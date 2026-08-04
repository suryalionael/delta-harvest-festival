# Phase 2 — Admin Dashboard Roadmap

Status: **Sprints 2.1–2.6 complete — all five modules (Dashboard, Orders, Tickets, Reports, Settings) shipped and production-verified.** See `PHASE2_ARCHITECTURE.md` and `PHASE2_DATABASE_REVIEW.md` for the design this roadmap implements. Remaining open items: Stripe checkout is broken in production (pre-existing, intentionally deferred until after Phase 3 per explicit instruction — not a Phase 2 gap) and Phase 3 (Festival Day check-in) itself, both out of this roadmap's scope.

**Revision note (post-approval):** the implementation order below is restructured into named sprints (2.1, 2.2, …) per the approval decision that each sprint must be fully implemented, deployed, and production-verified before the next one starts — "steps" that could be worked in parallel or loosely sequenced no longer fit. Frontend stack/topology questions the original draft left open are now settled (`PHASE2_ARCHITECTURE.md` §2: same Vercel project, `/admin` path, no CORS). Audit logging is pulled forward to Sprint 2.1 instead of arriving with the first mutating action in what was "Step 5."

---

## Production workflow (applies to every sprint)

Per `PHASE2_ARCHITECTURE.md` §11 — repeated here because it's the operating discipline for this whole roadmap, not a one-time setup step:

**Test locally → commit → push to GitHub → deploy to Vercel Production → verify against live production → check Vercel logs → produce an honest verification report.** Never continue building on unverified code. Every sprint must leave production in a working state before the next sprint starts.

---

## Sprint structure

