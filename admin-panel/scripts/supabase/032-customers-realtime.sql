-- Adds `customers` to the Realtime publication so useLiveTable('customers', ...) (Part 3 of the
-- approval-race-guards plan) gets live postgres_changes events. RLS already restricts reads to
-- admins only ("Admins can read customers" policy, 005-create-customers.sql) -- Realtime respects
-- RLS per-subscriber, so no new policy is needed here.
--
-- CORRECTION (live-tested via Playwright, 2026-09-30): an earlier version of this migration's
-- comment claimed no REPLICA IDENTITY change was needed, reasoning from cart_snapshot's working
-- setup. That was WRONG for this table -- confirmed empirically, not assumed. reject_customer/
-- claim_customer_for_approval/etc only UPDATE a few columns (status, updated_at, ...), and by
-- default Postgres's logical replication (which Realtime consumes) OMITS unchanged columns from
-- the UPDATE payload's `new` record -- an omitted key, not a null value. useLiveTable applies
-- `payload.new` as a full-row REPLACE into its Map, so a partial payload wiped out every other
-- field (first_name, last_name, account_type, etc all went blank in the live UI -- caught by
-- e2e/customers/live-sync.spec.ts, not by inspection). REPLICA IDENTITY FULL makes Postgres
-- include every column on every change, regardless of which ones were actually written, fixing
-- this at the source. (RLS has a separate, unrelated caveat -- with RLS enabled, `payload.old`
-- stays primary-key-only even with REPLICA IDENTITY FULL -- but this design never reads
-- `payload.old` for anything except DELETE's row-removal key, so that doesn't affect us here.)
--
-- Idempotent guard matches 007's own pattern -- a bare `alter publication ... add table` errors
-- if the table is already in the publication. `REPLICA IDENTITY FULL` itself is idempotent (safe
-- to re-run; setting it again is a no-op).
--
-- Safe to re-run.

alter table customers replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table customers;
  end if;
end $$;

-- VERIFY:
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'customers';
--   (expect 1 row)
-- select relreplident from pg_class where relname = 'customers';
--   (expect 'f' -- full)
