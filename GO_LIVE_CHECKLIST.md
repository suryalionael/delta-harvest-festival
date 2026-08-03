# Go-Live Checklist — Delta Harvest Festival Ticketing

Every item is manually checkable by a human. Nothing here has been checked off yet — this system has not been deployed. Work top to bottom; later sections assume earlier ones are done. See `DEPLOYMENT.md` for how to do each of these, and `TESTING_CHECKLIST.md` for the detailed step-by-step behind the test items.

## Infrastructure Stood Up

☐ Supabase project created, `schema.sql` run successfully with no errors
☐ Seeded event row's dates and prices confirmed correct for the real festival (not left as placeholder test data)
☐ RLS confirmed enabled on `events`, `orders`, `tickets` (no public policies)
☐ Resend account created, sending domain verification **completed** (not just started) — SPF and DKIM both show verified in the Resend dashboard
☐ Upstash Redis database created, REST credentials in hand
☐ Stripe account ready, test-mode secret key in hand
☐ `delta-harvest-tickets-api` deployed to Vercel
☐ `npm run check-env` passes against the deployed environment's variables (pull them locally first: `vercel env pull`)

## DNS & Domains

☐ `api` CNAME record added at the DNS provider
☐ DNS propagated — `dig api.deltaharvestfestival.ca` (or any DNS lookup tool) resolves to Vercel
☐ `https://api.deltaharvestfestival.ca` serves the deployment (not a Vercel "domain not configured" error)
☐ HTTPS works on the subdomain (Vercel provisions this automatically once the domain resolves — confirm no certificate warning)
☐ Existing `deltaharvestfestival.ca` apex domain and GitHub Pages are **unaffected** — spot check the homepage still loads normally

## Webhook

☐ Stripe webhook registered against `https://api.deltaharvestfestival.ca/api/payments/webhook` for `checkout.session.completed`
☐ Signing secret copied into `STRIPE_WEBHOOK_SECRET` in Vercel, and the function **redeployed** after setting it
☐ Stripe Dashboard's webhook log shows a successful test event (Stripe Dashboard has a built-in "send test webhook" button — use it) returning `200`

## Automated Smoke Tests

☐ `npm run smoke-test` (against the real deployed `API_BASE`) — all checks pass
☐ CORS preflight returns the correct `Access-Control-Allow-Origin`
☐ Invalid input on both endpoints returns proper `400` with the standard error envelope
☐ Webhook without a valid Stripe signature returns `400`, not a crash

## Manual Purchase Flow (test mode, real money never moves)

☐ Full purchase completed with Stripe's test card `4242 4242 4242 4242`
☐ Redirected to `/tickets/success/` after payment
☐ Order row appears in Supabase with correct `order_number`, quantities, and `payment_status = 'paid'`
☐ Correct number of ticket rows created, each with a unique `ticket_number` and `qr_token`
☐ **Confirmation email received** (check spam folder too) within a few minutes
☐ **PDF attached and opens correctly** — this is the one thing nothing else in this project could verify without a live deployment; do not skip actually opening it
☐ QR code on the PDF scans successfully with a phone camera
☐ Ticket number, name, date, and venue are all correct and legible on the PDF
☐ Declined-card test (`4000 0000 0000 0002`) correctly fails without creating an order
☐ Abandoning checkout (closing the tab / clicking back) correctly lands on `/tickets/cancel/` with no order created

## Retrieve Ticket

☐ Retrieving with the email from a real completed purchase sends a fresh email with the PDF
☐ Retrieving with a never-used email returns the **exact same** generic message (compare byte-for-byte, not just "looks similar")
☐ No email is sent for the never-used address

## Duplicate/Retry Safety

☐ Resending the same webhook event from the Stripe Dashboard's log is a no-op (no duplicate order, no duplicate tickets, no duplicate email)
☐ (If feasible) simulate two rapid concurrent deliveries of the same event and confirm ticket count still matches what was actually purchased

## Rate Limiting

☐ Exceeding the configured limit on `tickets/retrieve` returns `429`, not a crash
☐ Exceeding the configured limit on `create-checkout-session` returns `429`, not a crash
☐ A different IP is unaffected by another IP's rate limit

## Browser / Device / Accessibility

☐ Full flow completed once on desktop Chrome, once on desktop Safari
☐ Full flow completed once on a real iOS device, once on a real Android device
☐ Keyboard-only pass on `/tickets/` — every control reachable and operable, visible focus at every step
☐ Screen reader pass (VoiceOver or NVDA) confirms the ticket-selector fieldset/legend, stepper labels, and status/error messages are all announced correctly
☐ No console errors on any of the four ticket pages, in any tested browser
☐ Lighthouse (or equivalent) accessibility score reviewed on `/tickets/` — no critical/serious violations
☐ Zoomed to 200% — no lost or overlapping content

## Final Gate

