# Delta Harvest Festival Ticketing — Testing Checklist

Step-by-step verification for Phase 1. None of this has been run yet — see `PHASE1_IMPLEMENTATION_SUMMARY.md`'s Production Checklist for why. Run in test mode (Stripe test keys, a scratch Supabase project, Resend's sandbox/test domain) before ever touching live keys.

Prerequisites: `delta-harvest-tickets-api` deployed somewhere reachable (Vercel preview deploy is fine), `supabase/schema.sql` run against a test Supabase project, all env vars set, Stripe CLI installed (`stripe login`), and the static pages pointed at that deployment's URL (temporarily edit the `API_BASE` constant in `tickets-buy.js`/`tickets-retrieve.js`, or serve locally with it overridden).

---

## ✓ Purchase Flow

1. Open `/tickets/`. Select 1 Adult ticket — subtotal should read `$10.00 CAD`.
2. Fill in a real name and a real, checkable email address.
3. Click **Proceed to Secure Checkout** — should redirect to a Stripe-hosted checkout page within a couple seconds.
4. Pay with Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC, any postal code.
5. Confirm redirect to `/tickets/success/` with the static "Thank you" content.
6. In Supabase, confirm: one new row in `orders` (`payment_status = 'paid'`, `order_number` like `DHF-ORD-000001`, `adult_qty = 1`, `adult_unit_price = 1000`), and one new row in `tickets` (`ticket_number` like `DHF26-000001`, `status = 'valid'`, a 32-character hex `qr_token`).
7. Confirm the confirmation email arrives at the address used, with the PDF attached, within a couple minutes.

## ✓ Failed Payment

