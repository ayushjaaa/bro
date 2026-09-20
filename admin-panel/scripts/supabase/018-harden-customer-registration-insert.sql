-- SECURITY FIX (critical) -- run this first.
--
-- 005's "Customers can insert their own registration" policy only checked
-- `auth.uid() = supabase_user_id`. It said nothing about WHICH values the row may carry, so any
-- signed-in user (sign-up is open: anyone can create an Auth user with the public anon key) could
-- INSERT their own row directly through the Supabase REST API with `status = 'approved'` -- no
-- admin involved -- and instantly get prices, cart and checkout. Confirmed live with a throwaway
-- user before this migration was written: the insert was ACCEPTED and the row stored as approved.
-- (UPDATE was already safe: there is deliberately no update policy for customers.)
--
-- A registration may now only create a PENDING row that carries none of the fields an admin or the
-- approval flow assigns. Approval still works: it goes through SECURITY DEFINER functions / the
-- service role (see 005), which bypass RLS.

drop policy if exists "Customers can insert their own registration" on customers;

create policy "Customers can insert their own registration" on customers for insert
  with check (
    auth.uid() = supabase_user_id
    and status = 'pending'
    and approved_at is null
    and approved_by is null
    and shopify_customer_id is null
    and account_number is null
    and sales_rep_id is null
  );
