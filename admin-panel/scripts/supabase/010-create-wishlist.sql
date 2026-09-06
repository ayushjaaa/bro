-- Wishlist "folders" for the storefront -- a customer creates one or more named folders
-- (e.g. "Summer Order", "Restock List") and saves specific product variants into any of them
-- (the same variant can be saved into multiple folders at once -- a folder is a label, not an
-- exclusive bucket). Purely our own data, same RLS-scoped, no-service-role-needed pattern as
-- saved_locations (009) -- the storefront's own session-bound Supabase client reads/writes these
-- directly. Item DISPLAY details (name/image/price/stock) are deliberately NOT stored here -- only
-- the reference (variant_id + product_handle) -- so the wishlist always shows live Shopify data at
-- render time, never a stale snapshot (same "never trust cached price" principle used everywhere
-- else in this app: cart, checkout, order history).

create table if not exists wishlist_folders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table wishlist_folders enable row level security;

create policy "Customers can manage their own wishlist folders" on wishlist_folders
  for all
  using (customer_id in (select id from customers where supabase_user_id = auth.uid()))
  with check (customer_id in (select id from customers where supabase_user_id = auth.uid()));

create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references wishlist_folders(id) on delete cascade,
  variant_id text not null,
  product_handle text not null,
  added_at timestamptz not null default now(),
  unique (folder_id, variant_id)
);

alter table wishlist_items enable row level security;

-- Scoped via a join to wishlist_folders (which is itself scoped to the caller's own customer row)
-- -- same nested-ownership pattern as any RLS policy that can't check customer_id directly on the
-- table itself.
create policy "Customers can manage their own wishlist items" on wishlist_items
  for all
  using (
    folder_id in (
      select id from wishlist_folders where customer_id in (select id from customers where supabase_user_id = auth.uid())
    )
  )
  with check (
    folder_id in (
      select id from wishlist_folders where customer_id in (select id from customers where supabase_user_id = auth.uid())
    )
  );
