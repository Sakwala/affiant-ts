-- Native `MultiParty`: the requirement becomes an object, the approvers and their
-- decisions become rows of their own, and `compositeRef` leaves the schema.
--
-- Rules served: AZ-4 (a `MultiParty` write is one entry; its approvers are the host
-- policy's list, its decisions are records, and the entry's status folds from them),
-- DK-1 (the guarded compare-and-set, now over an approver's own record as well as over
-- the entry — the approval and any fold it causes are one transition, never two).
--
-- `requirement` was a bare kind name; from 0.3.0 it is the object the core produces
-- (`{ kind }` alone for the first three kinds, `{ kind: "MultiParty", approvers,
-- required }` for the fourth), so the column widens to `jsonb` and the `using` clause
-- wraps whatever text is there today in the shape a one-kind entry always had —
-- `{ kind }` — rather than guessing at an object no such row ever carried. There is no
-- composition above the gate at 0.3.0 (a host that needs several approvals asks for
-- `MultiParty` instead), so `composite_ref` is dropped rather than widened.

alter table {{schema}}.docket_entries
  alter column requirement type jsonb
  using jsonb_build_object('kind', requirement);

alter table {{schema}}.docket_entries
  drop column composite_ref;

-- The host policy's list of approvers, one row per name, in the order the policy
-- named them — `position` is what lets a read reproduce that order without trusting
-- whatever order a query happens to return rows in. Filed once, with the entry, and
-- never edited afterwards (DK-4): the approvers a `MultiParty` entry names are fixed
-- at filing, and a resubmission is a new entry with its own rows.
create table if not exists {{schema}}.docket_approvers (
  tenant_id  text        not null,
  entry_id   text        not null,
  approver   text        not null,
  position   integer     not null,
  primary key (tenant_id, entry_id, approver),
  foreign key (tenant_id, entry_id)
    references {{schema}}.docket_entries (tenant_id, entry_id) on delete cascade
);

-- One approval record per approver, at most one each (AZ-4: an approver's second
-- decision is refused, and the primary key is what makes that refusal a conflict
-- rather than a race the application code has to notice). Each carries its own
-- attestation, never the entry-level one — the entry's `multi-party` attestation is
-- composed from these and nothing else (AZ-3). The foreign key is to the approver row
-- named for this entry, not to the entry directly: a decision from someone the policy
-- never listed has no approver row to reference and cannot be inserted at all.
create table if not exists {{schema}}.docket_approvals (
  tenant_id    text        not null,
  entry_id     text        not null,
  approver     text        not null,
  decision     text        not null check (decision in ('approve', 'reject')),
  reason       text,
  decided_at   timestamptz not null,
  attestation  jsonb       not null,
  primary key (tenant_id, entry_id, approver),
  foreign key (tenant_id, entry_id, approver)
    references {{schema}}.docket_approvers (tenant_id, entry_id, approver) on delete cascade
);

-- Defence in depth (AZ-2), the same pair as the first migration's.
alter table {{schema}}.docket_approvers enable row level security;
alter table {{schema}}.docket_approvers force row level security;
alter table {{schema}}.docket_approvals enable row level security;
alter table {{schema}}.docket_approvals force row level security;

drop policy if exists docket_approvers_tenant on {{schema}}.docket_approvers;
create policy docket_approvers_tenant on {{schema}}.docket_approvers
  using (tenant_id = {{schema}}.current_tenant())
  with check (tenant_id = {{schema}}.current_tenant());

drop policy if exists docket_approvals_tenant on {{schema}}.docket_approvals;
create policy docket_approvals_tenant on {{schema}}.docket_approvals
  using (tenant_id = {{schema}}.current_tenant())
  with check (tenant_id = {{schema}}.current_tenant());

-- Reading an entry joins its approvals ordered by decided_at, approver (N-7), so
-- every reader — `#fold`, `#slice`, the sweep's own view of the row — gets the same
-- order without repeating the join by hand. The view is recreated whole (the same
-- shape `0001:100-156` defines, one lateral join added) rather than altered in
-- place, because a view's column list cannot be extended with `alter view`.
--
-- `to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` is what turns the stored
-- `timestamptz` back into the ISO 8601 instant the core wrote in (`decided_at`
-- entered as one via `instant()`'s normalisation before the cast to `timestamptz`
-- in `recordApproval`, and both encode the same absolute moment either way); the
-- alternative — binding the column's own driver-decoded `Date` — is the thing this
-- package's own comment on `json()`/`instant()` warns against, once a connection's
-- serializer registry has been touched by a wrapper the way `drizzle-orm/postgres-js`
-- touches it. `jsonb_agg` over zero rows is `null`, not `[]`; the fold (`fold.ts`)
-- tells "no approvals recorded yet" and "not a MultiParty row" apart by
-- `requirement.kind`, never by which of the two this column happens to read.
-- The view gains a column; Postgres refuses to add one through create-or-replace, so the view is dropped and made again.
drop view if exists {{schema}}.docket_current;

create or replace view {{schema}}.docket_current
  with (security_invoker = true)
  as
select
  e.tenant_id,
  e.entry_id,
  e.conversation_id,
  e.expires_at,
  e.filing_seq,
  e.filed_row,
  d.payload  as decision_payload,
  x.payload  as execution_payload,
  s.payload  as supersession_payload,
  p.payload  as preserved_payload,
  q.payload  as expiry_payload,
  a.approvals as approvals,
  case
    when d.payload is not null then d.payload ->> 'status'
    when q.payload is not null then 'expired'
    else e.filed_row ->> 'status'
  end as status,
  case
    when x.payload is not null then x.payload ->> 'execution'
    when d.payload is not null then d.payload ->> 'execution'
    when q.payload is not null then null
    else e.filed_row ->> 'execution'
  end as execution,
  case
    when d.payload is not null then (d.payload ->> 'decidedAt')::timestamptz
    when q.payload is not null then (q.payload ->> 'decidedAt')::timestamptz
    else (e.filed_row ->> 'decidedAt')::timestamptz
  end as decided_at
from {{schema}}.docket_entries e
left join lateral (
  select ev.payload from {{schema}}.docket_events ev
  where ev.tenant_id = e.tenant_id and ev.entry_id = e.entry_id and ev.kind = 'decision'
) d on true
left join lateral (
  select ev.payload from {{schema}}.docket_events ev
  where ev.tenant_id = e.tenant_id and ev.entry_id = e.entry_id and ev.kind = 'execution'
) x on true
left join lateral (
  select ev.payload from {{schema}}.docket_events ev
  where ev.tenant_id = e.tenant_id and ev.entry_id = e.entry_id and ev.kind = 'supersession'
) s on true
left join lateral (
  select ev.payload from {{schema}}.docket_events ev
  where ev.tenant_id = e.tenant_id and ev.entry_id = e.entry_id and ev.kind = 'preserved-amendments'
) p on true
left join lateral (
  select ev.payload from {{schema}}.docket_events ev
  where ev.tenant_id = e.tenant_id and ev.entry_id = e.entry_id and ev.kind = 'expiry'
) q on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object(
             'approver', ap.approver,
             'decision', ap.decision,
             'reason', ap.reason,
             'at', to_char(ap.decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'attestation', ap.attestation
           )
           order by ap.decided_at, ap.approver
         ) as approvals
  from {{schema}}.docket_approvals ap
  where ap.tenant_id = e.tenant_id and ap.entry_id = e.entry_id
) a on true;
