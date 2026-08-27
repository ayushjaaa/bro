-- Product-metadata health cache for the Dashboard (status breakdown, missing image/SKU, price
-- anomalies, duplicate SKU, stale drafts, brand/sub-category coverage, recently-updated feed).
-- See plan doc for full context. Fed by a new PRODUCTS_CREATE/PRODUCTS_UPDATE/PRODUCTS_DELETE
-- webhook (src/app/api/webhooks/products/route.ts) -- a SEPARATE pipeline from inventory_snapshot
-- (002/003), since product metadata and inventory levels are different Shopify events with
-- different payloads. One row per PRODUCT (not per variant), so this stays small (bounded by
-- product count, typically hundreds-to-low-thousands) even for a large catalog.
--
-- Same posture as inventory_snapshot: RLS on, public read, writes only via SECURITY DEFINER
-- functions (service_role executes them).

create table if not exists product_health_snapshot (
  product_id text primary key,
  title text not null,
  status text not null,
  has_image boolean not null,
  variant_count integer not null,
  missing_sku_count integer not null,
  has_price_anomaly boolean not null,
  brand_id text,
  brand_name text,
  subcategory_id text,
  subcategory_name text,
  missing_required_filter boolean not null default false,
  created_at timestamptz not null,
  published_at timestamptz,
  shopify_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table product_health_snapshot enable row level security;
create policy "Public read of product health snapshot" on product_health_snapshot for select using (true);

-- Store-wide SKU collision index -- one row per variant, so a duplicate SKU (owned by more than
-- one variant, possibly across different products) is a plain lookup instead of an all-products
-- scan. RLS: public read (it's just SKUs, no other data).
create table if not exists variant_sku_index (
  variant_id text primary key,
  product_id text not null,
  sku text not null
);
create index if not exists variant_sku_index_sku_idx on variant_sku_index (sku);

alter table variant_sku_index enable row level security;
create policy "Public read of variant sku index" on variant_sku_index for select using (true);

create or replace function upsert_product_health_snapshot_if_newer(
  p_product_id text,
  p_title text,
  p_status text,
  p_has_image boolean,
  p_variant_count integer,
  p_missing_sku_count integer,
  p_has_price_anomaly boolean,
  p_brand_id text,
  p_brand_name text,
  p_subcategory_id text,
  p_subcategory_name text,
  p_missing_required_filter boolean,
  p_created_at timestamptz,
  p_published_at timestamptz,
  p_shopify_updated_at timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  insert into product_health_snapshot (
    product_id, title, status, has_image, variant_count, missing_sku_count, has_price_anomaly,
    brand_id, brand_name, subcategory_id, subcategory_name, missing_required_filter,
    created_at, published_at, shopify_updated_at, updated_at
  )
  values (
    p_product_id, p_title, p_status, p_has_image, p_variant_count, p_missing_sku_count, p_has_price_anomaly,
    p_brand_id, p_brand_name, p_subcategory_id, p_subcategory_name, p_missing_required_filter,
    p_created_at, p_published_at, p_shopify_updated_at, now()
  )
  on conflict (product_id) do update
    set title = excluded.title,
        status = excluded.status,
        has_image = excluded.has_image,
        variant_count = excluded.variant_count,
        missing_sku_count = excluded.missing_sku_count,
        has_price_anomaly = excluded.has_price_anomaly,
        brand_id = excluded.brand_id,
        brand_name = excluded.brand_name,
        subcategory_id = excluded.subcategory_id,
        subcategory_name = excluded.subcategory_name,
        missing_required_filter = excluded.missing_required_filter,
        published_at = excluded.published_at,
        shopify_updated_at = excluded.shopify_updated_at,
        updated_at = now()
  where product_health_snapshot.shopify_updated_at < excluded.shopify_updated_at;
$$;

create or replace function delete_product_health_snapshot(p_product_id text) returns void
language sql
security definer
set search_path = public
as $$
  delete from variant_sku_index where product_id = p_product_id;
  delete from product_health_snapshot where product_id = p_product_id;
$$;

create or replace function replace_variant_sku_index_for_product(p_product_id text, p_variants jsonb) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from variant_sku_index where product_id = p_product_id;
  insert into variant_sku_index (variant_id, product_id, sku)
  select (v->>'variant_id'), p_product_id, (v->>'sku')
  from jsonb_array_elements(p_variants) as v
  where coalesce(v->>'sku', '') != '';
end;
$$;

revoke all on function upsert_product_health_snapshot_if_newer(
  text, text, text, boolean, integer, integer, boolean, text, text, text, text, boolean, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function upsert_product_health_snapshot_if_newer(
  text, text, text, boolean, integer, integer, boolean, text, text, text, text, boolean, timestamptz, timestamptz, timestamptz
) to service_role;

revoke all on function delete_product_health_snapshot(text) from public, anon, authenticated;
grant execute on function delete_product_health_snapshot(text) to service_role;

revoke all on function replace_variant_sku_index_for_product(text, jsonb) from public, anon, authenticated;
grant execute on function replace_variant_sku_index_for_product(text, jsonb) to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'product_health_snapshot') then
    alter publication supabase_realtime add table product_health_snapshot;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'variant_sku_index') then
    alter publication supabase_realtime add table variant_sku_index;
  end if;
end $$;
