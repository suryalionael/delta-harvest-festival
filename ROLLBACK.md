# Rollback Plan — Delta Harvest Festival Ticketing

Written for the moment something is actually broken, not as a theoretical exercise. Covers both repos and every external dependency.

## Important precondition: no git history on the API repo

`delta-harvest-tickets-api` currently has **zero commits** (`git log` returns "does not have any commits yet") despite being live on Vercel — it was deployed straight from the local working directory via the Vercel CLI. This means:
- There is **no `git revert`/`git diff` safety net** for this repo today.
- Rollback for the API must go through **Vercel's own deployment history** (Deployments tab → pick a prior build → "Promote to Production"), which works independently of git and is unaffected by this gap.
- Strongly recommended before or immediately after launch: run `git init` (if not already) / commit the current working tree / push to a remote, so future changes have real version history. This doesn't need to block go-live, but do it soon.

## Component-by-component

### Static site (`Delta Harvest Festival` repo, GitHub Pages)
- **Rollback**: `git revert` the commit(s) that added the `/tickets/*` pages and nav changes, push to the deploy branch. GitHub Pages picks it up on its normal deploy cadence.
- **Blast radius**: none to the rest of the site — nothing else was restructured, only additive nav items and one link conversion (`ticket-info` from `<p>` to `<a>`).
- **Fast, partial rollback** (if you need to stop sales without a full revert): remove the four `Tickets`/`Purchase Tickets`/`Retrieve My Tickets` nav links and the homepage `.ticket-info` link — a small, fast edit that hides the entry points without touching any backend.

### API (`delta-harvest-tickets-api`, Vercel)
- **Rollback**: Vercel dashboard → Deployments → select the last known-good deployment → **Promote to Production**. Instant, no git push required, works regardless of the missing commit history above.
- If the issue is a bad config value (env var) rather than bad code, no deployment rollback fixes that — fix the variable in Vercel's Environment Variables UI and redeploy.

### Database (Supabase)
- `supabase/schema.sql` is additive-only (`create table if not exists`, `create index if not exists`) — there is no destructive migration to roll back.
- If a future migration needs undoing, write and apply the inverse migration explicitly (e.g. `drop index if exists ...`) via the Supabase MCP `apply_migration` tool or the SQL editor — don't hand-edit production data without a plan.
- **Test data cleanup** (not an emergency rollback, just housekeeping): the Phase 1.5 verification order `DHF-ORD-000001` should be deleted before go-live — see `GO_LIVE.md` step 1 for the exact statements.

### Stripe webhook
- Can be disabled instantly from the Stripe Dashboard (toggle the endpoint off) without touching any code — stops new fulfillment attempts while investigating, without stopping Checkout itself from accepting payments (Stripe queues/retries the webhook once re-enabled, per its normal retry schedule, up to ~3 days).
- Resending a specific failed event from the Dashboard's webhook log is always safe — the idempotency guarantees (`stripe_payment_intent` unique constraint, the `tickets_generated_at` atomic claim) make it impossible to create duplicate orders/tickets from a resend or retry.

### Full stop (selling needs to halt immediately, cause unknown)
1. Static site: remove/hide the `/tickets/` nav links and the homepage `.ticket-info` link (fast static edit, no backend change).
2. Optionally also disable the Stripe webhook endpoint from its dashboard to stop fulfillment attempts on any payments that still come through a cached page.
3. Investigate with Vercel function logs (API errors) and Supabase logs (DB errors) in parallel — `mcp__supabase__get_logs` covers Postgres/API/auth/storage; Vercel's own dashboard covers the serverless function logs, which no tool in this environment can read directly.

## Failure-mode quick reference

| Symptom | Customer impact | Recovery |
|---|---|---|
| Webhook fails/stops delivering | Payment already succeeded in Stripe regardless — only ticket fulfillment is delayed, no double-charge risk | Fix root cause (check Vercel logs), then let Stripe's automatic retry run or manually **Resend** the specific event from the Stripe Dashboard |
| Email fails to send | None to payment/ticket validity — only the notification is missing | Order/tickets are still valid in Supabase; customer can self-serve via Retrieve Ticket, which reuses the same send path |
| PDF generation fails (Chromium/Puppeteer) | Same as email failure — the whole `sendTicketsForOrder` call fails together, no partial state | Check Vercel logs for the Puppeteer/Chromium error specifically; Retrieve Ticket calls the identical render path, so don't consider it fixed until a Retrieve Ticket request actually succeeds |
| Vercel deployment itself is bad | Depends on what broke — could be a hard outage | Promote a prior deployment to Production (see above); fix forward in a new commit before redeploying |
| Supabase unavailable | `create-checkout-session` fails before Stripe is ever reached (no payment risk); a webhook arriving *during* an outage for an already-successful payment is the one real risk case | Stripe's webhook retry (~3 days) will complete fulfillment automatically once Supabase recovers; manually resend from the Stripe Dashboard if a delivery ages out of the retry window first |
| Upstash unavailable | None by design — both rate-limited endpoints fail **open** on a rate-limiter error | No urgent action; monitor for abuse if the outage is prolonged |
| `429` responses on every request | Rate limiting doing its job, or misconfigured limits | Confirm request volume is legitimate before assuming misconfiguration — a `429` means Upstash was successfully reached and counted a real request |
