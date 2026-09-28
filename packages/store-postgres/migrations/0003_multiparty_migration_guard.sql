-- The migration guard (BD-324 F-2): `0002_native_multiparty`'s blocked-`MultiParty`
-- refusal and its `filed_row` rewrite are plain DML — a `select count(*)` and an
-- `update` — over `docket_entries`, whose policy `force row level security` applies to
-- as well as to an ordinary role, keyed on `current_setting('affiant.tenant_id', true)`.
-- A migrator role that is neither a superuser nor `BYPASSRLS` — and `0002` states no
-- role requirement — sees zero rows under that policy no matter how many rows the
-- table holds, so both statements run, see nothing, and succeed having done nothing:
-- the refusal never fires even over a stranded `pending` `MultiParty` row, and the
-- rewrite never converts a single pre-0.3.0 `filed_row`. `0002` itself is not edited —
-- `applyMigrations` records each migration's SHA-256 and refuses a changed digest, and
-- the first host already has `0002`'s digest on record from the run above.
--
-- The requirement this file enforces and repairs: **run this package's migrations as a
-- superuser or as a role with `BYPASSRLS`.** The application role stays ordinary — this
-- is a migrator-only requirement, and it is the same requirement `0001`'s and `0002`'s
-- row-level-security statements always needed to be effective, now stated and checked
-- rather than assumed.
--
-- What this file does, in order: (a) fails loudly, naming the requirement and
-- `current_user`, unless the role applying it can bypass row level security; (b)
-- re-applies `0002`'s blocked-`MultiParty` refusal, restricted to rows still in the
-- pre-0.3.0 shape, so a silent `0002` run that left a stranded row is still caught here
-- rather than carried forward silently again; (c) re-applies `0002`'s `filed_row`
-- rewrite verbatim, restricted the same way, so a silent `0002` run's rows are
-- converted now and a row `0002` already converted (this file running after a `0002`
-- that worked) is left byte-identical.

-- (a) The guard. A superuser bypasses row level security regardless of
-- `pg_roles.rolbypassrls`, which defaults to `NOBYPASSRLS` and is not implied by
-- `rolsuper` — so the check reads both columns rather than `rolbypassrls` alone;
-- `rolsuper` is kept in the check only so the message below can be precise about which
-- of the two `current_user` lacks; either one alone is sufficient to proceed.
do $$
declare
  can_bypass boolean;
begin
  select rolsuper or rolbypassrls into can_bypass
  from pg_roles
  where rolname = current_user;

  if not coalesce(can_bypass, false) then
    raise exception 'run this package''s migrations as a superuser or a role with BYPASSRLS (current_user is "%", which is neither); the application role stays ordinary', current_user;
  end if;
end $$;

-- (b) `0002`'s blocked-`MultiParty` refusal, re-applied over rows still in the
-- pre-0.3.0 shape only (`jsonb_typeof(filed_row -> 'requirement') = 'string'`): a row
-- `0002` already converted carries an object `requirement` and cannot match
-- `filed_row ->> 'requirement' = 'MultiParty'` in the first place, but the predicate is
-- stated explicitly here rather than relied on implicitly, so this block's intent reads
-- the same as `0003`'s other two DML statements.
do $$
declare
  blocked_multiparty_rows integer;
begin
  select count(*) into blocked_multiparty_rows
  from {{schema}}.docket_entries
  where jsonb_typeof(filed_row -> 'requirement') = 'string'
    and filed_row ->> 'status' = 'pending'
    and filed_row ->> 'requirement' = 'MultiParty';

  if blocked_multiparty_rows > 0 then
    raise exception 'expire or purge blocked MultiParty rows before upgrading; they cannot be represented at 0.3.0 (% row(s) found)', blocked_multiparty_rows;
  end if;
end $$;

-- (c) `0002`'s `filed_row` rewrite, re-applied verbatim in its expression. The `where`
-- clause is the reason this statement exists rather than a second call to `0002`'s own
-- text: `jsonb_typeof(filed_row -> 'requirement') = 'string'` is true only for a row
-- still in the pre-0.3.0 shape, so a row `0002` already converted here or wherever it
-- ran with a role that could see it is left untouched. Without this predicate,
-- re-running the expression over an already-converted row would double-wrap
-- `requirement` (`jsonb_build_object('kind', filed_row ->> 'requirement')` reads the
-- object's own text representation, not a bare kind name, once `requirement` is
-- already `{ kind }`), overwrite `approvals` back to `null` even where approvals had
-- since been recorded, and re-derive `decision.by` and `executionDetail` from fields
-- the first conversion already changed — every one of which `0002`'s own `where`
-- clause (`jsonb_typeof(filed_row -> 'requirement') = 'string' or filed_row ?
-- 'compositeRef' or jsonb_typeof(filed_row -> 'executionDetail') = 'string'`) would
-- also have refused a second time, which is why this file narrows to the first branch
-- alone: `compositeRef` and a string `executionDetail` cannot survive `0002`'s
-- expression once `requirement` is no longer a string, so the narrower predicate is
-- equivalent to `0002`'s on every row this file can ever see.
update {{schema}}.docket_entries
set filed_row = (filed_row - 'compositeRef')
  || jsonb_build_object(
       'requirement', jsonb_build_object('kind', filed_row ->> 'requirement'),
       'approvals', 'null'::jsonb,
       'decision', case
         when jsonb_typeof(filed_row -> 'decision') = 'object'
           then (filed_row -> 'decision') || jsonb_build_object(
                  'by', coalesce(
                    filed_row -> 'attestation' -> 'by' ->> 'id',
                    filed_row -> 'attestation' -> 'by' ->> 'memberId'
                  )
                )
         else filed_row -> 'decision'
       end,
       'executionDetail', case
         when jsonb_typeof(filed_row -> 'executionDetail') = 'string'
           then jsonb_build_object('code', 'legacy', 'note', filed_row ->> 'executionDetail')
         else filed_row -> 'executionDetail'
       end
     )
where jsonb_typeof(filed_row -> 'requirement') = 'string';
