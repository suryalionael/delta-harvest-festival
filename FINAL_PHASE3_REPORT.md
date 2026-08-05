# Phase 3 — Festival Day Operations: Final Report

Status: **Sprints 3.1–3.4 implemented, deployed to production, and server-side verified. Full real-device acceptance testing (camera, volunteer accounts, mobile browsers) is still pending — see "What Is Not Yet Verified" below.** This report is accurate as of 2026-08-04.

Companion documents: `FESTIVAL_DAY_RUNBOOK.md` (operational how-to for the event itself), `PRE_LAUNCH_CHECKLIST.md` (action items before Festival Day), `POST_EVENT_CHECKLIST.md` (wind-down after the event).

---

## 1. What Phase 3 built

### Sprint 3.1 — Role authorization + check-in backend
- Role-based authorization (`SUPER_ADMIN` / `ADMIN` / `VOLUNTEER`) retrofitted onto every Phase 2 admin route. `VOLUNTEER` is scoped to check-in only; a gap where any authenticated admin (including a hypothetical `VOLUNTEER`) could read Orders/Tickets/Reports was closed here.
- `POST /api/admin/checkin` — atomic `valid → checked_in` transition (single `UPDATE ... WHERE status = 'valid'`, not a separate read-then-write), accepts either a QR token or a typed ticket number, same code path either way.
- `GET /api/admin/checkin/validate` — read-only lookup, no state change.
- `GET /api/admin/checkin/stats` — live counters.
- Every outcome (success, duplicate, void/cancelled/refunded, not-found) is audit-logged.

