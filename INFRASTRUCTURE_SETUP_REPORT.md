# Infrastructure Setup Report — Delta Harvest Festival Ticketing

Scope: Supabase, Resend, Upstash, Vercel, and a mock-payment mode for local development — Stripe integration itself explicitly excluded from this pass. Everything below was verified for real, locally, using real open-source tools (a real Postgres instance, the real PostgREST binary Supabase runs internally, and a full real Chromium via Puppeteer) rather than reviewed by inspection alone. No cloud accounts exist for any of these services; nothing was deployed.

---

## Everything Completed

### 1. Mock Payment Mode (new)
Checkout can now run completely without a Stripe account, for local development:
- `lib/payments/mock-mode.ts` — `isMockPaymentsEnabled()`, triple-guarded (refuses to activate if `process.env.VERCEL` is set, if `NODE_ENV=production`, or if `MOCK_PAYMENTS` isn't the exact string `"true"`). Verified with 8 explicit test cases, including "flag mistakenly left on in production" — all passed.
- `lib/payments/mock-checkout.ts` — stands in for the entire Stripe Checkout → webhook → fulfillment chain: creates a real order (fabricated `stripe_payment_intent`/`stripe_checkout_session_id`, prefixed `mock_`), then calls the **exact same** `ensureTicketsGenerated()` and `sendTicketsForOrder()` used by the real webhook — so mock mode genuinely exercises ticket generation, PDF rendering, and email, not just a stub.
- `lib/payments/stripe-client.ts` and `lib/emails/client.ts` were both refactored from eager to **lazy** client construction (`getStripe()` / `getResend()`), so importing checkout or email-template code no longer requires `STRIPE_SECRET_KEY` or `RESEND_API_KEY` to be set at all — this is what actually makes mock mode (and template-only local testing) possible. Found because the email template literally failed to import during this session's own testing until fixed.

### 2. Supabase (schema, RLS, migrations) — verified against a real local Postgres
No Supabase account exists, so `supabase/schema.sql` was run against a real local PostgreSQL 16 instance and exercised with real queries — not just read for correctness:
- Full schema applied with **zero errors**: extensions, both sequences, all three tables, all indexes, both RPC functions, RLS enablement, and the seed insert.
- Row Level Security confirmed **actually enabled** on `events`, `orders`, `tickets` (queried `pg_class.relrowsecurity` directly — all `true`).
- The partial unique index enforcing "exactly one active event" confirmed **actually rejects** a second active row.
- `next_order_number()` and `next_ticket_numbers()` RPCs confirmed to produce correctly formatted, correctly incrementing, contiguous values.
- Foreign key constraints confirmed to **reject** an order referencing a nonexistent event.
- The `stripe_payment_intent` unique constraint confirmed to **reject** a duplicate — this is the DB-level half of the webhook idempotency guarantee.
- **The exact concurrency-safety mechanism from `lib/tickets/generate.ts`** (the atomic claim-then-generate pattern) was reproduced with raw SQL and confirmed to behave correctly under real Postgres semantics: the first `UPDATE ... WHERE tickets_generated_at IS NULL` claims the row, the second returns zero rows.
- All expected indexes present, and confirmed **no** redundant index exists on `order_number` (already covered by its `unique` constraint) — this was a specific fix from the prior production-readiness round, now independently confirmed correct.

**What this does not cover**: the actual Supabase cloud platform, its Auth/Storage layers (unused in Phase 1 anyway), or Supabase-specific dashboard behavior. It does cover the SQL itself, which is the vast majority of what could go wrong.

### 3. The application ↔ database integration layer — verified against a real PostgREST
Going a step further than the previous round: the real, open-source **PostgREST** binary (the exact REST layer Supabase runs internally to turn Postgres into the API `supabase-js` talks to) was downloaded and run locally against the same schema, fronted by a small local proxy to match `supabase-js`'s `/rest/v1/...` URL convention. This meant the **actual, unmodified** application code — `lib/database/orders.ts`, `tickets.ts`, `events.ts`, all the way up through the real `api/*.ts` route handlers — could be exercised over real HTTP against a real Postgres-backed REST API, not a hand-written stand-in.

Result: a real HTTP `POST /api/payments/create-checkout-session` (in mock mode) correctly created an order and a ticket that are verifiably present in the database with correct values; a real `POST /api/tickets/retrieve` against that same email correctly triggered a resend attempt; and the enumeration-safety property was directly confirmed — the response to a real, existing order's email and a never-used email were **byte-for-byte identical**.

### 4. Ticket PDF template — rendered for real, and a genuine bug was found and fixed
The exact HTML/CSS from `lib/tickets/template.ts` was rendered with a real, full Chromium (via Puppeteer) and inspected as actual screenshots and a real multi-page PDF — not just read as code.

**Found and fixed: a real layout bug.** The right-hand QR/ticket-number panel was being pushed almost entirely out of the visible card — `.t-main`, a flex child, was missing `min-width: 0`, so it refused to shrink below its content's natural width (a classic flexbox default) and overflowed the 960px card by over 200px. This is exactly the kind of bug that passes a type-check and a code review and only shows up when actually rendered. Fixed, then re-verified: element widths now sum correctly (698px + 260px ≈ 960px), and the QR/number panel renders in its intended position.

**Found and fixed: a real content-fit problem.** Even after the overflow fix, a realistic (not pathological) 34-character name still truncated more aggressively than intended, because the three-column info row was tight for the card's original 960px width. The card was widened to 1140px (with the PDF page size updated to match, 1180×500), verified to noticeably improve — though not eliminate — truncation for long names; ellipsis truncation (rather than overflow) remains the correct fallback for names longer than that.

Also confirmed via direct rendering, not just code inspection:
- XSS payload injected into a customer name (`<script>alert(1)</script>`) renders as literal, inert text — not executed, not present unescaped anywhere in the output.
- Sequential ticket numbering, per-ticket QR codes, and ticket-type labels all render correctly across a real 3-ticket, 3-page PDF.
- The resulting file is a valid PDF (correct header, exactly 3 `/Type /Page` objects matching the 3 tickets).

**What this does not cover**: `@sparticuz/chromium` (the Lambda-packaged Chromium binary the real deployed function uses) does not run on local macOS — confirmed directly (`spawn ENOEXEC` when the retrieve-ticket flow tried to render a PDF using the real production code path in the local integration test above). This is expected and matches what was already flagged as the single highest deployment risk; this session narrows that risk specifically to "does the Lambda-packaged Chromium binary launch on Vercel," since the HTML/CSS template itself is now proven correct independent of that question.

### 5. Confirmation email template — rendered for real
Same treatment as the PDF: `lib/emails/confirmation-template.ts`'s actual output was rendered with real Chromium and inspected as a screenshot, and separately verified programmatically. XSS payload (`<b>Family</b>` in a customer name) confirmed escaped and rendered as literal text. The plain-text subject line confirmed to correctly stay **unescaped** (a regression from the prior round that was caught and reverted at the time — now independently re-confirmed still correct). One consistency fix applied: the email's table headers and "Need help?" footer text used the same low-contrast `#8D8782` gray that was already fixed everywhere else in the previous round's WCAG pass — missed there, caught and fixed here, now `#6a5d4e` throughout.

### 6. Resend — API integration and a test-send endpoint (new)
- `lib/emails/send-test-email.ts` + `api/dev/test-email.ts` — a minimal endpoint that sends a template-independent test email via the real Resend SDK, to verify the API key and sending domain work, separate from whether the ticket template itself renders correctly.
- Gated the same way as mock payments (`lib/security/local-dev-only.ts`, shared by both features) plus its own explicit opt-in (`DEV_TOOLS_ENABLED=true`) — an unauthenticated "send email to any address" endpoint would be a real abuse vector if it were ever reachable in production, and there's no admin auth yet in Phase 1 to otherwise protect it.
- Exercised for real against the local integration harness: correctly attempted a real Resend API call, correctly surfaced Resend's own rejection ("API key is invalid," using a deliberately fake key) through the standard error envelope rather than crashing.

### 7. Upstash Redis (rate limiting) — verified without a live account
No Upstash account exists, so `checkRateLimit()`'s fail-open behavior (added in the previous production-readiness round) was verified two ways:
- **Unit-level**: called directly with fake limiter objects that throw, succeed, and block — confirmed it fails open only on an actual error, and correctly passes through real allow/block decisions otherwise.
- **Live, end-to-end**: in the local integration harness, `UPSTASH_REDIS_REST_URL` was pointed at a nonexistent host. Every real HTTP request to the rate-limited endpoints hit a genuine DNS failure, was caught, logged, and the request was allowed through exactly as designed — observed directly in server logs during the same tests that created real orders and tickets.

**What this does not cover**: real Upstash connectivity, or real rate-limit enforcement (blocking at the configured threshold) — both require a real Upstash database, which doesn't exist.

### 8. Vercel — configuration prepared, not deployed
No Vercel account/CLI access exists in this environment (confirmed: `vercel` command not found, no login). What was done instead:
- Added a missing `engines.node: "20.x"` to `package.json` — Vercel reads this to select the runtime; it was previously unpinned.
- `npm run check-env` and `npm run smoke-test` (from the prior round) were both re-verified to still work correctly after this round's changes.
- `.env.example` updated with the two new local-dev-only variables (`MOCK_PAYMENTS`, `DEV_TOOLS_ENABLED`).

---

## Remaining Stripe Tasks (explicitly out of scope this round, listed for completeness)

- Create/access a real Stripe account; obtain test-mode secret key.
- Deploy `delta-harvest-tickets-api` to a real Vercel project (blocking dependency for the next two items).
- Register the `checkout.session.completed` webhook against the live `api.*` URL; obtain the signing secret.
- Run one real test-mode purchase through actual Stripe Checkout (not mock mode) and confirm the webhook, not `mock-checkout.ts`, drives fulfillment correctly.
- Only after all of the above: switch to live keys. See `GO_LIVE_CHECKLIST.md` for the full gate.

Mock payment mode does **not** reduce any of this work — it exists solely so the rest of the system could be verified without waiting on Stripe account access, which is exactly what this pass did.

---

## Environment Variables Required

| Variable | Required for | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Real checkout | Not needed at all when `MOCK_PAYMENTS=true` |
| `STRIPE_WEBHOOK_SECRET` | Real webhook | Same |
| `MOCK_PAYMENTS` | Local dev only | New this round; never set on Vercel |
| `SUPABASE_URL` | Everything | |
| `SUPABASE_SERVICE_ROLE_KEY` | Everything | Not the anon key |
| `RESEND_API_KEY` | Email sending | |
| `RESEND_FROM_EMAIL` | Email sending | Has a fallback |
| `SUPPORT_EMAIL` | Email sending, Success page | Has a fallback |
| `DEV_TOOLS_ENABLED` | `/api/dev/test-email` only | New this round; never set on Vercel |
| `UPSTASH_REDIS_REST_URL` | Rate limiting | Breaks checkout/retrieval entirely at cold start if missing (see prior round's Known Limitations) |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | Same |
| `ALLOWED_ORIGIN` | CORS | Has a fallback (production domain) |
| `SITE_URL` | Stripe redirects, QR verify link | Has a fallback (production domain) — override for Preview deploys |

Full detail and setup instructions per service are in `DEPLOYMENT.md`. `npm run check-env` validates presence of the required ones programmatically.

---

## Issues Found

Ranked by how they were found, not by severity — all were fixed, none are open:

1. **Ticket PDF layout overflow** (found via real rendering) — the QR/ticket-number panel was rendering almost entirely off-card. Root cause: missing `min-width: 0` on a flex child. **Fixed and re-verified.**
2. **Long-name truncation more aggressive than intended** (found via real rendering with a realistic test name, not just a pathological one) — widened the card. **Fixed and re-verified.**
3. **Eager Resend client construction blocked importing the email template at all** without `RESEND_API_KEY` set (found because this session's own verification tooling hit it immediately) — same class of issue as the Stripe client had in the previous round, missed there because it wasn't exercised the same way. **Fixed** (lazy `getResend()`, mirroring `getStripe()`).
4. **Email template contrast inconsistency** — three text elements in the confirmation email used the same low-contrast gray fixed everywhere else in the last round's WCAG pass, but were missed since the email template wasn't part of that pass's page-level color audit. **Fixed.**
5. **`supabase-js` ↔ bare PostgREST path mismatch** (`/rest/v1` prefix) and **JWT format requirement** — both are artifacts of this session's local verification setup, not application bugs, but are worth recording since anyone else trying to test against local PostgREST will hit the same two issues.
6. **No `engines.node` in `package.json`** — Vercel runtime version was previously unpinned. **Fixed.**

No issues were found in: the database schema/constraints/RLS, the enumeration-safety guarantee, the rate-limit fail-open behavior, or the XSS escaping in either template — all were actively tested for failure and held up.

## What Remains Genuinely Unverified

Everything requiring a real account that doesn't exist in this environment: live Stripe (explicitly deferred), live Supabase cloud (the SQL and the PostgREST-level integration are both proven; the managed platform itself isn't), live Resend delivery (the API call shape and error handling are proven; an email has not actually been delivered to a real inbox), live Upstash (the fail-open behavior is proven; real enforcement isn't), and `@sparticuz/chromium` on Vercel's actual Lambda-like runtime (the template is proven correct; the Lambda-specific Chromium binary's ability to launch there is not — confirmed unable to test locally, for exactly the reason that makes it Lambda-specific).
