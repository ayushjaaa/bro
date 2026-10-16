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
| customer with a password (`email` identity), status = `approved` | true | yes |
| customer with a password, status = `pending` or `rejected` | false | **no** — decided: resets are blocked until the account is approved |
| Google-only customer | false | **no** — the modal's generic text says "signed up with Google? use Continue with Google" |
| admin (`admin_users`) | false | no |
| unknown / deleted | false | no |
The reply is byte-identical in all five cases.

### 4.3 The database layer — migration `033-password-reset-eligibility.sql`
```sql
create or replace function public.password_reset_allowed(p_email text) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from auth.users u
    join auth.identities i on i.user_id = u.id and i.provider = 'email'
    where lower(u.email) = lower(trim(p_email))
      and u.deleted_at is null
      and exists (select 1 from public.customers c where c.supabase_user_id = u.id and c.status = 'approved')
      and not exists (select 1 from public.admin_users a where lower(a.email) = lower(u.email))
  );
$$;
revoke all on function public.password_reset_allowed(text) from public, anon, authenticated;
grant execute on function public.password_reset_allowed(text) to service_role;
```
Callable **only by the server** (service role). Anyone calling it from a browser gets "permission denied", so the
classification can't be probed. Used at step 1 (request) **and** step 3 (consume) — so even if someone triggers an admin reset
straight against Supabase's public API, the link is refused when consumed here.

### 4.4 User flow (customer-facing walkthrough)

Example: Ravi is a logged-out customer who forgot his password.

1. **Login modal → "Forgot password?"** Ravi opens the login modal and clicks "Forgot password?" (currently a dead `href="#"`). The modal swaps its view to a single email input — no login needed, since the whole point is that he can't log in.
2. **Submit email.** Ravi types `ravi@example.com` and submits, still logged out. Server-side: `password_reset_allowed(email)` runs (customer ✔, not admin, has a password identity); if true, `resetPasswordForEmail` fires. The modal always shows the same generic line ("If this email is on an account, we've sent a link…") regardless of what happened server-side.
3. **Email arrives.** Link shape: `yoursite.com/reset-password?token_hash=...`.
4. **Link click (still logged out).** Can be opened on any device/browser — `token_hash` doesn't require the original session. `/reset-password` is a public page; the GET only renders a "new password / confirm password" form and does not touch the token yet.
5. **Submit new password.** The server action now: consumes the token (`verifyOtp`) — this is the only point the token is actually used; re-runs `password_reset_allowed` on the now-verified email (catches an admin's link here even if step 2's gate were somehow bypassed); updates the password; this automatically kills any other active session for the account (confirmed in E4); then explicitly signs out the recovery session itself.
6. **Back to login.** UI shows "Password updated — log in," returning to the normal login modal.

Key invariant: **Ravi is never auto-logged-in at any point in this flow.** Reset only changes the password; logging in afterward is a separate, normal `signInWithPassword` call with the new password (OWASP: auto-login after reset is a known anti-pattern).

### 4.5 Error handling & validation map (per server action)

Supabase JS calls return `{ data, error }` for expected failures (bad credentials, expired token, rate limit) — they don't throw for those. They *can* throw for unexpected failures (network error, Supabase outage, a bug). Both paths must end the same way: a generic message to the client, nothing leaked, no half-authenticated state left behind.

