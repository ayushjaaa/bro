-- Customer page-view tracking for the admin "Activity" tab. Run after 022.
--
-- Design (see the Activity plan in chat / ACTIVITY_TRACKING_PLAN notes):
--   * The storefront browser collects page views in ONE shared queue (localStorage, shared by all tabs)
--     and sends ONE batched request at most every 5 minutes -- so 40 tabs in 5 minutes = 1 request,
--     1 RPC call, 1 multi-row insert. Nothing is written on the page-render path.
--   * Writes happen ONLY through log_customer_activity(): it works out the customer from the caller's
--     own session (auth.uid()) -- the client never says "I am customer X". No insert policy exists on
--     the table, so nobody can insert directly.
--   * Reads are admin-only (RLS), same rule as 022.

begin;

create table if not exists customer_activity (
  id bigint generated always as identity primary key,
  customer_id text not null,
  action text not null default 'page_view' check (action in ('page_view')),
  path text not null check (char_length(path) <= 200),
  event_at timestamptz not null default now()
);

create index if not exists customer_activity_event_at_idx on customer_activity (event_at desc);
create index if not exists customer_activity_customer_idx on customer_activity (customer_id, event_at desc);

alter table customer_activity enable row level security;

drop policy if exists "Admins can read customer activity" on customer_activity;
create policy "Admins can read customer activity" on customer_activity for select
  to authenticated using ((select is_current_user_admin()));

-- p_events: [{ "path": "/products/abc", "at": "2026-09-20T10:00:00Z" }, ...]  (max 100 per call)
create or replace function public.log_customer_activity(p_events jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer text;
begin
  select c.id::text into v_customer
  from public.customers c
  where c.supabase_user_id = (select auth.uid()) and c.status = 'approved';

  if v_customer is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 100 then
    raise exception 'invalid events' using errcode = '22023';
  end if;

  -- abuse guard: a real browser sends one batch per 5 minutes
  if (select count(*) from public.customer_activity
      where customer_id = v_customer and event_at > now() - interval '5 minutes') > 400 then
    raise exception 'rate limited' using errcode = '54000';
  end if;

  insert into public.customer_activity (customer_id, action, path, event_at)
  select v_customer,
         'page_view',
         left(split_part(split_part(e->>'path', '?', 1), '#', 1), 200),
         -- trust the browser's timestamp only within the last 24h, otherwise use server time
         case
           when (e->>'at')::timestamptz between now() - interval '1 day' and now() + interval '1 minute'
             then (e->>'at')::timestamptz
           else now()
         end
  from jsonb_array_elements(p_events) as e
  where left(coalesce(e->>'path', ''), 1) = '/';
end;
$$;

revoke all on function public.log_customer_activity(jsonb) from public, anon, authenticated;
grant execute on function public.log_customer_activity(jsonb) to authenticated;

commit;

-- Keep 30 days only (same approach as 011).
select cron.schedule(
  'customer-activity-retention',
  '15 3 * * *',
  $$ delete from customer_activity where event_at < now() - interval '30 days'; $$
);

-- ROLLBACK:
--   select cron.unschedule('customer-activity-retention');
--   drop function if exists public.log_customer_activity(jsonb);
--   drop table if exists customer_activity;
