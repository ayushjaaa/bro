-- Least-privilege reads for the sign-up flow. Run after 018 and 019.
--
-- 1) sales_reps was readable by ANY signed-in user (`auth.role() = 'authenticated'`). Sign-up is
--    open, so "signed in" is not the same as "customer": anyone could create an account and read
--    every sales rep's name, phone and email. Only an APPROVED customer needs to see their rep
--    (getCustomerAccessState joins it for approved customers only); admins keep full access through
--    their own "Admins can manage sales reps" policy.
drop policy if exists "Authenticated users can read sales reps" on sales_reps;

create policy "Approved customers can read sales reps" on sales_reps for select
  using (
    exists (
      select 1 from customers
      where customers.supabase_user_id = auth.uid()
        and customers.status = 'approved'
    )
  );

-- 2) "Is this email already registered?" -- asked by the sign-up form BEFORE the applicant has an
--    account, so it can't rely on the caller's own RLS (they can only see their own row, and they
--    don't have one yet). Until now the storefront did this with the SERVICE-ROLE key, i.e. a public,
--    unauthenticated endpoint held a key that bypasses every policy. This SECURITY DEFINER function
--    exposes exactly one bit -- true/false -- and nothing else, so the storefront can use the
--    ordinary anon key for it. (It still confirms that an email exists; that is the accepted
--    sign-up trade-off, best paired with CAPTCHA / rate limiting.)
create or replace function email_registered(p_email text) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from customers where lower(email) = lower(trim(p_email)));
$$;

revoke all on function email_registered(text) from public;
grant execute on function email_registered(text) to anon, authenticated;
