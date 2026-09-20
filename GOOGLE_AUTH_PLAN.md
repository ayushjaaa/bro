# Google + Email/Password Registration & Login — Plan

Status: **PLAN ONLY — nothing implemented yet.** Written after reading the storefront auth code and the
official Supabase / Google docs (sources at the bottom).

## 1. Goal

- A B2B applicant can register with **either** Google **or** email+password.
- Registering with Google needs **no password**; Google proves the identity at login too.
- One person = one Auth user = one `customers` row, whichever method they use.
- A user who is **not approved** (no application, `pending`, `rejected`) can only **browse**:
  no prices, no add-to-cart, no checkout — regardless of how they signed up or whether they hold a session.

## 2. What exists today (verified in code)

| Area | Where | Behaviour |
|---|---|---|
| Registration | `features/apply/actions.ts` `submitRegistration` | `signUp(email,password)` → upload licences → insert `customers` → `signOut()`. On failure deletes the Auth user. |
| Password login | `features/auth/actions.ts` | Sign in, look up `customers` by `supabase_user_id`, sign out again unless `approved`. |
| Google login | `components/ui/LoginModal.tsx` → `app/auth/callback/route.ts` | Same lookup + sign-out gate. |
| Central gate | `lib/auth/access-state.ts` `getCustomerAccessState()` | Returns `guest` (no session **or no customers row**), `pending`, `rejected`, `approved`. |
| Price hiding | `app/products/[handle]/page.tsx`, `features/products/actions.ts` | Price zeroed **server-side** before it reaches the client for non-approved. |
| Cart / checkout | `features/cart/actions.ts`, `features/product/actions.ts`, `app/checkout/page.tsx`, `features/checkout/actions.ts` | All check `isCustomerApproved()` / `access.status !== 'approved'` server-side. |

**Good news:** the "browse only unless approved" requirement is already enforced server-side through one
gate. Keeping a session for a not-yet-approved user does **not** unlock anything, because every price/cart/
checkout path checks `customers.status`, not "is there a session".

## 3. Problems found

1. **Callback can't tell login from register** → a brand-new Google user has no `customers` row yet and is
   signed out immediately, so they can never reach the form.
2. **`?login_error=...` is never read anywhere.** The callback redirects with it, but no component displays
   it. Users currently get a silent bounce to the home page. (Grep: only `app/auth/callback/route.ts` mentions it.)
3. **Email is unverified** (Confirm email is OFF). Per Supabase docs, automatic identity linking happens only
   for *verified* emails, and when a new OAuth identity matches an existing user, Supabase **removes the other
   unconfirmed identities**. So a password registrant who later clicks Google with the same email can end up as a
   *different* Auth user id → the `customers` row (keyed only on `supabase_user_id`) is no longer found.
4. **Failure cleanup deletes the Auth user** (`cleanupOrphanedUser`). Right for password sign-up, wrong for a
   Google user who already had an account/session.
5. `handleGoogleLogin` sets `gd-account-just-logged-in` (the post-login tour flag) **before** the redirect, even
   if the login is then rejected or is really a registration.
6. Registration wizard requires a password (`password.length < 8`) unconditionally.

## 4. Industry standards this plan follows

From Google's OpenID Connect docs and Supabase's Auth docs:

- **Identify a Google user by `sub`, never by email.** Email can change; `sub` cannot. Supabase stores it as the
  identity id, so we key on `supabase_user_id` (already the case) and use email only as a *verified fallback*.
- **Trust an email only if verified** (`email_verified`). Google emails are verified; our password emails are not.
- **Authorization Code + PKCE, `state` handled by the library.** `@supabase/ssr` + `exchangeCodeForSession` does
  this — keep using it, don't hand-roll OAuth.
- **Redirect URIs must match exactly** (protocol, host, path, trailing slash) in both Google Console and
  Supabase's Redirect URL allow-list.
- **Never let a client-supplied value pick the redirect target.** `intent` is an allow-listed enum; we never
  accept a free-form `next=` URL (open-redirect).
- **Server enforces authorization; UI is cosmetic.** Already true here; we add nothing that relies on UI hiding.
- **No account enumeration.** Error copy must not reveal whether an email is registered.

## 5. Design

### 5.1 Registration flow — Google-first

```
/apply (or /register/retailer)
  step 0: choose  [Continue with Google]   [Use email + password]
  ── Google ──────────────────────────────────────────────────────────
  signInWithOAuth(google, redirectTo=/auth/callback?intent=register&type=<wholesale|retail>)
      → Google → /auth/callback
      → exchangeCodeForSession
      → intent=register: keep session, redirect to the wizard (same route) with ?google=1
  wizard (Google mode): email = session email, LOCKED; password step hidden
  submit → submitRegistrationWithSession():
      uses the EXISTING session (no signUp), uploads licences, inserts customers row
      (supabase_user_id = auth.uid()), then signOut() → "Application under review"
  ── Email/password ── unchanged (signUp path)
```

