-- Store-wide stock aggregates for the Dashboard (Total Stock / Out-of-Stock / Low-Stock widgets).
-- See plan doc for full context. These sit alongside inventory_snapshot (002) and are kept
-- consistent with it by ONE atomic function (sync_inventory_and_aggregates) called from
-- src/app/api/webhooks/inventory/route.ts instead of the old upsert_inventory_snapshot_if_newer --
-- computing a correct running total and detecting 0/low-stock threshold crossings both require
-- knowing the item's PREVIOUS quantity, which only this function (reading then writing in one
-- transaction) can do safely under concurrent webhook deliveries for different items.
--
-- Same posture as inventory_snapshot: RLS on, public read (no sensitive data, just counts/ids),
-- writes only via the SECURITY DEFINER function (service_role executes it).

create table if not exists store_stock_totals (
  id boolean primary key default true check (id), -- singleton row trick: only one row can ever exist
  total_stock integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into store_stock_totals (id) values (true) on conflict do nothing;

create table if not exists out_of_stock_items (
  inventory_item_id text primary key,
  flagged_at timestamptz not null default now()
);

create table if not exists low_stock_items (
  inventory_item_id text primary key,
  quantity integer not null,
  flagged_at timestamptz not null default now()
);

alter table store_stock_totals enable row level security;
alter table out_of_stock_items enable row level security;
alter table low_stock_items enable row level security;

create policy "Public read of store stock totals" on store_stock_totals for select using (true);
create policy "Public read of out of stock items" on out_of_stock_items for select using (true);
create policy "Public read of low stock items" on low_stock_items for select using (true);

create or replace function sync_inventory_and_aggregates(
  p_inventory_item_id text,
  p_location_id text,
  p_quantity integer,
  p_shopify_updated_at timestamptz
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

  insert into inventory_snapshot (inventory_item_id, location_id, quantity, shopify_updated_at, updated_at)
    values (p_inventory_item_id, p_location_id, p_quantity, p_shopify_updated_at, now())
    on conflict (inventory_item_id) do update
      set quantity = excluded.quantity,
          location_id = excluded.location_id,
          shopify_updated_at = excluded.shopify_updated_at,
          updated_at = now();

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

revoke all on function sync_inventory_and_aggregates(text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function sync_inventory_and_aggregates(text, text, integer, timestamptz) to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'store_stock_totals') then
    alter publication supabase_realtime add table store_stock_totals;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'out_of_stock_items') then
    alter publication supabase_realtime add table out_of_stock_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'low_stock_items') then
    alter publication supabase_realtime add table low_stock_items;
  end if;
end $$;

-- Backfill-only: sync_inventory_and_aggregates does DELTA arithmetic against the existing
-- inventory_snapshot row, which is correct for a genuine live change but WRONG for seeding the
-- aggregates from scratch (an item whose snapshot row already holds its current, correct quantity
-- would compute a delta of 0 and never contribute to the totals). This function instead
-- recomputes all three aggregates directly from whatever is currently in inventory_snapshot --
-- used once by scripts/shopify/backfill-stock-aggregates.ts after it upserts real quantities.
create or replace function recompute_all_stock_aggregates() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update store_stock_totals set total_stock = (select coalesce(sum(quantity), 0) from inventory_snapshot), updated_at = now()
    where id = true;

  delete from out_of_stock_items where true;
  insert into out_of_stock_items (inventory_item_id)
    select inventory_item_id from inventory_snapshot where quantity = 0;

  delete from low_stock_items where true;
  insert into low_stock_items (inventory_item_id, quantity)
    select inventory_item_id, quantity from inventory_snapshot where quantity > 0 and quantity < 10;
end;
$$;

revoke all on function recompute_all_stock_aggregates() from public, anon, authenticated;
grant execute on function recompute_all_stock_aggregates() to service_role;