☐ Every item above is checked
☐ Everyone who needs to know the ticketing system is going live has been told
☐ Support contact (`SUPPORT_EMAIL`) is a real, monitored inbox — not a placeholder
☐ Someone knows how to check the Vercel function logs and the Stripe Dashboard's webhook log if something goes wrong on the day

**Only after every box above is checked:**

☐ Stripe switched to **live** secret key in Vercel
☐ **Separate** live-mode webhook registered (test and live mode have independent webhooks and signing secrets in Stripe — this is easy to forget)
☐ One real, tiny, real-money purchase made and refunded (or a $0 test if your Stripe setup supports it) to confirm live mode actually works end-to-end before announcing ticket sales publicly

---

## Failure Recovery

What to do when each specific piece breaks, written for the moment it's actually happening (not just "check the logs"):

### Stripe webhook fails / stops delivering
- **Symptom**: Stripe Dashboard shows failed deliveries; customers pay but don't get tickets.
- **Customer impact is contained automatically**: the payment itself already succeeded in Stripe regardless of webhook health — no customer is charged twice or loses money. The only consequence is delayed ticket fulfillment.
- **Recovery**: fix the underlying cause (check Vercel function logs for the actual error — expired signing secret, a downstream Supabase/Resend outage, a code bug), then either wait for Stripe's automatic retry schedule or manually **Resend** the specific failed event(s) from the Stripe Dashboard's webhook event log. Resending is safe — the idempotency logic (unique `stripe_payment_intent`, the `tickets_generated_at` claim) guarantees it can't create duplicates.
- **If it's going to be down for a while**: consider temporarily disabling new checkouts (hide the `/tickets/` nav links) rather than letting customers pay into a queue of undelivered tickets — resolve the backlog, then re-enable.

### Email fails to send (Resend down, or domain verification lapses)
- **Symptom**: orders and tickets exist correctly in Supabase, but no confirmation email arrives.
- **Customer impact**: none to their payment or ticket validity — only the notification is missing.
- **Recovery**: fix the Resend issue (check their status page; re-verify the sending domain if DNS records were ever changed), then either wait for the customer to use **Retrieve Ticket** themselves, or manually trigger the same `sendTicketsForOrder()` path once a Phase 2 admin resend tool exists. For now, in a pinch, a developer with Supabase access can look up the order and ask the customer to use Retrieve Ticket.

### PDF generation fails (Chromium/Puppeteer error)
- **Symptom**: webhook logs show an error inside `renderHtmlToPdf`; no email goes out (the whole `sendTicketsForOrder` call fails together — there's no partial "email without PDF" state).
- **Customer impact**: order and tickets are still correctly recorded in Supabase; only the notification is missing, same as an email failure.
- **Recovery**: this is the scenario the Production Checklist's Chromium/Puppeteer verification step exists to catch **before** go-live. If it happens in production anyway: check Vercel function logs for the specific Puppeteer/Chromium error, check whether it's a version-compatibility issue (see `DEPLOYMENT.md`'s troubleshooting table) or a resource limit (function memory/timeout), and once fixed, the customer can self-serve via Retrieve Ticket (which calls the exact same render path, so don't consider it "fixed" until a Retrieve Ticket request actually succeeds).

### Vercel deployment fails
- **Symptom**: a deploy errors out, or a bad deploy goes live and starts erroring on real requests.
- **Recovery**: Vercel dashboard → Deployments → find the last known-good deployment → **Promote to Production**. This is instant and doesn't require a new git push or build. Fix the underlying issue in a new commit before attempting to deploy again.

### Supabase unavailable
- **Symptom**: every API request that touches the database fails (which is nearly all of them — checkout needs the active event, the webhook needs to write orders/tickets, retrieval needs to query orders).
- **Customer impact**: `create-checkout-session` would fail before a customer ever reaches Stripe (no payment risk), but a webhook arriving **during** a Supabase outage, for a payment that already succeeded, is the serious case — the payment is real but fulfillment can't complete.
- **Recovery**: Supabase outages are rare and typically brief (check Supabase's status page); Stripe's webhook retry schedule (automatic, over ~3 days) will keep retrying until Supabase is back, at which point fulfillment completes normally with no manual intervention needed. If a webhook delivery ages out of Stripe's retry window before Supabase recovers, it can still be manually resent from the Stripe Dashboard once things are healthy again.

### Upstash unavailable
- **Symptom**: rate-limit checks fail.
- **Customer impact**: none by design — both rate-limited endpoints **fail open** on a rate-limiter error (see `PHASE1_IMPLEMENTATION_SUMMARY.md`'s Production Readiness Pass), meaning an Upstash outage temporarily removes rate limiting rather than blocking ticket sales/retrieval. This is a deliberate tradeoff, not a bug — an Upstash outage is expected to be rare enough that a brief window of reduced abuse protection is preferable to blocking real customers.
- **Recovery**: no urgent action needed; monitor for abuse during the outage window if it's prolonged, otherwise nothing to do once Upstash recovers.
