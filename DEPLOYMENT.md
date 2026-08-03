# Delta Harvest Festival Ticketing — Deployment Guide

Written for whoever actually deploys this — assume no prior context beyond what's in this repo and `PHASE1_IMPLEMENTATION_SUMMARY.md`. Every infrastructure step below (creating accounts, setting DNS, deploying to Vercel, registering the Stripe webhook) requires manual execution by whoever owns those accounts; none of it has been executed as part of building this system — see that document's **Known Limitations** and **Production Checklist** for exactly what remains unverified.

---

## Architecture (at a glance)

Two independently deployed things:

1. **This repo** — the existing static Delta Harvest Festival site, unchanged deploy path (GitHub Pages, deploy-from-branch). Gains only new pages under `/tickets/`.
2. **`delta-harvest-tickets-api`** (sibling repo) — Node.js serverless functions on Vercel, at a new subdomain `api.deltaharvestfestival.ca`. Holds every secret; the static site never sees one.

```
deltaharvestfestival.ca (GitHub Pages)  ──calls──▶  api.deltaharvestfestival.ca (Vercel)  ──▶  Stripe / Supabase / Resend / Upstash
```

Full architecture rationale is in `PHASE1_IMPLEMENTATION_SUMMARY.md`.

---

## Prerequisites

### Required accounts (all free-tier-capable for testing)
- **GitHub** — already have it; this repo already deploys here.
- **Vercel** — for `delta-harvest-tickets-api`.
- **Stripe** — payments. Start in test mode.
- **Supabase** — Postgres database.
- **Resend** — transactional email.
- **Upstash** — Redis, for rate limiting.

### Required local tools (for deployment/verification, not for running the site)
- Node.js 24.x (matches `engines.node` in `delta-harvest-tickets-api/package.json` — Node 20 reached upstream end-of-life on 2026-04-30 and `@supabase/supabase-js` dropped Node 20 support in v2.110.0; the installed `2.111.0` requires 22+)
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`) — optional but recommended for local testing before a dashboard-driven deploy
- [Stripe CLI](https://stripe.com/docs/stripe-cli) — for local webhook testing and for resending/replaying events during verification
- Access to the domain's DNS (wherever `deltaharvestfestival.ca`'s nameservers are managed) — needed once, to add the `api` subdomain

---

## Environment Variables

All of these are read only by server code in `delta-harvest-tickets-api` (see `.env.example`) — none are ever sent to the browser.

| Variable | Required | Source | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Yes | Stripe Dashboard → Developers → API keys | Use a **test** key until go-live |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe Dashboard, after registering the webhook (see below) | Different for test vs. live mode |
| `SUPABASE_URL` | Yes | Supabase project → Settings → API | |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase project → Settings → API | **Not** the anon/public key |
| `RESEND_API_KEY` | Yes | Resend Dashboard → API Keys | |
| `RESEND_FROM_EMAIL` | No (has a fallback) | You choose, e.g. `Delta Harvest Festival <tickets@deltaharvestfestival.ca>` | Must be on a domain verified in Resend |
| `SUPPORT_EMAIL` | No (has a fallback) | You choose | Shown on the Success page and in emails |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Dashboard → your database → REST API | REST URL, not the TCP connection string |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Dashboard → your database → REST API | |
| `ALLOWED_ORIGIN` | No (has a fallback) | Defaults to `https://deltaharvestfestival.ca` | **Override for Vercel Preview deploys** or CORS will reject requests from anywhere else |
| `SITE_URL` | No (has a fallback) | Defaults to `https://deltaharvestfestival.ca` | **Override for Preview deploys** or Stripe redirects (`success_url`/`cancel_url`) will point at production |

Run `npm run check-env` in `delta-harvest-tickets-api` (after pulling env vars locally, e.g. via `vercel env pull .env.local` then `node --env-file=.env.local scripts/check-env.mjs`) to verify all required variables are present before deploying.

**Two footguns specific to this project**, both because `SITE_URL`/`ALLOWED_ORIGIN` default to the production domain:
1. Testing against a Vercel **Preview** deployment without overriding these will silently redirect Stripe Checkout back to the *live* site, and CORS will reject calls from a local/preview frontend.
2. There is no automated check that these are set correctly per-environment in Vercel — verify manually in the Vercel dashboard's environment variable UI (it supports different values per Production/Preview/Development).

