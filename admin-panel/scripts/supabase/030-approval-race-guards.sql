-- Closes the approve/reject/account-type race conditions found in the 2026-09-30 audit.
-- Prior behaviour: approve_customer and reject_customer had no guard on the row's CURRENT
-- status, so two admins racing (approve+approve, approve+reject, reject+approve) could both
-- succeed, with whichever committed last silently winning -- including an admin's explicit
-- Reject being silently overwritten by a race-losing Approve. approve_customer also read
-- account_type in one statement and wrote the account-number prefix later in the same function,
-- so a concurrent account-type switch (deliberately left unrestricted -- product decision) could
-- land a permanent wrong-prefix account number (e.g. "W-..." on a customer whose type is now
-- 'retail').
--
-- Fix shape (see plan): approve_customer is split into claim -> (JS calls Shopify) -> finalize,
-- because the thing being raced isn't just a DB write, it's an EXTERNAL Shopify API call that a
-- DB-only guard can't protect (Postgres locks don't reach outside Postgres -- confirmed against
-- postgresql.org/docs/current/explicit-locking.html). The claim step atomically flips
-- pending -> approving (a single guarded UPDATE, proven race-free under Postgres's default READ
-- COMMITTED isolation per postgresql.org/docs/current/transaction-iso.html: a second concurrent
-- UPDATE simply re-evaluates its WHERE clause against the post-commit row and matches zero rows).
-- Only the admin who wins the claim ever reaches Shopify. account_type is captured AT CLAIM TIME
-- and threaded through to finalize explicitly, so the account number is generated from a
-- consistent snapshot even if account_type keeps changing underneath while Shopify is called.
--
-- Safe to re-run.

-- 1. Allow the transient 'approving' status alongside the existing three.
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
      and conname <> 'customers_status_check_v2'
    limit 1;

  if v_old_conname is not null then
    execute format('alter table customers drop constraint %I', v_old_conname);
  end if;
end $$;

alter table customers add constraint customers_status_check_v2
  check (status in ('pending', 'approving', 'approved', 'rejected'));

