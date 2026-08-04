# Phase 3 — Festival Day Operations Architecture

Status: **Planning — no implementation yet**, per explicit instruction. This document assumes the reader has not read Phase 1/2 docs. Every fact below was verified live against the running system (Supabase project `zcohmiqvkcaempgafeuh`, the `delta-harvest-tickets-api` Vercel project) on 2026-08-04, not recalled from memory alone.

Companion docs: `PHASE3_DATABASE_REVIEW.md` (schema detail), `PHASE3_ROADMAP.md` (sprints, milestones, risks).

---

## 1. What already exists that Phase 3 builds on

**Ticket model** (`tickets` table): `ticket_number` (sequential, human-facing), `qr_token` (128-bit random hex, independent of the sequential number — deliberately unguessable), `ticket_type` (`adult`/`kids`), `status` — a check constraint already listing `valid | checked_in | cancelled | refunded | void`. Only `valid` has ever been written. **`checked_in` was anticipated in Phase 1 and has sat unused since** — Phase 3's core state transition needs no schema change to the constraint itself.

**QR encoding** (`lib/tickets/qr.ts`): each ticket's QR image encodes `https://deltaharvestfestival.ca/tickets/verify/?t=<qr_token>` — a URL, not a bare token, so a generic QR scanner app shows something meaningful. **That URL 404s today** — the verify page was never built, flagged as Phase 3 scope since Phase 1. Confirms `qr_token` is the right lookup key; nothing about the encoding needs to change.

**Audit logging** (`admin_audit_log`): controlled-vocabulary `action` check constraint **already includes `CHECK_IN_TICKET` and `VOID_TICKET`**, unused since Sprint 2.1 — reserved specifically for this phase. `target_type` already includes `'ticket'`. No migration needed to start logging check-ins.

**Auth** (`profiles` table): role check constraint already includes `SUPER_ADMIN | ADMIN | VOLUNTEER`. **Zero `VOLUNTEER` accounts exist today, and — this is the first substantive finding of this review — `VOLUNTEER` has never actually been enforced anywhere.** `requireAdmin()` (`lib/admin/session.ts`) checks only "is this a known, active profile row" — it does not check *which* role. The one place role is checked at all is the Settings PATCH endpoint (`SUPER_ADMIN` only, added Sprint 2.6). Every other endpoint — including ones that expose customer names, emails, and revenue — would currently accept a `VOLUNTEER` account with zero restriction. This was harmless while `VOLUNTEER` had no real accounts; it stops being harmless the moment Phase 3 provisions volunteer scanner logins. **§4 below treats this as a Phase 3 security prerequisite, not optional hardening.**

**Deployment**: every `/api/admin/*` route is dispatched through one serverless function, `api/admin/router.ts`, via an explicit `vercel.json` rewrite (`/api/admin/:path*` → `/api/admin/router?path=:path*`) — a Sprint 2.4 fix for Vercel Hobby's 12-function cap. Current count: **5 functions**, confirmed live. New Phase 3 routes cost zero additional functions — this headroom is exactly why that refactor was worth doing.

**Rate limiting**: Upstash + `@upstash/ratelimit`, sliding-window, already used for checkout, ticket retrieval, and admin login. Same library, same pattern, reusable for the check-in endpoint.

**Nothing in this codebase uses WebSockets, Supabase Realtime, or any push-based mechanism.** Every existing screen (Dashboard, Orders, Tickets, Reports) is plain request/response via PostgREST or RPC. This matters directly for §3's real-time-counter decision.

**Known, unrelated blocker**: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are still absent from Vercel production (confirmed live again for this review) — checkout has been broken since Sprint 2.1 verification, by explicit instruction left untouched until after Phase 3. **This is a real operational dependency worth naming plainly: Phase 3 can be built and fully tested with seeded data without Stripe working, but the actual festival gate needs real paid orders to have real tickets to scan. Someone needs to fix Stripe before Festival Day, even though Phase 3's own build doesn't require it.** Flagged here so it isn't lost between "not Phase 3's job" and "actually necessary before the event."

---

## 2. Scanner: browser camera, no native app

**Decision: a hybrid decoder — the native `BarcodeDetector` API where available, a lightweight pure-JS library (`jsQR`) as the fallback everywhere else.**

