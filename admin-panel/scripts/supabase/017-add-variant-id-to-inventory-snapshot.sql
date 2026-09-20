-- Adds the Shopify ProductVariant GID to inventory_snapshot, alongside the existing
-- inventory_item_id key. The storefront (see storefront/src/lib/shopify/queries/products.ts)
-- only ever has a variant's own gid://shopify/ProductVariant/... id (from the Storefront API,
-- which never exposes inventoryItem -- that's Admin-API-only), so it needs a column it can filter
-- on directly rather than resolving inventory_item_id itself, which it has no Shopify credential
-- for (admin-panel/storefront credential separation -- storefront must never hold an Admin token).
--
-- Nullable + no backfill guarantee here: existing rows get variant_id filled in by
-- scripts/shopify/backfill-inventory-snapshot-variant-ids.ts (one-time), new rows get it from the
-- inventory webhook route going forward (src/lib/shopify/inventory-webhook-queries.ts now also
-- fetches variant.id). The storefront read path must treat a missing/null variant_id match as
-- "fall back to Shopify Storefront API's own quantityAvailable", never as "0".

alter table inventory_snapshot add column if not exists variant_id text;

create index if not exists inventory_snapshot_variant_id_idx on inventory_snapshot (variant_id);

-- Same public-read posture as the rest of this table (002) -- variant_id is exactly as
-- non-sensitive as inventory_item_id already was, no new RLS policy needed, existing
-- "Public read of inventory snapshot" policy already covers the new column.

-- sync_inventory_and_aggregates (003) gains a p_variant_id param and now writes it alongside
-- quantity on every call -- replaces the 003 version wholesale (same name, new signature, so the
-- old 4-arg version is dropped first since Postgres treats a different arg list as a different
-- overload, not a replacement).
drop function if exists sync_inventory_and_aggregates(text, text, integer, timestamptz);

create or replace function sync_inventory_and_aggregates(
  p_inventory_item_id text,
  p_location_id text,
  p_quantity integer,
  p_shopify_updated_at timestamptz,
  p_variant_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_quantity integer;
  v_row_exists boolean;
  v_row_is_newer boolean;
  v_low_stock_threshold constant integer := 10; -- default; change here if the business wants a different cutoff
begin
  select quantity, (shopify_updated_at >= p_shopify_updated_at)
    into v_old_quantity, v_row_is_newer
    from inventory_snapshot where inventory_item_id = p_inventory_item_id;
  v_row_exists := found;

  -- Same "ignore out-of-order/duplicate deliveries" guard as the original upsert function.
  if v_row_exists and v_row_is_newer then
    return;
  end if;
  v_old_quantity := coalesce(v_old_quantity, 0);

  insert into inventory_snapshot (inventory_item_id, location_id, quantity, shopify_updated_at, updated_at, variant_id)
    values (p_inventory_item_id, p_location_id, p_quantity, p_shopify_updated_at, now(), p_variant_id)
    on conflict (inventory_item_id) do update
      set quantity = excluded.quantity,
          location_id = excluded.location_id,
          shopify_updated_at = excluded.shopify_updated_at,
          updated_at = now(),
          variant_id = coalesce(excluded.variant_id, inventory_snapshot.variant_id);

  -- `where id = true` is required even though this is a singleton row -- this Supabase project
  -- rejects an UPDATE with no WHERE clause at all.
  update store_stock_totals set total_stock = total_stock + (p_quantity - v_old_quantity), updated_at = now()
    where id = true;

  if p_quantity = 0 then
    insert into out_of_stock_items (inventory_item_id) values (p_inventory_item_id) on conflict do nothing;
  else
    delete from out_of_stock_items where inventory_item_id = p_inventory_item_id;
  end if;

  if p_quantity > 0 and p_quantity < v_low_stock_threshold then
    insert into low_stock_items (inventory_item_id, quantity) values (p_inventory_item_id, p_quantity)
      on conflict (inventory_item_id) do update set quantity = excluded.quantity;
  else
    delete from low_stock_items where inventory_item_id = p_inventory_item_id;
  end if;
end;
$$;

revoke all on function sync_inventory_and_aggregates(text, text, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function sync_inventory_and_aggregates(text, text, integer, timestamptz, text) to service_role;
