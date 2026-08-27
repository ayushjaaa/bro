-- Customer approval system + Cart Activity + Order funnel (see plan doc for full context).
--
-- Security posture is DELIBERATELY DIFFERENT from every table built earlier this session
-- (inventory_snapshot, product_health_snapshot, etc.) -- those hold public storefront data, fine
-- to read openly. This is customer PII and revenue data, so these three tables are ADMIN-ONLY
-- READ: the RLS policy checks the CONNECTED user's own verified JWT email against admin_users
-- (same trust boundary as requireAdmin() itself), not a blanket "anyone can read" policy. This
-- still lets an admin's own logged-in browser subscribe live via Supabase Realtime (Realtime
-- respects RLS per-subscriber), it just means nobody else can.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid,
  email text not null,
  first_name text not null,
  last_name text not null,
  phone text,
  business_name text,
  business_registration_number text,
  pst_number text,
  vpt_number text,
  type_of_business text,
  license_number text,
  account_type text not null check (account_type in ('retail', 'wholesale')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text,
  shopify_customer_id text,
  updated_at timestamptz not null default now()
);

alter table customers enable row level security;

create policy "Admins can read customers" on customers for select
  using (exists (select 1 from admin_users where email = auth.jwt() ->> 'email'));

-- A registering customer can insert their own pending row (the future storefront's job) --
-- scoped to their own auth uid so one customer can't submit a row on another's behalf.
create policy "Customers can insert their own registration" on customers for insert
  with check (auth.uid() = supabase_user_id);

-- No update/delete policy for anon/authenticated -- approval status changes only via the
-- SECURITY DEFINER functions below (service_role / admin action only).

create or replace function approve_customer(
  p_id uuid,
  p_approved_by text,
  p_shopify_customer_id text
) returns void
language sql
security definer
set search_path = public
as $$
  update customers
    set status = 'approved',
        approved_at = now(),
        approved_by = p_approved_by,
        shopify_customer_id = p_shopify_customer_id,
        updated_at = now()
    where id = p_id;
$$;

create or replace function reject_customer(p_id uuid) returns void
language sql
security definer
set search_path = public
as $$
  update customers set status = 'rejected', updated_at = now() where id = p_id;
$$;

create or replace function update_customer_account_type(p_id uuid, p_account_type text) returns void
language sql
security definer
set search_path = public
as $$
  update customers set account_type = p_account_type, updated_at = now() where id = p_id;
$$;

revoke all on function approve_customer(uuid, text, text) from public, anon, authenticated;
grant execute on function approve_customer(uuid, text, text) to service_role;
revoke all on function reject_customer(uuid) from public, anon, authenticated;
grant execute on function reject_customer(uuid) to service_role;
revoke all on function update_customer_account_type(uuid, text) from public, anon, authenticated;
grant execute on function update_customer_account_type(uuid, text) to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'customers') then
    alter publication supabase_realtime add table customers;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Cart Activity -- self-reported by the (separate, not-yet-built) storefront app. Open INSERT so
-- that app can report an event with just its anon key and zero new backend code; admin-only READ
-- since this reveals customer shopping behavior.
-- ---------------------------------------------------------------------------------------------

create table if not exists cart_events (
  id uuid primary key default gen_random_uuid(),
  customer_id text,
  product_id text,
  action text not null,
  quantity integer,
  event_at timestamptz not null default now()
);

alter table cart_events enable row level security;

create policy "Anyone can log cart activity" on cart_events for insert with check (true);

create policy "Admins can read cart events" on cart_events for select
  using (exists (select 1 from admin_users where email = auth.jwt() ->> 'email'));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cart_events') then
    alter publication supabase_realtime add table cart_events;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Order status funnel -- written only by the orders webhook route (service_role); admin-only read.
-- ---------------------------------------------------------------------------------------------

create table if not exists order_status_log (
  id uuid primary key default gen_random_uuid(),
  customer_id text,
  order_id text not null,
  old_status text,
  new_status text not null,
  changed_at timestamptz not null default now()
);

alter table order_status_log enable row level security;

create policy "Admins can read order status log" on order_status_log for select
  using (exists (select 1 from admin_users where email = auth.jwt() ->> 'email'));

-- No insert/update/delete policy at all for anon/authenticated -- only the function below
-- (service_role) writes here.

-- Only inserts a row if new_status actually differs from this order's most recently logged
-- status -- avoids duplicate rows on redundant/retried webhook deliveries for the same change.
create or replace function log_order_status_change_if_new(
  p_order_id text,
  p_customer_id text,
  p_new_status text,
  p_changed_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_status text;
begin
  select new_status into v_last_status
    from order_status_log
    where order_id = p_order_id
    order by changed_at desc
    limit 1;

  if v_last_status is distinct from p_new_status then
    insert into order_status_log (customer_id, order_id, old_status, new_status, changed_at)
      values (p_customer_id, p_order_id, v_last_status, p_new_status, p_changed_at);
  end if;
end;
$$;

revoke all on function log_order_status_change_if_new(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function log_order_status_change_if_new(text, text, text, timestamptz) to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'order_status_log') then
    alter publication supabase_realtime add table order_status_log;
  end if;
end $$;
