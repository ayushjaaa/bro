-- F-5, STEP B of 2 -- switch the database's admin check from email to Auth user id.
-- Run ONLY after: 024 (every admin has a user_id) AND the admin-panel code that looks admins up by
-- user id is deployed. The block below refuses to run otherwise, so it cannot lock admins out.
--
-- Effect: is_current_user_admin() -- used by every "Admins can read ..." policy -- and the two
-- policies in 015 that compared the email directly now compare auth.uid().
--
-- ROLLBACK: see the commented block at the bottom (restores the email comparison).

begin;

do $$
begin
  if exists (select 1 from public.admin_users where user_id is null) then
    raise exception 'Refusing to switch: some admin_users rows have no user_id. Run 024 and fix them first.';
  end if;
end $$;

alter table public.admin_users alter column user_id set not null;

create or replace function public.is_current_user_admin() returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

drop policy if exists "Admins can manage sales reps" on public.sales_reps;
create policy "Admins can manage sales reps" on public.sales_reps for all
  to authenticated
  using ((select public.is_current_user_admin()))
  with check ((select public.is_current_user_admin()));

drop policy if exists "Admins can manage internal notes" on public.internal_notes;
create policy "Admins can manage internal notes" on public.internal_notes for all
  to authenticated
  using ((select public.is_current_user_admin()))
  with check ((select public.is_current_user_admin()));

commit;

-- ROLLBACK (paste and run to go back to the email comparison):
--   create or replace function public.is_current_user_admin() returns boolean
--   language sql security definer set search_path = public stable
--   as $f$ select exists (select 1 from admin_users where email = auth.jwt() ->> 'email'); $f$;
--   drop policy if exists "Admins can manage sales reps" on public.sales_reps;
--   create policy "Admins can manage sales reps" on public.sales_reps for all
--     using (exists (select 1 from admin_users where email = auth.jwt() ->> 'email'));
--   drop policy if exists "Admins can manage internal notes" on public.internal_notes;
--   create policy "Admins can manage internal notes" on public.internal_notes for all
--     using (exists (select 1 from admin_users where email = auth.jwt() ->> 'email'));
--   alter table public.admin_users alter column user_id drop not null;
