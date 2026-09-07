-- Server-side pagination for the /cart page's "Current Carts by Customer" list. Previously that
-- page fetched every cart_snapshot row and grouped/sorted/paginated in the browser -- fine at
-- small scale, but doesn't scale with the customer base. Real DB-side pagination is non-trivial
-- here because the page is grouped BY CUSTOMER (not by raw cart_snapshot row) and ordered by each
-- customer's most-recently-updated item, both of which need visibility across all of a customer's
-- rows to compute -- a plain LIMIT/OFFSET on cart_snapshot itself would split a customer's cart
-- across page boundaries and couldn't be sorted correctly. This function does that
-- grouping/ordering/search-filtering in Postgres and returns one row per customer, already paged.
--
-- total_count comes back on every row via a window function (count(*) over()) -- cheaper than a
-- second round-trip query just to compute page count, at the cost of a few repeated bytes per row
-- (irrelevant at LIMIT 10-50 page sizes).

create or replace function list_customer_carts(
  p_search text default null,
  p_limit int default 10,
  p_offset int default 0
) returns table (
  customer_id text,
  first_name text,
  last_name text,
  business_name text,
  email text,
  item_count bigint,
  last_updated timestamptz,
  total_count bigint,
  total_items bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select
      cs.customer_id,
      sum(cs.quantity) as item_count,
      max(cs.updated_at) as last_updated
    from cart_snapshot cs
    group by cs.customer_id
  ),
  joined as (
    select
      a.customer_id,
      c.first_name,
      c.last_name,
      c.business_name,
      c.email,
      a.item_count,
      a.last_updated
    from agg a
    join customers c on c.id::text = a.customer_id
    where
      p_search is null or trim(p_search) = ''
      or (c.first_name || ' ' || c.last_name) ilike '%' || p_search || '%'
      or coalesce(c.business_name, '') ilike '%' || p_search || '%'
      or c.email ilike '%' || p_search || '%'
  )
  select
    j.*,
    count(*) over() as total_count,
    sum(j.item_count) over() as total_items
  from joined j
  order by j.last_updated desc
  limit p_limit offset p_offset;
$$;

-- Same posture as upsert_cart_snapshot_batch (007) -- called from admin-panel server code using
-- the service-role client, which is already gated by requireAdmin() at the Next.js layer, not by
-- Postgres RLS. No anon/authenticated grant since this exposes customer PII (name/email).
revoke all on function list_customer_carts(text, int, int) from public, anon, authenticated;
grant execute on function list_customer_carts(text, int, int) to service_role;
