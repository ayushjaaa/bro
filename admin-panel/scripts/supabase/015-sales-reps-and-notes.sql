-- Two features, opposite trust boundaries:
--   1. Assigned sales rep -- admin assigns a rep to a customer; the customer sees name/phone/
--      email on their own storefront account page. Reusable list (not free-text per customer)
--      so a rep's number changing updates everywhere they're assigned.
--   2. Internal team notes -- staff-only notes on a customer account or an individual order.
--      Its own table, admin-only RLS, never touched by any storefront-facing query -- must be
--      structurally incapable of reaching the storefront, not just "we won't render it there."

create table if not exists sales_reps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table sales_reps enable row level security;

-- Read is low-sensitivity (a business contact list, not private data) -- any authenticated
-- customer can read it (needed for the storefront's join off their own customers.sales_rep_id),
-- not just admins. Only admins can create/update rep records.
create policy "Authenticated users can read sales reps" on sales_reps for select
  using (auth.role() = 'authenticated');

create policy "Admins can manage sales reps" on sales_reps for all
  using (exists (select 1 from admin_users where email = auth.jwt() ->> 'email'));

alter table customers add column if not exists sales_rep_id uuid references sales_reps(id);

create table if not exists internal_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('customer', 'order')),
  entity_id text not null,
  body text not null,
  created_by text not null, -- the admin's email (admin_users / auth.jwt())
  created_at timestamptz not null default now()
);

create index if not exists internal_notes_entity_idx on internal_notes (entity_type, entity_id);

alter table internal_notes enable row level security;

-- Admin-only, full stop -- the one table in this migration that must never be reachable from a
-- customer-scoped session, by design.
create policy "Admins can manage internal notes" on internal_notes for all
  using (exists (select 1 from admin_users where email = auth.jwt() ->> 'email'));
