-- Adds two new customer statuses on top of 030's pending/approving/approved/rejected:
--
--   suspended   -- PERMANENT. No status this row can ever move to afterward (enforced by the
--                  transition trigger below, not just by the admin UI omitting a button). The
--                  applicant's email AND business identity are recorded in a separate, append-only
--                  `suspended_applicants` table so the block survives even if this `customers` row
--                  is later deleted -- a status flag on a row that can disappear is not a permanent
--                  block (see GitLab's "block banned user normalized email reuse" pattern).
--   deactivated -- TEMPORARY. Reversible: an admin can reactivate back to 'approved' with zero
--                  data loss, same cost as a status flip.
--
-- Also reworks reject_customer's reapply story: product wants a rejected applicant to be able to
-- reapply with the SAME email. Rather than make Reject itself destructive (it stays the same
-- one-click, zero-friction action it is today -- just gains audit columns), a second, separately
-- confirmed admin action (reset_rejected_customer_for_reapply) clears the application fields and
-- flips the row back to 'pending' so the same email/row can be resubmitted.
--
-- Security notes carried over from research (SuperTokens' "how to ban users", OWASP-style
-- defense in depth):
--   1. A status flag alone doesn't kill an already-open session. suspend_customer/
--      deactivate_customer/reject_customer all hand back supabase_user_id so the CALLING
--      application code (admin-panel/src/data/customers.ts) can immediately call
--      `supabase.auth.admin.signOut(userId)` -- Postgres itself cannot reach the Supabase Auth
--      Admin API, so this is deliberately NOT done in SQL.
--   2. RLS does NOT stop the service_role client (it bypasses RLS by default in Supabase). The
--      real backstop making `suspended_applicants` append-only even from the admin panel's own
--      service-role client is the explicit `revoke update, delete` below, not the RLS policy.
--
-- Safe to re-run.

-- ============================================================================
-- 1. Status constraint: add 'suspended' and 'deactivated'.
-- ============================================================================
do $$
declare
  v_old_conname text;
begin
  select conname into v_old_conname
    from pg_constraint
    where conrelid = 'customers'::regclass
      and contype = 'c'
      and conkey = (
        select array_agg(attnum) from pg_attribute
        where attrelid = 'customers'::regclass and attname = 'status'
      )
      and conname <> 'customers_status_check_v3'
    limit 1;

  if v_old_conname is not null then
    execute format('alter table customers drop constraint %I', v_old_conname);
  end if;
end $$;

alter table customers add constraint customers_status_check_v3
  check (status in ('pending', 'approving', 'approved', 'rejected', 'suspended', 'deactivated'));

-- ============================================================================
-- 2. Audit columns -- same approved_at/approved_by naming convention as 014/030.
-- ============================================================================
alter table customers add column if not exists rejected_at timestamptz;
alter table customers add column if not exists rejected_by text;
alter table customers add column if not exists rejection_count integer not null default 0;
alter table customers add column if not exists suspended_at timestamptz;
alter table customers add column if not exists suspended_by text;
alter table customers add column if not exists suspension_reason text;
alter table customers add column if not exists deactivated_at timestamptz;
alter table customers add column if not exists deactivated_by text;
alter table customers add column if not exists deactivation_reason text;
alter table customers add column if not exists reactivated_at timestamptz;
alter table customers add column if not exists reactivated_by text;

-- ============================================================================
-- 3. suspended_applicants -- append-only block-list, outlives the customers row on purpose
--    (original_customer_id is NOT a foreign key: it must keep its value even after that
--    customers row is deleted).
-- ============================================================================
create table if not exists suspended_applicants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  business_number text,
  business_name text,
  original_customer_id uuid,
  suspended_at timestamptz not null default now(),
  suspended_by text not null,
  reason text not null
);

create index if not exists suspended_applicants_email_idx on suspended_applicants (lower(email));
create index if not exists suspended_applicants_business_number_idx
  on suspended_applicants (lower(business_number)) where business_number is not null;

alter table suspended_applicants enable row level security;

drop policy if exists "Admins can read suspended applicants" on suspended_applicants;
create policy "Admins can read suspended applicants" on suspended_applicants
  for select
  using (exists (select 1 from admin_users where email = (select auth.jwt() ->> 'email')));

-- No insert/update/delete policy for anon/authenticated at all -- only suspend_customer()
-- (SECURITY DEFINER, owned by the migration-running role, which bypasses RLS as the table owner)
-- may insert. The explicit revoke below is what actually stops service_role (which bypasses RLS
-- entirely, policy or not) from updating/deleting rows -- this table is append-only in practice,
-- not just in intent.
revoke update, delete on suspended_applicants from public, anon, authenticated, service_role;

