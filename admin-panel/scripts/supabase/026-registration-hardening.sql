-- Registration hardening (F1-6 + F1-9). Safe to run more than once. Run in the Supabase SQL editor.
--
-- PART 1 (F1-9): email_registered() is SECURITY DEFINER (runs with its owner's rights), so its
-- name lookups must not depend on a caller-controlled search_path. Empty search_path + fully
-- qualified names means a look-alike table in another schema can never be picked up.
-- Same answer as before: true/false only.
create or replace function public.email_registered(p_email text) returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (select 1 from public.customers where lower(email) = lower(trim(p_email)));
$$;

revoke all on function public.email_registered(text) from public;
grant execute on function public.email_registered(text) to anon, authenticated;

-- PART 2 (F1-6): an applicant whose registration failed half-way must be able to remove the
-- licence files they just uploaded (otherwise personal documents are orphaned in storage).
-- Allowed ONLY while they have no `customers` row: once an application exists its documents are
-- evidence for the admin review and the applicant can no longer delete them.
drop policy if exists "Applicants can delete their own documents before applying" on storage.objects;
create policy "Applicants can delete their own documents before applying" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'registration-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.customers c where c.supabase_user_id = (select auth.uid())
    )
  );

-- VERIFY (expect: proconfig = {search_path=""}, and one DELETE policy):
--   select proname, prosecdef, proconfig from pg_proc where proname = 'email_registered';
--   select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects'
--     and policyname like 'Applicants can delete%';
--
-- ROLLBACK:
--   create or replace function public.email_registered(p_email text) returns boolean
--     language sql security definer set search_path = public stable
--     as $f$ select exists (select 1 from customers where lower(email) = lower(trim(p_email))); $f$;
--   drop policy if exists "Applicants can delete their own documents before applying" on storage.objects;