Why Google **first**: the redirect reloads the page — a form filled before it (and its licence files, which
can't be stored in `sessionStorage`) would be lost. Doing Google first means the form is filled with a live session,
and the existing RLS rule `auth.uid() = supabase_user_id` on `customers` insert and on the
`registration-documents` bucket keeps working unchanged.

### 5.2 Callback logic (`app/auth/callback/route.ts`)

```
intent ∈ {'login','register'}   // anything else → treated as 'login'
error=access_denied (user cancelled at Google)  → redirect with reason=cancelled
exchange code → user
lookup customers by supabase_user_id
  (fallback: verified email, see 5.4)

if intent=register:
    row exists  → do NOT show the form; treat as login outcome (below)
    no row      → keep session, redirect to wizard
if intent=login (or fallthrough):
    no row      → signOut → reason=no_application   (message: "Apply first" + link)
    pending     → signOut → reason=pending
    rejected    → signOut → reason=rejected
    approved    → restoreCartOnLogin → home
```

### 5.3 Showing the result (fix for problem 2)

A small client component (mounted in `app/layout.tsx`) reads `?login_error=` once, shows a toast/modal with
plain-language copy, then strips the param with `router.replace`. Reasons and copy:

| reason | message |
|---|---|
| `no_application` | "We couldn't find an application for this Google account. Apply first, or use the account you applied with." + Apply link |
| `pending` | "Your application is under review — we'll email you when it's approved." |
| `rejected` | "Your application wasn't approved. Contact support." |
| `cancelled` | "Google sign-in was cancelled." |
| others | generic "Something went wrong, please try again." |

### 5.4 Linking password ⇄ Google for the *same* email

- **Preferred:** turn **Confirm email ON** in Supabase and make registration say "verify your email". Then the
  password identity is verified and Supabase links Google to the *same* user automatically. Zero custom code.
  (Dashboard setting — must be done by the project owner.)
- **Belt-and-braces fallback in code** (recommended even with the above, for users registered before it):
  if no row matches `supabase_user_id`, look up `customers` by **lower(email)** — but only when the Google
  identity has `email_verified = true`. On a match, re-point `supabase_user_id` to the new user using the
  **service-role client on the server** (users can't update that column under RLS). Never do this for an
  unverified email.

### 5.5 Password login for a Google-only account

`signInWithPassword` failing returns "Incorrect email or password" today. Keep that generic message
(anti-enumeration) but add a permanent hint under the form: *"Registered with Google? Use Continue with Google."*
Optionally add "Forgot password" (Supabase reset) so a Google user can also set a password.

## 6. Edge cases (all decided)

| # | Case | Decision |
|---|---|---|
| 1 | Register vs login callback | `intent` allow-list (5.2). |
| 2 | Google login, never applied | Message + Apply link; not a silent bounce (5.3). |
| 3 | Abandons wizard mid-way | Empty Auth user is harmless; on return `/apply` sees session-with-no-row and **resumes** the form (email locked). Optional later: cleanup of Auth users with no row older than N days. |
| 4 | Google account tries password login | Generic error + "Registered with Google?" hint / optional reset flow. |
| 5 | Form email ≠ Google email | Google's email wins; field locked. |
| 6 | Applied with Google-A, logs in with Google-B | Correct behaviour → `no_application` copy tells them to use the original account. |
| 7 | Double submit / row already exists | Insert guarded (unique on `supabase_user_id`); friendly message. `/apply` for a user who already has a row shows their **status** instead of the form. Rejected → decision below. |
| 8 | Failure after Google session exists | **Do not delete the Auth user** (only the password path may). Show error, keep session, let them retry. |
| 9 | Pending user holds a session | Safe: gate is `customers.status`. Verify Navbar/account UI also key off `access.status`, not "has session". |
| 10 | Prod redirect URLs | Add prod domain to Supabase Redirect URLs + Google Console (JS origins + Supabase callback URI). |
| 11 | `intent=register` forged by an approved/pending user | Callback checks for an existing row first → never shows the wizard to someone who already applied. |
| 12 | User cancels on Google's consent screen | Callback gets `error=access_denied`, no `code` → `cancelled` message (today: `missing_code`, unreadable). |
| 13 | Post-login tour flag set too early | Set `gd-account-just-logged-in` only after a *successful approved* login (move out of `handleGoogleLogin`). |
| 14 | Same email, different case | Normalize to lower-case for the email fallback. **Do not** strip Gmail dots/`+tags` — identity is `sub`, email is only a fallback. |
| 15 | Password user registers, later clicks Google (email unverified) | Covered by 5.4 (Confirm-email ON and/or verified-email re-link). |
| 16 | Attacker pre-registers `victim@x.com` by password | Supabase deletes the unconfirmed identity when the real owner signs in via Google; re-link only trusts verified Google email. Confirm-email ON closes it fully. |
| 17 | In-app browsers (Instagram/Facebook webview) | Google blocks OAuth there (`disallowed_useragent`). Keep email+password as a visible alternative; add hint "Open in your browser" if detected. |
| 18 | Google consent screen in *Testing* mode | Only ~100 listed test users can sign in. Publish the OAuth app to *Production* before launch (email/profile scopes need no Google verification). |
| 19 | Bots mass-creating Auth users via Google/sign-up | Enable Supabase CAPTCHA (Turnstile/hCaptcha) on sign-up; rate limits already exist in Supabase. Optional but recommended. |
| 20 | Licence upload abuse | Server-side re-check of type (pdf/jpg/png) and max size in `submitRegistration`, not only in the form. |
| 21 | Wizard validation | Password field/schema conditional on mode; Google mode never asks for it. |
| 22 | Both wizards | `/apply` (wholesale) and `/register/retailer` share `submitRegistration` — change once, cover both. |

## 7. Enforcement matrix — "not approved ⇒ browse only"

Every row is **already** enforced server-side; the plan adds a regression test for each.

| Surface | Guest / no row / pending / rejected | Approved |
|---|---|---|
| Product list & detail price | `0` sent to client (never in payload) | real price for their account type |
| Add to cart / update / remove | rejected by `isCustomerApproved()` | allowed |
| `/checkout` page | `redirect('/')` | allowed |
| `placeOrderAction` | `ok:false` | allowed |
| `/account/*`, `/invoice` | redirect | allowed |
| `restoreCartOnLogin` | never runs | runs |

New code must **only** ever call `getCustomerAccessState()`/`isCustomerApproved()`; nothing may read
`supabase.auth.getUser()` to decide access.

## 8. Implementation phases

**Phase 0 — dashboard (owner, no code)**
- Supabase: Confirm email ON; Redirect URLs (localhost + prod); CAPTCHA (optional).
- Google Console: OAuth client = Web app; JS origins; redirect URI = the Supabase callback; publish to Production.

**Phase 1 — callback + messages** (`app/auth/callback/route.ts`, new `LoginErrorNotice` client component, `LoginModal.tsx`)
- `intent` allow-list, `access_denied`, existing-row check, message component, tour-flag fix.

**Phase 2 — Google-first registration** (`features/apply/*`, `features/retail/*`, `app/apply`, `app/register/retailer`)
- Step-0 method chooser, Google mode (locked email, no password), resume-when-session, "already applied → show status".
- `submitRegistration`: session-based branch, no `signUp`, no user deletion on failure.

**Phase 3 — linking safety** (`features/auth/actions.ts`, callback)
- Verified-email fallback + service-role re-link; "Registered with Google?" hint; optional password-reset link.
- Registration copy for Confirm-email ("check your inbox").

**Phase 4 — tests** (`storefront/e2e`, Playwright already set up)
- See section 9.

## 9. Test plan

- Google register (new) → form → submit → `pending` row created with Google `sub`'s user id; signed out.
- Google login while `pending` / `rejected` / no row → correct message, no session left.
- Google login while `approved` → home, cart restored, tour runs.
- Password register → Google login same email (Confirm ON) → same user, row found.
- Forged `intent=register` as an existing applicant → no wizard.
- Cancel at Google → `cancelled` message.
- Wizard abandoned then reopened → resumes, email locked.
- Non-approved session: price is `0` in page payload; add-to-cart action, `/checkout`, `placeOrderAction` all refused.
- Double submit → one row.

## 10. Open decisions for the owner

1. **Confirm email ON?** (recommended: yes — cleanest linking, blocks pre-registration hijack.)
2. **Rejected applicants:** may they re-apply (new row / reset status) or must they contact support?
3. **Keep the pending user signed out after submit** (current) or leave them signed in with a "status" page?
   (Both are safe because of the status gate; signed-out matches today's behaviour.)
4. Add CAPTCHA now or later?

## 11. Out of scope (future)

Apple / Facebook sign-in, account deletion, self-serve unlinking, SSO for staff, cleanup cron for stale
empty Auth users.

## Sources

- Supabase — Identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking
- Supabase — Login with Google: https://supabase.com/docs/guides/auth/social-login/auth-google
- Google — OpenID Connect (use `sub`, `email_verified`, `state`/`nonce`, redirect URI rules):
  https://developers.google.com/identity/protocols/oauth2/openid-connect
