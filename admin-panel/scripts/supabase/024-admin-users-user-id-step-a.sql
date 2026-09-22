-- F-5, STEP A of 2 -- tie each admin row to the Supabase Auth user id, not just an email string.
--
-- Why: admin status was decided by matching `admin_users.email` to the JWT's email claim. With open
-- sign-up and "Confirm email" off, an email string proves nothing about who holds it: if an admin's
-- email is ever in this table with NO Auth account (row added by hand, or the Auth user deleted),
-- anyone can sign up with that email and be treated as that admin. The Auth user id (`sub`) cannot
-- be chosen by a visitor, so the check moves to it.
--
-- THIS STEP IS HARMLESS: it only ADDS a nullable column and fills it. Nothing that exists today
-- reads it yet, so nobody can be locked out by running it.
--
-- ORDER OF WORK:  A (this file)  ->  deploy the admin-panel code  ->  B (025).
--
-- After running, LOOK at the result of the last SELECT. Every admin must have a user_id. Any row it
-- lists has no Auth account yet: have that person set a password via the invite script (which
-- creates the account) and re-run this file. Do NOT deploy/run B while that list is not empty.

begin;

alter table public.admin_users add column if not exists user_id uuid;

update public.admin_users a
set user_id = u.id
from auth.users u
where a.user_id is null
  and lower(u.email) = lower(a.email);

create unique index if not exists admin_users_user_id_key on public.admin_users (user_id);

commit;

-- Must return ZERO rows before you continue:
select id, email as "admin with NO auth account yet" from public.admin_users where user_id is null;
