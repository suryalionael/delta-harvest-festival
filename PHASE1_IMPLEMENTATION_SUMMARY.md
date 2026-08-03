# Delta Harvest Festival — Online Ticketing: Phase 1 Implementation Summary

## Overview

Phase 1 adds guest-checkout ticketing to the Delta Harvest Festival site: visitors buy Adult ($10 CAD) or Kids-under-12 ($5 CAD) admission via Stripe Checkout, receive a branded confirmation email with a PDF ticket (unique QR code per ticket), and can resend a forgotten ticket by email. No accounts, no admin dashboard, no check-in — those are Phase 2/3.

The full architecture review (three rounds of revision) lives in the approved plan; this document is the as-built reference. A fourth pass — a full production-readiness audit across both repos — followed feature-completion; see **Production Readiness Pass** below for what that changed.

## Production Readiness Pass

A dedicated audit pass (no new features — Phase 2/3 explicitly excluded) went through both repos file by file against a production checklist: races/transaction safety, error handling, XSS, database indexing, contrast/accessibility, and email/PDF rendering correctness. Real issues were found and fixed rather than just reviewed:

**Backend, correctness/security:**
- **Fixed a genuine transaction-safety bug**: the atomic "claim" that prevents two concurrent Stripe webhook deliveries from double-generating tickets (`orders.tickets_generated_at`) had no failure-recovery path — if anything threw between claiming and actually inserting ticket rows (a dropped connection, an RPC timeout), the order would be permanently stuck "claimed" with zero tickets and no way to ever retry. Fixed in `lib/tickets/generate.ts`: the claim is now released on any failure (`releaseTicketGenerationClaim`), so a retry (Stripe's automatic retry, or a Retrieve Ticket request) can complete generation.
- **Fixed a related race**: a caller (e.g. an impatient Retrieve Ticket request seconds after paying) could observe the claim already taken but the ticket rows not yet inserted, get back an empty array, and — since nothing guarded against it — email a PDF with zero ticket pages. `ensureTicketsGenerated` now polls briefly for the tickets to appear, and `sendTicketsForOrder` refuses to run with zero tickets as a second line of defense.
- **Fixed a Stripe correctness gap**: `checkout.session.completed` does not always mean a payment has actually cleared — some payment methods settle asynchronously, and this integration was never wired to `async_payment_succeeded`. Checkout Sessions are now created `payment_method_types: ['card']` (card payments always settle synchronously), and the webhook additionally checks `session.payment_status === 'paid'` before fulfilling, logging and skipping otherwise rather than issuing tickets for an unconfirmed payment.
- **Fixed a database index that didn't match its query**: `orders` had a functional index on `lower(customer_email)`, but the actual lookup queries the raw column directly (email is normalized to lowercase at insert time). The index was silently unused; replaced with a plain index on `customer_email`. Also removed a redundant index on `order_number`, which already has an implicit index from its `unique` constraint.
- **Fixed missing XSS escaping**: the ticket PDF/preview template and the confirmation email template escaped the customer's name but not `event.name`/`event.venue` (admin/seed-controlled, but dynamic — not hardcoded, so still escaped for defense-in-depth). One escaping regression was caught and reverted during the fix: the email *subject line* must stay plain text, not HTML-escaped, or recipients would see a literal `&amp;` in their inbox.
- **Fixed unhandled rate-limiter failures**: `create-checkout-session` and `tickets/retrieve` called Upstash directly with no error handling — a transient Upstash outage would have thrown an unhandled exception instead of a proper error response, taking ticket sales down over a secondary dependency. Both now fail **open** (log and allow the request through) if the rate-limit check itself errors; a missing/misconfigured Upstash env var still fails loudly at cold start, which is correct for genuine misconfiguration.
- **Improved error classification**: `create-checkout-session`'s catch-all previously labeled every failure `STRIPE_ERROR`, including non-Stripe failures (e.g. no active event configured). Now distinguishes actual `Stripe.errors.StripeError` (502) from everything else (500 `INTERNAL_ERROR`).
- Removed a no-op `pageRanges: ''` option from the PDF renderer (dead code).

**Ticket PDF, printability:**
- A long customer name or venue could overflow the ticket card's fixed height and get clipped at the PDF page boundary. Fixed with `min-width: 0` + `text-overflow: ellipsis` on the info-cell values, so long content truncates gracefully instead of breaking the layout.
- Label text on the ticket (`ADMITS` / `DATE` / `VENUE`, the footer notice, the stub's order-number line) used the site's `--muted` gray at 3.2:1 contrast against the ticket's background — passable for the site's existing decorative eyebrows, but too low for print/B&W legibility on a document meant to be scanned at a gate. Changed to the same `#6a5d4e` already used for the nav's own label text elsewhere on the site — better contrast (5.4–5.8:1) and, as a side effect, more internally consistent (the ticket previously used two different "muted label" shades for no real reason).

**Static pages, accessibility:**
- Same contrast issue as above, on `/tickets/`: form labels, ticket prices, fine-print copy, and the Success/Cancel pages' help text all used `--muted` at 3.2:1 against the page background — fails WCAG AA (4.5:1) for real, functionally-important text (as opposed to the site's existing purely-decorative eyebrow labels, which weren't touched, to keep site-wide visual consistency). Fixed with the same reused, already-on-palette `#6a5d4e`.
- The ticket-type selector (two quantity steppers with no `<label>` of their own, contextualized only by a visual heading) is now a proper `<fieldset>`/`<legend>` instead of a `<div>`/`<h2>`, so screen reader users get the "Choose Your Tickets" grouping context when navigating the stepper controls.
- The quantity stepper's `−`/`+` buttons didn't actually disable at 0/20 despite CSS already having a `:disabled` style for them — fixed so the boundary is both visually and programmatically indicated.
- Status/error messages now switch between `role="status"`/`aria-live="polite"` (routine updates) and `role="alert"`/`aria-live="assertive"` (validation errors) — errors should interrupt, routine updates shouldn't.
- Removed a dead `::placeholder` CSS rule — no input on any page actually has a `placeholder` attribute (real `<label>`s are used instead, which is the more senior-friendly choice anyway), so the rule never did anything.

## Architecture

The main site ([deltaharvestfestival.ca](https://deltaharvestfestival.ca)) is a 100% static site on GitHub Pages with no build step. It cannot run the server code that Stripe/Supabase/Resend integration requires (secret keys, webhook verification, DB writes must never reach the browser). Rather than migrate the live site's hosting, **all server logic lives in a separate repo, `delta-harvest-tickets-api`, deployed to Vercel at a new subdomain, `api.deltaharvestfestival.ca`.** This repo's GitHub Pages deployment is completely unaffected.

```
Browser (deltaharvestfestival.ca)          api.deltaharvestfestival.ca (Vercel)         Stripe / Supabase / Resend
─────────────────────────────────          ──────────────────────────────────           ───────────────────────────
/tickets/            ──POST──▶  /api/payments/create-checkout-session
                                    │ validates qty, prices from active event row
                                    ▼
                              Stripe Checkout (hosted)
                                    │ redirect
                                    ▼
/tickets/success/  (static)
/tickets/cancel/   (static)
/tickets/retrieve/   ──POST──▶  /api/tickets/retrieve
                                    │ enumeration-safe: same response either way
                                    ▼
                                                                              Stripe ──webhook──▶ /api/payments/webhook
                                                                                                        │ verify signature
                                                                                                        │ idempotent order+ticket insert
                                                                                                        │ render PDF (in memory, on demand)
                                                                                                        │ send email (Resend)
```

## Repository Changes

### Files Added (this repo)
- `tickets/index.html`, `tickets/success/index.html`, `tickets/cancel/index.html`, `tickets/retrieve/index.html` — folder-based clean URLs (`/tickets/`, `/tickets/success/`, etc.), which GitHub Pages serves natively from `path/index.html` with no build tooling.
- `tickets.css` — shared styling for all four pages, reusing the site's existing tokens (`--bg`, `--ink`, `--rule`, `--display`, `--sans` from `styles.css`) plus a page-local `--accent`/`--mono` pair, following the same pattern as `festival-map-page.css`.
- `tickets-buy.js`, `tickets-retrieve.js` — client logic for the purchase and retrieval forms. Neither ships a Stripe key of any kind; checkout is a plain redirect to the URL the API returns.

### Files Modified (this repo)
- `index.html`, `mill-history.html`, `old-town-hall.html`, `festival-map.html` — added a **Tickets** nav dropdown (Purchase Tickets / Retrieve My Tickets) to the shared nav, matching the existing dropdown pattern.
- `index.html` — the existing "Tickets · $10 adults · $5 children under 12" notice is now a link to `/tickets/`; `styles.css`'s `.ticket-info` rule gained `text-decoration`/hover/focus-visible handling since it's now interactive.
- `sitemap.xml` — added `/tickets/` and `/tickets/retrieve/` (the success/cancel pages carry `<meta name="robots" content="noindex">` and are intentionally excluded).

**Important — root-relative paths:** the four new pages are nested one level deep (`/tickets/...`), so unlike the rest of the site (which uses bare relative paths like `href="styles.css"`), every asset link, nav link, and script tag on these four pages is root-relative (`/styles.css`, `/tickets/retrieve/`, etc.). This was flagged in the architecture review specifically because it's an easy static-site mistake to miss.

### New Repo: `delta-harvest-tickets-api`
Created as a sibling directory (`../delta-harvest-tickets-api`), not pushed to a remote or deployed — that's a separate step for whoever owns the Vercel/GitHub account.

```
/api
  /payments
    create-checkout-session.ts   POST — validates input, calls lib/payments/checkout.ts
    webhook.ts                    POST — verifies signature, calls the fulfillment/generation/email chain
  /tickets
    retrieve.ts                    POST — rate-limited, enumeration-safe resend
/lib
  /payments   stripe-client.ts, pricing.ts (policy constants only — NOT prices), checkout.ts, fulfill-order.ts
  /tickets    numbering.ts, qr.ts, present.ts, template.ts, generate.ts, resend.ts, logo.ts
  /emails     client.ts, confirmation-template.ts
  /pdf        render.ts
  /database   client.ts, types.ts, orders.ts, tickets.ts, events.ts
  /security   rate-limit.ts
  /http       respond.ts, cors.ts, validate.ts
/supabase/schema.sql
vercel.json, package.json, tsconfig.json, .env.example
```

Every `/api/*` route is thin by convention: validate the request shape → call exactly one `/lib` function → format the response. All business logic (idempotency, pricing, enumeration-safe shaping) lives in `/lib`. The project type-checks cleanly (`npm run typecheck`).

## Database Schema

Run `supabase/schema.sql` (in the new repo) against a fresh Supabase project once, before the first live webhook call. It creates:

- **`events`** — one row per festival (`name`, `year`, `venue`, `start_date`/`end_date`, `adult_price`/`kids_price`, `is_active`). A partial unique index guarantees at most one active event. Seeded with the 2026 festival.
- **`orders`** — one row per purchase, referencing `event_id`. Includes `order_number` (`DHF-ORD-000001`), the Stripe identifiers (§ below), a **pricing snapshot** (`adult_qty`/`kids_qty`/`adult_unit_price`/`kids_unit_price`), `total_amount`, `payment_status`, and `tickets_generated_at` (the concurrency-safety column, see Known Limitations → race handling below).
- **`tickets`** — one row per admitted person, referencing both `order_id` and (denormalized) `event_id`, with `ticket_number` (`DHF26-000001`), a secure-random `qr_token`, and a `status` enum (`valid`/`checked_in`/`cancelled`/`refunded`/`void`).
- RLS is enabled on all three tables with **no public policies** — only the Supabase service-role key (used exclusively server-side) can read or write.

### Event Model (multi-festival support)
Nothing about pricing, dates, or venue is hardcoded in the API or the ticket template — `create-checkout-session` and the webhook both resolve everything from the `events` table (`getActiveEvent()` for new checkouts, `getEventById()` for anything tied to an already-existing order). Running next year's festival is a new `events` row with `is_active` flipped, not a code or schema change.

### Pricing Snapshot Strategy
`lib/payments/pricing.ts` intentionally holds **no prices** — only cross-event policy constants (currently just `MAX_TICKETS_PER_TYPE`). The authoritative price is the active event's row at the moment a Checkout Session is created; those exact unit prices are written into the Session's Stripe metadata immediately, and the webhook reads them back from metadata (never re-queries `events`) when it inserts the order. This closes a real race: if an admin changes next year's price while someone's Checkout tab is still open, the order records what was actually charged, not whatever the price happens to be by the time the webhook fires.

### Ticket Status Model
`tickets.status` replaces a plain boolean specifically so Phase 3 check-in (`valid → checked_in`) and any future refund flow (`→ refunded`) don't require a migration. Phase 1 code only ever creates `'valid'` tickets — the other values are inert until later phases write to them. `orders.payment_status` was deliberately left as `('paid','failed')` rather than widened the same way, since refunds are out of Phase 1 scope and nothing else references that column yet.

### API Response Conventions
The two browser-facing endpoints return a standard envelope:
```json
{ "success": true, "data": { ... } }
{ "success": false, "code": "VALIDATION_ERROR", "message": "human-readable" }
```
The Stripe webhook is excluded (Stripe doesn't parse a particular shape; it gets a minimal `{ "received": true }`). One hard rule: `tickets/retrieve`'s success `data` is always the exact same `{ message: "..." }` regardless of whether an email matched anything — the envelope must never grow a field that varies by branch, or it reopens the enumeration leak that endpoint exists to close.

## Ticket Retrieval Flow

`/tickets/retrieve/` — a single email field, no account/login/password. On submit:
1. Rate limit by IP, then by normalized email (see below).
2. Validate email format (a genuine input error — distinct from the "found vs. not found" question below).
3. Look up all `paid` orders for that email (exact, case-insensitive match — **not** `ILIKE`, since a wildcard-shaped "email" like `%@gmail.com` would otherwise pattern-match other customers' addresses and leak their tickets to whoever typed it).
4. For each matching order, regenerate its PDF on demand and resend the same confirmation email used at purchase time (via the shared `sendTicketsForOrder()` — see PDF Generation Strategy).
5. **Always** respond with the same generic message, whether zero, one, or several orders matched. If more than one order matched, each resend email includes a one-line note ("we found N separate orders for this email") so a customer who double-purchased notices it themselves — no dedupe/refund logic needed.

## Rate Limiting Strategy

Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`) — the only practical option for stateless Vercel functions, since in-memory counters don't survive between invocations. Three sliding-window limiters (`lib/security/rate-limit.ts`):
- `create-checkout-session`: 10 requests / 10 min per IP.
- `tickets/retrieve`: 5 / 15 min per IP **and** 5 / 15 min per normalized email — the stricter of the two applies, since this is the enumeration-risk endpoint.

## Ticket Numbering Strategy

Two independent Postgres sequences, exposed via RPC functions (`next_order_number()`, `next_ticket_numbers()` in `schema.sql`) since PostgREST can't call `nextval()` directly:
- **Order number** — `DHF-ORD-000001`, one per purchase.
- **Ticket number** — `DHF26-000001`, `DHF26-000002`, …, one per admitted person, year-prefixed from the event's `year`.

Both are sequential and non-secret by design (retrieval is always by verified email, never by guessing a number). The **QR code encodes a separate, unrelated 128-bit random `qr_token`** (`lib/tickets/qr.ts`), never derived from either sequence — this is load-bearing for Phase 3 check-in security.

## Final Ticket Design Approach

Three concepts were sketched during the architecture review (bordered admission card / railway stub / borderless broadside notice); the implemented design is a landscape bordered card with a solid-rule right-hand QR/ticket-number zone — the lowest-risk option, built almost entirely from the site's existing components rather than a new visual language:
- Cormorant Garamond + Inter + IBM Plex Mono (same families used sitewide).
- Exact palette from `styles.css`'s `:root` (`#F5F3F1` ivory, `#1C1A18` ink, `#523819` umber accent, `#DCD7CF` rule).
- The `.hn-brand` eyebrow-over-italic-serif header treatment and the `.ticket-info` rule-bordered row are recomposed directly onto the ticket.
- The actual site favicon (`Favicon.png`, base64-embedded in `lib/tickets/logo.ts`) is the logo — not a redrawn mark. (`Favicon (1).svg` was **not** used — inspection showed it's a ~1 MB raster image wrapped in an SVG tag, not a lightweight vector, and embedding it in every render would meaningfully slow down PDF generation.)

Implemented once as `lib/tickets/template.ts` (one HTML/CSS document, one `.ticket-page` per ticket, `page-break-after: always`) — used identically for the PDF render and any future HTML preview. The email is a **separate**, deliberately simpler table-based HTML shell (`lib/emails/confirmation-template.ts`) that reuses the same data and design tokens but not the same literal markup, because Outlook/Gmail don't support the CSS the PDF template uses (flexbox, custom fonts). The PDF is the pixel-perfect version; it's what's actually attached and meant to be printed/shown at the gate.

**Known trade-off:** the ticket template's `@font-face`/`@import` pulls Cormorant Garamond, Inter, and IBM Plex Mono from Google Fonts at render time inside the headless-Chromium function, rather than embedding font files. This keeps the template lightweight but is a network dependency at PDF-render time; the CSS includes system-font fallbacks (`Georgia`/`Arial`) so a slow or failed font fetch degrades cosmetically rather than breaking the render.

## PDF Generation Strategy

**Generated on demand, in memory, never persisted to storage.** Considered and rejected: a Supabase Storage bucket with signed download URLs. On-demand wins here specifically because the Success page (per the approved revision) no longer has an in-page "Download Ticket" button — delivery is exclusively via the email attachment and the Retrieve Ticket resend — so there's no code path left that needs a stored, independently-fetchable file. The only two places a PDF is ever produced are `stripe-webhook.ts` (first confirmation) and `tickets/retrieve.ts` (resend), both through the same `lib/tickets/resend.ts → sendTicketsForOrder()` core, which renders via `puppeteer-core` + `@sparticuz/chromium` (`lib/pdf/render.ts`) and attaches the buffer directly to the Resend call. Net effect: no Storage bucket, no signed URLs, no `pdf_path` column, one fewer moving part.

## Environment Variables

See `.env.example` in `delta-harvest-tickets-api`:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPPORT_EMAIL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ALLOWED_ORIGIN`, `SITE_URL`. None of these are ever read outside `/lib` and `/api` server code — nothing is bundled to the browser.

## Stripe Setup
1. Create a Stripe account (or use an existing one) and grab the **test-mode** secret key for development.
2. No Stripe Products/Prices need to be pre-created — line items use inline `price_data` sourced from the active `events` row at request time.
3. After the API is deployed, register a webhook endpoint at `https://api.deltaharvestfestival.ca/api/payments/webhook` for the `checkout.session.completed` event, and copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Switch to live keys only once the whole flow has been verified end-to-end in test mode.

## Supabase Setup
1. Create a new Supabase project.
2. Run `supabase/schema.sql` in the SQL editor (creates tables, sequences, RPCs, RLS, and seeds the 2026 event — adjust the seed row's dates/prices first if needed).
3. Copy the project URL and **service-role** key (not the anon key) into `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

## Resend Setup
1. Create a Resend account and verify the `deltaharvestfestival.ca` sending domain (SPF/DKIM DNS records) — required before any email will actually send.
2. Set `RESEND_FROM_EMAIL` to a verified address on that domain (e.g. `Delta Harvest Festival <tickets@deltaharvestfestival.ca>`) and `SUPPORT_EMAIL` to the same or a monitored inbox — the Success page's "Need help?" link points here.

## Upstash Setup
1. Create a free Upstash Redis database (REST API, not a TCP connection).
2. Copy `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` into the API's environment.

## Local Development
- **This repo**: no build step — open the HTML files directly or serve the directory with any static file server. The `/tickets/*` pages call the *deployed* `api.deltaharvestfestival.ca` origin by default (hardcoded in `tickets-buy.js`/`tickets-retrieve.js`); point that constant at `http://localhost:3000` if testing against a local API.
- **`delta-harvest-tickets-api`**: `npm install`, copy `.env.example` to `.env.local` with test-mode/dev keys, `npm run dev` (Vercel CLI) to run the functions locally, and `stripe listen --forward-to localhost:3000/api/payments/webhook` (Stripe CLI) to receive webhook events during testing. `npm run typecheck` runs `tsc --noEmit`.

## Deployment Checklist
- [ ] Run `supabase/schema.sql` against the production Supabase project.
- [ ] Deploy `delta-harvest-tickets-api` to Vercel; add a `CNAME api → cname.vercel-dns.com` DNS record (additive — existing GitHub Pages records for the apex domain are untouched) and verify `api.deltaharvestfestival.ca` in the Vercel dashboard.
- [ ] Set all environment variables in Vercel (Production).
- [ ] Register the Stripe webhook against the live `api.*` URL; confirm `STRIPE_WEBHOOK_SECRET` matches.
- [ ] Verify the Resend sending domain.
- [ ] Confirm the Vercel plan supports the `maxDuration` values set in `vercel.json` (30s for the webhook and retrieve endpoints) — the free Hobby tier caps functions at 10s regardless of this config, which may be too tight for a multi-ticket PDF render; Pro removes that cap.
- [ ] Switch Stripe from test to live keys only after a full end-to-end test purchase.
- [ ] Deploy this repo's new/changed static files (same GitHub Pages flow as always — no new steps).

## Security Notes
- No secret ever reaches the browser — the client never sees a Stripe key of any kind (redirect-only Checkout flow).
- Server-side-only pricing: client quantities are validated (integer, 0–20) but never trusted for amount; the charged price always comes from the active event's row.
- Webhook signature verified against the **raw** request body (`bodyParser: false` on that route) before any processing.
- Idempotency is handled at two levels: a unique constraint on `stripe_payment_intent` (so a retried webhook delivery never creates a second order), and a separate atomic **claim** on `orders.tickets_generated_at` (an `UPDATE ... WHERE tickets_generated_at IS NULL`) before ticket generation — this closes a real concurrency gap that a simple "does this order have tickets yet" check would leave open if two webhook deliveries for the same event arrived at once.
- `tickets/retrieve` never returns ticket/order data in an HTTP response — the only way to receive ticket contents is via email, sent only to the address the requester typed in, with an identical response regardless of match (email-enumeration protection). Exact-match (not `ILIKE`) email lookups prevent SQL wildcard abuse of that same endpoint.
- Row Level Security is enabled on every table with no public policies — only the service-role key, used exclusively in server code, can touch the data.
- Total infrastructure footprint is four services — Stripe, Supabase, Resend, Upstash — no logging/monitoring/auth service was added; each dashboard is sufficient at this scale.

## Known Limitations
- On-demand PDF rendering happens synchronously inside the webhook handler, which Stripe expects a response from within roughly 20 seconds. At this festival's expected order volume this should comfortably fit; if it ever doesn't, the documented (not yet built) fix is to acknowledge the webhook immediately after the DB write and move PDF/email generation to a `waitUntil` background step.
- No automatic retry if a confirmation email fails to send after tickets are already generated — the order is still valid, and the customer can always use Retrieve Ticket (which reuses the same send path) to get it resent.
- The retrieve-ticket enumeration protection is response-*content*-based only; response *timing* between the "found" and "not found" branches isn't deliberately normalized. Acceptable for this threat model (a small community festival), but worth naming rather than assuming perfect.
- Ticket template fonts load from Google Fonts at PDF-render time rather than being embedded — see the trade-off note under Final Ticket Design Approach.
- No load testing has been done against Vercel/Resend/Upstash free-tier limits for a real festival-day traffic spike.
- Each ticket's QR code already encodes a `/tickets/verify/?t=...` URL (so a generic scanner shows something meaningful), but that page doesn't exist until Phase 3 — scanning a Phase 1 ticket today will 404. Chosen deliberately over a bare token so the QR format never has to change later.
- **`@sparticuz/chromium` and `puppeteer-core` version compatibility is unverified.** `package.json` pins `@sparticuz/chromium@^123.0.0` and `puppeteer-core@^23.0.0`; both installed and type-checked cleanly together, but that only proves the *types* line up, not that the actual Chromium binary and Puppeteer's DevTools protocol client are compatible at runtime on Vercel's Lambda-like environment — the two packages need to be matched to the same underlying Chromium version (see `github.com/Sparticuz/chromium`'s README), and neither this session nor its tooling could confirm that pairing without an actual deployment. **This must be verified with a real test render on Vercel before relying on it for a live purchase** — it's the single highest-risk unverified piece of this whole implementation.
- **A missing/misconfigured Upstash env var breaks checkout and retrieval entirely at cold start**, not gracefully — `Redis.fromEnv()` throws at module load if `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` aren't set, before any request-handling code (including the new fail-open rate-limit wrapper) ever runs. This is intentional fail-fast behavior for genuine misconfiguration (you want a broken env var caught immediately, not silently degraded around), but it means the Upstash env vars are as load-bearing as the Stripe/Supabase/Resend ones despite rate limiting being "just" a defense-in-depth measure — get them right in the deployment checklist.
- No part of this implementation has been exercised against live Stripe/Supabase/Resend/Upstash accounts or rendered in an actual browser — see **Production Checklist** and `TESTING_CHECKLIST.md` for what real verification still needs to happen before go-live.

## Production Checklist

Everything below is unverified against real infrastructure as of this writing (this session deliberately scaffolded code only, per an earlier explicit decision not to create live third-party accounts). None of it is optional before taking real payments:

- [ ] Deploy `delta-harvest-tickets-api` to a real Vercel project and confirm the headless-Chromium PDF render actually works in that environment (see the `@sparticuz/chromium`/`puppeteer-core` risk above) — do this **first**, since it's the least certain piece.
- [ ] Run a full test-mode purchase end to end: `/tickets/` → Stripe Checkout (test card) → webhook fires → order + tickets appear in Supabase → confirmation email arrives with a correctly-rendered PDF attached.
- [ ] Confirm the webhook is idempotent in practice: replay the same event from the Stripe Dashboard's webhook log and confirm no duplicate order/tickets are created.
- [ ] Test Retrieve Ticket against a real order, a non-existent email, and confirm the response is byte-for-byte identical either way.
- [ ] Trigger rate limiting deliberately on both endpoints and confirm a clean 429 rather than a raw error.
- [ ] Open every new page (`/tickets/`, `/tickets/success/`, `/tickets/cancel/`, `/tickets/retrieve/`) in an actual browser — desktop and mobile — since no part of this implementation has been visually verified in a real browser or screen reader. See `TESTING_CHECKLIST.md`.
- [ ] Send a real test email to at least Gmail and Outlook (web + desktop client if possible) and check it renders as intended, not just that it sends.
- [ ] Verify the Resend sending domain and the Stripe live keys only after all of the above pass in test mode.
- [ ] Re-confirm the Vercel plan's function `maxDuration` supports the values in `vercel.json` (the Hobby tier's 10s cap may be too tight for the webhook's PDF render + email send).

## Future Roadmap

### Phase 2
- Admin Dashboard, Orders, Ticket Search, Revenue Reporting, Customer Lookup — all queryable from the existing schema with no migration.
- Ticket Resend (admin-triggered, by order) — a third caller of the same `sendTicketsForOrder()` core already used by the webhook and the public Retrieve Ticket endpoint.
- Admin authentication via Supabase Auth + RLS (already "free" since Supabase is already in the stack).

### Phase 3
- QR Check-in / Ticket Validation — reads/writes `tickets.qr_token` and `tickets.status` (`valid → checked_in`), both already in the Phase 1 schema.
- Volunteer Mode, Live Attendance — scoped queries against `tickets.event_id` (already denormalized for exactly this).
- CSV Export, Analytics — plain SQL against existing tables once admin auth exists.
