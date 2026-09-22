-- K3: list_customer_carts() is SECURITY DEFINER (runs with its owner's rights), so its table
-- lookups must not depend on a caller-controlled search_path -- same reasoning, and same fix, as
-- 026's email_registered(). Not currently exploitable (grants already restrict execution to
-- service_role only -- no customer session can call this at all), but hardened for defense in
-- depth regardless. Safe to run more than once.
--
-- Behaviour is unchanged: same signature, same result shape, same grants.
create or replace function public.list_customer_carts(
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
set search_path = ''
as $$
  with agg as (
    select
      cs.customer_id,
      sum(cs.quantity) as item_count,
      max(cs.updated_at) as last_updated
    from public.cart_snapshot cs
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
    join public.customers c on c.id::text = a.customer_id
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

revoke all on function public.list_customer_carts(text, int, int) from public, anon, authenticated;
grant execute on function public.list_customer_carts(text, int, int) to service_role;

-- VERIFY (expect: proconfig = {search_path=""}):
--   select proname, prosecdef, proconfig from pg_proc where proname = 'list_customer_carts';
--
-- ROLLBACK: re-run 012-cart-snapshot-pagination.sql (identical body, search_path = public).