-- 2. reject_customer -- now guarded: only a still-pending row can be rejected. Per product
-- decision there is no "revoke an approved customer" use case, so this is a strict pending-only
-- conditional UPDATE (the simple, proven-sufficient pattern -- no locking needed since there's no
-- intermediate read/external call to protect).
create or replace function reject_customer(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update customers set status = 'rejected', updated_at = now()
    where id = p_id and status = 'pending';

  if not found then
    raise exception 'This application was already decided.' using errcode = 'P0001';
  end if;
end;
$$;

-- 3. approve_customer is replaced by claim -> finalize (+ revert on failure). The old single-shot
-- function unconditionally overwrote status regardless of its current value -- drop it so nothing
-- can call the unguarded version by mistake.
drop function if exists approve_customer(uuid, text, text);

-- Claims a pending row for approval: atomically flips pending -> approving and hands back the
-- account_type/ship_province/account_number as they stood AT THE MOMENT OF THE CLAIM. Zero rows
-- updated (not found) means someone else already approved, rejected, or is mid-approving this
-- customer -- the caller must stop here and never reach Shopify.
create or replace function claim_customer_for_approval(p_id uuid)
returns table(account_type text, ship_province text, account_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
  v_ship_province text;
  v_account_number text;
begin
  update customers
    set status = 'approving', updated_at = now()
    where id = p_id and status = 'pending'
    returning customers.account_type, customers.ship_province, customers.account_number
    into v_account_type, v_ship_province, v_account_number;

  if not found then
    raise exception 'This application was already decided or is being processed.' using errcode = 'P0001';
  end if;

  return query select v_account_type, v_ship_province, v_account_number;
end;
$$;

-- Finalizes a claimed (status = 'approving') row after Shopify has been called. p_account_type
-- and p_ship_province are passed in from what claim_customer_for_approval returned -- NOT
-- re-read here -- so the account-number prefix reflects the type the customer was actually
-- claimed/approved under, even if account_type was switched by another admin while Shopify was
-- being called.
create or replace function finalize_customer_approval(
  p_id uuid,
  p_approved_by text,
  p_shopify_customer_id text,
  p_account_type text,
  p_ship_province text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_number text;
  v_type_code text;
  v_province_code text;
  v_new_number text;
begin
  select account_number into v_existing_number
    from customers where id = p_id and status = 'approving';

  if not found then
    raise exception 'Customer % is not awaiting finalization (already finalized, reverted, or invalid id).', p_id
      using errcode = 'P0001';
  end if;

  v_type_code := case when p_account_type = 'wholesale' then 'W' else 'R' end;
  v_province_code := coalesce(
    case p_ship_province
      when 'Alberta' then 'AB' when 'British Columbia' then 'BC' when 'Manitoba' then 'MB'
      when 'New Brunswick' then 'NB' when 'Newfoundland and Labrador' then 'NL'
      when 'Nova Scotia' then 'NS' when 'Ontario' then 'ON'
      when 'Prince Edward Island' then 'PE' when 'Quebec' then 'QC'
      when 'Saskatchewan' then 'SK' when 'Northwest Territories' then 'NT'
      when 'Nunavut' then 'NU' when 'Yukon' then 'YT'
      else null
    end,
    'XX'
  );

  -- Idempotent against re-finalizing: once assigned, permanent.
  v_new_number := coalesce(
    v_existing_number,
    v_type_code || '-' || v_province_code || '-' || to_char(now(), 'YY') || '-' ||
      lpad(nextval('account_number_seq')::text, 4, '0')
  );

  update customers
    set status = 'approved',
        approved_at = now(),
        approved_by = p_approved_by,
        shopify_customer_id = p_shopify_customer_id,
        account_number = v_new_number,
        updated_at = now()
    where id = p_id and status = 'approving';
end;
$$;

-- Reverts a claim back to pending -- called when the Shopify call fails after a successful claim,
-- so a transient Shopify error never leaves an applicant stuck unreachable in 'approving'.
create or replace function revert_customer_claim(p_id uuid) returns void
language sql
security definer
set search_path = public
as $$
  update customers set status = 'pending', updated_at = now()
    where id = p_id and status = 'approving';
$$;

-- Manual escape hatch for a row stuck in 'approving' (e.g. the server crashed mid-approval,
-- between claim and finalize/revert -- see plan doc). Deliberately manual, not automatic: an
-- automatic timeout-based reclaim needs a "fencing token" to stay correct (so a merely-slow, not
-- actually-crashed, original process can't finalize after someone else reclaims), which is real
-- complexity for a failure mode expected to be very rare. A human confirming "yes, this is stuck"
-- is simpler and safe. Records who intervened (accountability for a manual override), same as
-- approve_customer records approved_by.
alter table customers add column if not exists force_reset_by text;
alter table customers add column if not exists force_reset_at timestamptz;

create or replace function force_reset_stuck_approval(p_id uuid, p_reset_by text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update customers
    set status = 'pending', force_reset_by = p_reset_by, force_reset_at = now(), updated_at = now()
    where id = p_id and status = 'approving';

  if not found then
    raise exception 'Customer % is not currently stuck in approving.', p_id using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function claim_customer_for_approval(uuid) from public, anon, authenticated;
grant execute on function claim_customer_for_approval(uuid) to service_role;
revoke all on function finalize_customer_approval(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function finalize_customer_approval(uuid, text, text, text, text) to service_role;
revoke all on function revert_customer_claim(uuid) from public, anon, authenticated;
grant execute on function revert_customer_claim(uuid) to service_role;
revoke all on function force_reset_stuck_approval(uuid, text) from public, anon, authenticated;
grant execute on function force_reset_stuck_approval(uuid, text) to service_role;

-- 4. Defense in depth: reject any status transition outside the known-valid set at the schema
-- level, even from a direct SQL edit or a future buggy caller that bypasses the functions above.
-- Only fires when status actually changes (WHEN clause) -- account_type/sales_rep_id updates,
-- which don't touch status, are untouched by this trigger.
create or replace function enforce_customer_status_transition() returns trigger
language plpgsql
as $$
begin
  if not (
    (old.status = 'pending' and new.status = 'approving') or
    (old.status = 'pending' and new.status = 'rejected') or
    (old.status = 'approving' and new.status = 'approved') or
    (old.status = 'approving' and new.status = 'pending')
  ) then
    raise exception 'Invalid customer status transition: % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_status_transition_guard on customers;
create trigger customers_status_transition_guard
  before update on customers
  for each row
  when (old.status is distinct from new.status)
  execute function enforce_customer_status_transition();

-- VERIFY:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'customers'::regclass and contype = 'c';
--   (expect exactly one status-related check, allowing 'approving')
-- select proname from pg_proc
--   where proname in ('claim_customer_for_approval','finalize_customer_approval','revert_customer_claim','reject_customer');
--   (expect all four)
-- select proname from pg_proc where proname = 'approve_customer';
--   (expect zero rows -- old function dropped)
