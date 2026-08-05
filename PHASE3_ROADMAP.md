# Phase 3 — Festival Day Operations Roadmap

Status: **Sprints 3.1–3.4 implemented, deployed, and server-side verified.** See `FINAL_PHASE3_REPORT.md` for the full report, `FESTIVAL_DAY_RUNBOOK.md`/`PRE_LAUNCH_CHECKLIST.md`/`POST_EVENT_CHECKLIST.md` for operational docs. Real-device/volunteer-account acceptance testing is still pending (not a code gap — see the final report §6) and Stripe is still unconfigured in production (pre-existing, tracked in `PRE_LAUNCH_CHECKLIST.md` item 1) — Phase 3's own build is complete regardless of both.

---

## Production workflow (unchanged from Phase 2)

Test locally → commit → push → deploy to Vercel Production → verify against live production → check Vercel logs → produce an honest verification report. Never continue building on unverified code. Every sprint leaves production in a working state before the next one starts.

---

## Sprint structure

**Sprint 3.1 — Backend foundation & the security prerequisite**
- Migration: `checked_in_at`, `checked_in_by` on `tickets`.
- `lib/database/tickets.ts`: `getTicketByQrToken()`, `getTicketByNumber()`.
- `lib/admin/authorize.ts`: a `requireRole(identity, allowedRoles)` check, layered on top of the existing `requireAdmin()`.
- **Retrofit existing routes**: Orders detail, Tickets detail, Reports restricted to `SUPER_ADMIN`/`ADMIN` — closing the gap `PHASE3_ARCHITECTURE.md` §4 identifies (nothing currently stops a `VOLUNTEER` account from reading customer/revenue data). This is Phase 3 work with a Phase 2 blast radius — see Risks below.
- New `POST /api/admin/checkin` — accepts `qrToken` or `ticketNumber`, atomic `valid → checked_in` transition, distinguishes `checked_in`/`already_checked_in`/`not_found`/other-terminal-status responses, logs `CHECK_IN_TICKET`. Open to `SUPER_ADMIN`/`ADMIN`/`VOLUNTEER`. Rate-limited (Upstash, same pattern as login).
- New `GET /api/admin/checkin/stats` — lightweight `{checkedIn, total}`, backing the live counter without the full Dashboard aggregation's cost.
- Both routes added to the existing `router.ts` dispatcher — zero new Vercel functions.
- Non-code: enable Supabase Auth's leaked-password protection (dashboard toggle, `PHASE3_DATABASE_REVIEW.md` §4) before Sprint 3.3 provisions volunteer accounts.
- Verification: seed test tickets directly via SQL (checkout is still broken — same constraint every Phase 2 sprint worked under), exercise every response branch (fresh check-in, duplicate, not-found, manual-entry path), and specifically test the concurrency claim (two near-simultaneous requests for the same ticket — confirm exactly one succeeds).

**Sprint 3.2 — Scanner frontend**
- Vendor `jsQR` (local file, not a CDN tag — `PHASE3_ARCHITECTURE.md` §9).
- New `admin/scan.html` + `admin/scan.js` — dedicated page, not a tab in the existing dashboard shell (`PHASE3_ARCHITECTURE.md` §6): full-screen camera view, hybrid `BarcodeDetector`/`jsQR` decode, client-side pre-validation of scanned strings before any network call, full-screen color-coded result states (success/duplicate/invalid) with sound/vibration, auto-resume, manual ticket-number entry fallback for damaged codes.
- Volunteer sign-in on this page, reusing the existing server-side login proxy and supabase-js session pattern — not a new auth mechanism.
- **Exit criterion is device testing, not just code review**: verified working on at least one real Android/Chrome device and one real iOS/Safari device before this sprint is called done — the `BarcodeDetector`/`jsQR` split and camera permission flow can't be fully validated any other way.

**Sprint 3.3 — Attendance counter + volunteer provisioning**
- Small live counter embedded in the scan page itself (polls `checkin/stats` every 5s while the page is open) — the volunteer's own immediate feedback.
- The existing Dashboard's `attendance` stat tile (built Sprint 2.2, always `0 / total` until now) starts showing real numbers the moment check-ins exist — **no new Dashboard code needed**, this is Phase 2's own forward-design paying off exactly as documented at the time.
- `SUPER_ADMIN`-only "add volunteer" capability (new profile row + Supabase Auth account), extending Settings rather than inventing a new module — addresses "concurrent volunteers" without manual-per-volunteer Supabase dashboard work on festival morning.

