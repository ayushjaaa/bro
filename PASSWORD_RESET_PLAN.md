# Forgot / Reset Password — Research + Plan (storefront)

Status: **PLAN ONLY — nothing implemented.** Written after reading the official docs, probing the real Supabase project with
throw-away users, and reading the existing code. Implementation starts after the decisions in §9.

## 1. Requirements (from the owner)

1. The **server** decides what kind of account an email is — password account vs Google-only vs admin. Nothing coming from the browser decides it.
2. The reset mail may only ever go to **the account's own address**; nobody can steer it elsewhere.
3. **Admin accounts cannot be reset from the storefront** (no values from the frontend decide anything for admins).
4. Both the **server / redirect layer** and the **database layer** must enforce it (defense in depth — see AUTH_SECURITY_REVIEW.md).

## 2. What the official docs say

**OWASP Forgot Password Cheat Sheet**
- Same message *and same response time* whether or not the account exists (no enumeration, including timing).
- Reset tokens: cryptographically random, single-use, expiring, stored safely.
- Rate-limit per account and/or CAPTCHA to stop mail-flooding.
- After a reset: **don't auto-log-in**, invalidate the user's other sessions, send a "your password changed" confirmation.
- Build the reset URL from a **hard-coded trusted origin, never the Host header**; put `Referrer-Policy: no-referrer` on the reset page.
- Send the link only to the account's registered address.

**Supabase**
- `resetPasswordForEmail()` never reveals whether the account exists (returns success either way).
- `redirectTo` must be on the project's Redirect-URL allow-list.
- For server-rendered apps the documented pattern is a custom template with `{{ .TokenHash }}` → a server route calls `verifyOtp()`.
- Template variables include **`{{ .RedirectTo }}`** (the `redirectTo` each caller passed) — so two apps sharing one Supabase project can each get their own link.
- Docs warn that mail scanners (e.g. Microsoft Defender) **prefetch links and burn one-time tokens** → use an intermediate confirmation page.
- Rate limits: **built-in email = 2 emails/hour for the whole project**; 60 s cooldown per user on `/recover`.

## 3. What I measured on the real project (throw-away users, no email sent)

| # | Experiment | Result | Consequence for the design |
|---|---|---|---|
| E1 | `resetPasswordForEmail` for a non-existent email | no error, took 220–600 ms | uniform response ✔; **timing differs from a real send → add a fixed minimum duration** |
| E2 | Consume a recovery link via `token_hash` + `verifyOtp` in a fresh client | works, **no same-browser cookie needed**; session `amr` = `[{method:"otp"}]` (not "recovery") | use `token_hash` (PKCE `?code=` would break when opened on another device); **can't tell a recovery session from a normal OTP session by its claims** → the server must decide by *how* it got there (do everything inside one action) |
| E5 | Use the same link twice | 2nd refused ("invalid or expired") | single-use ✔ |
| E3 | `updateUser({password})` from that session | OK; old password stops working, new works | ✔ |
| E4 | An already-open session of that user after the password change | its refresh token **stops working immediately** | Supabase already revokes other sessions on password change ✔ (we still `signOut` the recovery session itself) |
| E9 | How accounts look to the server | password user → `identities:["email"]`; Google-only → `["google"]` | eligibility can be read from `auth.identities` |
| — | Who else sends Supabase mail | admin invites use `generateLink()` + its **own** URL (`invite-admin.ts`); nothing calls `resetPasswordForEmail` | editing the *Reset password* template does **not** affect admin |

## 4. Design

### 4.1 Flow (token is consumed only on the final POST)
```
Login modal → "Forgot password?" → enter email
   │  server action requestPasswordReset(email)           (public, always same answer, ≥ ~1.5 s)
   │    1. DB function password_reset_allowed(email)  [service-role only]  → true/false
   │    2. only if true: supabase.auth.resetPasswordForEmail(email, { redirectTo: <APP_ORIGIN>/reset-password })
   │    3. return "If this email belongs to a password account, we've sent a link…"   (identical for every case)
   ▼
Email (template): {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
   ▼
GET /reset-password?token_hash=…      ← only RENDERS a form. Does not touch the token (scanner-safe).
   ▼
Form submit → server action resetPassword(tokenHash, newPassword, confirm)
   1. validate password (8–72) and token shape
   2. supabase.auth.verifyOtp({ token_hash, type:'recovery' })       ← token consumed here, session created
   3. password_reset_allowed(verified user's email)  → if false (e.g. an ADMIN link): signOut, refuse with a generic message
   4. supabase.auth.updateUser({ password })
   5. supabase.auth.signOut({ scope:'global' })      ← nobody is left logged in
   6. "Password updated — log in" → opens the login modal
```
Why not Supabase's default PKCE `?code=` link: needs the same browser that asked for the reset, is consumed by link scanners,
and lands on `/auth/callback`, which signs non-approved users out.

### 4.2 Who gets a mail (decided by the server, never the browser)
| Email is… | `password_reset_allowed` | Mail? |
|---|---|---|
| customer with a password (`email` identity), any status | true | yes |
| Google-only customer | false | **no** — the modal's generic text says "signed up with Google? use Continue with Google" |
| admin (`admin_users`) | false | no |
| unknown / deleted | false | no |
The reply is byte-identical in all four cases.

### 4.3 The database layer — migration `023-password-reset-eligibility.sql`
```sql
create or replace function public.password_reset_allowed(p_email text) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from auth.users u
    join auth.identities i on i.user_id = u.id and i.provider = 'email'
    where lower(u.email) = lower(trim(p_email))
      and u.deleted_at is null
      and exists (select 1 from public.customers c where c.supabase_user_id = u.id)
      and not exists (select 1 from public.admin_users a where lower(a.email) = lower(u.email))
  );
$$;
revoke all on function public.password_reset_allowed(text) from public, anon, authenticated;
grant execute on function public.password_reset_allowed(text) to service_role;
```
Callable **only by the server** (service role). Anyone calling it from a browser gets "permission denied", so the
classification can't be probed. Used at step 1 (request) **and** step 3 (consume) — so even if someone triggers an admin reset
straight against Supabase's public API, the link is refused when consumed here.

