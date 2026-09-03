-- Extends `customers` (005) with the real fields the storefront's already-built Wholesale/Retail
-- signup wizards collect (legal vs. operating business name, business number, store count,
-- multi-select business types, monthly purchase range, sells-online + URL + Instagram, full
-- shipping AND billing addresses, 2 licence file storage paths, tax-exempt flag, referral source,
-- e-signature). Additive only -- the older, narrower columns from 005 (pst_number, vpt_number,
-- type_of_business, license_number, business_registration_number) are left in place, unused.
--
-- Also adds the missing "customer can read their own row" policy -- 005 only let a customer
-- INSERT their own row, never SELECT it back. Registration-time password login (this session's
-- plan) needs the storefront to read a customer's own `status` right after they authenticate, to
-- decide whether to let a pending/rejected login through.

alter table customers
  add column if not exists personal_cell text,
  add column if not exists legal_business_name text,
  add column if not exists operating_name text,
  add column if not exists business_number text,
  add column if not exists num_stores integer,
  add column if not exists business_types text[],
  add column if not exists monthly_purchase_range text,
  add column if not exists sells_online boolean,
  add column if not exists online_url text,
  add column if not exists instagram_handle text,
  add column if not exists ship_line1 text,
  add column if not exists ship_line2 text,
  add column if not exists ship_city text,
  add column if not exists ship_province text,
  add column if not exists ship_postal_code text,
  add column if not exists bill_same_as_shipping boolean,
  add column if not exists bill_line1 text,
  add column if not exists bill_line2 text,
  add column if not exists bill_city text,
  add column if not exists bill_province text,
  add column if not exists bill_postal_code text,
  add column if not exists business_licence_path text,
  add column if not exists specialty_licence_path text,
  add column if not exists tax_exempt boolean,
  add column if not exists referral_source text,
  add column if not exists signature_name text,
  add column if not exists signed_at timestamptz;

drop policy if exists "Customers can read their own row" on customers;
create policy "Customers can read their own row" on customers for select
  using (auth.uid() = supabase_user_id);

-- ---------------------------------------------------------------------------------------------
-- Storage bucket for the 2 registration licence uploads. Private (not public) -- a customer may
-- only read/write objects under their own auth.uid()-prefixed path; service_role (admin panel,
-- reviewing applications) can read everything via the Storage API's signed-URL flow.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('registration-documents', 'registration-documents', false)
  on conflict (id) do nothing;

drop policy if exists "Customers can upload their own registration documents" on storage.objects;
create policy "Customers can upload their own registration documents" on storage.objects
  for insert
  with check (
    bucket_id = 'registration-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Customers can read their own registration documents" on storage.objects;
create policy "Customers can read their own registration documents" on storage.objects
  for select
  using (
    bucket_id = 'registration-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
