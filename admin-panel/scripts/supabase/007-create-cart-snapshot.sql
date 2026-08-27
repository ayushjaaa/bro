-- Current cart state per customer -- separate from cart_events (which is an append-only
-- history/activity log). This table always reflects "what's in this customer's cart RIGHT NOW":
-- one row per (customer, product, variant), overwritten in place, not appended.
--
-- Designed for BATCH writes from the storefront: the storefront should debounce local cart
-- changes (e.g. wait ~2s after the last change) and send ONE call covering the customer's full
-- current cart, rather than one write per click -- both to avoid hammering Supabase and so the
-- customer's UI never blocks on a network call. upsert_cart_snapshot_batch() below accepts the
-- customer's whole cart as one jsonb array and replaces their rows atomically in a single
-- transaction, which is both the batch-friendly shape and the simplest way to keep this table an
-- exact mirror of "current cart" (an item removed from the cart just isn't in the next batch, and
-- disappears from this table too).

create table if not exists cart_snapshot (
  customer_id text not null,
  product_id text not null,
  variant_id text not null,
  quantity integer not null,
  updated_at timestamptz not null default now(),
  primary key (customer_id, variant_id)
);

alter table cart_snapshot enable row level security;

-- Same posture as cart_events: open write (the storefront reports with just its anon key), but
-- writes actually happen through the function below (batch replace), not raw insert/update, so
-- an explicit insert/update policy isn't needed here -- only the function needs grants.
create policy "Admins can read cart snapshot" on cart_snapshot for select
  using (is_current_user_admin());

create or replace function upsert_cart_snapshot_batch(p_customer_id text, p_items jsonb) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from cart_snapshot where customer_id = p_customer_id;

  insert into cart_snapshot (customer_id, product_id, variant_id, quantity, updated_at)
  select p_customer_id, (item->>'product_id'), (item->>'variant_id'), (item->>'quantity')::integer, now()
  from jsonb_array_elements(p_items) as item
  where (item->>'quantity')::integer > 0;
end;
$$;

revoke all on function upsert_cart_snapshot_batch(text, jsonb) from public, anon, authenticated;
grant execute on function upsert_cart_snapshot_batch(text, jsonb) to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cart_snapshot') then
    alter publication supabase_realtime add table cart_snapshot;
  end if;
end $$;
