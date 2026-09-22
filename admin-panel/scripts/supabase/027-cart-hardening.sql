-- Cart hardening (C-7 + C-8). Safe to run more than once. Run in the Supabase SQL editor.
--
-- C-7: customer_carts.cart_id was any text, and its policy applied to every role and to non-approved
-- customers. The app later loads whatever cart id is stored there, so:
--   * only an APPROVED customer may touch their own pointer, and only as `authenticated`
--   * cart_id must look like a Shopify cart id (gid://shopify/Cart/<token>?key=<token>), max 200 chars
-- C-8: cart_events.product_id had no length limit (a signed-in customer could insert huge values through
--   the REST API).
--
-- The constraints are NOT VALID on purpose: they are enforced for every NEW or changed row right away and
-- do not scan or reject rows that already exist (all 4 existing pointers match anyway).
begin;

drop policy if exists "Customers can manage their own cart pointer" on public.customer_carts;
drop policy if exists "Approved customers manage their own cart pointer" on public.customer_carts;
create policy "Approved customers manage their own cart pointer" on public.customer_carts
  for all
  to authenticated
  using (
    customer_id in (
      select id from public.customers
      where supabase_user_id = (select auth.uid()) and status = 'approved'
    )
  )
  with check (
    customer_id in (
      select id from public.customers
      where supabase_user_id = (select auth.uid()) and status = 'approved'
    )
  );

alter table public.customer_carts drop constraint if exists customer_carts_cart_id_format;
alter table public.customer_carts
  add constraint customer_carts_cart_id_format
  check (cart_id ~ '^gid://shopify/Cart/[A-Za-z0-9]+(\?key=[A-Za-z0-9]+)?$' and char_length(cart_id) <= 200)
  not valid;

alter table public.cart_events drop constraint if exists cart_events_product_id_length;
alter table public.cart_events
  add constraint cart_events_product_id_length
  check (char_length(product_id) <= 200)
  not valid;

commit;

-- VERIFY (expect: 1 policy for authenticated with 'approved' in its qual; 2 constraints):
--   select policyname, roles, cmd from pg_policies where tablename = 'customer_carts';
--   select conname, convalidated from pg_constraint
--     where conname in ('customer_carts_cart_id_format', 'cart_events_product_id_length');
--
-- Optional, later (checks the OLD rows too; only if this returns 0 rows):
--   select cart_id from public.customer_carts where not (cart_id ~ '^gid://shopify/Cart/[A-Za-z0-9]+(\?key=[A-Za-z0-9]+)?$' and char_length(cart_id) <= 200);
--   alter table public.customer_carts validate constraint customer_carts_cart_id_format;
--
-- ROLLBACK:
--   alter table public.cart_events drop constraint if exists cart_events_product_id_length;
--   alter table public.customer_carts drop constraint if exists customer_carts_cart_id_format;
--   drop policy if exists "Approved customers manage their own cart pointer" on public.customer_carts;
--   create policy "Customers can manage their own cart pointer" on public.customer_carts for all
--     using (customer_id in (select id from customers where supabase_user_id = auth.uid()))
--     with check (customer_id in (select id from customers where supabase_user_id = auth.uid()));
