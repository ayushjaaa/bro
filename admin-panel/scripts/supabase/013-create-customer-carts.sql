-- Account-tied cart pointer -- lets a customer's cart survive logout/login and follow them across
-- devices (see PERSISTENT_CART_PLAN.md at repo root for the full design). Confirmed against
-- Shopify's own Storefront API docs that this isn't natively supported: the Customer object has no
-- cart/carts/lastCart field, cart(id:...) requires an already-known cart ID, and
-- cartBuyerIdentityUpdate only attaches identity to an existing cart -- it can't retrieve one. So
-- this table is the missing piece: a customer_id -> cart_id pointer we maintain ourselves.
--
-- Deliberately does NOT store cart contents (line items/quantities/prices) -- only the Shopify
-- cart ID itself. The real data is always re-fetched live from Shopify's cart(id:...) query at
-- restore time (same "never trust a cached snapshot" principle wishlist_items already follows for
-- product display data), so this table can never drift out of sync with the actual cart.
--
-- One row per customer (customer_id is the primary key, not just indexed) -- an upsert always
-- overwrites in place, so there's never more than one "last known cart" per customer to reconcile.

create table if not exists customer_carts (
  customer_id uuid primary key references customers(id) on delete cascade,
  cart_id text not null,
  updated_at timestamptz not null default now()
);

alter table customer_carts enable row level security;

-- Same ownership pattern as saved_locations/wishlist_folders -- a customer can read/write only the
-- row tied to their own customers.id, matched via supabase_user_id = auth.uid(). No admin/
-- service-role bypass needed: this is purely session-restore plumbing, not data an admin needs to
-- audit (cart_events/cart_snapshot already cover admin-facing cart visibility).
create policy "Customers can manage their own cart pointer" on customer_carts
  for all
  using (customer_id in (select id from customers where supabase_user_id = auth.uid()))
  with check (customer_id in (select id from customers where supabase_user_id = auth.uid()));