**Sprint 2.1 — Authentication foundation** *(current sprint — see this doc's companion verification report once complete)*
- `profiles` + `admin_audit_log` migrations.
- `lib/admin/session.ts` (`requireAdmin()`), `lib/admin/audit.ts` (`logAudit()`), `lib/admin/roles.ts`, `lib/admin/actions.ts`.
- `POST /api/admin/auth/login`, `GET /api/admin/auth/session`.
- Audit logging live from day one: `LOGIN_SUCCESS`/`LOGIN_FAILED` on every attempt.
- Minimal admin frontend shell at `/admin`: login form, authenticated header (email + role), logout. No data modules yet — those don't exist until later sprints.
- First `SUPER_ADMIN` provisioned.
- Exit criteria: an admin can log in from the real `/admin` page on production, see their identity, and every login attempt (success or failure) shows up in `admin_audit_log`.

**Sprint 2.2 — Dashboard Metrics** *(complete — see this doc's companion verification report)*
- `GET /api/admin/dashboard` (the single aggregated endpoint — `PHASE2_ARCHITECTURE.md` §4): revenue, tickets sold, adult/child ticket counts, recent orders, attendance placeholder.
- Revenue computed via a new `admin_revenue_total()` RPC (PostgREST has no SUM without the aggregates extension — same reasoning as the existing numbering RPCs); everything else in the response is plain PostgREST counts/selects run in parallel.
- Dashboard page (stat tiles + recent-orders table) built into the admin frontend, reusing Sprint 2.1's auth.
- No audit logging added this sprint — `VIEW_ORDER`/`VIEW_TICKET` stay reserved for when their own modules exist (Sprint 2.3), and dashboard views aren't in the controlled vocabulary.
- Split out from the original draft's combined "Dashboard + Orders" step — actual execution treated them as separate sprints; Orders moved to 2.3.

**Sprint 2.3 — Orders Management** *(complete — see this doc's companion verification report)*
- `GET /api/admin/orders?q=&status=&page=&limit=` — search across order number/customer name/email (ILIKE — an authenticated-admin tool, not the enumeration-risk public retrieve endpoint), optional payment-status filter, paginated.
- `GET /api/admin/orders/:id` — order detail + its tickets, logs `VIEW_ORDER`.
- `POST /api/admin/orders/:id/resend` — reuses `ensureTicketsGenerated()` + `sendTicketsForOrder()` unchanged (same core the webhook and public Retrieve Ticket already use), logs `RESEND_EMAIL`. Rejects non-`paid` orders (400).
- Orders page (search, table, pagination) + order-detail panel (fields, ticket list, resend button) built into the admin frontend; Orders nav item is now live, no longer a placeholder.
- First sprint where audit rows record real mutations/views, not just login events.
- Split further from the original draft: Tickets-module search + `regenerate-pdf` (ticket-level, not order-level) moves to its own sprint rather than bundling with Orders — matches how `PHASE2_ARCHITECTURE.md` §4 already drew that module boundary.

**Sprint 2.4 — Tickets module** *(complete — see this doc's companion verification report)*
- `GET /api/admin/tickets?q=&page=&limit=` — one search field across ticket number, QR token, customer name, and email (name/email resolved via a lookup against `orders` first, since `tickets` has no customer columns of its own).
- `GET /api/admin/tickets/:id` — ticket detail + its linked order + a QR code image, rendered via `qrDataUrl()` unchanged (the exact function already used in the PDF/email — no second QR implementation). Logs `VIEW_TICKET`.
- `POST /api/admin/tickets/:id/resend` and `POST /api/admin/tickets/:id/regenerate-pdf` — this system never stores a rendered PDF (email-only delivery, no download, per Phase 1's deliberate design), so both actions reduce to the identical underlying operation: re-render + re-email the order's tickets via `ensureTicketsGenerated()` + `sendTicketsForOrder()`, unchanged. Factored into one shared `lib/admin/ticket-actions.ts` helper so the two endpoints differ only in which audit action they log (`RESEND_EMAIL` vs `REGENERATE_PDF`) — not two implementations of the same thing.
- Tickets page (search, table, pagination) + ticket-detail panel (fields, QR image, both action buttons) built into the admin frontend; Tickets nav item is now live.

**Sprint 2.5 — Reports & Export** *(complete — see this doc's companion verification report)*
- `GET /api/admin/reports/summary?from=&to=` — total revenue, paid/failed order counts, adult/child/total tickets sold, average order value, all computed server-side. Extends the Sprint 2.2 `admin_revenue_total()` RPC with an optional date range (backward compatible — the Dashboard's existing no-args call is unaffected) rather than writing a second revenue query; new `countOrders()`/`countTickets()` helpers are shared with `lib/database/dashboard.ts`, which was refactored to use them too.
- `GET /api/admin/reports/export?from=&to=` — CSV, built server-side (never assembled in the browser) via a small generic `lib/http/csv.ts` helper. One row per (order, ticket type present) — an order with both adult and kids tickets produces two rows — derived directly from `orders.adult_qty`/`kids_qty`/unit prices rather than joining to `tickets`, since those columns already are the type+quantity+amount breakdown the export needs. Built in memory rather than true chunked HTTP streaming — at this system's data volume that distinction doesn't matter yet (§8's scale reasoning); "generated server-side, never in the browser" is the actual requirement and is met either way.
- `EXPORT_REPORT` audit logging added, recording the date range and row count.
- Reports page (date-range filter, 7 stat tiles, CSV download via `fetch` + blob — a plain `<a href>` can't attach the Authorization header a download needs) built into the admin frontend; Reports nav item is now live.
- **Zero new serverless functions** — routed through the same `/api/admin/router.ts` dispatcher added during Sprint 2.4's Hobby-plan fix, not a new deployed route. Total stays at 5 functions.

**Sprint 2.6 — Settings & Final Hardening** *(complete — see this doc's companion verification report)*
- `GET /api/admin/settings/event` (any authenticated admin — read-only) and `PATCH /api/admin/settings/event` (`SUPER_ADMIN` only) — name/venue/start date/end date editable; pricing and support email deliberately stay read-only (pricing per `PHASE2_ARCHITECTURE.md` §7 — no `sales_status`/refund model yet to reason about safely; support email is a Vercel env var, not a DB column, so it can't be live-edited without a separate migration). `UPDATE_EVENT` audit logging added. Both routes added to the existing `router.ts` dispatcher — zero new functions.
- Settings page (read-only display for any admin, edit form shown only when the server says `canEdit`) added to the frontend; Settings nav item is now live — every planned module has shipped.
- Consistency pass: the `authenticate()` helper that had been separately copy-pasted into `orders.ts`, `tickets.ts`, and `reports.ts` (and duplicated with slightly different shape in `dashboard.ts`/`auth.ts`) is now one shared `lib/admin/authenticate.ts`, used everywhere.
- Accessibility: one global `:focus-visible` rule now covers every interactive element (previously only login inputs had one); nav buttons got proper button resets (background/cursor/font — they were relying on browser default button chrome); contrast-checked every text/background pair in both themes programmatically (all pass WCAG AA, several pass AAA) rather than eyeballed.
- Mobile: search/date filter fields go full-width below 600px instead of cramping next to their button; stat tiles and table cells shrink slightly; minimum 42px tap target height on buttons.
- Dead-code check: grepped the whole admin surface for debug markers, stray `console.log`, TODO/FIXME — none found (the Sprint 2.4 routing debug probe was already removed in that same sprint, not left behind).
- Audit logging verified intact end-to-end after the `authenticate()` refactor — every mutating route still logs its action (confirmed by re-reading each handler post-refactor, not just assumed).

**Explicitly deferred, on record, not a Sprint 2.x concern**: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are missing from Vercel production, so checkout is currently broken — discovered during Sprint 2.1 verification. Per explicit instruction, Stripe is intentionally deferred until after Phase 3 and no engineering time goes toward it until told otherwise; it is not a Sprint 2.x blocker or a deduction against any sprint's production-readiness verdict.

**Deferred beyond Phase 2 (explicitly not scheduled — architecture only)**
- **Full event management** — Sprint 2.6 shipped name/venue/date editing only. Pricing, capacity, and sales-status editing still need the `capacity`/`sales_status` migration in `PHASE2_DATABASE_REVIEW.md` §4 first, plus real design work on what changing a price means for orders that already snapshotted the old one. Scheduled only once there's a concrete need.
- **Phase 3 (Festival Day check-in)** — reuses Sprint 2.1's auth system and the `VOLUNTEER` role directly (`PHASE2_ARCHITECTURE.md` §5).

---

## Milestones

| Milestone | Sprint | Exit criteria |
|---|---|---|
| **M1 — Auth works in production** | 2.1 | Real login on the live `/admin` page; `LOGIN_SUCCESS`/`LOGIN_FAILED` both verified in `admin_audit_log`; non-admins rejected |
| **M2 — Dashboard metrics live** | 2.2 | A real admin sees live revenue/ticket-count/recent-orders/attendance data from one aggregated endpoint in production |
| **M3 — Orders management live** | 2.3 | Admin can search/browse orders, view an order's detail + tickets, and resend an order's tickets from production, all audit-logged, verified against a real order |
| **M4 — Ticket operations** | 2.4 | Admin can search tickets by number/QR and regenerate a PDF from production, audit-logged |
| **M5 — Reports + export** | 2.5 | Streamed CSV export produces correct data in production; revenue/breakdown numbers match manual SQL spot-checks |
| **M6 — Production-ready** | 2.6 | Settings module live (`SUPER_ADMIN`-gated event editing), accessibility/mobile pass done, dead code removed, audit logging verified intact across every route |

No calendar estimates are given since available hours/week wasn't specified. Given the "verify before proceeding" discipline, Sprint 2.1 is the highest-uncertainty sprint (genuinely new infrastructure) and should be sized generously; 2.2–2.5 should be faster once the pattern is proven and each sprint is mostly additive on top of a verified base.

---

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Zero real production data to test against** | `orders`/`tickets` still have 0 rows — Sprint 2.2's dashboard was verified against genuinely-empty production data (correct zeros), not a populated one; Sprint 2.3's Orders list/detail views are harder to verify meaningfully without real rows | Normally: insert test-mode Stripe orders. Currently blocked — checkout is broken (missing `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`) and Stripe work is explicitly off-limits until after Phase 3. Until that's lifted, Sprint 2.3+ verification will need hand-inserted rows via direct SQL instead of the real purchase flow |
| **Two-repo coordination** | The admin API lives in `delta-harvest-tickets-api` (not this repo); work happens there, planning docs live here | Keep `PHASE2_ARCHITECTURE.md`/`PHASE2_DATABASE_REVIEW.md` as the shared reference across both repos |
| **Auth is genuinely new infrastructure** | Everything else in Phase 2 is additive reuse; admin auth is the one piece with no Phase 1 precedent to copy | Sprint 2.1 builds and verifies it in isolation, in production, before Sprint 2.2 depends on it — the "never continue on unverified code" rule exists specifically for this risk |
| **Scope creep into Phase 3 / Settings territory** | QR check-in, refunds, and event editing are adjacent and tempting to "just add while I'm in there" | Architecture doc explicitly scopes each sprint; hold the line — `tickets.status`, `payment_status`, and `events` pricing/dates stay unwritten by admin code until their own scheduled sprint |
| **Controlled-vocabulary drift** | If a future sprint needs a new audit action not in the current list, adding it under time pressure risks a quick free-text hack instead of a proper migration | The check constraint makes this impossible to do quietly — a missing action value fails loudly (insert error) rather than silently degrading into free text |
| **Stale static-site event data** | Phase 1 flagged that `tickets/index.html`'s meta description still shows outdated dates, disconnected from the live `events` row | Explicitly deferred to whenever Settings is scheduled (`PHASE2_ARCHITECTURE.md` §7) — not a Sprint 2.1–2.5 blocker, just flagged so it isn't rediscovered as a surprise later |

---

## Suggestions to improve the roadmap before implementation begins

1. **Seed realistic test data before Sprint 2.2 starts**, not just before Reports — having a handful of test orders/tickets makes every subsequent sprint easier to sanity-check visually, not just at the end.
2. **Confirm who holds each role** (who's `SUPER_ADMIN` vs. `ADMIN`, and when `VOLUNTEER` accounts will actually be created for Phase 3) before Sprint 2.1's provisioning step — doesn't change the design, but affects whether a single hardcoded admin row is enough for now.
3. **Treat Sprint 2.1's exit criteria as a hard gate.** The approval decision is explicit that Sprint 2.2 doesn't start until 2.1 is fully verified in production — resist the temptation to start Dashboard/Orders scaffolding "in the background" while 2.1 is still being verified.