-- ============================================================================
-- 4. suspend_customer -- permanent. Blocked while 'approving' (half-finished Shopify approval is
--    an ambiguous state to interrupt -- product decision: wait for it to settle first).
-- ============================================================================
create or replace function suspend_customer(p_id uuid, p_suspended_by text, p_reason text)
returns table(supabase_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_business_number text;
  v_business_name text;
  v_supabase_user_id uuid;
  v_status text;
begin
  select email, business_number, legal_business_name, customers.supabase_user_id, status
    into v_email, v_business_number, v_business_name, v_supabase_user_id, v_status
    from customers where id = p_id;

  if v_status is null then
    raise exception 'Customer % not found.', p_id using errcode = 'P0002';
  end if;

  if v_status = 'approving' then
    raise exception 'This customer is mid-approval -- wait for it to finish before suspending.' using errcode = 'P0001';
  end if;

  if v_status = 'suspended' then
    raise exception 'This customer is already suspended.' using errcode = 'P0001';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to suspend a customer.' using errcode = 'P0001';
  end if;

  insert into suspended_applicants (email, business_number, business_name, original_customer_id, suspended_by, reason)
    values (v_email, v_business_number, v_business_name, p_id, p_suspended_by, p_reason);

  update customers set
    status = 'suspended',
    suspended_at = now(),
    suspended_by = p_suspended_by,
    suspension_reason = p_reason,
    updated_at = now()
    where id = p_id;

  return query select v_supabase_user_id;
end;
$$;

-- ============================================================================
-- 5. deactivate_customer -- reversible, only from 'approved'.
-- ============================================================================
create or replace function deactivate_customer(p_id uuid, p_deactivated_by text, p_reason text)
returns table(supabase_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supabase_user_id uuid;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to deactivate a customer.' using errcode = 'P0001';
  end if;

  update customers set
    status = 'deactivated',
    deactivated_at = now(),
    deactivated_by = p_deactivated_by,
    deactivation_reason = p_reason,
    updated_at = now()
    where id = p_id and status = 'approved'
    returning customers.supabase_user_id into v_supabase_user_id;

  if not found then
    raise exception 'Only an approved customer can be deactivated.' using errcode = 'P0001';
  end if;

  return query select v_supabase_user_id;
end;
$$;

-- ============================================================================
-- 6. reactivate_customer -- only from 'deactivated'. No session to revoke (none is active).
-- ============================================================================
create or replace function reactivate_customer(p_id uuid, p_reactivated_by text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update customers set
    status = 'approved',
    reactivated_at = now(),
    reactivated_by = p_reactivated_by,
    updated_at = now()
    where id = p_id and status = 'deactivated';

  if not found then
    raise exception 'Only a deactivated customer can be reactivated.' using errcode = 'P0001';
  end if;
end;
$$;

-- ============================================================================
-- 7. reject_customer -- same pending-only guard and blast radius as 030, now also stamping audit
--    columns. Still one click in the UI, no reason box (product decision: keep it zero-friction).
-- ============================================================================
create or replace function reject_customer(p_id uuid, p_rejected_by text) returns table(supabase_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supabase_user_id uuid;
begin
  update customers set
    status = 'rejected',
    rejected_at = now(),
    rejected_by = p_rejected_by,
    rejection_count = rejection_count + 1,
    updated_at = now()
    where id = p_id and status = 'pending'
    returning customers.supabase_user_id into v_supabase_user_id;

  if not found then
    raise exception 'This application was already decided.' using errcode = 'P0001';
  end if;

  return query select v_supabase_user_id;
end;
$$;

-- ============================================================================
-- 8. reset_rejected_customer_for_reapply -- clears the application fields (same set
--    update_customer_application_info (031) touches, plus documents/compliance fields it doesn't)
--    and flips the SAME row back to 'pending' so the applicant can resubmit with the same email.
--    Email, supabase_user_id, id, and the rejection audit history are deliberately untouched.
-- ============================================================================
create or replace function reset_rejected_customer_for_reapply(p_id uuid, p_reset_by text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update customers set
    status = 'pending',
    requested_at = now(),
    first_name = '',
    last_name = '',
    phone = null,
    personal_cell = null,
    legal_business_name = null,
    operating_name = null,
    business_number = null,
    num_stores = null,
    business_types = '{}',
    monthly_purchase_range = null,
    sells_online = null,
    online_url = null,
    instagram_handle = null,
    ship_line1 = null,
    ship_line2 = null,
    ship_city = null,
    ship_province = null,
    ship_postal_code = null,
    bill_same_as_shipping = null,
    bill_line1 = null,
    bill_line2 = null,
    bill_city = null,
    bill_province = null,
    bill_postal_code = null,
    business_licence_path = null,
    specialty_licence_path = null,
    tax_exempt = null,
    vpt_number = null,
    referral_source = null,
    signature_name = null,
    signed_at = null,
    force_reset_by = p_reset_by,
    force_reset_at = now(),
    updated_at = now()
    where id = p_id and status = 'rejected';

  if not found then
    raise exception 'Only a rejected application can be reset for reapplication.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function suspend_customer(uuid, text, text) from public, anon, authenticated;
grant execute on function suspend_customer(uuid, text, text) to service_role;
revoke all on function deactivate_customer(uuid, text, text) from public, anon, authenticated;
grant execute on function deactivate_customer(uuid, text, text) to service_role;
revoke all on function reactivate_customer(uuid, text) from public, anon, authenticated;
grant execute on function reactivate_customer(uuid, text) to service_role;
revoke all on function reject_customer(uuid, text) from public, anon, authenticated;
grant execute on function reject_customer(uuid, text) to service_role;
revoke all on function reset_rejected_customer_for_reapply(uuid, text) from public, anon, authenticated;
grant execute on function reset_rejected_customer_for_reapply(uuid, text) to service_role;

-- ============================================================================
-- 9. is_applicant_blocked -- checked by the storefront's public submitRegistration() (anon-
--    executable, hardened search_path like email_registered (026)) before any signUp/insert.
--    Matches on email OR business_number so a suspended business can't dodge the block with a
--    new email alone.
-- ============================================================================
create or replace function public.is_applicant_blocked(p_email text, p_business_number text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.suspended_applicants
    where lower(email) = lower(trim(p_email))
       or (p_business_number is not null and trim(p_business_number) <> ''
           and lower(business_number) = lower(trim(p_business_number)))
  );
$$;

revoke all on function public.is_applicant_blocked(text, text) from public;
grant execute on function public.is_applicant_blocked(text, text) to anon, authenticated;

-- ============================================================================
-- 10. Extend the transition trigger (030). 'suspended' has NO outgoing branch anywhere in this
--     function -- that absence, plus the explicit raise below, is the permanent dead end.
--     'approving' -> 'suspended' is deliberately NOT included (matches suspend_customer's own
--     guard above -- belt and suspenders).
-- ============================================================================
create or replace function enforce_customer_status_transition() returns trigger
language plpgsql
as $$
begin
  if old.status = 'suspended' then
    raise exception 'Customer % is permanently suspended and cannot be modified.', old.id
      using errcode = 'P0001';
  end if;

  if not (
    (old.status = 'pending' and new.status = 'approving') or
    (old.status = 'pending' and new.status = 'rejected') or
    (old.status = 'pending' and new.status = 'suspended') or
    (old.status = 'approving' and new.status = 'approved') or
    (old.status = 'approving' and new.status = 'pending') or
    (old.status = 'rejected' and new.status = 'pending') or
    (old.status = 'rejected' and new.status = 'suspended') or
    (old.status = 'approved' and new.status = 'suspended') or
    (old.status = 'approved' and new.status = 'deactivated') or
    (old.status = 'deactivated' and new.status = 'approved')
  ) then
    raise exception 'Invalid customer status transition: % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The trigger's WHEN clause (030) originally only fired when status itself changed -- which left
-- a real gap found during manual verification: updating some OTHER column (e.g. first_name) on
-- an already-suspended row left old.status = new.status = 'suspended', so the WHEN clause never
-- evaluated true and the function body (which raises unconditionally on old.status='suspended')
-- never ran at all. A "permanently suspended, cannot be modified" row was therefore still
-- editable via any ordinary field update. Fixed by also firing whenever the row is ALREADY
-- suspended, regardless of what's changing -- the function body's existing unconditional check
-- on old.status then genuinely blocks every update, not just status transitions.
drop trigger if exists customers_status_transition_guard on customers;
create trigger customers_status_transition_guard
  before update on customers
  for each row
  when (old.status = 'suspended' or old.status is distinct from new.status)
  execute function enforce_customer_status_transition();

-- VERIFY:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'customers'::regclass and contype = 'c';
--   (expect exactly one status check, allowing suspended/deactivated)
-- select proname from pg_proc where proname in
--   ('suspend_customer','deactivate_customer','reactivate_customer','reject_customer',
--    'reset_rejected_customer_for_reapply','is_applicant_blocked');
--   (expect all six)
--
-- Manual transition tests (run against a disposable test row):
--   select suspend_customer(<id>, 'test@admin', 'fraud'); -- then try ANY further update -> expect
--     "permanently suspended" error, including via reactivate_customer/UPDATE directly.
--   select deactivate_customer(<approved id>, 'test@admin', 'temp hold'); then
--   select reactivate_customer(<id>, 'test@admin'); -- status back to approved, no data touched.
--   select reject_customer(<pending id>, 'test@admin'); then
--   select reset_rejected_customer_for_reapply(<id>, 'test@admin'); -- status pending, fields null.
--   -- service_role client attempting `update suspended_applicants ...` or `delete from
--   -- suspended_applicants ...` directly must fail with a permission error despite using the
--   -- service-role key (confirms the revoke, not just RLS, is doing the work).
--   -- deleting the customers row after suspend_customer must leave its suspended_applicants row
--   -- intact (confirms the block survives row deletion).