- `BarcodeDetector` (part of the Shape Detection API) decodes QR codes from a video frame with no JS decoding loop at all — fastest and lightest where it exists. Support: Chrome/Edge/Android Chrome broadly, Safari 17+ (iOS 17+) added it, but volunteers will likely use personal phones of unknown, uncontrolled OS version — coverage is good, not universal.
- `jsQR` is a small (~30KB), dependency-free, pure-JS QR decoder that reads pixel data from a `<canvas>` sampled from the video stream. Works anywhere `getUserMedia` works, at the cost of running an actual decode loop on the CPU.
- Feature-detect at load: `if ('BarcodeDetector' in window)` use it; otherwise fall back to `jsQR` on a throttled canvas sample (roughly every 150–200ms — fast enough that a presented ticket is read in well under a second, slow enough not to burn a volunteer's battery over a multi-hour shift decoding every single frame).

This is the one dependency this phase adds (`jsQR`, vendored/self-hosted, not a CDN fetch on every page load — see §7). It's justified by the same bar the rest of this codebase has applied to dependencies: camera-based QR decoding is the literal core feature, not a nice-to-have, and no zero-dependency way to reliably decode QR codes from raw video exists across both target platforms today.

**Requires HTTPS** (`getUserMedia` refuses insecure contexts) — already satisfied, the whole site is served over HTTPS via Vercel. No action needed, just confirming the precondition holds.

---

## 3. Real-time attendance counter: polling, not Supabase Realtime

**Decision: short-interval polling (5s) against a dedicated lightweight endpoint, only while an attendance view is open. Not Supabase Realtime.**

This is a direct instance of "challenge existing assumptions" — Supabase Realtime (Postgres change subscriptions over WebSocket) is the obvious tool for "real-time counter" and is available in this stack for free. It's rejected here anyway:

- **Nothing else in this codebase uses it.** Adopting Realtime for exactly one counter means carrying a second data-fetching pattern (subscribe/unsubscribe lifecycle, connection-drop handling, channel auth) alongside the REST-everywhere pattern every other screen uses, for a feature where the two approaches are barely distinguishable in practice.
- **The actual UX difference is marginal at this scale.** A headcount display that updates every 5 seconds versus instantly is not a meaningfully different experience for anyone watching a gate counter climb over the course of a festival day. Push-based updates earn their complexity when staleness costs something (a trading dashboard, a chat app); a walk-in counter isn't that.
- **A dedicated polling endpoint is cheap and reuses existing code.** `countTickets({ status: 'checked_in' })` and `countTickets()` (both already exist, added in Sprint 2.5 for Reports) are the entire implementation — no new query logic, just a thin route.

If a future phase genuinely needs push updates (e.g., a public-facing "X people here now" display), Realtime is still there to reach for. Not reaching for it now is the discipline, not an oversight.

---

## 4. Authorization: closing the `VOLUNTEER` gap, not just adding a role

**Decision: introduce role-scoped authorization at the route level, and retroactively apply it to the routes that currently expose data `VOLUNTEER` accounts shouldn't see.**

Concretely: `requireAdmin()` continues to verify identity (unchanged). A new, small `requireRole(identity, allowedRoles)` check — call sites pass an explicit allow-list — gets added to:

- **New check-in route**: allows `SUPER_ADMIN`, `ADMIN`, `VOLUNTEER` — this is the volunteer's actual job.
- **Existing Orders detail, Tickets detail (beyond check-in), Reports**: restricted to `SUPER_ADMIN`/`ADMIN` — these expose customer names, emails, and revenue figures a gate volunteer has no operational need to see. Today, nothing stops a `VOLUNTEER` account from reading any of it.
- **Settings**: unchanged, already `SUPER_ADMIN`-only for writes.

**This touches existing, already-shipped Phase 2 route handlers**, which is worth being explicit about given "no further work on Phase 2 unless a bug is discovered": this is being framed as exactly that — a real bug (an access-control gap that was inert only because no `VOLUNTEER` account existed yet), surfaced and made actionable by Phase 3's own requirement to provision real volunteer accounts. It is not scope creep into Phase 2 features; it's closing a hole Phase 3 is about to make exploitable.

**Volunteer provisioning**: the same manual Supabase Auth Admin process used for the first `SUPER_ADMIN` (Sprint 2.1) doesn't scale to "concurrent volunteers" (plural, per the brief) without becoming a bottleneck on festival morning. Recommend a small `SUPER_ADMIN`-only "add volunteer" capability (extends Settings) as in-scope for this phase — see `PHASE3_ROADMAP.md`.

**New advisory finding, unrelated to the above but relevant to provisioning more accounts**: Supabase's leaked-password-protection (HaveIBeenPwned check) is currently **disabled** project-wide (confirmed live, `WARN`-level). Free to enable, a dashboard toggle, no code change — worth doing before creating a batch of volunteer accounts, not because any current account is at risk, but because it's a five-minute fix that costs nothing.

---

## 5. Check-in flow: atomicity, duplicates, invalid scans, damaged codes

**The core state transition reuses a pattern this codebase already trusts**: `orders.tickets_generated_at` uses an atomic `UPDATE ... WHERE tickets_generated_at IS NULL` claim so two concurrent webhook deliveries can never both generate tickets for the same order (Phase 1). Check-in needs exactly the same shape: `UPDATE tickets SET status = 'checked_in', ... WHERE id = $1 AND status = 'valid' RETURNING *`. Two volunteers scanning the same physical ticket at nearly the same instant is not a race condition to design around from scratch — it's the same problem Phase 1 already solved, applied to a new column.

**Response design treats "already checked in" as an expected outcome, not an error.** A duplicate scan is normal (a volunteer rescans after a screen glitch; someone tries to walk a ticket in twice). The endpoint distinguishes:

| Outcome | HTTP | Meaning |
|---|---|---|
| `checked_in` | 200 | First scan, valid ticket, now checked in |
| `already_checked_in` | 200 | Valid ticket, but already checked in — response includes when and by which volunteer, so a human can judge "rescanned a second ago" vs. "checked in three hours ago, this is a second physical copy" |
| `not_found` | 404 | Token doesn't match any ticket — garbled scan, wrong QR entirely, or fraud |
| `void` / `cancelled` / `refunded` | 200, distinct status | Ticket exists but was administratively invalidated |

**Invalid QR detection has a client-side layer before the network round trip at all**: a scanned string that doesn't match the expected `/tickets/verify/?t=<hex>` shape (someone's boarding pass, a WiFi-password QR, camera noise) is rejected instantly in the browser — no wasted request, no wasted volunteer wait, and it can't be confused with a real "not found" ticket lookup.

