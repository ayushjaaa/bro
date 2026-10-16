-- ============================================================================
-- 036: Closes the one race gap left in 034/035 -- found and proven via a live concurrent test
-- this session (customer-suspend-deactivate.test.ts). suspend_customer and
-- reset_rejected_customer_for_reapply both used a SELECT to check status, THEN a separate
-- UPDATE/DELETE with no status re-check in its own WHERE clause -- unlike deactivate_customer,
-- reactivate_customer and reject_customer, which already guard atomically (WHERE id = p_id AND
-- status = '<required>' directly on the UPDATE itself, so a second concurrent call's own WHERE
-- clause simply matches zero rows once the first has committed).
--
-- Same fix applied to both: fold the status check directly into the UPDATE/DELETE's WHERE clause
-- and use RETURNING to capture the row's data atomically with the claim. Only the call whose
-- UPDATE/DELETE actually affected a row proceeds to insert into suspended_applicants /
-- rejection_history -- the losing call's own statement affects zero rows (`not found`), so it can
-- never insert a duplicate. No schema change, only the two function bodies.
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
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to suspend a customer.' using errcode = 'P0001';
  end if;

  -- Atomic claim: a row only matches if it is neither 'approving' nor already 'suspended' AT THE
  -- MOMENT this UPDATE actually runs -- under two concurrent calls, only the first to commit can
  -- match; the second's identical WHERE clause then sees the post-update status and affects zero
  -- rows, closing the race (see 036's header comment).
  update customers set
    status = 'suspended',
    suspended_at = now(),
    suspended_by = p_suspended_by,
    suspension_reason = p_reason,
    updated_at = now()
    where id = p_id and status not in ('approving', 'suspended')
    returning email, business_number, legal_business_name, customers.supabase_user_id
    into v_email, v_business_number, v_business_name, v_supabase_user_id;

  if not found then
    -- The claim lost (or never had a chance) -- a second, cheap SELECT here (not on the hot path:
    -- this only runs for a row that's about to be refused anyway) distinguishes WHY, for the same
    -- specific error messages this function always gave.
    select status into v_status from customers where id = p_id;
    if v_status is null then
      raise exception 'Customer % not found.', p_id using errcode = 'P0002';
    elsif v_status = 'approving' then
      raise exception 'This customer is mid-approval -- wait for it to finish before suspending.' using errcode = 'P0001';
    else
      raise exception 'This customer is already suspended.' using errcode = 'P0001';
    end if;
  end if;

  insert into suspended_applicants (email, business_number, business_name, original_customer_id, suspended_by, reason)
    values (v_email, v_business_number, v_business_name, p_id, p_suspended_by, p_reason);

  return query select v_supabase_user_id;
end;
$$;

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
  -- Atomic claim-and-delete: a row only matches if it is still 'rejected' AT THE MOMENT this
  -- DELETE actually runs -- under two concurrent calls, only the first to commit can match; the
  -- second finds the row already gone and affects zero rows (same pattern as suspend_customer
  -- above). The transition trigger (034) only guards UPDATE, never DELETE, so it has no bearing
  -- here either way.
  delete from customers where id = p_id and status = 'rejected'
    returning email, business_number, legal_business_name, rejection_count, rejected_at, rejected_by, customers.supabase_user_id
    into v_email, v_business_number, v_business_name, v_rejection_count, v_rejected_at, v_rejected_by, v_supabase_user_id;

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

  return query select v_supabase_user_id;
end;
$$;

-- Grants unchanged -- same signatures, same service_role-only access as 034/035.

-- VERIFY:
-- select proname from pg_proc where proname in ('suspend_customer', 'reset_rejected_customer_for_reapply');
-- Re-run admin-panel's tests/security/customer-suspend-deactivate.test.ts -- the two race tests
-- ("suspend_customer: two concurrent clicks..." and "reset_rejected_customer_for_reapply: ...")
-- should now deterministically show exactly 1 succeeded, every run, never 2.