---

## DNS

One **additive** record — nothing about the existing `deltaharvestfestival.ca` apex domain or its current GitHub Pages `CNAME` file changes.

| Type | Host | Value |
|---|---|---|
| CNAME | `api` | (Vercel will show you the exact target when you add the domain in its dashboard — historically `cname.vercel-dns.com`, but confirm live in Vercel's UI, since this is the kind of detail that can change) |

DNS propagation can take anywhere from minutes to ~48 hours depending on the registrar/TTL. Don't register the Stripe webhook or switch to live keys until `https://api.deltaharvestfestival.ca` actually resolves and serves the Vercel deployment.

---

## Supabase Setup

1. Create a new Supabase project (any region; a small community festival has no meaningful latency concerns).
2. Open the SQL editor and run the entirety of `delta-harvest-tickets-api/supabase/schema.sql`. This creates `events`/`orders`/`tickets`, the two numbering sequences and their RPC wrappers, indexes, RLS (enabled, no public policies), and seeds the 2026 festival as the active event.
3. **Before running it in production**, open the seed `insert into events (...)` statement at the bottom of that file and confirm the dates/prices are actually correct for the real festival — it's currently `2026-09-26` to `2026-09-27`, `$10.00`/`$5.00`.
4. Copy the project URL and the **service_role** key (Settings → API — not the `anon` key) into `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
5. Verify RLS is actually enabled on all three tables (Table Editor → each table → RLS toggle) — `schema.sql` enables it, but it's cheap to eyeball-confirm given it's the only thing standing between the `anon` key and this data.

## Stripe Setup

1. Use an existing Stripe account or create one. Stay in **test mode** for everything below until the Production Checklist in `PHASE1_IMPLEMENTATION_SUMMARY.md` is fully green.
2. No Products/Prices need to be created in the Stripe Dashboard — line items are built inline from the active Supabase `events` row at request time.
3. Copy the test **Secret key** (Developers → API keys) into `STRIPE_SECRET_KEY`.
4. Webhook registration happens *after* the API is deployed and its URL is live (see Deployment Order) — you need a real, reachable URL to register a webhook against.

## Resend Setup

1. Create a Resend account.
2. Add and verify the `deltaharvestfestival.ca` sending domain (Domains → Add Domain), which means adding the SPF/DKIM DNS records Resend shows you — a second, separate DNS change from the `api` CNAME above, on the same domain.
3. Until that domain is verified, emails will fail to send (or only send from Resend's own sandbox domain, depending on their current test-mode behavior) — this blocks the confirmation-email step of testing, not the payment/database steps.
4. Set `RESEND_FROM_EMAIL` to an address on the verified domain.

## Upstash Setup

1. Create a free Upstash Redis database (any region close to Vercel's chosen region is marginally better, not critical at this scale).
2. Use the **REST API** credentials (not the Redis protocol connection string) — copy the REST URL and token into `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`.
3. Reminder from `PHASE1_IMPLEMENTATION_SUMMARY.md`: a missing/wrong value here breaks checkout and retrieval **entirely** at cold start (fail-fast by design) — get this right before deploying, not after.

## Vercel Setup

1. Import `delta-harvest-tickets-api` as a new Vercel project (from GitHub, once pushed there, or via `vercel` CLI from the local directory).
2. Framework preset: **Other** (there's no frontend build here — this project is API routes only; leave the build command blank).
3. Set every environment variable from the table above in the Vercel dashboard (Project → Settings → Environment Variables), scoped to at least Production. Add Preview-scoped overrides for `SITE_URL`/`ALLOWED_ORIGIN` if you'll test Preview deployments.
4. Add the custom domain `api.deltaharvestfestival.ca` (Project → Settings → Domains) — Vercel will show the exact DNS record to add (see DNS above).
5. Confirm your Vercel plan supports the `maxDuration` values in `vercel.json` (30s on the webhook and retrieve routes) — the free Hobby tier caps at 10s regardless of what's configured, which may be too tight for a multi-ticket PDF render. Pro removes that cap.
6. Deploy. **Before registering the Stripe webhook or trusting any of this**, confirm the single highest-risk unverified piece of this whole build: that `puppeteer-core` + `@sparticuz/chromium` can actually launch and render a PDF in Vercel's runtime. Hit `create-checkout-session` and complete one real test-mode purchase (see Smoke Tests below), and confirm a PDF actually arrives — do not assume this works just because it type-checked locally.

## GitHub Pages Setup

Nothing changes here — this repo's deploy path is exactly what it already was. For completeness/verification only:
- Confirm Settings → Pages shows the correct source branch and that the custom domain is still `deltaharvestfestival.ca` with **Enforce HTTPS** checked.
- The new `/tickets/`, `/tickets/success/`, `/tickets/cancel/`, `/tickets/retrieve/` folders need no special GitHub Pages configuration — GitHub Pages serves `folder/index.html` at `folder/` natively.
- A `.nojekyll` file was added at the repo root (this pass) as a defensive standard practice — the site doesn't use Jekyll features, so this just skips an unnecessary processing step; it shouldn't change any existing behavior.

## Webhook Registration

Do this **after** `api.deltaharvestfestival.ca` is live and resolving:
1. Stripe Dashboard → Developers → Webhooks → Add endpoint.
2. Endpoint URL: `https://api.deltaharvestfestival.ca/api/payments/webhook`.
3. Events to send: **`checkout.session.completed`** only (the handler ignores everything else, but subscribing only to what's needed keeps the Stripe Dashboard's event log relevant).
4. Copy the **Signing secret** shown after creation into `STRIPE_WEBHOOK_SECRET` in Vercel, and redeploy (env var changes require a redeploy to take effect for already-running functions).
5. Repeat this entire step separately for live mode once you switch off test keys — test and live mode have **separate** webhook registrations and separate signing secrets in Stripe.

---

## Deployment Order

Nothing here is safely reorderable — each step depends on the previous one being live.

1. **Supabase**: create project, run `schema.sql`, verify the seeded event's dates/prices.
2. **Resend**: create account, start domain verification (can run in parallel with steps 3–6 below since it doesn't block anything except the email-arrives step of testing).
3. **Upstash**: create the Redis database, grab REST credentials.
4. **Stripe**: create/confirm test-mode account, grab the test secret key. (Webhook registration is step 8, after the API is live.)
5. **Vercel**: import `delta-harvest-tickets-api`, set all environment variables (using the test-mode Stripe key for now), deploy.
6. **DNS**: add the `api` CNAME, add it as a custom domain in Vercel, wait for it to resolve.
7. **Verify**: `https://api.deltaharvestfestival.ca/api/tickets/retrieve` responds (even a 400/405 to a bad request proves the deployment and DNS are both working).
8. **Stripe webhook**: register it against the now-live URL, copy the signing secret into Vercel, redeploy.
9. **Full test-mode purchase**: run through the whole flow once by hand (see Smoke Tests + `TESTING_CHECKLIST.md`) — this is the step that actually proves PDF rendering works on Vercel, which nothing before this point confirms.
10. **This repo (static site)**: push the `/tickets/*` changes to whatever branch GitHub Pages deploys from. No new steps versus how this site already deploys.
11. **Only after 1–10 are all green**: switch Stripe to live mode (new live secret key in Vercel, new live webhook registration with its own signing secret), and only then is this a real, chargeable production system.

---

## Rollback Plan

- **Static site (this repo)**: a normal `git revert` of the commit(s) that added the `/tickets/*` pages and nav changes, pushed to the deploy branch, removes the ticketing UI from the live site within GitHub Pages' normal deploy latency. The rest of the site is completely unaffected either way, since nothing else was restructured.
- **API (`delta-harvest-tickets-api`)**: Vercel keeps every previous deployment; use the Vercel dashboard (Deployments → select a prior one → Promote to Production) to roll back instantly without a new git push. If the issue is bad data rather than bad code, no rollback fixes that — see Failure Recovery below.
- **Stripe webhook**: can be disabled instantly from the Stripe Dashboard (toggle the endpoint off) without touching any code — stops new fulfillment attempts while you fix a problem, without stopping Checkout itself from accepting payments (Stripe just queues/retries the webhook once you re-enable it, per its normal retry behavior).
- **Full stop (if something is actively broken and you need to stop selling immediately)**: remove/hide the `/tickets/` nav links and the `.ticket-info` link on the homepage (small, fast static-site edit), or point `/tickets/index.html`'s form at nothing — either buys time without touching the backend at all.
- There is no database migration to roll back in Phase 1 — `schema.sql` is additive-only and has never been run against production data as of this writing, so there's nothing to revert on the Supabase side yet.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Checkout button does nothing / network error | `ALLOWED_ORIGIN` doesn't match the page's actual origin (CORS), or the API isn't deployed yet | Check the browser console for a CORS error specifically; confirm `ALLOWED_ORIGIN` in Vercel matches exactly (scheme + host, no trailing slash) |
| Stripe redirects to the live site instead of a preview/staging one | `SITE_URL` unset for that Vercel environment, using its production fallback | Set `SITE_URL` explicitly for that environment in Vercel |
| Webhook shows repeated failures in Stripe Dashboard | Signing secret mismatch, or the function is erroring | Check Vercel function logs for the actual error; confirm `STRIPE_WEBHOOK_SECRET` matches the specific endpoint (test vs. live have different secrets) |
| Order exists in Supabase but no tickets | The atomic claim (`tickets_generated_at`) was taken but generation then failed and the claim wasn't released yet, or is mid-retry | Check Vercel logs for the specific order; the claim auto-releases on failure so a webhook retry (or a Retrieve Ticket request) should self-heal within moments — see Failure Recovery |
| Tickets exist but no email arrived | Resend domain not verified yet, or `sendTicketsForOrder` threw (check logs) | Verify the Resend domain; the order/tickets are still valid regardless — use Retrieve Ticket to resend once the underlying issue is fixed |
| PDF is blank, malformed, or the function times out | The `@sparticuz/chromium`/`puppeteer-core` pairing isn't actually compatible on Vercel's runtime — this is the one thing this whole build could not verify without a live deployment | Check Vercel function logs for the Puppeteer/Chromium launch error; may need to pin different matched versions per `github.com/Sparticuz/chromium`'s current README |
| `429` responses on every request | Upstash rate limiting is doing its job, or (if unexpected) the limiter is misconfigured | Check whether the request volume is actually legitimate; the limiter fails open on Upstash *errors*, so a 429 means it successfully reached Upstash and counted a real request |
| Everything 500s immediately, even simple requests | A required env var is missing (fails loudly at cold start by design) | Run `npm run check-env` against the environment in question; check Vercel function logs, which will show exactly which `requireEnv`/client constructor threw |

---

## Smoke Tests

Two forms, both included in `delta-harvest-tickets-api/scripts/`:

- **`npm run check-env`** — confirms every required environment variable is present before you even deploy.
- **`npm run smoke-test`** (or `API_BASE=https://api.deltaharvestfestival.ca/api node scripts/smoke-test.mjs`) — hits a real deployed API and checks: CORS preflight, method rejection, input validation, the enumeration-safety response shape on `tickets/retrieve`, a real (harmless, uncompleted) Checkout Session creation, and webhook signature rejection. Pass `SKIP_LIVE_CHECKOUT=1` to skip the one test that creates a real Stripe Checkout Session if you'd rather not.

Both scripts were written and verified in this session — `check-env` was run and confirmed to correctly pass/fail based on which variables are set, and `smoke-test` was run against a temporary mock server standing in for the real API and confirmed all 13 of its assertions pass against well-formed responses. Neither has been run against the real, deployed infrastructure, since none exists yet as of this writing.

Beyond the scripted checks, the manual walkthrough in `TESTING_CHECKLIST.md` covers the parts that genuinely need a human and a browser: a real payment, a real received email, scanning a real QR code, keyboard/screen-reader passes, and cross-browser/mobile checks.

---

## Go-Live

See `GO_LIVE_CHECKLIST.md` for the final, manually-checkable gate before switching Stripe to live keys and calling this a real production system.