**`requestPasswordReset(email)`** — public action
| Step | What to check | On failure |
|---|---|---|
| Input shape | `typeof email === 'string'`, trimmed, lower-cased, length ≤ 254, basic email shape | Skip straight to the generic response (still through the fixed minimum delay — don't let malformed input return *faster* than a real lookup, or that itself becomes a timing oracle) |
| `password_reset_allowed(email)` via service-role RPC | wrap in `try/catch`; treat any thrown error the same as `false` (**fail closed** — never send mail if the eligibility check itself breaks) | log event+timestamp only (no email) server-side; fall through to generic response |
| `resetPasswordForEmail(email, { redirectTo })` — only if step above was `true` | wrap in `try/catch`; a returned `error` (e.g. Supabase's own 60s per-user cooldown) must not change the outward response | same generic response either way |
| Response timing | enforce the fixed minimum delay (§4.6) around the *entire* function body, success or failure, so exceptions can't shortcut it | — |
| Response content | **always** the same string, same shape, regardless of which branch ran or threw | — |

**`resetPassword(tokenHash, newPassword, confirmPassword)`** — public action
| Step | What to check | On failure |
|---|---|---|
| `tokenHash` shape | non-empty string, expected charset/length | reject immediately with the generic "This link can't be used" message — don't call Supabase at all |
| Password shape | 8–72 chars, `newPassword === confirmPassword` | reject with a field-level form error (this one *can* be specific — it's about the input, not the account) — server re-validates even though the client already does, since the client is never trusted |
| `verifyOtp({ token_hash, type: 'recovery' })` | wrap in `try/catch`; a returned `error` (expired/used/garbage) and a thrown error are handled identically | generic "can't be used" message; never state *why* (§4.6) |
| `password_reset_allowed(verifiedEmail)` — second check, after the token is already consumed | if `false` (e.g. the token belonged to an admin) | **must** `signOut()` this just-created recovery session before returning, inside a `try/finally` so the sign-out runs even if something after it throws — otherwise an admin/ineligible session could linger |
| `updateUser({ password })` | wrap in `try/catch` | on failure, still sign out before returning an error — never leave a verified-but-unupdated session standing |
| Final `signOut({ scope: 'global' })` | run in a `finally` block covering every path past `verifyOtp` success, not just the happy path | ensures nobody is left logged in no matter which step failed |
| Logging | on any catch block, log only an event name + timestamp | never log `tokenHash`, `email`, or either password value |

General rule carried from the existing `signInWithPassword` pattern (`storefront/src/features/auth/actions.ts`): never let a raw thrown error reach the client (Next.js would surface a digest) — every server action here gets one outer `try/catch` that converts anything unexpected into the same generic failure message.

### 4.6 Hardening details
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
| `admin-panel/scripts/supabase/033-password-reset-eligibility.sql` | the function above (+ rollback comment) |
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
| Pending / rejected customer | blocked — same generic no-mail reply as an unknown email; nothing to reset until `status = 'approved'` |
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

## 9a. Implementation checklist (from OWASP + Supabase docs + real-world incident write-ups)

Cross-referenced against the design in §4 — items marked **(new)** are not yet explicitly covered above and need verification/code during implementation.

1. **Token design**
   - Cryptographically random, ≥32 bytes — handled by Supabase's `token_hash`, nothing custom to build.
   - Never stored in plaintext — Supabase stores it hashed internally.
   - Single-use (confirmed in E5).
   - Short-lived, expiry enforced (default 1h, confirmed acceptable in §6.5).
   - **(new)** A new reset request must invalidate any previously-issued, still-unused token for that user — the most commonly reported real-world bug is a stale first token staying valid after a second one is issued. Verify Supabase's actual behavior here before launch (test: request twice, try to consume the first link).

2. **Server-side validation on every step, not just the GET**
   - The common bug: validating on the page-render GET but not re-validating on the POST that actually saves the password. Already covered — `password_reset_allowed` runs both before sending the mail (step 1) and again after `verifyOtp` at consume time (step 3 of §4.1). Add an explicit test for this.
   - No decision (admin vs customer vs allowed) is ever taken from browser-supplied data — always a fresh server-side DB check.

3. **Password-reset poisoning (Host header attack)**
   - An attacker can forge `Host`/`X-Forwarded-Host` to steer the reset link to an attacker-controlled domain. Mitigation: redirect origin always built from the fixed `NEXT_PUBLIC_APP_URL` env value (§4.6), never from request headers. Keep the Supabase Redirect URL allow-list to exact URLs only, no wildcards.

4. **Email change / account-state edge cases**
   - **(new)** If a user changes their email, any pending reset link tied to the old address should die immediately — otherwise a link sent to the old inbox can still reset the account under the new email. Needs explicit verification against Supabase's behavior during implementation.
   - Deleted/disabled accounts: already covered via `deleted_at is null` in the eligibility function (§4.3).

5. **Account enumeration + timing**
   - Identical response message for every case (exists / doesn't exist / Google-only / admin) — §4.2.
   - Uniform response time via fixed minimum delay — §4.6.

6. **Rate limiting + abuse prevention**
   - Per-account and per-IP rate limiting on top of Supabase's own 60s/account cooldown — §4.6, §6.6.
   - CAPTCHA (Turnstile) for production — §6.6.
   - Custom SMTP required before launch; built-in mail quota (2/hour, project-wide) is not viable — §6.3.

7. **Session handling after reset**
   - No auto-login after reset — §4.1 step 5.
   - All other sessions revoked on password change — confirmed Supabase behavior (E4).
   - The recovery session itself is explicitly signed out (`scope:'global'`) — §4.1 step 5.

8. **Transport / page hardening for `/reset-password`**
   - `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex` — §4.6.
   - GET only renders the form and never touches/consumes the token, so link-prefetching mail scanners (e.g. Microsoft Defender) can't burn it — §4.1, §2.

9. **Notification / audit**
   - "Password changed" confirmation email — recommended in §9 decision 4, dashboard toggle in §6.4.
   - Server-side logging of reset attempts (event + timestamp only) — never log email, token, or password — §4.6.

10. **Admin/customer separation (core requirement)**
    - `password_reset_allowed` is callable only by `service_role`; `anon`/`authenticated` get permission denied — §4.3.
    - Checked twice: before sending mail, and again at token-consume time — §4.3, §4.1.
    - Admin-panel code is untouched by this flow; admin password resets stay on a separate mechanism — §5, §9 decision 5.

11. **Testing before launch**
    - Security test: anon and a logged-in user cannot execute `password_reset_allowed` — §8.
    - E2E test: an admin's recovery link is refused on the storefront and the admin's password stays unchanged — §8.
    - Full regression: existing auth test suites stay green — §8.

Sources consulted: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Supabase Password-based Auth docs](https://supabase.com/docs/guides/auth/passwords), [Secure Password Reset: Tokens, Expiry, System Design](https://vjnvisakh.medium.com/secure-password-reset-tokens-expiry-and-system-design-best-practices-337c6161af5a), [Password Reset Token Invalidation Failure](https://medium.com/@0xMo7areb/password-reset-token-invalidation-failure-a-subtle-bug-with-serious-security-implications-a3edfed57a6a), [How Weak Password Reset Flows Turn Forgot-Password Into Account Takeover](https://medium.com/@MuhammedAsfan/how-weak-password-reset-flows-turn-forgot-password-into-full-account-takeover-dc95508cdfe8).

## 9. Decisions (confirmed)
1. **Google-only customers: no mail** + Google hint. ✅ confirmed.
2. **Pending / rejected customers may NOT reset** — eligibility requires `customers.status = 'approved'` (overrides the original "recommended: allow" — see §4.3, §4.2). ✅ confirmed.
3. **SMTP provider** for production (e.g. Resend) — needed before launch, not before building. Deferred, not a blocker for implementation.
4. **"Password changed" notification** — turned on (recommended default, no objection raised).
5. Admin password resets stay outside the storefront (script / dashboard). ✅ confirmed, no admin-panel changes.

## 10. Rollout order
`033` SQL → template + Redirect URL (you) → code + tests → run the suites → preview deploy → SMTP + firewall rules → production.

## 11. What could break (and why it won't)
Nothing in login/registration changes: the "Forgot password?" link is currently dead (`href="#"`), so there is no behaviour to regress.
The new SQL only **adds** a service-role-only function. The one shared resource is the Supabase mail quota — hence custom SMTP.
