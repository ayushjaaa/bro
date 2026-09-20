# Login + Registration — Test Plan (Google + email/password)

Three layers, because each catches different things:

| Layer | Where | What it proves | Run |
|---|---|---|---|
| **Unit** | `storefront/tests/unit` | Pure logic: intent cookie, error copy, email escaping, application validation | `npm run test:unit` |
| **Server-side / security** | `storefront/tests/security` | The real Supabase rules (RLS, Auth, Storage) — what actually stops an attacker, with no UI involved | `npm run test:security` |
| **End-to-end (Playwright)** | `storefront/e2e/auth-*.spec.ts` | The whole app in a browser: wizards, login modal, callback, access gate, logout | `npx playwright test e2e/auth-*.spec.ts` |

All test users are `e2e-auth-*@e2e.test.internal` / `e2e-sec-*@e2e.test.internal` and are deleted afterwards.
Tests tagged `[needs 018]` / `[needs 019]` fail until `admin-panel/scripts/supabase/018` / `019` are run — a red one is a live hole.

## What cannot be automated (manual, real Google)
Google blocks bots on its consent screen, so the redirect itself is checked by hand. E2E simulates a "Google applicant"
as a user with a real session and no `customers` row — the app decides from the session, not the provider.

- [ ] Login → Continue with Google → **account chooser always appears** (also right after logout)
- [ ] Google login, approved account → logged in, prices visible
- [ ] Google login, pending → "Application under review" **inside the login modal**, no session left
- [ ] Google login, no application → "couldn't find an application" in the modal
- [ ] Google login, rejected → "not approved" message
- [ ] Press **Cancel** on Google's screen → "Google sign-in was cancelled"
- [ ] `/apply` → Google → returns to **/apply** (wholesale) with locked email, no password field; submit → saved as wholesale
- [ ] `/register/retailer` → Google → returns to **/register/retailer**; submit → saved as retail
- [ ] Register with Google using an email that is already registered → modal says "already registered", **not** logged in
- [ ] Register by password, later log in with Google (same email) → same account (pending → message; approved → in)
- [ ] Register with Google, later try email+password login → generic error + "Signed up with Google?" hint
- [ ] Google-first, abandon the wizard, come back → wizard resumes with locked email
- [ ] Instagram/Facebook in-app browser → Google is blocked by Google; email+password still works
- [ ] Mobile width: chooser + wizard have no horizontal scroll

## Unit tests (`tests/unit`) — 63
- **Intent cookie** (`intent.test.ts`): register:wholesale/retail → right account; login; missing/empty → login; tampered values (`register:admin`, `../../evil`, `__proto__`, casing) → login; percent-encoded values; malformed escapes; wholesale→`/apply`, retail→`/register/retailer`; no absolute URLs.
- **Login error copy** (`login-error-messages.test.ts`): each reason's message; unknown → generic; prototype keys (`constructor`, `__proto__`…) → generic; never echoes input.
- **Server-action gates** (`server-action-gates.test.ts`): every `'use server'` action is gated or on the public allow-list; lib modules gated; allow-list has no stale entries.
- **Application validation** (`application-validation.test.ts`): required fields, whitespace-only, over-long text, store-count bounds, licence types (`.exe/.html/.svg/.js/double extension` rejected), 10 MB limit (exact boundary), empty file input ignored; email plausibility; intent serialisation.

## Server-side / security tests (`tests/security/db-security.test.ts`) — 26
- **customers RLS:** anon reads nothing; applicant-without-row sees 0 rows; customer reads only own row; can't read another's; can register own pending row; **can't register for another user id**; **[018] can't insert as approved**; **[018] can't smuggle `approved_at`/`shopify_customer_id`/`account_number`**; can't self-promote via UPDATE; can't change `account_type`; can't delete own row; **[019] one application per user; [019] one per email (case-insensitive)**.
- **Auth:** duplicate sign-up → `user_already_exists` and no session; wrong password → `invalid_credentials`; real vs unknown email give identical errors (no enumeration).
- **Storage:** own-folder upload OK; can't write into another user's folder; can't list/download another's files; anon can't download; bucket not public; **[019] rejects `.html`; [019] enforces a size limit**.
- **Least privilege [020]:** non-approved users can't read `sales_reps`; approved customers still can; `email_registered()` returns only true/false (case-insensitive) and doesn't open `customers` to anon.

## End-to-end (`e2e/`)
**`auth-login.spec.ts` (9)** approved logs in; pending / rejected / no-application messages; wrong password + Google hint; unknown email = same message (no enumeration); failed login leaves no session; Google button → `prompt=select_account`, exact `redirect_to`, and a server-set HttpOnly SameSite=Lax intent cookie.

**`auth-callback.spec.ts` (17)** no code → `missing_code`; `error=access_denied` → `cancelled`; bad code → `exchange_failed` (no 500); forged register cookie can't create a session; **open-redirect params ignored**; no session cookie on failure; every `login_error` reason renders in the login modal; unknown / `constructor` / `__proto__` → generic; param removed from the URL; **no reflected XSS**.

**`auth-registration.spec.ts` (22)** — every scenario once for **wholesale (`/apply`)** and once for **retail (`/register/retailer`)**: chooser first; Google button sends `register:<type>`; password mismatch; **taken email refused on step 1** (and ignoring capitals); fresh email advances; **full password application saved with the right `account_type`, pending, licence stored, applicant not left logged in**; Google applicant → locked email / no password / no chooser; **full Google application saved with the session email and right type, then signed out**; existing account → "You already have an account". Plus cross-wizard (Google applicant on the retail page is saved as retail) and **double-click Submit → exactly one row**.

**`auth-session.spec.ts` (9)** Google applicant mid-wizard is a guest (price hidden, `/checkout` and `/account` closed, navbar shows Log in); pending and rejected sessions can't see prices or check out; approved sees the price; logout returns to guest; **logout in one tab logs out the other tab without reload**; Back after logout doesn't show the private page.

Existing suites still cover: `guest`, `approved-flow`, `login-rejection`, `session-invalidation`, `concurrent-status-change`, `backend-direct`, `cross-app-credentials`.

## Not covered (and why)
- A real Google code exchange (Google bot-blocks it) — manual list above.
- Rate limiting / brute force — Supabase's per-IP limit only; needs CAPTCHA / Vercel Firewall (see AUTH_SECURITY_REVIEW.md #8, #11).
- Email confirmation flows — Confirm email is OFF.
- Password reset — the "Forgot password?" link isn't built yet.
