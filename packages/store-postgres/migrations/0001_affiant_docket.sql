-- The Affiant Docket, as two append-only tables and a fold over them.
--
-- `{{schema}}` is a placeholder for the schema the tables live in, quoted as an
-- identifier. `applyMigrations` substitutes it; a host vendoring this file into its
-- own migration sequence substitutes it once, by hand or with its own renderer, and
-- checks the checksum of the file as shipped rather than of the rendered text.
--
-- Rules served: DK-1 (the guarded compare-and-set, the idempotent re-file, expiry as
-- a queryable state), DK-4 (later facts are appended, never edited), AZ-2 (every row
-- is tenant-scoped, and a wrong-tenant read is a miss).

create schema if not exists {{schema}};

-- The tenant a statement is allowed to see, read from a transaction-scoped setting.
-- The name is this package's own: a host's tenant setting stays independent of it
-- even when the two carry the same value.
create or replace function {{schema}}.current_tenant() returns text
  language sql
  stable
  as $$ select current_setting('affiant.tenant_id', true) $$;

-- Which migrations of this package have been applied here, and what they hashed to.
-- Bookkeeping, not a Docket fact: `applied_at` is the only place a clock reading
-- comes from the database, and nothing reads it back.
create table if not exists {{schema}}.schema_migrations (
  name        text        not null primary key,
  sha256      text        not null,
  applied_at  timestamptz not null default now()
);

-- The filing: written once, never updated. `filed_row` is the entry exactly as the
-- core produced it, so a field the core adds later is not lost by the column
-- mapping; the columns beside it are the ones a statement filters or orders on.
create table if not exists {{schema}}.docket_entries (
  tenant_id         text        not null,
  entry_id          text        not null,
  conversation_id   text        not null,
  channel           text        not null,
  tool_name         text        not null,
  affidavit         jsonb       not null,
  requirement       text        not null,
  blocked           jsonb,
  composite_ref     text,
  supersedes        text,
  filed_at          timestamptz not null,
  expires_at        timestamptz not null,
  protocol_version  text        not null,
  filing_seq        bigint      not null generated always as identity,
  filed_row         jsonb       not null,
  -- An entry id is unique *within* a tenant, never across them: two tenants filing
  -- the same id are two rows, and a lookup carrying the wrong tenant is a miss.
  primary key (tenant_id, entry_id)
);

create index if not exists docket_entries_tenant_seq
  on {{schema}}.docket_entries (tenant_id, filing_seq);
create index if not exists docket_entries_tenant_conversation_seq
  on {{schema}}.docket_entries (tenant_id, conversation_id, filing_seq);
create index if not exists docket_entries_tenant_expires
  on {{schema}}.docket_entries (tenant_id, expires_at);

-- The later facts. One row per fact per entry, and the unique index is what makes
-- each of them happen once: the decision that loses the race, the second execution
-- report and the repeated sweep all conflict here rather than overwriting anything.
create table if not exists {{schema}}.docket_events (
  id         bigint      not null generated always as identity primary key,
  tenant_id  text        not null,
  entry_id   text        not null,
  kind       text        not null
             check (kind in ('decision', 'execution', 'supersession', 'preserved-amendments', 'expiry')),
  payload    jsonb       not null,
  at         timestamptz not null,
  unique (tenant_id, entry_id, kind),
  foreign key (tenant_id, entry_id)
    references {{schema}}.docket_entries (tenant_id, entry_id) on delete cascade
);

-- An entry leaves `pending` exactly once, and the database is what says so.
--
-- The unique constraint on `(tenant_id, entry_id, kind)` above makes each *kind* of
-- fact happen once, which is not the same thing: a decision and a sweep are different
-- kinds, so without this a decision committing while a sweep is choosing its rows would
-- leave a row carrying both, and the sweep would report an approved entry as expired.
-- The two terminal facts share one index instead, so of the two exactly one is written
-- and the other conflicts — which is why every insert of a later fact in this package
-- says `on conflict do nothing` without naming an index (DK-1).
create unique index if not exists docket_events_terminal_once
  on {{schema}}.docket_events (tenant_id, entry_id)
  where kind in ('decision', 'expiry');

-- The fold: the filing joined with one row per event kind.
--
-- `security_invoker` is what makes the view honour the querying role's row-level
-- security rather than its owner's. Without it a view owned by the migration role
-- would read the tables with that role's visibility, and a host role querying it
-- would see every tenant's rows (AZ-2).
--
-- Expiry is deliberately **not** computed here: the deadline is the store's clock's
-- question, and the database's own `now()` is never consulted.
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
  -- Each branch reads the fact that was written down, never a second derivation of
  -- it: the sweep records the entry's deadline, and a view that reached for
  -- `expires_at` here instead would agree with that only for as long as it stayed
  -- true, leaving `retention` and the folded entry disagreeing about when a row left
  -- `pending` in every case where it did not (DK-1, DK-4).
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
) q on true;

-- Defence in depth (AZ-2). The store filters by tenant in every statement because
-- the contract requires it; these policies catch the statement that forgot. `force`
-- applies them to the tables' owner too, so a host that runs its application role as
-- the owner is not quietly exempt.
alter table {{schema}}.docket_entries enable row level security;
alter table {{schema}}.docket_entries force row level security;
alter table {{schema}}.docket_events enable row level security;
alter table {{schema}}.docket_events force row level security;

drop policy if exists docket_entries_tenant on {{schema}}.docket_entries;
create policy docket_entries_tenant on {{schema}}.docket_entries
  using (tenant_id = {{schema}}.current_tenant())
  with check (tenant_id = {{schema}}.current_tenant());

drop policy if exists docket_events_tenant on {{schema}}.docket_events;
create policy docket_events_tenant on {{schema}}.docket_events
  using (tenant_id = {{schema}}.current_tenant())
  with check (tenant_id = {{schema}}.current_tenant());
