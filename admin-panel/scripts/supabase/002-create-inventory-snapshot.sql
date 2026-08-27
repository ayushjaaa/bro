-- Real-time inventory cache for the Edit Flavours screen (see plan doc for full context).
--
-- Written ONLY by the inventory webhook route (src/app/api/webhooks/inventory/route.ts) using
-- the service-role key, which bypasses RLS entirely -- same pattern as admin_users (001). Unlike
-- 001, this table DOES need a client-facing SELECT policy: the browser reads it live via Supabase
-- Realtime using the anon-role browser client (src/lib/supabase/client.ts), which is subject to
-- RLS like any other anon request. There is no sensitive data here (just a public product's stock
-- count, which the storefront already exposes indirectly via "in stock"/"sold out"), so an
-- unrestricted read policy is fine. No INSERT/UPDATE/DELETE policy exists -- all writes stay
-- service-role-only (via the function below), exactly like 001's write-lockdown intent.
--
-- `inventory_item_id` is the primary key (one row per Shopify inventory item at
-- INVENTORY_LOCATION_ID -- this app only tracks the one location, so location_id is stored for
-- traceability/debugging but is not part of the key).
--
-- `shopify_updated_at` is the ordering field, populated from the webhook payload's own
-- `updated_at`. `quantity` itself is NEVER taken from the webhook payload (Shopify has a
-- documented bug where `available` can be wrong when multiple items change close together) -- it
-- is always the result of a fresh GraphQL re-query performed by the webhook route. The upsert
-- function only overwrites a row if the incoming event is newer than what's already stored, since
-- Shopify explicitly does not guarantee webhook delivery order.

create table if not exists inventory_snapshot (
  inventory_item_id text primary key,
  location_id text not null,
  quantity integer not null,
  shopify_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table inventory_snapshot enable row level security;

create policy "Public read of inventory snapshot"
  on inventory_snapshot for select
  using (true);

-- Deliberately no insert/update/delete policy -- writes only happen via the service-role key
-- (bypasses RLS) or via the SECURITY DEFINER function below (also service-role only, see grants).

-- Atomic "only write if newer" upsert, so the compare-and-write isn't split into a racy
-- select-then-write from the webhook route (two concurrent webhook deliveries for the same item
-- must not interleave into a stale final write).
create or replace function upsert_inventory_snapshot_if_newer(
  p_inventory_item_id text,
  p_location_id text,
  p_quantity integer,
  p_shopify_updated_at timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  insert into inventory_snapshot (inventory_item_id, location_id, quantity, shopify_updated_at, updated_at)
  values (p_inventory_item_id, p_location_id, p_quantity, p_shopify_updated_at, now())
  on conflict (inventory_item_id) do update
    set quantity = excluded.quantity,
        location_id = excluded.location_id,
        shopify_updated_at = excluded.shopify_updated_at,
        updated_at = now()
  where inventory_snapshot.shopify_updated_at < excluded.shopify_updated_at;
$$;

-- Only the webhook route (service role) may call this -- anon/authenticated must go through
-- Realtime read-only, never write directly.
revoke all on function upsert_inventory_snapshot_if_newer(text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function upsert_inventory_snapshot_if_newer(text, text, integer, timestamptz) to service_role;

-- Required for Supabase Realtime's postgres_changes to broadcast changes on this table at all --
-- easy to forget, and wrapped in a guard so re-running this file is safe.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'inventory_snapshot'
  ) then
    alter publication supabase_realtime add table inventory_snapshot;
  end if;
end $$;
