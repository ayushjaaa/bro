-- Forgot/reset password -- who is allowed to receive a reset link (see PASSWORD_RESET_PLAN.md).
--
-- Decides eligibility server-side, from the DB, so no value from the browser can ever classify an
-- email as reset-able: a password customer whose application is `approved`, excluding anyone who
-- is also an admin (admin resets stay off the storefront entirely -- see admin_users join below).
--
-- SECURITY DEFINER so the function body can read auth.users/auth.identities regardless of caller,
-- but EXECUTE is granted ONLY to service_role (not anon/authenticated) -- otherwise anyone could
-- call this directly via the Supabase REST API and get the exact classification (customer vs
-- admin vs Google-only vs unknown) as an instant, unrate-limited oracle, defeating the whole point
-- of the uniform "if this email is on an account..." reply the storefront's server action gives.
-- Only admin-panel's internal API route (holding the service-role key; see
-- app/api/internal/password-reset-eligibility/route.ts) is allowed to call it -- the storefront
-- itself never gets a service-role key, matching the same credential-separation reasoning as
-- delete-applicant / create-draft-order / customer-orders.
create or replace function public.password_reset_allowed(p_email text) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from auth.users u
    join auth.identities i on i.user_id = u.id and i.provider = 'email'
    where lower(u.email) = lower(trim(p_email))
      and u.deleted_at is null
      and exists (select 1 from public.customers c where c.supabase_user_id = u.id and c.status = 'approved')
      -- Join on user_id, not email -- 024-admin-users-user-id-step-a.sql's own reasoning: an email
      -- string proves nothing about who holds it, the Auth user id does.
      and not exists (select 1 from public.admin_users a where a.user_id = u.id)
  );
$$;

revoke all on function public.password_reset_allowed(text) from public, anon, authenticated;
grant execute on function public.password_reset_allowed(text) to service_role;

-- Rollback: drop function if exists public.password_reset_allowed(text);
