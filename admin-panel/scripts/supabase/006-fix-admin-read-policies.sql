-- Fixes a real bug in 005's RLS policies: `admin_users` has zero policies for the authenticated
-- role (by design, "lockdown" posture -- see 001's own comment). When customers/cart_events/
-- order_status_log's SELECT policies did `exists (select 1 from admin_users where email = ...)`,
-- that subquery runs AS the connected authenticated user, who has no permission to read
-- admin_users at all -- so the check silently evaluated to false for every admin, every time,
-- regardless of whether their row actually existed there. Confirmed live: the JWT correctly
-- carried the admin's email, admin_users correctly had a matching row, and the policy still
-- denied every read.
--
-- Standard fix: a SECURITY DEFINER helper function, which runs with the function owner's
-- privileges (bypassing RLS internally, same trust boundary as requireAdmin() itself) to safely
-- check admin_users, then have each policy call this function instead of querying admin_users
-- directly.

create or replace function is_current_user_admin() returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admin_users where email = auth.jwt() ->> 'email');
$$;

revoke all on function is_current_user_admin() from public, anon;
grant execute on function is_current_user_admin() to authenticated;

drop policy if exists "Admins can read customers" on customers;
create policy "Admins can read customers" on customers for select
  using (is_current_user_admin());

drop policy if exists "Admins can read cart events" on cart_events;
create policy "Admins can read cart events" on cart_events for select
  using (is_current_user_admin());

drop policy if exists "Admins can read order status log" on order_status_log;
create policy "Admins can read order status log" on order_status_log for select
  using (is_current_user_admin());
