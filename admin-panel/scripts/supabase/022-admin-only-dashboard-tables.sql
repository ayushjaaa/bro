-- Internal dashboard tables were readable by anyone on the internet. Run after 021.
--
-- product_health_snapshot (which products lack images / have price anomalies / missing SKUs),
-- variant_sku_index, store_stock_totals, out_of_stock_items and low_stock_items all had
-- `for select using (true)`. That is the admin dashboard's internal data; nothing public needs it.
--
-- NOT touched on purpose: inventory_snapshot stays public -- the storefront reads live per-variant stock
-- from it with the anon key (lib/shopify/queries/products.ts -> getLiveStockForVariants).
--
-- Why this cannot break the admin dashboard (checked in the code):
--   * server render:  app/(dashboard)/page.tsx reads these with the SERVICE-ROLE client (bypasses RLS);
--   * live updates:   useLiveTable subscribes from the browser with the admin's own JWT -- the same way the
--                     already admin-only order_status_log / cart_events panels work;
--   * the storefront reads none of the five; the webhooks that write them use service-role RPCs.
--
-- For each table the admin policy is created BEFORE the public one is dropped, inside one transaction,
-- so there is never a moment with no policy.

begin;

create policy "Admins can read product health snapshot" on product_health_snapshot for select
  to authenticated using ((select is_current_user_admin()));
drop policy if exists "Public read of product health snapshot" on product_health_snapshot;

create policy "Admins can read variant sku index" on variant_sku_index for select
  to authenticated using ((select is_current_user_admin()));
drop policy if exists "Public read of variant sku index" on variant_sku_index;

create policy "Admins can read store stock totals" on store_stock_totals for select
  to authenticated using ((select is_current_user_admin()));
drop policy if exists "Public read of store stock totals" on store_stock_totals;

create policy "Admins can read out of stock items" on out_of_stock_items for select
  to authenticated using ((select is_current_user_admin()));
drop policy if exists "Public read of out of stock items" on out_of_stock_items;

create policy "Admins can read low stock items" on low_stock_items for select
  to authenticated using ((select is_current_user_admin()));
drop policy if exists "Public read of low stock items" on low_stock_items;

commit;

-- ROLLBACK (re-opens public read):
--   create policy "Public read of product health snapshot" on product_health_snapshot for select using (true);
--   create policy "Public read of variant sku index"       on variant_sku_index        for select using (true);
--   create policy "Public read of store stock totals"      on store_stock_totals       for select using (true);
--   create policy "Public read of out of stock items"      on out_of_stock_items       for select using (true);
--   create policy "Public read of low stock items"         on low_stock_items          for select using (true);