**Damaged QR codes get a fallback that reuses the same endpoint, not a separate code path**: the check-in request accepts *either* `qrToken` *or* `ticketNumber`. A volunteer whose camera can't read a torn, sun-glared, or poorly-printed code can type the visible ticket number (`DHF26-000042`, already printed on the PDF ticket next to the QR) into a manual-entry field, hitting the identical atomic-transition logic via a `ticket_number` lookup instead. One endpoint, one audit trail, two ways in.

**Every successful transition (and every attempted one, on the duplicate/void/not-found paths too) logs to `admin_audit_log`** — `CHECK_IN_TICKET` for the success case; the reserved vocabulary already supports this without a migration. `actor_id` records which volunteer scanned it — the exact accountability a busy gate with multiple concurrent volunteers needs when something needs to be traced back later.

---

## 6. Interface: a dedicated page, not a sixth dashboard tab

**Decision: a separate, minimal page (`admin/scan.html` + `admin/scan.js`), not a new tab inside the existing six-module dashboard shell.**

The existing admin shell (Dashboard/Orders/Tickets/Reports/Settings) is a dense, desktop-oriented, table-and-form interface — appropriate for its job, wrong for this one. A volunteer standing at a gate for a multi-hour shift needs:

- Full-screen camera view, immediately on load — not a nav bar, a header, and five tabs they'll never touch.
- Enormous, unambiguous full-screen result feedback (green + checkmark = in; amber = already scanned; red + X = invalid) rather than a small status paragraph.
- Sound and/or vibration on every result — a festival entrance is loud and a volunteer isn't always looking directly at the screen between scans; audio/haptic confirmation matters as much as visual.
- Auto-resume scanning after a short result pause — no "tap to scan again."

Building this *inside* the existing shell would mean shipping the whole dashboard's JS/CSS to a device whose only job is scanning, and fighting the existing chrome to get a kiosk-like full-screen experience. A separate page avoids both: smaller payload, faster load, genuinely mobile-first, and it can be bookmarked/added-to-home-screen on a volunteer's phone as its own icon for festival day.