1. Start checkout, use Stripe's declined-card test number `4000 0000 0000 0002`.
2. Confirm Stripe shows a decline message and does **not** redirect to `/tickets/success/`.
3. Confirm no `checkout.session.completed` webhook fires (check the Stripe Dashboard's webhook log) and no `orders` row was created.
4. Confirm the customer can retry with a working card without needing to reload `/tickets/`.

## ✓ Cancelled Payment

1. Start checkout, then click Stripe Checkout's back/close control instead of paying.
2. Confirm redirect to `/tickets/cancel/`, not `/tickets/success/`.
3. Confirm no order was created and no email was sent.
4. Confirm the **Return to Tickets** button on the cancel page goes back to `/tickets/`.

## ✓ Stripe Retry (webhook delivery failure)

1. Temporarily break the webhook (e.g. redeploy with the handler returning a 500, or point Stripe's webhook URL at a wrong path) and complete a real test purchase.
2. Confirm Stripe's Dashboard shows the delivery failed and is queued for automatic retry.
3. Restore the correct webhook URL/handler.
4. Confirm the retried delivery succeeds, exactly one `orders` row and the correct number of `tickets` rows exist (not duplicated), and exactly one confirmation email was sent.

## ✓ Duplicate Webhook Delivery

1. In the Stripe Dashboard, find a `checkout.session.completed` event that already succeeded and use **Resend** to redeliver it manually.
2. Confirm the response is `200` and processing is a no-op — no second order, no second set of tickets, no second email.
3. Repeat with the Stripe CLI: `stripe events resend evt_...` for the same event ID, and confirm the same no-op result.
4. (If you can simulate true concurrency) fire the same event twice in rapid succession and confirm the ticket count for that order still matches what was actually paid for — this is the specific race the `tickets_generated_at` claim column exists to prevent.

## ✓ Email Resend (via webhook failure)

1. Temporarily break the Resend API key (or the confirmation template) so `sendTicketsForOrder` throws during the webhook.
2. Complete a test purchase. Confirm the order and tickets are still created in Supabase (email failure must not block fulfillment) and the webhook still returns `200`.
3. Restore Resend. Use **Retrieve Ticket** with that order's email and confirm the customer now receives their confirmation email via the resend path.

## ✓ Retrieve Ticket

1. Go to `/tickets/retrieve/`, enter the email from a real completed order, submit.
2. Confirm the response message is generic ("If tickets are associated with that email address, we've sent them…") and a fresh email with the PDF arrives.
3. Enter an email that has **never** purchased anything, submit.
4. Confirm the response message is **character-for-character identical** to step 2's — this is the whole point of the enumeration protection. No email should be received for this address (nothing was found).
5. Buy two separate orders with the same email address, then retrieve — confirm **two** emails arrive, each mentioning "we found 2 separate orders."

## ✓ Invalid Email

1. On both `/tickets/` and `/tickets/retrieve/`, submit with an empty email field, then `notanemail`, then `a@b` (no TLD).
2. Confirm each is rejected client-side with "Please enter a valid email address" and no network request is sent (check DevTools' Network tab).
3. Bypass the client and POST directly to the API (`curl`/Postman) with a malformed email — confirm a `400 VALIDATION_ERROR` with the standard `{success:false,...}` envelope, not a raw 500.
4. POST an email containing `%` or `_` (e.g. `%@gmail.com`) to `/api/tickets/retrieve` directly and confirm it does **not** match multiple real customers' orders — exact-match lookup, not wildcard `ILIKE`.

## ✓ Rate Limiting

1. Script 6+ rapid POSTs to `/api/tickets/retrieve` from the same source within 15 minutes — confirm the 6th+ requests return `429 RATE_LIMITED` with the standard error envelope, not a crash.
2. Same for `/api/payments/create-checkout-session` past 10 requests / 10 minutes.
3. Confirm a legitimate request from a *different* IP isn't affected by another IP being rate-limited.
4. If possible, verify the "fail open" behavior: temporarily point `UPSTASH_REDIS_REST_URL` at an unreachable host and confirm checkout/retrieval still work (rather than hard-failing) while an error is logged.

## ✓ QR Generation

1. Open a received ticket PDF and scan the QR with a phone camera or any QR reader app.
2. Confirm it decodes to a URL of the form `https://deltaharvestfestival.ca/tickets/verify/?t=<64-char-hex-ish string>` (this page will 404 today — expected, Phase 3 scope — just confirm the QR itself decodes correctly).
3. Generate two tickets in the same order and confirm their QR codes decode to **different** tokens.
4. Confirm the token in the QR does **not** match or trivially derive from the printed ticket number (e.g. `DHF26-000001`) next to it.

## ✓ Multiple Tickets / Adult+Kids Combinations

1. Purchase 1 Adult only — confirm 1 ticket, correct type/price.
2. Purchase 1 Kids only — confirm 1 ticket, correct type/price ($5.00).
3. Purchase 3 Adult + 2 Kids in one order — confirm 5 tickets total, sequential ticket numbers, correct per-type pricing, and the PDF has exactly 5 pages (one per ticket) with no clipped/overlapping content on any page.
4. Attempt 0 Adult + 0 Kids — confirm the submit button stays disabled and no request is possible.
5. Attempt to push a quantity stepper past 20 — confirm the `+` button disables at 20 and a direct API request with `adultQty: 21` is rejected with `400 VALIDATION_ERROR`.

## ✓ Mobile

Test at minimum on one real iOS Safari and one real Android Chrome device (or accurate emulation):
1. `/tickets/` — steppers are easily tappable (44×44px targets), subtotal updates correctly, form is usable without horizontal scrolling, nav hamburger menu opens/closes correctly and includes the new Tickets item.
2. Checkout redirect and Stripe's own mobile checkout UI complete normally.
3. `/tickets/success/`, `/tickets/cancel/`, `/tickets/retrieve/` — text is legible without zooming, buttons are tappable, no layout overflow at narrow widths (test down to ~360px).
4. Confirmation email renders correctly in the iOS Mail app and Gmail's Android app.

## ✓ Desktop

1. All four pages at common widths (1280px, 1440px, 1920px) — no excessive whitespace or awkward line lengths, `.tix-card` content stays centered and readable.
2. Keyboard-only pass (see Accessibility below) on a desktop browser.
3. Print preview (Cmd/Ctrl+P) of a downloaded ticket PDF — confirm it fits sensibly on both Letter and A4 paper via "fit to page" (the PDF's page size is a custom 1000×500px landscape to match the ticket's proportions, not literally A4/Letter — this is intentional, verify only that it prints legibly, not that it's pixel-for-pixel A4).
4. Print (or print-preview) a ticket in grayscale/black-and-white and confirm the ticket number, name, and QR code are all still clearly legible.

## ✓ Accessibility

1. **Keyboard only** (no mouse) on `/tickets/`: Tab through nav → hero → ticket steppers → name/email fields → submit button, in a logical order. Steppers must be operable with Enter/Space. Confirm a visible focus outline on every interactive element.
2. **Screen reader** (VoiceOver on macOS/iOS, or NVDA on Windows) on `/tickets/`: confirm the "Choose Your Tickets" fieldset/legend is announced when entering that group, each stepper button's label is read ("Increase adult tickets"), and the live quantity `<output>` announces its new value after a click.
3. Trigger a validation error (e.g. submit with no name) and confirm a screen reader announces it immediately (assertive/alert), not silently.
4. Successfully submit Retrieve Ticket and confirm the generic confirmation message is announced (polite/status).
5. Run an automated pass (axe DevTools, Lighthouse accessibility audit, or WAVE) against all four pages and confirm no critical/serious violations, particularly around the color-contrast fixes made in this round.
6. Zoom the browser to 200% and confirm no content is lost or overlapping.

## ✓ Browser Compatibility

Test the full purchase flow (or at minimum, page rendering + form interaction) in:
- Chrome (current)
- Safari (current, macOS and iOS)
- Firefox (current)
- Edge (current)

Specifically watch for: `<fieldset>`/`<output>` rendering differences, CSS `clamp()` support (should be universal in current browsers, but verify), and the `fetch`-based form submission (no polyfills are included — this targets evergreen browsers only, consistent with the rest of the site).

## ✓ Production Deployment

Covered in detail in `PHASE1_IMPLEMENTATION_SUMMARY.md`'s **Production Checklist** and **Deployment Checklist** — repeated here as a final gate:
1. Headless-Chromium PDF rendering verified working on the actual Vercel deployment (not just locally/type-checked).
2. DNS (`api.` CNAME) resolves and the Vercel domain is verified.
3. All environment variables set in Vercel, including Upstash (a missing Upstash var breaks checkout entirely at cold start — see Known Limitations).
4. Stripe webhook registered against the live `api.*` URL with the correct signing secret.
5. Resend sending domain verified (SPF/DKIM).
6. Full end-to-end test-mode purchase completed successfully (this whole checklist, effectively) before switching to Stripe live keys.
7. This repo's static file changes deployed via the normal GitHub Pages flow.
