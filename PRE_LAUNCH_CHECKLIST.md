# Pre-Launch Checklist

Action items to complete before Festival Day, in priority order. Every item below is a verified, current fact as of 2026-08-04 — see `FINAL_PHASE3_REPORT.md` for the full audit these are drawn from. Nothing here is speculative.

---

## Critical — blocks real ticket sales or check-in

**1. Fix Stripe configuration.**
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are not set on Vercel Production (re-confirmed today via `vercel env ls production` and `vercel env pull` — every other required variable is present; only these two are missing). This means checkout-session creation and webhook signature verification are both currently broken — a real visitor cannot buy a ticket right now. This is a known, already-documented issue (see `PHASE2_ROADMAP.md` and `PHASE3_ARCHITECTURE.md`), deferred by explicit instruction until after Phase 3. Phase 3 is now done — this needs to be scheduled and fixed before Festival Day, since without it there are no real paid orders to produce real tickets to scan.
*Owner: you (Stripe account access + adding the env vars). Not something I can do without real credentials.*

**2. Decide what to do with Sprint 3.2's test data.**
Order `DHF-TEST32-A` (customer "Jamie Rivera", 3 tickets: `DHF26-T32A` and `DHF26-T32B` checked-in, `DHF26-T32C` void) is currently live in production. It will inflate real attendance/ticket-sold/revenue numbers on Festival Day if left in place. Not deleted automatically — tell me to remove it (and I will, with confirmation) or leave it if you'd rather archive/ignore it manually.

**3. Enable Supabase Auth's leaked-password protection.**
Currently disabled (flagged by Supabase's own security advisor, WARN level). This was already named in `PHASE3_ROADMAP.md` as something to do "before Sprint 3.3 provisions volunteer accounts" — it wasn't done before this report. It's a one-click toggle in the Supabase dashboard (Authentication → Policies), not code. Do this before creating real volunteer accounts, since volunteer passwords are currently server-generated (already high-entropy, so this mainly protects the SUPER_ADMIN/ADMIN accounts' own passwords against reuse of a known-breached one).

---

## Required — needed for a working Festival Day, not yet done

**4. Complete the real-device acceptance pass.**
Nobody has yet: created a real volunteer account and confirmed the one-time password flow end-to-end; logged in as that VOLUNTEER and confirmed the `/admin/scan` redirect plus full lockout from the rest of the dashboard even via direct URL; tested camera scan, manual entry, camera switch, and torch on both a real iOS Safari device and a real Android Chrome device, in both portrait and landscape. This needs a SUPER_ADMIN session and physical devices, so it couldn't be done as part of this build. See `FINAL_PHASE3_REPORT.md` §6 for the full list.

**5. Create real volunteer accounts for Festival Day.**
`profiles` currently has exactly 1 row (the SUPER_ADMIN account) — zero volunteers exist yet. Create them with real names/emails once item 3 above is done.

**6. Physical venue connectivity test.**
Old Town Hall, Delta, Ontario — connectivity has never been tested on-site (named as an open risk in `PHASE3_ROADMAP.md`). The scanner degrades gracefully for brief interruptions but has no true offline mode for a sustained outage. If the test reveals a real problem, decide on a fallback (see `FESTIVAL_DAY_RUNBOOK.md` §5) before the event, not that morning.

**7. Print or distribute the volunteer quick-reference.**
`FESTIVAL_DAY_RUNBOOK.md` §3 is written to be handed to volunteers directly (print it, screenshot it, or share the link) — a volunteer under queue pressure has seconds, not minutes, to understand a system they've likely never used before.

---

## Recommended — real but lower-stakes

**8. Confirm `admin_audit_log` action rows actually appear as expected** once real logins/scans/volunteer actions happen (spot-check a few rows in Supabase after item 4's device testing) — this was verified at the code level (every route calls `logAudit` correctly) but not yet observed with real production traffic.

**9. Optional cleanup: remove `DEV_TOOLS_ENABLED` and `MOCK_PAYMENTS` from Vercel Production's environment variables.**
Both are present but structurally inert there (they only ever activate when `isLocalDevEnvironment()` is true, which is never the case on a real Vercel deployment). Not a security issue — just avoidable confusion for a future maintainer. Skip this if you'd rather not touch Vercel project settings right now.

**10. Re-run `npm run typecheck` and a final `git status` clean check** immediately before Festival Day if any last-minute changes get made, to catch anything that slipped in outside this workflow.

---

## Explicitly not required before Festival Day

These are named in `FINAL_PHASE3_REPORT.md` §7 as deliberate, out-of-scope design choices, not launch blockers: true offline mode, per-volunteer/per-gate reporting, a manual void/re-validate action for supervisors, and the public-site `/tickets/verify/` 404. None of these prevent running check-in on the day.
