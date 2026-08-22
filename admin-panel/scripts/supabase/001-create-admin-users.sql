-- DECISIONS.md item 44a-i — admin_users table.
-- RLS enabled with NO client-facing policies at all: only the Service Role key (server-only,
-- bypasses RLS) can read/write this table. No authenticated or anon user can ever
-- INSERT/UPDATE/DELETE/SELECT here directly — admin status is only checked server-side via
-- requireAdmin(), never trusted from a client-editable source.

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

-- Deliberately no policies are created here. With RLS enabled and zero policies, every
-- client-role request (anon, authenticated) is denied by default. Only the service_role key
-- (which bypasses RLS entirely) can access this table — exactly the intended behavior.
