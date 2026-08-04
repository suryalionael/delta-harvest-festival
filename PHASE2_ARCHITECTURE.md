# Phase 2 — Admin Dashboard Architecture

Status: **Sprints 2.1–2.6 complete.** All five planned modules (Dashboard, Orders, Tickets, Reports, Settings) are shipped and production-verified.
Scope: Admin Dashboard (Dashboard, Orders, Tickets, Reports, Settings) built on top of the existing, live Phase 1 ticketing system. Nothing in Phase 1 is redesigned or rewritten.

**Revision note (post-approval):** this document was updated after initial planning review to reflect ten architecture decisions from the approval pass — replacing the originally-proposed `admin_users` table with a future-proof `profiles` + role system, collapsing dashboard statistics into one aggregated endpoint, keeping Tickets as its own module rather than folding it into Orders, adding a Settings module for future event management, requiring server-side CSV streaming, and formalizing a controlled audit-action vocabulary starting Sprint 2.1. Where this revision changes an earlier recommendation, the earlier text has been replaced, not left alongside it — this file reflects the current decision only.

This document assumes the reader has NOT read the Phase 1 docs. Phase 1 facts stated here were mined from `PHASE1_IMPLEMENTATION_SUMMARY.md`, `FINAL_PRODUCTION_REPORT.md`, `INFRASTRUCTURE_SETUP_REPORT.md`, `DEPLOYMENT.md`, `ROLLBACK.md`, `GO_LIVE.md`/`GO_LIVE_CHECKLIST.md`, and verified live against the Supabase project (`zcohmiqvkcaempgafeuh`) via direct schema/advisor inspection on 2026-08-04.

---

## 1. What already exists (Phase 1, unchanged)

