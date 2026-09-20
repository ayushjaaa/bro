-- Cart tracking was writable by ANYONE, with no login at all. Run after 020.
--
-- Found by probing every table and RPC as (a) anon and (b) a freshly signed-up, non-admin user:
--   * `cart_events` had "Anyone can log cart activity" with `check (true)` -> any visitor could insert
--     unlimited rows with any customer_id / product_id / action / quantity.
--   * `upsert_cart_snapshot_batch(p_customer_id, p_items)` is SECURITY DEFINER and was granted to
--     `anon`. It first DELETES every cart_snapshot row for p_customer_id and then inserts whatever
--     jsonb the caller sends -- so anyone could wipe or overwrite any customer's cart record, or bloat
--     the table, with no size limit.
-- Both feed the admin panel's cart / funnel analytics (sales reps chase abandoned carts from them), so
-- this is unauthenticated tampering with data staff act on, plus a storage-abuse vector.
--
-- The storefront only ever writes these from the SERVER, with the signed-in customer's own session
-- (lib/cart-tracking.ts, approved customers only). So: require that session, and require that the
-- customer_id being written is the caller's own approved customer row.

-- 1) cart_events: only an approved customer may log activity, only for themselves, only known actions.
drop policy if exists "Anyone can log cart activity" on cart_events;

create policy "Approved customers can log their own cart activity" on cart_events for insert
  to authenticated
  with check (
    action in ('add_to_cart', 'update_quantity', 'remove_from_cart')
    and (quantity is null or quantity between 0 and 100000)
    and exists (
      select 1 from customers c
      where c.id::text = cart_events.customer_id
        and c.supabase_user_id = auth.uid()
        and c.status = 'approved'
    )
  );

-- 2) upsert_cart_snapshot_batch: same ownership rule, plus size/value limits, and no anon access.
create or replace function upsert_cart_snapshot_batch(p_customer_id text, p_items jsonb) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (trusted server jobs) may write any cart; everyone else only their own approved cart.
  if auth.role() <> 'service_role' and not exists (
    select 1 from customers c
    where c.id::text = p_customer_id
      and c.supabase_user_id = auth.uid()
      and c.status = 'approved'
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'invalid items' using errcode = '22023';
  end if;

  delete from cart_snapshot where customer_id = p_customer_id;

  insert into cart_snapshot (customer_id, product_id, variant_id, quantity, updated_at)
  select p_customer_id, left(item->>'product_id', 200), left(item->>'variant_id', 200), (item->>'quantity')::integer, now()
  from jsonb_array_elements(p_items) as item
  where (item->>'quantity')::integer between 1 and 100000
    and coalesce(item->>'variant_id', '') <> ''
  on conflict (customer_id, variant_id) do update set quantity = excluded.quantity, updated_at = now();
end;
$$;

revoke all on function upsert_cart_snapshot_batch(text, jsonb) from public, anon, authenticated;
grant execute on function upsert_cart_snapshot_batch(text, jsonb) to authenticated, service_role;

-- 3) OPTIONAL -- admin-only reads for internal dashboard tables. These are readable by anyone on the
--    internet today (`using (true)`): product_health_snapshot (2k rows: missing images, price
--    anomalies...), variant_sku_index, store_stock_totals, out_of_stock_items, low_stock_items.
--    NOT applied by default because the admin dashboard reads product_health_snapshot / variant_sku_index
--    live from the BROWSER (useLiveTable / Realtime): apply, then load the admin dashboard as an admin
--    and check the panels still fill. (inventory_snapshot is left public on purpose: the storefront
--    reads live stock from it with the anon key.)
--
-- drop policy if exists "Public read of product health snapshot" on product_health_snapshot;
-- create policy "Admins can read product health snapshot" on product_health_snapshot for select using (is_current_user_admin());
-- drop policy if exists "Public read of variant sku index" on variant_sku_index;
-- create policy "Admins can read variant sku index" on variant_sku_index for select using (is_current_user_admin());
-- drop policy if exists "Public read of store stock totals" on store_stock_totals;
-- create policy "Admins can read store stock totals" on store_stock_totals for select using (is_current_user_admin());
-- drop policy if exists "Public read of out of stock items" on out_of_stock_items;
-- create policy "Admins can read out of stock items" on out_of_stock_items for select using (is_current_user_admin());
-- drop policy if exists "Public read of low stock items" on low_stock_items;
-- create policy "Admins can read low stock items" on low_stock_items for select using (is_current_user_admin());
