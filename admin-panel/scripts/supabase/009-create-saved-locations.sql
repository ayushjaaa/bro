-- Saved shipping locations for the storefront's custom checkout (Draft Order flow, Part 1).
-- Purely our own data -- Shopify's Customer address book was considered and rejected (its
-- Storefront API mutations require a customerAccessToken, which this app's customers can never
-- get: their Shopify customer record has no password, only email/name, since login is Supabase
-- Auth, not Shopify's). One row per address a customer has saved; the checkout's "Ship" option
-- reads/writes this table directly via RLS, no service-role client needed.

create table if not exists saved_locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  location_name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  province text not null,
  postal_code text not null,
  country text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table saved_locations enable row level security;

-- A customer can read/write only rows tied to THEIR OWN customers.id -- matched via
-- supabase_user_id, the same auth.uid() link access-state.ts already uses to find a customer's own
-- row. No admin/service-role bypass needed here (unlike customers itself): a saved address has no
-- approval workflow, it's the customer's own data end to end.
create policy "Customers can manage their own saved locations" on saved_locations
  for all
  using (customer_id in (select id from customers where supabase_user_id = auth.uid()))
  with check (customer_id in (select id from customers where supabase_user_id = auth.uid()));