### Sprint 3.2 — Scanner UI
- `admin/scan.html` / `admin/scan.js` / `admin/scan.css` — a dedicated, mobile-first, full-screen scanner page, separate from the admin dashboard shell.
- Camera decode via the native `BarcodeDetector` API where available, falling back to a vendored `jsQR` (Sprint 3.4: now loaded on demand, not unconditionally — see §3).
- Manual ticket-number entry using the identical backend call as a camera scan.
- Full-screen, color-coded, sound+vibration result states.
- Live attendance counters, polling every 5s.
- A real CSS bug (`#scan-result` had no `[hidden]` override, so an author stylesheet rule silently beat the browser's own `[hidden] → display:none`) was found from real-device testing and fixed — this was blocking manual entry, camera switch, and torch by sitting an invisible full-screen click-catcher over the controls, and separately meant the result overlay never actually dismissed. Both bugs shared one root cause.

### Sprint 3.3 — Volunteer accounts, expanded audit trail, live stats
- Volunteer account management (`SUPER_ADMIN` only): create (server-generates a one-time temporary password via the Supabase Auth admin API), activate/deactivate (`profiles.is_active`), reset password, per-volunteer activity view.
- `VOLUNTEER` login now redirects straight to `/admin/scan` instead of rendering a dashboard shell it has no access to.
- `LOGOUT` and the three volunteer-management actions added to the audit vocabulary; logout is now audited (previously invisible to the audit trail — sign-out was purely client-side).
- `checkin/stats` gained `totalTickets` and `attendancePercentage`; the scanner UI gained a 4th stat tile.
- Scanner reliability: request timeouts (8s), camera-error messages that distinguish permission-denied / no-camera / in-use-elsewhere, a `devicechange` listener that recovers automatically if a camera reappears, and `online`/`offline` handling that pauses/resumes scanning proactively.

### Sprint 3.4 — Production hardening (this sprint)
A full audit across security, reliability, performance, and accessibility — see §3 for what was found and fixed.

---

## 2. Complete endpoint inventory

All routes are dispatched through the single `api/admin/router.ts` function (Vercel Hobby plan's 12-function cap; the project currently uses 5 functions total, unchanged since Sprint 2.4).

| Route | Method | Role required | Rate limited |
|---|---|---|---|
| `/api/admin/auth/login` | POST | — (pre-auth) | Yes (5/15min per IP) |
| `/api/admin/auth/session` | GET | any active admin | — |
| `/api/admin/auth/logout` | POST | any active admin | — |
| `/api/admin/dashboard` | GET | SUPER_ADMIN, ADMIN | — |
| `/api/admin/orders` | GET | SUPER_ADMIN, ADMIN | — |
| `/api/admin/orders/:id` | GET | SUPER_ADMIN, ADMIN | — |
| `/api/admin/orders/:id/resend` | POST | SUPER_ADMIN, ADMIN | — |
| `/api/admin/tickets` | GET | SUPER_ADMIN, ADMIN | — |
| `/api/admin/tickets/:id` | GET | SUPER_ADMIN, ADMIN | — |
| `/api/admin/tickets/:id/resend` | POST | SUPER_ADMIN, ADMIN | — |
| `/api/admin/tickets/:id/regenerate-pdf` | POST | SUPER_ADMIN, ADMIN | — |
| `/api/admin/reports/summary` | GET | SUPER_ADMIN, ADMIN | — |
| `/api/admin/reports/export` | GET | SUPER_ADMIN, ADMIN | — |
| `/api/admin/settings/event` | GET | SUPER_ADMIN, ADMIN | — |
| `/api/admin/settings/event` | PATCH | SUPER_ADMIN only | — |
| `/api/admin/checkin` | POST | SUPER_ADMIN, ADMIN, VOLUNTEER | Yes (300/min per IP) |
| `/api/admin/checkin/validate` | GET | SUPER_ADMIN, ADMIN, VOLUNTEER | — |
| `/api/admin/checkin/stats` | GET | SUPER_ADMIN, ADMIN, VOLUNTEER | — |
| `/api/admin/volunteers` | GET, POST | SUPER_ADMIN only | POST: 30/10min per IP |
| `/api/admin/volunteers/:id` | PATCH | SUPER_ADMIN only | — |
| `/api/admin/volunteers/:id/reset-password` | POST | SUPER_ADMIN only | 30/10min per IP |
| `/api/admin/volunteers/:id/activity` | GET | SUPER_ADMIN only | — |

Unrelated to Phase 3, untouched: `/api/payments/create-checkout-session`, `/api/payments/webhook`, `/api/tickets/retrieve`, `/api/dev/test-email` (production-inert by design, see §3).

---

## 3. Sprint 3.4 audit — findings and fixes

Every route's authorization, every `catch` block's error handling, every `innerHTML` assignment, and every fetch call site in `admin.js`/`scan.js` was individually reviewed. Genuine issues found and fixed; everything else below was checked and confirmed already correct — nothing was changed for style.

**Fixed this sprint:**

1. **Expired sessions were mishandled almost everywhere in the admin dashboard.** `admin.js` had 16 separate data-loading/action functions, and only `restoreSession()` actually checked for a `401` (expired/revoked session) response — every other one (Orders, Tickets, Reports, Settings, Volunteers, resend/regenerate actions) just showed a generic "could not load" message, which is actively misleading when the real fix is "log in again." Added a single `handleUnauthorized(res)` check at all 16 call sites; a `401` now always drops back to the login screen. (`scan.js` already did this correctly at its two data call sites — no change needed there.)
2. **jsQR (130KB) was loaded unconditionally on every scanner page load**, even on the (likely majority of) phones with native `BarcodeDetector` support that never use it. Now loaded on demand — only fetched if `BarcodeDetector` isn't present — cutting the common-case scanner payload by roughly 70%, which matters specifically because festival WiFi is a named risk in `PHASE3_ARCHITECTURE.md`.
3. **Stats polling and camera decoding continued at full rate while the tab/screen was backgrounded** (phone locked, app switched). Added a `visibilitychange` listener that pauses both and resumes (with an immediate refresh) when the scanner screen becomes visible again.
4. **Volunteer account creation and password reset had no rate limit**, unlike every other sensitive admin action. Both already require an authenticated `SUPER_ADMIN` session, so this is defense-in-depth (a stolen token could otherwise mass-create accounts or spam resets) rather than the primary control. Added a shared limiter (30 requests/10min per IP).
5. **Volunteer table action buttons (Activate/Deactivate/Reset password/Activity) had no per-row `aria-label`**, unlike the existing Orders/Tickets "View" buttons — a screen reader user tabbing through several volunteer rows would hear "Deactivate, button" repeated with no way to tell which row. Fixed to match the existing pattern (`aria-label="Deactivate jane@example.com"` etc.).

**Reviewed and confirmed already correct (no change made):**

- **Authorization**: every route checked individually — `MANAGEMENT_ROLES` (excludes `VOLUNTEER`) on Dashboard/Orders/Tickets/Reports/Settings-GET; `SUPER_ADMIN`-only on Settings-PATCH and all Volunteers routes; all three roles on the check-in endpoints, correctly.
- **XSS**: every `innerHTML` assignment in `admin.js` and `scan.js` traced — all user-controlled values (customer names, emails, ticket numbers, volunteer emails, audit metadata) go through the existing `escapeHtml()`; `scan.js`'s `innerHTML` uses are all static SVG constants, no user data.
- **CSRF**: not applicable by construction — this API is bearer-token-only (`Authorization` header from `localStorage`/`sessionStorage` via supabase-js), never cookies. Confirmed zero `Set-Cookie`/`document.cookie` usage anywhere in the codebase. A malicious page can't forge a cross-origin request carrying a header it can't read.
- **Secret handling**: no service-role key or other server secret referenced anywhere client-side (only the intentionally-public anon key, same as before). No hardcoded credentials anywhere in `lib/`, `api/`, or `admin/`.
- **`api/dev/test-email.ts`** exposure: double-guarded (`isLocalDevEnvironment()`, itself based on Vercel's own platform-set `VERCEL` env var — not client-controllable — AND an explicit `DEV_TOOLS_ENABLED=true` opt-in). Structurally can never activate on any real Vercel deployment. Confirmed by reading the guard, not just trusting the comment.
- **Server error responses** never leak internals: every route's `catch` block logs the real error server-side via `console.error` and returns a fixed, safe message. The two places that pass a caught error's own `.message` to the client (`tickets.ts` resend/regenerate) do so only for a typed `TicketActionError` with hardcoded safe messages ("Ticket not found.", etc.), never a raw exception.
- **Duplicate-request safety**: the atomic `UPDATE ... WHERE status = 'valid'` check-in pattern makes a repeated scan of the same ticket naturally idempotent (returns `already_checked_in`, never double-counts) without any extra guard needed. Every action button that mutates state (resend, regenerate, toggle-active, reset-password, order-resend) already disables itself before the request and only re-enables on failure.
- **Browser compatibility**: `admin.js`/`scan.js` are plain ES5 (`var`, `function(){}`, zero arrow functions or `const`/`let` anywhere in either file, confirmed by grep) — matches the codebase's established style, deliberately broad-compatible.
- **Input validation**: pagination (`page`/`limit`) is bounded server-side on both Orders and Tickets; date ranges on Reports are regex- and order-validated; volunteer email validated the same way as login email; every new field this phase (`isActive`, `email`) is type-checked before use.
- **Accessibility (beyond the one fix above)**: keyboard shortcuts (`M` for manual entry, `Escape` to close it) still work; focus moves to the manual-entry input and the volunteer-create email field when each opens; all interactive elements are real `<button>`/`<input>` elements, not clickable `<div>`s; contrast of new UI (credential box, activity list) reuses already-vetted Phase 2 color tokens; `prefers-reduced-motion` already disables the new scan-detected flash animation globally, no extra work needed.
- **Dead code / debug logging / TODOs**: repo-wide grep found zero `TODO`/`FIXME`/`HACK` markers, zero stray `console.log` in `lib/`/`api/` outside one pre-existing, correctly-gated line in `lib/payments/mock-checkout.ts` (local-dev-only, same guard as above — never runs in production). `tsc --noEmit` passes clean with `noUnusedLocals`/`noUnusedParameters` both enabled, so there are no unused imports/locals anywhere in the TypeScript codebase.

**Found, not fixed (belongs to the user, not this build):**

- **`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are still absent from Vercel Production** — re-confirmed today via `vercel env ls production` and `vercel env pull` (key names only checked; no secret values were viewed or logged; the temporary pulled file was deleted immediately after). This is a **known, already-documented** issue — `PHASE2_ROADMAP.md` and `PHASE3_ARCHITECTURE.md` both record it as discovered during Sprint 2.1, deferred by explicit instruction, and named as something that must be fixed before Festival Day. Not a Phase 3 gap; not touched by this build; see `PRE_LAUNCH_CHECKLIST.md` item 1.
- **Supabase Auth's leaked-password protection is still disabled** — flagged by `get_advisors` (WARN level), and already named in `PHASE3_ROADMAP.md` Sprint 3.1 as something to enable "before Sprint 3.3 provisions volunteer accounts." It was not enabled before this report. It's a one-click dashboard toggle, not code — see `PRE_LAUNCH_CHECKLIST.md` item 3.
- **Sprint 3.2's test data is still in production**: order `DHF-TEST32-A` (3 tickets: `DHF26-T32A`, `DHF26-T32B` both `checked_in`, `DHF26-T32C` `void`) — confirmed present via direct query. Left in place deliberately (device-testing was ongoing), but it will inflate real attendance/ticket-sold counts if not removed before Festival Day. See `PRE_LAUNCH_CHECKLIST.md` item 2. Not deleted by this report — removing production data needs your explicit go-ahead.

---

## 4. Database

10 migrations total, all applied live (no local-only drift): `phase1_ticketing_schema`, two search-path pin fixes, `phase2_profiles_and_roles`, `phase2_admin_audit_log`, `phase2_dashboard_revenue_rpc`, two reports-revenue migrations, `phase3_ticket_checkin_columns`, and this sprint's `phase3_volunteer_and_logout_audit_actions`.

Current tables: `events`, `orders`, `tickets`, `profiles`, `admin_audit_log` — all RLS-enabled with zero policies (deliberate deny-all; every access goes through the service-role key server-side, never RLS-mediated). This is the same design carried through every phase, not something this sprint changed.

`profiles` currently has 1 row (the SUPER_ADMIN account) — no volunteer accounts exist yet in production.

---

## 5. Dependencies & environment

No new npm dependencies added in Phase 3 (volunteer account creation uses the existing `@supabase/supabase-js` admin API; nothing new to install). Full dependency list unchanged from Phase 1: `@sparticuz/chromium`, `@supabase/supabase-js`, `@upstash/ratelimit`, `@upstash/redis`, `puppeteer-core`, `qrcode`, `resend`, `stripe`.

No new required environment variables. `scripts/check-env.mjs`'s list (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) is unchanged and still accurate.

`DEV_TOOLS_ENABLED` and `MOCK_PAYMENTS` are both set on Vercel Production — both are structurally inert there (both gate through `isLocalDevEnvironment()`, which is unconditionally `false` on any real Vercel deployment). Not a security issue, just noise; optional cleanup, not required.

---

## 6. What is verified vs. not yet verified

**Verified (server-side, this sprint and prior sprints):** every route's auth/method/rate-limit gating (via direct curl against production with and without a token), static asset delivery, TypeScript typecheck, DOM id/class cross-references between every HTML/JS/CSS file, Vercel deployment health and logs (no application errors), database migration application, Supabase security advisors (no new findings).

**Not yet verified (needs a real SUPER_ADMIN session, a VOLUNTEER account, and physical devices — outside what I can do without them):**
- Creating a volunteer, confirming the one-time password display/copy, activating/deactivating, resetting a password, viewing activity
- Logging in as a VOLUNTEER and confirming the `/admin/scan` redirect and full lockout from Dashboard/Orders/Tickets/Reports/Settings/Volunteers by direct navigation, not just nav-hiding
- Camera scan, manual entry, camera switch, torch, and the new 4th stat tile on real iOS Safari and Android Chrome devices, portrait and landscape
- The visibility-pause/resume and offline/online reliability behavior under real network conditions
- Audit log rows actually appearing correctly for LOGIN_SUCCESS/LOGOUT/CREATE_VOLUNTEER/UPDATE_VOLUNTEER/RESET_VOLUNTEER_PASSWORD after real use

This list is intentionally identical in spirit to Sprint 3.3's — it hasn't shrunk because the manual acceptance pass hasn't happened yet, per your instruction to not block development on it. See `PRE_LAUNCH_CHECKLIST.md` for this as a required pre-event step.

---

## 7. Known limitations (by design or explicitly out of scope, not oversights)

- **No true offline mode.** The scanner degrades gracefully (pauses, retries, clear messaging) but does not queue check-ins locally during a sustained outage. Deliberate — see `PHASE3_ARCHITECTURE.md` §7. Revisit only if a venue connectivity test shows it's genuinely needed.
- **Single-day event assumption.** `checkedInToday` and total attendance are computed identically (no multi-day partitioning) — correct for a one-day festival, would need real changes for a multi-day event.
- **No manual void/re-validate action** for a SUPER_ADMIN/ADMIN to correct a volunteer's mistaken check-in. The `void` status and `VOID_TICKET` audit action already exist in the schema, unused — cheap to add later, not asked for in Phase 3.
- **`/tickets/verify/` still 404s** on the public static site — every ticket's QR code encodes this URL, and a curious attendee's own camera app will follow it. The admin scanner doesn't need this page (reads the token directly), but it's a real, small, pre-existing polish gap on the *public* site, unrelated to this backend repo.
- **Per-volunteer/per-gate reporting** isn't built. `checked_in_by` is already captured on every ticket, so this is a future Reports addition if multiple simultaneous check-in lanes turn out to be worth analyzing.

---

## 8. Recommendation

Phase 3's engineering work — role authorization, check-in backend, scanner UI, volunteer management, audit trail, and this sprint's hardening pass — is complete and production-deployed. I'd stop short of calling Phase 3 fully done until: (1) the Stripe env vars are fixed (or a decision is made to keep using seeded test data for now), (2) leaked-password protection is enabled, (3) test data is either cleared or explicitly accepted as pre-event data, and (4) the manual device/volunteer acceptance pass in §6 actually happens. None of those are code work — they're the remaining items in `PRE_LAUNCH_CHECKLIST.md`.