### 4.4 Hardening details
- Redirect origin from a **fixed env value** (`NEXT_PUBLIC_APP_URL`, already set), never from the request Host.
- Fixed **minimum response time** on the request action (E1 showed 220–600 ms for the no-mail path; floor set above the measured real-send time, ≈1.5 s).
- `/reset-password`: `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex` (via `next.config.ts` headers); no `next=` parameter (no redirect target to abuse).
- Password rule shared with registration: 8–72 characters (72 = bcrypt limit); confirm field must match.
- Never log the email, token or password. Failure messages don't say *why* (expired / used / not allowed → "This link can't be used. Request a new one.").
- Both new Server Actions are public **by necessity** → added to the `PUBLIC_ACTIONS` allow-list of the gate guard-rail test, with reasons.
- Service-role key is used for one thing only: calling `password_reset_allowed`.

## 5. Files

| New / changed | Purpose |
|---|---|
| `admin-panel/scripts/supabase/023-password-reset-eligibility.sql` | the function above (+ rollback comment) |
| `storefront/src/lib/auth/password-reset.ts` | pure helpers: password validation, token-shape check, constants (unit-tested) |
| `storefront/src/features/auth/password-reset-actions.ts` | `requestPasswordReset`, `resetPassword` |
| `storefront/src/app/reset-password/page.tsx` + `ResetPasswordForm.tsx` | form page (server component reads `token_hash`; doesn't consume it) |
| `storefront/src/components/ui/LoginModal.tsx` | "Forgot password?" becomes a real second view (email → generic confirmation) |
| `storefront/next.config.ts` | headers for `/reset-password` |
| `tests/unit/server-action-gates.test.ts` | allow-list the two new public actions |
| tests (below) | unit, security, e2e |
| `admin-panel` | **no change** — admin resets stay on the admin side (script `invite-admin.ts` pattern / Supabase dashboard) |

## 6. Dashboard / config work (you)
1. Auth → Email Templates → **Reset password**: link = `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` (only this template; invites are unaffected).
2. Auth → URL Configuration → Redirect URLs: add `http://localhost:3000/reset-password` and later the production URL (exact, no query).
3. **Custom SMTP** before launch (built-in = 2 mails/hour project-wide, and it is shared with every other Auth mail).
4. Auth → Emails → Security notifications: turn on **Password changed** (OWASP: confirm by mail).
5. Confirm "minimum password length" ≥ 8 and the recovery-link expiry (default 1 h is fine).
6. Vercel Firewall rate limit on `POST` + `next-action` (see the earlier firewall guidance) and, later, Turnstile CAPTCHA (Supabase supports `captchaToken` on this call too).

## 7. Edge cases (all decided)
| Case | Behaviour |
|---|---|
| Unknown / Google-only / admin email | identical reply, no mail |
| Link opened by a mail scanner | GET only renders the form → token untouched |
| Link used twice / expired / garbage `token_hash` | generic "can't be used" page; never crashes |
| Admin's recovery link opened on the storefront | token consumed, session signed out, refused, password untouched |
| User already logged in elsewhere | Supabase revokes those sessions on password change (E4) |
| Pending / rejected customer | can reset; still can't log in until approved (existing gate) |
| Double-click on submit | second POST fails as "used" while the first succeeds |
| Typing `VICTIM@x.com` / spaces / `victim+tag@x.com` | trimmed + lower-cased; a `+tag` address isn't an account → no mail |
| Two requests within 60 s | Supabase's own cooldown; our reply is unchanged |
| Two apps, one Supabase project | `{{ .RedirectTo }}` gives each its own link; admin doesn't use this template |

## 8. Tests
- **Unit:** password rules (length 8–72, mismatch, whitespace), token-shape check, constants, response-floor helper.
- **Security (real DB):** anon and a signed-in user **cannot execute** `password_reset_allowed`; it returns true for a password customer and false for Google-only / admin / unknown / customer-without-row / deleted.
- **E2E (no real email needed — `admin.generateLink()` mints the token):**
  identical reply for four kinds of email (body + status); a valid link resets the password (old fails, new logs in, other session dead, nobody left logged in);
  reused / garbage / expired token refused; **an admin's link is refused and the admin's password is unchanged**; `/reset-password` sends the no-referrer / no-store headers; a scanner-style GET does not consume the token;
  mismatch / too-short password shown as form errors; Google-only email gets no mail (assert via the eligibility function) and the modal shows the Google hint.
- Regression: the 73-test auth suite + the 16-test old set stay green.

## 9. Decisions I need
1. **Google-only customers: no mail** + Google hint (recommended) — or send the mail (then they'd have both ways to log in)?
2. **Pending / rejected customers may reset** (recommended; login gate still applies)?
3. **SMTP provider** for production (e.g. Resend) — needed before launch, not before building.
4. Turn on the **"Password changed" notification** (recommended)?
5. Admin password resets stay outside the storefront (script / dashboard) — OK?

## 10. Rollout order
`023` SQL → template + Redirect URL (you) → code + tests → run the suites → preview deploy → SMTP + firewall rules → production.

## 11. What could break (and why it won't)
Nothing in login/registration changes: the "Forgot password?" link is currently dead (`href="#"`), so there is no behaviour to regress.
The new SQL only **adds** a service-role-only function. The one shared resource is the Supabase mail quota — hence custom SMTP.