**What it reuses, not rebuilds**: the same Supabase Auth session pattern (supabase-js + the server-side login proxy) for volunteer sign-in; the same CSS design tokens (custom properties) so it doesn't look like a different product; the same `/api/admin/*` backend, including the new check-in endpoint.

---

## 7. Offline and network-interruption strategy: graceful degradation, not offline-first

**Decision: detect and recover from brief network blips; do not build full offline-first ticket validation. This is deliberately a smaller commitment than "handle offline," and the tradeoff is stated plainly rather than implied.**

True offline-first (the whole valid-ticket set shipped to each scanner device, local validation, background sync, conflict resolution when two offline devices check in the same ticket) is the robust answer to "what if the venue has no connectivity." It is also a materially larger build: secure on-device data distribution, merge-conflict handling, and a sync protocol that doesn't exist anywhere in this system today. For a single small festival with a handful of scanner devices, that cost isn't justified by the benefit — this is the same "don't build for scale this system doesn't need" judgment applied throughout Phase 2.

What Phase 3 does instead:

- A failed scan request (network error, timeout) shows a clear, distinct "No connection — try again" state — never a silent failure or a false negative that reads as "invalid ticket."
- A small bounded client-side retry queue smooths over brief blips (a few seconds of spotty signal) without needing the volunteer to notice or intervene.
- **What this does not cover**: a sustained outage. If the venue loses connectivity for an extended period, the scanner stops working — full stop. This needs an *operational*, not technical, backup: a printed or offline-accessible list of valid ticket numbers, or the judgment call to let people in on visual ticket inspection alone until connectivity returns. This is named explicitly in `PHASE3_ROADMAP.md`'s risk register as something requiring a real decision and a day-of plan, not a code fix.
- **Recommended operational step, not a Phase 3 deliverable**: verify actual cellular/WiFi coverage at Old Town Hall, Delta, Ontario before the event. This system can't fix venue connectivity; it can only fail predictably instead of silently if that connectivity turns out to be bad.

---

## 8. Performance

- **Client-side decode loop**: throttled to ~150–200ms between `jsQR` decode attempts (native `BarcodeDetector`, where available, is cheap enough not to need throttling). Fast enough that a presented ticket reads in well under a second; slow enough not to pin a volunteer's phone CPU/battery for a multi-hour shift.
- **Server-side check-in**: one atomic `UPDATE` plus one audit insert — sub-50ms at this data volume (hundreds of tickets total), no different in cost from any other single-row write already in this system.
- **Concurrent volunteers, different tickets**: fully parallel — Postgres row-level locking only serializes concurrent writes to the *same* row (i.e., the actual duplicate-scan case), never blocks unrelated scans across multiple gate lanes.
- **Attendance polling**: capped at 5s, active only while an attendance view is actually open — trivial load at this scale, but scoped deliberately rather than left as an always-on background poll.

---

## 9. New environment variables / dependencies

| Addition | Purpose |
|---|---|
| `jsQR` (vendored JS file, not a CDN script tag) | QR decode fallback where `BarcodeDetector` is unavailable |

No new secrets, no new third-party services, no new Vercel functions (§1). Vendoring `jsQR` as a local file (rather than the CDN pattern used for `supabase-js`) is deliberate: it's a small, stable, unchanging library where a CDN dependency buys nothing but an extra external request on a page that needs to load fast on possibly-poor festival WiFi.

---

## 10. Design principles carried forward

- **Reuse over rebuild**: the atomic-claim pattern, the audit vocabulary, the rate-limiting library, the `router.ts` dispatcher, the `countTickets()` helper — nothing here invents a new mechanism where an existing one already fits.
- **Scale-appropriate**: polling over Realtime, graceful degradation over offline-first — both rejections of the more "impressive" technical answer in favor of the one that actually fits a single small festival.
- **Security closes gaps it creates**: provisioning real `VOLUNTEER` accounts is what makes the existing role-enforcement gap dangerous, so closing that gap is treated as inside this phase's scope, not deferred.
- **Operational honesty over false robustness**: the offline strategy says plainly what it does and doesn't cover, rather than implying a resilience this system doesn't actually have.
