-- Adds account_type to list_customer_carts' return columns, needed by the admin Cart page
-- (CartOverview.tsx) to resolve each customer's cart lines at the correct price tier (retail vs.
-- wholesale dual-pricing feature) instead of always showing the native/wholesale price regardless
-- of who the cart belongs to.
--
-- Postgres doesn't allow CREATE OR REPLACE FUNCTION to change a function's return columns -- the
-- old signature must be dropped first.

drop function if exists list_customer_carts(text, int, int);

create function list_customer_carts(
  p_search text default null,
  p_limit int default 10,
  p_offset int default 0
) returns table (
  customer_id text,
  first_name text,
  last_name text,
  business_name text,
  email text,
  account_type text,
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
      c.account_type,
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

-- Same posture as the original (012) -- service-role only, exposes customer PII.
revoke all on function list_customer_carts(text, int, int) from public, anon, authenticated;
grant execute on function list_customer_carts(text, int, int) to service_role;
