# Go-Live Runbook — Delta Harvest Festival Ticketing

Current state as of Phase 1.7's non-Stripe validation pass. This supersedes the *order* of remaining work in `GO_LIVE_CHECKLIST.md` / `DEPLOYMENT.md` (still the reference for *how* to do each step) by marking what's already done against live infrastructure and what's genuinely left. No Vercel CLI, API token, or MCP tool is available in this environment — every Vercel-dashboard action below must be done by you; this runbook tells you exactly what to click and enter, not "check the dashboard" vaguely.

## Already done and verified live — do not repeat

- ✅ Supabase project schema applied and fully verified (tables, sequences, indexes, constraints, RLS, RPCs) — `FINAL_PRODUCTION_REPORT.md` §5.
- ✅ Security advisor warnings resolved (RPC `search_path` pinned).
- ✅ `delta-harvest-tickets-api` deployed and live on Vercel at `https://delta-harvest-tickets-api.vercel.app`.
- ✅ Retrieve Ticket flow proven end-to-end against production: real ticket generation, real PDF render (Chromium on Vercel — the previously-highest-risk unknown), real Resend send, real Upstash rate-limit enforcement (a 6th request returned a clean `429`), enumeration-safety confirmed byte-for-byte.
- ✅ Idempotency/race safety re-confirmed live (5 repeated calls against one order → exactly 1 order, 1 ticket).

## Remaining steps, in order

### 1. ~~Clean up test data~~ — done
`DHF-ORD-000001` and its ticket were deleted in Phase 1.7. `orders`/`tickets` are empty; ready for real data.

### 2. ~~Reconcile `engines.node`~~ — resolved, no action needed
Correction to Phase 1.6's report: `package.json`'s `"24.x"` is correct, not drift. Node 20 reached upstream end-of-life 2026-04-30, Vercel deprecates it for Functions on 2026-10-01, and the installed `@supabase/supabase-js@2.111.0` already requires Node 22+. `DEPLOYMENT.md` was the stale side and has been updated to match.

### 3. DNS — add the `api` custom domain (requires your action; no CLI/API access exists in this environment)
Vercel assigns a **project-specific** CNAME target, not a fixed universal value — it's only shown after you add the domain, so do it in this order:
1. Vercel dashboard → `delta-harvest-tickets-api` project → **Settings → Domains → Add Domain** → enter `api.deltaharvestfestival.ca`.
2. Vercel will display an exact CNAME record — host `api`, value something like `d1d4fc829fe7bc7c.vercel-dns-017.com.` (yours will differ; copy it exactly, including the trailing period, from what your dashboard actually shows).
3. Add that CNAME record at whatever DNS provider hosts `deltaharvestfestival.ca` (confirmed via `dig`: the apex currently points at GitHub Pages' `A` records and `www` is a CNAME to `suryalionael.github.io` — both untouched by this, it's purely additive).
4. Wait for `dig api.deltaharvestfestival.ca` to resolve and `https://api.deltaharvestfestival.ca` to serve over HTTPS with a valid certificate before proceeding to webhook registration or pushing the static site.

### 4. Verify the Resend sending domain (requires your action; no Resend dashboard/API access exists in this environment)
`dig` finds no `resend._domainkey` record, no SPF entry for Resend/Amazon SES, and no `send.` subdomain records for `deltaharvestfestival.ca` — only an unrelated Google site-verification TXT and a generic hosting-provider DMARC record. This is consistent with the sending domain not being verified yet, but it's DNS evidence, not a dashboard-confirmed fact. In the Resend dashboard: Domains → Add Domain (if not already added) → add the SPF/DKIM records it shows you → wait for both to show verified. This can happen in parallel with step 3; it doesn't depend on the `api` subdomain.

### 5. Register the Stripe webhook
Only after step 3 resolves: Stripe Dashboard → Developers → Webhooks → Add endpoint → `https://api.deltaharvestfestival.ca/api/payments/webhook`, subscribed to `checkout.session.completed` only. Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in Vercel (Production scope) and redeploy.

### 6. One real test-mode purchase, end to end
This is the one piece Phase 1.5/1.6 could not exercise (no browser automation available in either session, and `MOCK_PAYMENTS` is correctly hard-blocked on Vercel). Manually, in a browser:
- Go through `/tickets/` with Stripe's test card `4242 4242 4242 4242`.
- Confirm redirect to `/tickets/success/`.
- Confirm the order + ticket(s) appear in Supabase with `payment_status = 'paid'`.
- Confirm the confirmation email arrives with a correctly-rendered, correctly-scanning PDF attached.
- Test a decline (`4000 0000 0000 0002`) creates no order.
- Test abandoning checkout lands on `/tickets/cancel/` with no order created.

### 7. Push the static site changes
`tickets-buy.js`, `tickets-retrieve.js`, `tickets.css`, `tickets/`, and the nav/sitemap/styles diffs are currently **untracked** — commit and push them to whatever branch GitHub Pages deploys from. Do this **after** steps 3–6 are green, not before — pushing earlier means real visitors hit the unresolvable `api.deltaharvestfestival.ca` the moment the nav links go live.

### 8. Retest Retrieve Ticket against the real purchase from step 6
Confirms the full loop (not just the Phase 1.5 direct-DB-insert version) works against a naturally-created order.

### 9. Switch to live Stripe keys
Only after every step above is green: new live secret key in Vercel, a **separate** live-mode webhook registration (test and live have independent signing secrets), and one real, tiny, real-money purchase (refunded, or $0 if supported) before announcing ticket sales publicly.

## Final Sign-off

Everyone who needs to know ticketing is going live has been told; `SUPPORT_EMAIL` is a real, monitored inbox; someone knows how to check Vercel's function logs and Stripe's webhook log if something breaks on the day. See `ROLLBACK.md` for what to do if it does.
