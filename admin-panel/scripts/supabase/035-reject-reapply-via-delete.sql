-- ============================================================================
-- 035: "Allow reapply" now actually lets the SAME email register again through the public
-- wizard -- the 034 version only reset the row's fields in place, which left three independent
-- blockers still in the way: email_registered() (matches on existence, not status), Supabase
-- Auth's own signUp() (the Auth user was never deleted, so it fails with `user_already_exists`),
-- and the unique index on customers.email (019). Fixing any ONE of those wasn't enough -- all
-- three had to go, which means the row and its Auth user must actually be deleted, not reset.
--
-- A rejected applicant never reaches 'approved', so they never have cart/wishlist/saved-location
-- data (ON DELETE CASCADE on all three handles it regardless) and never touch orders. The one
-- real loss from deleting outright is the admin's own audit trail -- rejection_count and any
-- internal_notes on this customer -- so both are snapshotted into rejection_history first, the
-- same "outlive the deleted row" pattern suspended_applicants (034) already uses, just without
-- that table's block-list purpose: this one is purely informational, nothing reads it to refuse
-- anything.
-- ============================================================================

create table if not exists rejection_history (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  business_number text,
  business_name text,
  original_customer_id uuid, -- not a FK on purpose: the customers row this refers to is deleted
  rejection_count integer not null,
  last_rejected_at timestamptz,
  last_rejected_by text,
  notes_snapshot text, -- concatenated internal_notes for this customer, newest last; null if none
  reapplied_at timestamptz not null default now(),
  reapplied_by text not null
);

create index if not exists rejection_history_email_idx on rejection_history (lower(email));

alter table rejection_history enable row level security;

drop policy if exists "Admins can read rejection history" on rejection_history;
create policy "Admins can read rejection history" on rejection_history
  for select
  using (exists (select 1 from admin_users where email = (select auth.jwt() ->> 'email')));

-- No insert/update/delete policy for anon/authenticated -- only reset_rejected_customer_for_reapply()
-- (SECURITY DEFINER) writes here. Unlike suspended_applicants (034), this is purely informational
-- (nothing is ever blocked by its contents), so it does not need the same hardened
-- `revoke ... from service_role` treatment -- there is no block-list integrity to protect.

-- Return type changes from void (034) to table(supabase_user_id uuid) -- create or replace cannot
-- change a function's return type, so the old signature must be dropped first.
drop function if exists reset_rejected_customer_for_reapply(uuid, text);

create or replace function reset_rejected_customer_for_reapply(p_id uuid, p_reset_by text)
returns table(supabase_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_business_number text;
  v_business_name text;
  v_rejection_count integer;
  v_rejected_at timestamptz;
  v_rejected_by text;
  v_supabase_user_id uuid;
  v_notes_snapshot text;
begin
  select email, business_number, legal_business_name, rejection_count, rejected_at, rejected_by, customers.supabase_user_id
    into v_email, v_business_number, v_business_name, v_rejection_count, v_rejected_at, v_rejected_by, v_supabase_user_id
    from customers where id = p_id and status = 'rejected';

  if not found then
    raise exception 'Only a rejected application can be reset for reapplication.' using errcode = 'P0001';
  end if;

  select string_agg(created_at || ' (' || created_by || '): ' || body, E'\n\n' order by created_at)
    into v_notes_snapshot
    from internal_notes
    where entity_type = 'customer' and entity_id = p_id::text;

  insert into rejection_history (
    email, business_number, business_name, original_customer_id,
    rejection_count, last_rejected_at, last_rejected_by, notes_snapshot, reapplied_by
  ) values (
    v_email, v_business_number, v_business_name, p_id,
    v_rejection_count, v_rejected_at, v_rejected_by, v_notes_snapshot, p_reset_by
  );

  delete from internal_notes where entity_type = 'customer' and entity_id = p_id::text;

  -- The transition trigger (034) only guards UPDATE, not DELETE -- a delete here is unaffected by
  -- it, same as suspended_applicants' own "survives row deletion" guarantee already proved this.
  delete from customers where id = p_id;

  return query select v_supabase_user_id;
end;
$$;

-- Grants unchanged from 034 -- service_role only, same as every other admin-panel RPC here.
revoke all on function reset_rejected_customer_for_reapply(uuid, text) from public, anon, authenticated;
grant execute on function reset_rejected_customer_for_reapply(uuid, text) to service_role;

-- VERIFY:
-- select proname from pg_proc where proname = 'reset_rejected_customer_for_reapply';
-- select conname from pg_constraint where conrelid = 'rejection_history'::regclass;
--
-- Manual test (disposable row):
--   insert a rejected test customer, add an internal_notes row for it (entity_type='customer',
--   entity_id = that customer's id::text), then:
--   select reset_rejected_customer_for_reapply(<id>, 'test@admin');
--   -- expect: one row in rejection_history with notes_snapshot populated; the customers row GONE;
--   -- the internal_notes row GONE; the returned supabase_user_id matches the original customer's.
--   select email_registered('<that email>'); -- expect false now
