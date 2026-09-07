-- Cart data (cart_events, cart_snapshot) is high-volume, low-value-per-row activity data -- keep
-- only the last 10 days so these tables don't grow unbounded. Runs daily via pg_cron rather than
-- from application code, so cleanup happens even if the storefront/admin apps are down.

create extension if not exists pg_cron;

select cron.schedule(
  'cart-data-retention',
  '0 3 * * *', -- daily at 03:00 UTC
  $$
    delete from cart_events where event_at < now() - interval '10 days';
    delete from cart_snapshot where updated_at < now() - interval '10 days';
  $$
);
