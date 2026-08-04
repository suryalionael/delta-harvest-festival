# Phase 2 — Admin Dashboard Roadmap

Status: **Approved, with amendments — Sprint 2.1 in progress.** See `PHASE2_ARCHITECTURE.md` and `PHASE2_DATABASE_REVIEW.md` for the design this roadmap implements.

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

**Sprint 2.2 — Dashboard + Orders (read-only)**
- `GET /api/admin/dashboard` (the single aggregated endpoint — `PHASE2_ARCHITECTURE.md` §4), `GET /api/admin/orders`, `GET /api/admin/orders/:id`.
- Dashboard and Orders pages in the admin frontend.
- `VIEW_ORDER` audit logging added.
- No mutations yet. This is the first sprint with real operational value: today there's no way to see an order without opening the Supabase dashboard directly.

**Sprint 2.3 — Tickets module + resend/regenerate**
- `GET /api/admin/tickets`, `GET /api/admin/tickets/:id`, `POST /api/admin/orders/:id/resend` (reuses `sendTicketsForOrder()`), `POST /api/admin/tickets/:id/regenerate-pdf` (reuses `lib/pdf/render.ts`).
- Tickets page in the admin frontend, kept as its own module/nav item, not folded into Orders (`PHASE2_ARCHITECTURE.md` §4).
- `VIEW_TICKET`, `RESEND_EMAIL`, `REGENERATE_PDF` audit logging added — first sprint where audit rows record a real mutation, not just login events.

**Sprint 2.4 — Reports module**
- Revenue summary, ticket-type breakdown, daily sales, and `GET /api/admin/reports/export` — **streamed server-side CSV**, never assembled in the browser.
- `EXPORT_REPORT` audit logging added.
- Built after Orders/Tickets because it's aggregation over data those sprints already prove is queryable correctly.

**Sprint 2.5 — Hardening pass**
- Confirm login rate limiting is tuned correctly under real usage, run the security checklist in §Risks below, do a full mobile-responsiveness/accessibility pass on the admin frontend across all modules built so far.

**Deferred beyond Phase 2 (explicitly not scheduled — architecture only)**
- **Settings / event editing** (`PHASE2_ARCHITECTURE.md` §7) — needs the `capacity`/`sales_status` migration in `PHASE2_DATABASE_REVIEW.md` §4 first. Scheduled only once there's a concrete need to edit the live event.
- **Phase 3 (Festival Day check-in)** — reuses Sprint 2.1's auth system and the `VOLUNTEER` role directly (`PHASE2_ARCHITECTURE.md` §5).

---

## Milestones

| Milestone | Sprint | Exit criteria |
|---|---|---|
| **M1 — Auth works in production** | 2.1 | Real login on the live `/admin` page; `LOGIN_SUCCESS`/`LOGIN_FAILED` both verified in `admin_audit_log`; non-admins rejected |
| **M2 — Read-only dashboard live** | 2.2 | A real admin sees live orders + the aggregated dashboard summary in production, no mutations yet |
| **M3 — Ticket operations** | 2.3 | Admin can resend an order's tickets and regenerate a PDF from production, both audit-logged, both verified against a real (test-mode) order |
| **M4 — Reports + export** | 2.4 | Streamed CSV export produces correct data in production; revenue/breakdown numbers match manual SQL spot-checks |
| **M5 — Production-ready** | 2.5 | Rate limiting verified under load, full audit vocabulary exercised at least once each, mobile/accessibility pass done |

No calendar estimates are given since available hours/week wasn't specified. Given the "verify before proceeding" discipline, Sprint 2.1 is the highest-uncertainty sprint (genuinely new infrastructure) and should be sized generously; 2.2–2.5 should be faster once the pattern is proven and each sprint is mostly additive on top of a verified base.

---

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Zero real production data to test against** | `orders`/`tickets` have 0 rows — Sprint 2.2+ endpoints will be built and tested against either empty state or hand-inserted test rows, not real purchase patterns | Insert a handful of realistic test orders/tickets (test-mode Stripe, exactly like Phase 1's own pre-launch testing) before Sprint 2.2; don't trust "it works" until it's been exercised against non-trivial data |
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