**Sprint 3.4 — Hardening & production verification**
- Network-blip handling: distinct offline/retry UI state, bounded client-side retry queue (`PHASE3_ARCHITECTURE.md` §7).
- Torch/flashlight toggle for the manual-entry-adjacent low-light case, **best-effort only** — `MediaStreamTrack` torch constraints work on Android Chrome, not iOS Safari (a WebKit limitation, not something this build can fix) — ship it where it works, don't block on where it doesn't.
- Full security review pass: confirm role scoping actually holds across every route (not just the ones touched this phase), confirm the check-in rate limit is tuned for legitimate rapid-fire scanning without being abuse-permissive, confirm audit log completeness (every branch of the check-in response logs correctly, including non-success ones where useful).
- Performance review pass: decode-loop timing on a real device, a real concurrent-scan test (not just a unit-level race-condition check).
- Final production verification report, same format as every Phase 2 sprint.

---

## Milestones

| Milestone | Sprint | Exit criteria |
|---|---|---|
| **M1 — Check-in works, safely** | 3.1 | Atomic transition verified under concurrency; `VOLUNTEER` role actually restricted where it should be, verified by testing a volunteer account against a restricted route and confirming rejection |
| **M2 — Scanner works on real phones** | 3.2 | A real Android and a real iOS device both successfully scan a real QR ticket end-to-end, not just "the code compiles" |
| **M3 — Live counters + volunteers provisioned** | 3.3 | Dashboard attendance tile shows a real number after a real check-in; a `SUPER_ADMIN` can create a working volunteer login without touching the Supabase dashboard directly |
| **M4 — Production-ready for Festival Day** | 3.4 | Network-blip recovery demonstrated (not just described), full role/security sweep clean, device compatibility confirmed on the actual hardware volunteers are likely to use |

No calendar estimates given (hours/week not specified, consistent with Phase 2's roadmap). M2 and M4 both gate on physical device access, not just development time — flag early if that access isn't available yet, since it blocks calling either milestone done.

---

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Stripe is still broken in production** | Phase 3 can be fully built and tested against seeded data without it, but Festival Day itself needs real paid orders to produce real tickets to scan. This is outside Phase 3's own scope but blocks the *event*, not just the feature. | Named explicitly here so it isn't lost between "not Phase 3's job" and "actually necessary before the event" — someone needs to schedule fixing it before Festival Day, independent of this roadmap |
| **Retrofitting role checks touches shipped Phase 2 routes** | Real regression risk to already-working, already-verified Orders/Tickets/Reports endpoints, done in service of a Phase 3 requirement | Full regression sweep of every existing endpoint (not just the new ones) before Sprint 3.1 is called done — same discipline as every prior sprint's "verify nothing broke" step, just with sharper stakes here |
| **`BarcodeDetector` coverage gaps on volunteers' personal phones** | An unsupported/older device falls back to `jsQR`, which is slower and more light-sensitive than native decoding | Sprint 3.2's device-testing exit criterion exists specifically to catch this before Festival Day, not discover it that morning |
| **Venue connectivity at Old Town Hall, Delta, Ontario is unverified** | The graceful-degradation design (`PHASE3_ARCHITECTURE.md` §7) explicitly does not cover a sustained outage | Recommend a physical connectivity test at the venue before the event, and a documented manual fallback plan — operational, not code, and needs an owner who isn't this build |
| **Volunteer learnability** | Volunteers may be unfamiliar with the system and have seconds, not minutes, to understand it under queue pressure | A one-page instructions card (non-code deliverable) as part of Sprint 3.2 or 3.4 — point at the camera, listen for the sound, hand it back |
| **Poor lighting / damaged QR reduces scan success rate** | A festival entrance at dusk, a rain-smudged printed ticket, a phone screen at low brightness — all real and all reduce optical decode reliability | Manual ticket-number fallback (`PHASE3_ARCHITECTURE.md` §5) exists specifically for this, not as an afterthought; the entrance should also just be reasonably lit as an operational note |

---

## Suggested improvements (explicitly out of scope for this phase, recorded so they aren't lost)

1. **Fix the `/tickets/verify/` 404.** Every ticket's QR code encodes a public URL that a curious attendee's own camera app will follow — it's been a dead link since Phase 1. The admin scanner doesn't need this page to exist (it reads the token directly off the scanned string, never navigates), but leaving a 404 on every attendee-facing QR code is a small, real polish gap. A simple static page ("This is a Delta Harvest Festival ticket — show this at the gate") would cost very little and isn't backend work at all — could ship independently of this roadmap, on the public static site, whenever convenient.
2. **Per-volunteer / per-gate reporting.** The new `checked_in_by` column makes "which volunteer checked in how many people" a trivial future Reports addition, if multiple simultaneous check-in lanes turn out to be worth analyzing after the fact.
3. **True offline-first**, if a venue connectivity test (see Risks) reveals the graceful-degradation approach genuinely isn't enough. Not recommended pre-emptively — see `PHASE3_ARCHITECTURE.md` §7's reasoning — but worth revisiting if real conditions warrant it.
4. **Manual void/re-validate action** for a `SUPER_ADMIN`/`ADMIN` to correct a volunteer's mistaken check-in (the `void` status and `VOID_TICKET` audit action already exist in the schema, unused) — not asked for in this phase's stated goals, so left out of scope, but cheap to add later given the schema's already there.
