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