Two separate deployments, three services, no framework:

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│  Static site (this repo)    │        │  delta-harvest-tickets-api        │
│  GitHub Pages                │        │  (separate repo, Vercel)         │
│  deltaharvestfestival.ca     │  fetch │  api.deltaharvestfestival.ca      │
│  /tickets/* pages + JS       ├───────►│  /api/payments/create-checkout-  │
│  no server code, no secrets  │        │    session                       │
│                               │        │  /api/payments/webhook           │
│                               │        │  /api/tickets/retrieve           │
└─────────────────────────────┘        └───────────┬──────────────────────┘
                                                      │ service-role key only
                                        ┌─────────────▼─────────────┐
                                        │  Supabase (Postgres)       │
                                        │  events / orders / tickets │
                                        │  RLS ON, zero policies      │
                                        │  (deny-all except service   │
                                        │   role, which bypasses RLS) │
                                        └────────────────────────────┘
                        Stripe (Checkout) ─┐
                        Resend (email)    ─┼─► called server-side only
                        Upstash (rate limit)┘   from the API project
```

Key architectural facts that constrain every Phase 2 decision:

- **The browser never talks to Supabase, Stripe, or Resend directly.** All secrets live server-side in the Vercel API project. This is the single most important invariant to preserve.
- **RLS is enabled with zero policies on all three tables** — this is a deliberate deny-all posture. Only the service-role key (which bypasses RLS entirely) can read/write. There is currently no anon-key/authenticated-key path into this data at all.
- **No admin/user/role table exists.** No Supabase Auth usage anywhere in Phase 1.
- **The API is plain Vercel serverless functions** (`/api/*.ts`, Framework preset "Other"), not Next.js, not Supabase Edge Functions (`list_edge_functions` returns empty — confirmed live).
- **Core fulfillment logic is already factored into reusable functions**: `sendTicketsForOrder()` (used by both the Stripe webhook and the public retrieve endpoint) and a PDF renderer (`lib/pdf/render.ts`, Puppeteer + `@sparticuz/chromium`). Both are exactly what Phase 2's "resend email" / "regenerate PDF" actions should call — not reimplement.
- **The static marketing site is a separate, framework-free deploy** (GitHub Pages, no build step). It should not need to change for Phase 2 at all.

Live schema (verified via Supabase MCP, matches `supabase/schema.sql` in the API repo):

| Table | Purpose | Notable columns |
|---|---|---|
| `events` | one active event at a time (partial unique index enforces ≤1) | `adult_price`, `kids_price`, `is_active` |
| `orders` | one row per Stripe checkout | `order_number` (`DHF-ORD-000001`), `stripe_payment_intent` (unique, idempotency key), `payment_status` (`paid`\|`failed` only), `tickets_generated_at` (atomic fulfillment claim) |
| `tickets` | one row per ticket | `ticket_number` (`DHF26-000001`), `qr_token` (unique, 128-bit), `ticket_type` (`adult`\|`kids`), `status` (`valid`\|`checked_in`\|`cancelled`\|`refunded`\|`void` — only `valid` is written today) |

Full column-level detail, indexes, and RPCs are in `PHASE2_DATABASE_REVIEW.md` — this file only covers what's architecturally relevant.

---

## 2. Where the Admin Dashboard lives

**Decision (approved): extend the existing `delta-harvest-tickets-api` Vercel project. No new backend, ever, for Phase 2.**

- New routes under `/api/admin/*` in the same repo/project as the existing `/api/payments/*` and `/api/tickets/*` routes.
- Same Supabase client, same service-role key, same `lib/` helpers (response envelope, rate limiting, `sendTicketsForOrder`, PDF renderer). Zero new secrets to provision beyond one admin-specific rate-limit namespace and one new Supabase key (see §3).

  **Amendment (Sprint 2.4, discovered mid-build): one deployed function for all of `/api/admin/*`, not one file per route.** The original per-route-file structure (`api/admin/auth/login.ts`, `api/admin/orders/[id].ts`, etc.) hit Vercel's Hobby-plan cap of 12 serverless functions per deployment at 14 functions total — a real deploy failure, not a style preference. Per an explicit "stay on Hobby, don't upgrade" decision, every `/api/admin/*` route's actual logic now lives in plain (non-deployed) functions under `lib/admin/routes/*.ts`, and a single `api/admin/router.ts` dispatches to them by path segment + method. Routing there is done via an explicit `vercel.json` rewrite (`/api/admin/:path*` → `/api/admin/router?path=:path*`) — verified live that Vercel's zero-config `[...param].ts` file-name convention only captures a single path segment for a non-framework ("Other" preset) project like this one, so a real multi-segment route never reached a catch-all file at all. The rewrite is the documented, reliable mechanism. Net effect: 14 functions → 5, with headroom for Settings and Phase 3 without hitting this again — Sprint 2.5 (Reports) added two more routes at zero additional function cost as a direct result.
- **The service-role key is never exposed to the frontend, under any circumstance.** All admin data access happens through `/api/admin/*` routes running server-side with the service-role client already defined in `lib/database/client.ts`. The only credential the browser ever holds is a short-lived Supabase Auth session token (see §3) — a credential scoped to *that admin's identity*, not a database master key.
- **The admin frontend is static files served from the same Vercel project**, at `/admin`, not a second Vercel project or subdomain. This is a stronger version of the "no new backend" decision applied to the frontend too: one project, one deploy pipeline, no new DNS/CNAME, and — the concrete payoff — **same-origin means no CORS configuration for the admin surface at all.** A browser only enforces CORS on cross-origin requests; `/admin/*` calling `/api/admin/*` on the same host never triggers it. This removes an entire class of misconfiguration risk (a missed allow-list entry silently breaking the dashboard) that existed in the original two-origin proposal. The existing `ALLOWED_ORIGIN` CORS handling for the public ticketing endpoints is untouched — admin routes simply don't call `applyCors()` at all, since they have no legitimate cross-origin caller to support.

**Why not put the dashboard in this static-site repo?** This repo is pure static HTML with no build step and no way to hold a server secret. An admin dashboard fundamentally needs authenticated, authorized server-side data access — it has to live next to (or inside) the API project, not the public site.

**Why not give the dashboard its own Supabase RLS policies + anon key instead of going through the API?** Considered and rejected. Phase 1's entire security model is "no client ever holds a Supabase key that can do anything" (RLS deny-all + service-role-only server access). Introducing a second access pattern — RLS policies plus an `authenticated` role using the anon key — doubles the security surface (two authorization systems to keep in sync: RLS policies AND server-side checks) for no real benefit at this data scale (single small festival, low query volume). Routing everything through `/api/admin/*` with server-side auth checks keeps one access pattern for the whole system and matches the existing "reuse, don't duplicate" instruction.

---

## 3. Authentication & authorization

Phase 1 explicitly flagged this as deferred: *"Admin authentication via Supabase Auth + RLS (already 'free' since Supabase is already in the stack)"* — a one-line forward pointer, not a spec. This is the one genuinely new piece of infrastructure Phase 2 needs, and the approval pass replaced the original minimal design with a **future-proof role system**, specifically so Phase 3 (Festival Day, e.g. check-in scanner staff) can reuse the exact same authentication system rather than needing its own.

**Design (approved):**

1. **Identity: Supabase Auth**, email + password. Reuses the Supabase project already in the stack — no new identity provider.
2. **Authorization: a `profiles` table**, not a bare allow-list. `profiles` (`user_id uuid references auth.users`, `role text`, `is_active boolean`, timestamps) links every admin identity to a **role**: `SUPER_ADMIN`, `ADMIN`, or `VOLUNTEER`. Being present in this table with an active row is what makes someone an admin at all — Supabase Auth alone only proves *who* someone is, not that they're allowed in, and the role determines *what* they're allowed to do. See `PHASE2_DATABASE_REVIEW.md` for the exact schema and role semantics.
   - This directly serves §5 of this document (Festival Day reuse): Phase 3 check-in staff are a `VOLUNTEER` row in this same table, authenticating through this same login endpoint, with role-gated access to a narrower set of actions (ticket lookup + check-in only) — no second auth system to build later.
3. **Every `/api/admin/*` route requires a Bearer token** (the Supabase Auth session token) in the `Authorization` header. `lib/admin/session.ts`'s `requireAdmin()`:
   - Verifies the token against Supabase Auth.
   - Looks up the caller in `profiles`; rejects (401/403) if absent, inactive, or role-invalid.
   - Returns `{ userId, email, role }` to the handler, which individual routes can further gate on role (e.g. `UPDATE_EVENT` restricted to `SUPER_ADMIN`/`ADMIN`, not `VOLUNTEER`) once those routes exist.
4. **RLS on `events`/`orders`/`tickets` (and the new `profiles`/`admin_audit_log`) stays deny-all, no policies.** The admin API reads/writes through the service-role key, same as every existing route — auth/authz happens in the middleware, not in Postgres policies. One access pattern, enforced once, in one place, exactly as decided in §2.
5. **The dashboard frontend never sees the service-role key.** It only ever holds a Supabase Auth session token, obtained via a server-side login proxy (`POST /api/admin/auth/login`, not a direct client-side `supabase-js` sign-in) and sent as a Bearer token with each subsequent call. Routing sign-in through our own endpoint — rather than letting the browser talk to Supabase Auth directly — is what makes item 7 below (audit-logging every login attempt, including wrong-password ones) and item 6 (rate limiting) possible; a client-side sign-in would happen entirely outside our server's visibility.

   **Amendment (Remember Me):** the credential check still goes through our server-side login proxy unchanged — that part of the design didn't move. What changed is what happens *after* a successful login: instead of the frontend manually writing the returned tokens into `sessionStorage` itself, it hands them to a browser-side `supabase-js` client via `auth.setSession()`, and that client's own `persistSession`/`autoRefreshToken` mechanism owns storage and refresh from that point on — the official mechanism, not a hand-rolled one. A "Remember Me" checkbox controls *where* that official mechanism persists to (a custom `storage` adapter picks `localStorage` vs. `sessionStorage` per a small non-token preference flag), not *how* it persists. This requires the browser to load `@supabase/supabase-js` (via CDN, since the admin frontend has no build step) and hold the anon key — both already covered by §9's "safe to be public" reasoning. `requireAdmin()` server-side is completely unaffected: it validates whatever bearer token arrives, regardless of how the browser obtained or stored it, and still re-checks the live `profiles` row on every request — a deactivated admin's remembered session stops working on its very next API call, not just at next login.
6. **Rate-limit the login path** using the same Upstash sliding-window pattern already proven in Phase 1, so credential stuffing against the dashboard is throttled the same way ticket-buying abuse already is.
7. **Audit log every login attempt from Sprint 2.1 onward** (`LOGIN_SUCCESS` / `LOGIN_FAILED`) and every mutating admin action as later sprints add them — see §6 (Audit logging) and `PHASE2_DATABASE_REVIEW.md` for the `admin_audit_log` table and its controlled action vocabulary.

Admin account provisioning (creating the first admin user and their `profiles` row) is a manual, one-time operation via the Supabase Auth Admin API — not a self-serve signup flow. There's no product need for open registration on a single-festival admin tool. Role changes (promoting/demoting an existing profile) are a straightforward future `SUPER_ADMIN`-only endpoint, not built in Sprint 2.1.

**Caveat on "remembered for ~30 days":** the frontend now persists the session correctly for as long as the underlying Supabase Auth refresh token stays valid — that part is verified. The actual ceiling on refresh-token lifetime is a Supabase project-level Auth setting (Dashboard → Authentication → Sessions), not something exposed through any tool available for this build. If a hard 30-day cap matters precisely (vs. "persists indefinitely until revoked or the refresh token is otherwise invalidated," which is Supabase's default), that setting needs checking/configuring directly in the Supabase dashboard.

---

## 4. API surface (new)

All new, all under `/api/admin/*`, all requiring the auth middleware from §3 (except `auth/login` itself, which *establishes* identity), all using the existing response envelope (`{success, data}` / `{success:false, code, message}`) for consistency with Phase 1 endpoints, all same-origin (no CORS) per §2.

**One aggregated dashboard endpoint, not many small ones (approved decision).** The original plan proposed separate summary/revenue/breakdown/recent-orders endpoints; that's replaced with a single `GET /api/admin/dashboard` returning everything the Dashboard module needs in one response, so the frontend never has to fan out multiple requests (and pay multiple round trips) just to paint one screen:

```json
{
  "revenue": 123000,
  "ticketsSold": 245,
  "adults": 190,
  "children": 55,
  "attendance": { "checkedIn": 0, "total": 245 },
  "recentOrders": [ { "orderNumber": "DHF-ORD-000042", "customerName": "...", "total": 5000, "createdAt": "..." } ]
}
```

**As shipped in Sprint 2.2** (revised from this section's original draft): no `pending`/`refunded` fields. `orders.payment_status` only ever takes `'paid'`/`'failed'` — there's no real "pending" concept in this schema (a checkout that's never completed never gets an `orders` row at all), so those two fields would always read `0` and risked implying a real status this system doesn't track. Dropped rather than shipped as always-zero noise; can be added later if a real use for them shows up. `attendance` is still shipped as a future-ready placeholder — see §7 and §8 for why.

| Endpoint | Method | Purpose | Reuses |
|---|---|---|---|
| `/api/admin/auth/login` | POST | Sign in, verify `profiles` membership, return a session token | Supabase Auth; rate-limited (§3.6) |
| `/api/admin/auth/session` | GET | Return current admin identity from a Bearer token (frontend bootstrap / reload) | `requireAdmin()` |
| `/api/admin/dashboard` | GET | Everything the Dashboard module needs, in one response (see above) | Direct aggregate queries — no new tables |
| **Orders module** | | | |
| `/api/admin/orders` | GET | Search/filter orders — by order number, customer name, email, status; paginated | — |
| `/api/admin/orders/:id` | GET | Order detail + its tickets (join) | — |
| `/api/admin/orders/:id/resend` | POST | Resend all tickets for an order by email | **`sendTicketsForOrder()`** — exact function Phase 1 already uses for webhook + public retrieve |
| **Tickets module (deliberately separate from Orders — approved decision)** | | | |
| `/api/admin/tickets` | GET | Search by ticket number or QR token | — |
| `/api/admin/tickets/:id` | GET | Ticket status/detail, independent of the Orders UI | — |
| `/api/admin/tickets/:id/regenerate-pdf` | POST | Re-render a ticket's PDF (and optionally re-send it) | **`lib/pdf/render.ts`** — exact renderer Phase 1 already uses |
| **Reports module (shipped Sprint 2.5)** | | | |
| `/api/admin/reports/summary?from=&to=` | GET | Total revenue, paid/failed order counts, adult/child/total tickets sold, average order value — one aggregated response, date-range filterable | `admin_revenue_total()` RPC (extended with an optional date range), `countOrders()`/`countTickets()` shared with the Dashboard |
| `/api/admin/reports/export?from=&to=` | GET | **Server-side-generated CSV**, never assembled in the browser — one row per (order, ticket type present) | `orders.adult_qty`/`kids_qty`/unit prices directly — no join to `tickets` needed for these columns |
| **Settings module (shipped Sprint 2.6, narrower than originally sketched here — see §7)** | | | |
| `/api/admin/settings/event` | GET | Any authenticated admin — name, venue, dates, pricing (read-only), support email (read-only) | `getActiveEvent()`, `SUPPORT_EMAIL` (existing env-var export from `lib/emails/client.ts` — no duplication) |
| `/api/admin/settings/event` | PATCH | `SUPER_ADMIN` only — name/venue/start date/end date. Pricing and support email rejected outright (400), not silently ignored | `updateEvent()`; logs `UPDATE_EVENT` |

**Why Tickets stays a separate module from Orders**: an order is a purchase transaction (one customer, one payment); a ticket is an individual admission credential (one person, one QR code). An order for 4 adult + 2 kids tickets is one row in Orders and six rows in Tickets — collapsing them into one UI would force every ticket-level operation (look up *this* QR code, regenerate *this* PDF) through an order-shaped lens that doesn't fit. Keeping them separate also matches how Festival Day check-in will actually be used: staff scanning a gate need ticket-level lookup, not order-level.

Nothing here requires new third-party services. No new Stripe/Resend/Upstash capabilities — Resend is reused for resend, Upstash gets one additional rate-limit namespace (login abuse protection), Stripe is untouched (Phase 2 is read/report/resend only — no refund flow yet, matching `payment_status` currently only supporting `paid`/`failed`).

**Explicitly out of scope for Phase 2 code** (though the data model is kept ready for it — see §7, §8): QR check-in (`/api/tickets/verify`, ticket `status = 'checked_in'` transition) and refunds (`payment_status` would need a third value) are Phase 3. Event editing (Settings module) is architected for now but not built until its own sprint. This keeps the blast radius small: nothing shipped in Sprint 2.1–2.x can alter a paid order's financial facts or the live event configuration.

---

## 5. Festival Day (Phase 3) reuse

The prompt asks Phase 2 to design for Festival Day reuse. Concretely, that means:

- **`/api/admin/tickets` (search by ticket/QR)** is the same lookup a check-in scanner will need — Phase 3 can add a `POST /api/admin/tickets/:id/check-in` endpoint that transitions `status` to `checked_in`, reusing the same auth middleware, the same ticket lookup, and the same audit log table (`CHECK_IN_TICKET` is already in the vocabulary — §6).
- **`profiles` + the auth middleware is exactly what check-in staff use too** — no second auth system. A check-in volunteer is simply a `profiles` row with `role = 'VOLUNTEER'`, signing in through the same `POST /api/admin/auth/login`. This was the specific reason the role system replaced the originally-proposed flat `admin_users` allow-list (§3).
- **`tickets.status` already has `checked_in` in its check constraint** (unused today) — Phase 1 already anticipated this, no schema change needed for Phase 3's core state transition.
- **Dashboard's `attendance` field is built future-ready now** (§4, §8): it queries `tickets.status` counts, which will start returning real check-in numbers the moment Phase 3 ships, with no dashboard code change.

---

## 6. Audit logging (approved decision — begins Sprint 2.1, not deferred)

Every important admin action is recorded in `admin_audit_log` from the very first sprint that has any actions to log — Sprint 2.1 ships `LOGIN_SUCCESS`/`LOGIN_FAILED` logging alongside the login endpoint itself, not as a follow-up.

**Controlled vocabulary, not free text.** `admin_audit_log.action` is a fixed set of values, enforced by a Postgres check constraint (defense in depth alongside the TypeScript union type `lib/admin/actions.ts` defines) — nothing can insert an ad-hoc action string. The vocabulary, sized for what Phase 2 (and the Phase 3 handoff) actually needs:

`LOGIN_SUCCESS`, `LOGIN_FAILED`, `VIEW_ORDER`, `VIEW_TICKET`, `RESEND_EMAIL`, `REGENERATE_PDF`, `EXPORT_REPORT`, `UPDATE_EVENT`, `VOID_TICKET`, `CHECK_IN_TICKET`

The last two (`VOID_TICKET`, `CHECK_IN_TICKET`) have no endpoint that writes them yet — `VOID_TICKET` arrives with the Tickets module's future void/cancel action, `CHECK_IN_TICKET` with Phase 3. They're in the vocabulary now so the constraint doesn't need a migration later just to log an action whose *code* already exists in spirit (`tickets.status` already has `void` and `checked_in` as valid values today). Adding a genuinely new action later is still a small migration (`alter table ... add constraint`) — this isn't meant to predict every future action, just the ones already implied by this document's own scope.

Each row records `actor_id` (nullable — a failed login before identity is established has no actor), `action`, `target_type`/`target_id` (what the action was performed on, when applicable), `ip`, and `metadata` (small structured context, e.g. which email address a resend went to). See `PHASE2_DATABASE_REVIEW.md` for the full schema. Writes go through one shared `logAudit()` helper (`lib/admin/audit.ts`) — every route that needs to log calls the same function, so the vocabulary and shape stay consistent by construction rather than by convention.

Audit log failures never block the action being logged (mirrors Phase 1's rate-limiter fail-open reasoning) but are logged loudly server-side — a silently broken audit pipeline is worse than a slow one.

---

## 7. Settings / event management readiness (name/venue/dates shipped Sprint 2.6; pricing/capacity/sales-status still deferred)

The original plan asked Phase 2 to make event editing (title, venue, date, pricing, capacity, sales status) *eventually* possible without a schema redesign, without necessarily building it immediately. Sprint 2.6 went further than "architecture only" for the safe subset: name, venue, and dates are genuinely editable now (`SUPER_ADMIN`-gated, audit-logged). Pricing/capacity/sales-status remain deferred — concretely:

- `events` already has `name`, `venue`, `start_date`/`end_date`, `adult_price`, `kids_price` — `PATCH /api/admin/settings/event` writes to the first four directly, no migration needed. It explicitly rejects (400) any attempt to include `adultPrice`/`kidsPrice`/`supportEmail` in the request body, rather than silently accepting-and-ignoring them — an admin should never see a 200 response and believe a price change took effect when it didn't.
- `supportEmail` is read-only display only — it's `SUPPORT_EMAIL`, a Vercel environment variable read at cold-start (`lib/emails/client.ts`), not an `events` column. Making it live-editable would mean either adding a new DB column and changing Phase 1's email-sending code to read from it (a real behavior change to already-verified Phase 1 logic, out of scope here) or accepting that a "saved" change wouldn't take effect until a redeploy (confusing UX). Deferred rather than half-built.
- **Two fields don't exist yet and will need an additive migration when Settings is actually built**: `capacity` (an integer cap, currently unbounded) and a real `sales_status` (open/paused/closed). Note that `is_active` is *not* the same concept as sales status — `is_active` picks which single event row drives checkout among potentially several event rows (its partial unique index enforces "at most one active event"); sales status would control whether *that* active event is currently purchasable. Conflating the two later would be a mistake worth avoiding now by naming this distinction explicitly.
- Any event editor must also solve the static-site staleness problem Phase 1 already flagged: `tickets/index.html`'s meta description doesn't update when the DB `events` row changes, because nothing connects them. A future Settings module either needs to (a) accept that static copy is manually maintained and out of scope, or (b) trigger a static-site content update some other way. Not a Phase 2 decision to make now — just flagging it so it's a conscious choice when Settings is scheduled, not a rediscovered surprise.
- Until Settings ships, the `admin_audit_log` vocabulary already reserves `UPDATE_EVENT` (§6) so that sprint doesn't need its own audit migration either.

---

## 8. Performance, scalability, security posture

- **Scale reality check**: this is a single-day, single-venue local festival. Phase 1 docs report no load testing was done and none of the current infra (Vercel Hobby-adjacent limits, Upstash free tier, Supabase free/small tier) has been stressed. Expected order/ticket volume is in the hundreds, not thousands. **Do not build for scale this system doesn't need** — no caching layer, no read replica, no materialized views. Direct Postgres queries against `orders`/`tickets` with the existing indexes (all unique-constraint-backed: `order_number`, `stripe_payment_intent`, `ticket_number`, `qr_token`) are more than sufficient. Add pagination on list endpoints purely for UI ergonomics, not because the data volume demands it.
- **Search columns**: `customer_email` has a plain (non-functional) index today per the Phase 1 docs; case-insensitive search should use `ilike` and can add a `citext` or `lower()`-based index if search feels slow in practice — not needed pre-emptively at this row count.
- **Security posture inherited, not reinvented**: same "secrets never reach the browser," same rate-limiting pattern, same input validation discipline, same enumeration-safety instinct (though less relevant here since admins are authenticated). New surface introduced is exactly one thing: the admin login path, which gets the same Upstash sliding-window treatment as the existing public endpoints.
- **Dashboard performance**: the single aggregated `GET /api/admin/dashboard` endpoint (§4) runs its component queries directly against the three tables at request time. At expected data volumes this is sub-100ms; no need for pre-aggregation or a cron-refreshed summary table. Revisit only if real usage proves otherwise.
- **Attendance is modeled now, populated later (approved decision)**: the dashboard response shape (§4) includes an `attendance` field from Sprint 2.1 onward, sourced from `tickets.status` counts — a column that already exists and already has `checked_in` as a valid value, just unused until Phase 3's check-in flow writes it. This is the concrete reason no dashboard schema redesign will be needed when Phase 3 ships: the field is already there, already wired, just returning `0` until real check-ins start happening.

---

## 9. New environment variables

| Var | Purpose |
|---|---|
| `SUPABASE_ANON_KEY` | Server-side Supabase Auth calls (sign-in, token verification) in `lib/admin/auth-client.ts` — deliberately the anon key, never the service-role key, and never sent to the browser (§3) |

No `ADMIN_ALLOWED_ORIGIN` or other CORS-related var is needed — §2's same-origin decision removes that requirement entirely. Everything else (Resend, Upstash, Supabase URL/service-role key) is already provisioned and reused as-is.

---

## 10. Design principles applied

- **Production-first**: every new endpoint reuses proven Phase 1 fulfillment code (`sendTicketsForOrder`, PDF renderer) rather than re-deriving it — less new code, less new risk.
- **Minimal / avoid duplication**: one backend project, one auth pattern, one response envelope, one rate-limiting library, no new database access pattern alongside the existing service-role-only model.
- **Mobile responsive / clean / accessible**: dashboard frontend should follow the same accessibility discipline already visible in the ticketing pages (explicit `aria-live` regions, WCAG-AA color contrast fixes like `--muted-readable`) — carry that convention into the new UI rather than starting from scratch.
- **Secure**: deny-all RLS untouched; all new access mediated by an explicit auth+authz middleware; every mutation audit-logged; no new secret reaches any browser.

---

## 11. Production workflow standard (applies to every sprint, not just 2.1)

Every completed milestone follows the same sequence, no exceptions, mirroring how Phase 1 was actually shipped:

1. Test locally (`npm run typecheck`; exercise new endpoints against `vercel dev` or directly against Supabase where a full local Stripe/webhook loop isn't needed).
2. Commit.
3. Push to GitHub.
4. Deploy to Vercel Production.
5. Verify against the live production deployment (real HTTP calls, not just "it built").
6. Check Vercel logs for the deploy.
7. Produce an honest verification report — what was implemented, what was actually confirmed working in production, what wasn't, and what risk that leaves.

**Never continue building on unverified code.** If step 5 or 6 turns up a problem, it gets fixed and re-verified before the next milestone starts — not noted as a follow-up. Every milestone must leave production in a working state; Sprint 2.2 does not begin until Sprint 2.1 is fully implemented, deployed, and production-verified.
