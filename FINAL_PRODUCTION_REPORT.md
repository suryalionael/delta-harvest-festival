# Final Production Report — Delta Harvest Festival Ticketing (Phase 1.6)

Scope: a full, file-by-file audit of both repos (`Delta Harvest Festival` static site + sibling `delta-harvest-tickets-api`) plus the live Supabase project, run as a final QA gate before launch. Builds on Phase 1.5's live-infrastructure verification (schema applied, one real order run through the live Retrieve Ticket endpoint, Resend/PDF/Chromium/Upstash all confirmed working against production). This pass re-reads every source file, cross-checks the codebase against `PHASE1_IMPLEMENTATION_SUMMARY.md` (the closest thing this project has to a committed ADR — no standalone ADR files exist in either repo; in-code comments reference "ADR #13" / "ADR #21" / "architecture §N" as pointers into that document), and re-verifies live state.

No refactors were made for style. Two small, verified-safe changes were applied (below); everything else is a finding, not a change.

---

## Phase 1.7 Update — Non-Stripe Production Validation

A follow-up pass, explicitly scoped to skip every Stripe-related task (account setup, Checkout, webhook registration/testing, signing secrets — all treated as an intentionally-unavailable external dependency). Everything below either resolves a Phase 1.6 finding, corrects one, or adds new verification. Nothing here required a code rewrite; all changes are documentation, config-hygiene, or data cleanup.

**Corrections to Phase 1.6's own findings:**
- **The `engines.node` "drift" was a false alarm — the wrong side was flagged.** `package.json`'s `"24.x"` is correct, not stale. Node 20 reached upstream end-of-life 2026-04-30, Vercel is deprecating Node 20 for Functions on 2026-10-01, and the installed `@supabase/supabase-js@2.111.0` already requires Node 22+ (dropped 20 support in v2.110.0). `DEPLOYMENT.md` was the stale side and has been corrected to say 24.x; `GO_LIVE.md`'s action item has been marked resolved. `INFRASTRUCTURE_SETUP_REPORT.md` was left untouched as an accurate historical record of what was true when it was written.
- **The Phase 1.5 leftover test order (`DHF-ORD-000001`) has been deleted** from the live `orders`/`tickets` tables. Confirmed via `execute_sql`: 0 orders, 0 tickets, 1 correctly-seeded active event remain.

**New verification this pass:**
- **DNS, re-confirmed**: `api.deltaharvestfestival.ca` still returns no DNS record (`dig` empty). I have no Vercel CLI, no Vercel API token, and no Vercel MCP tool available in this environment, so I cannot add the custom domain myself. Per Vercel's own current documentation, the CNAME target for a subdomain is **unique per project** (e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com`) and is only revealed *after* the domain is added in the Vercel dashboard — there is no fixed value I can hand you in advance without guessing. **Exact manual steps required of you:**
  1. In the Vercel dashboard → `delta-harvest-tickets-api` project → Settings → Domains → Add Domain → enter `api.deltaharvestfestival.ca`.
  2. Vercel will display an exact CNAME record (host `api`, a project-specific target ending in `.vercel-dns.com` or `.vercel-dns-0NN.com`, with a trailing period). Copy it exactly as shown.
  3. Add that CNAME at whatever DNS provider hosts `deltaharvestfestival.ca`'s nameservers (the existing GitHub Pages apex `A` records and the `www` CNAME to `suryalionael.github.io` are untouched by this — it's a purely additive subdomain record).
  4. Wait for `dig api.deltaharvestfestival.ca` to resolve and `https://api.deltaharvestfestival.ca` to serve over HTTPS with a valid cert before doing anything else (webhook registration, static-site push).
- **Vercel production config**: no CLI/API/dashboard access exists in this environment, so production environment variables, per-environment (Production vs. Preview) value scoping, and the actual runtime Node version Vercel selected **could not be directly verified** — this is a real gap, not something to assume clean. What *was* confirmed: `vercel.json`'s three `maxDuration` overrides are present and match the documented values (30s webhook, 15s checkout, 30s retrieve); `.vercel/project.json` correctly links to `delta-harvest-tickets-api`; no secret-shaped strings (`sk_live`, `sk_test`, `whsec_`, Resend keys, JWTs) exist anywhere in either repo's trackable files.
- **Supabase, re-verified**: same schema/RLS/index/constraint/RPC/seed-data state as Phase 1.6, still fully matching `schema.sql`, still zero WARN-level advisor findings. Confirmed unchanged, not re-discovered from scratch.
- **Resend**: configuration in code is unchanged and correct (lazy client, documented fallbacks). **Domain verification could not be confirmed** — no Resend API key or dashboard access exists in this environment. As indirect DNS evidence (not proof): `dig` finds no `resend._domainkey` DKIM record, no SPF entry referencing Resend/Amazon SES, and no `send.` subdomain records for `deltaharvestfestival.ca` — only an unrelated Google site-verification TXT record and a generic hosting-provider DMARC record. This is consistent with the sending domain **not yet being verified in Resend**, but I cannot state that as a confirmed fact without dashboard access — treat it as a strong signal to check, not a verified conclusion.
- **Upstash, re-confirmed live**: 6 fresh requests against the live `tickets/retrieve` endpoint (distinct emails, to isolate the IP-based limiter) produced 5× `200` then a clean `429` on the 6th — rate limiting is still enforcing correctly in production, independent of Phase 1.5's original test.
- **Repo/file hygiene**: `.gitignore` (main repo) was missing entries for two local-tool-state paths that would otherwise land in a first commit — `.serena/` (this session's own MCP tool cache/config, analogous to the already-ignored `.claude/`) and a stray `dbeaver-ce-*.pdf` (a database-client installer PDF, unrelated to site content, almost certainly saved here by accident). Both are now ignored. One more file, `History of Old Stone Mill - short.pdf`, is untracked and not ignored — it's plausibly intentional historical reference material for the mill-history content (not ticketing-related either way), so it was **flagged, not removed**; it's your call. The API repo's `.gitignore` was already correct (`node_modules/`, `.env*`, `.vercel/` all covered) — confirmed no secret-shaped strings in anything it would commit.
- **Git preparation**: both repos are now in a clean, reviewed state for a first commit — nothing was committed or pushed, per instruction. Main repo: `git status` shows only the ticketing feature files, doc updates, and `.gitignore` — all expected. API repo: still zero commits (unchanged from Phase 1.6 — this is a "first commit still needs to happen" state, not a new problem); its whole tracked-file set is exactly the application source, config, and `.gitignore`, nothing stray.
- **ADR/Phase-leakage re-audit**: unchanged from Phase 1.6 — no Phase 2/3 code, no new architecture drift introduced by this pass's doc/config edits.

---

## Phase 1.7b Update — Live Resend Verification (Post-DNS)

Ran after DNS was configured and Resend's sending domain was reported verified. Still no Stripe touched, no `MOCK_PAYMENTS` used.

**DNS is now live**: `api.deltaharvestfestival.ca` resolves (CNAME → a project-specific `*.vercel-dns-017.com` target, exactly matching what Phase 1.7's DNS section predicted would happen) and serves the deployment correctly. This closes the Critical finding from earlier in this report (§1) — real visitors will now reach the API, not a DNS failure.

**Method**: two independent temporary orders were inserted directly in Supabase (never through Stripe, per instruction), each with a manually-assigned order number (`DHF-ORD-TEST0001`/`0002` — chosen specifically so this test **doesn't consume `order_number_seq`**, unlike Phase 1.5's approach), `tickets_generated_at` left `NULL` so the live code would generate the ticket for real. Each was immediately followed by a real call to `https://api.deltaharvestfestival.ca/api/tickets/retrieve` — the actual production custom domain, exercised end-to-end for the first time. Both test orders and their tickets were deleted immediately after; `orders`/`tickets` are back to empty.

**Results — mixed:**
- ✅ **Ticket generation, confirmed live through the real custom domain**: both calls correctly claimed the order, generated a real ticket (`DHF26-000002`, `DHF26-000003`) via the real RPC, and left the database in a correct, non-duplicated state. This is the first time this path was exercised through `api.deltaharvestfestival.ca` rather than the `.vercel.app` fallback — confirmed working identically.
- ❌ **Resend email delivery — NOT confirmed. Two independent attempts, ~10 minutes apart, both failed to arrive** at `suryalionael@gmail.com` (checked inbox and spam/promotions both times, by the account owner, not assumed). This is a real, reproducible failure, not a one-off — with a fresh test order and a full ticket-generation cycle each time, the only common failing link is the email send itself.
- **Root cause not identified — and cannot be, from this environment.** The `tickets/retrieve` endpoint always returns the same generic success message regardless of whether `sendTicketsForOrder()` actually succeeded (`api/tickets/retrieve.ts` catches and only logs email failures — this is correct, intentional enumeration-safety behavior, not a bug, but it means an external caller like me gets zero signal either way). I have no Vercel function-log access and no Resend dashboard/API access in this environment, so I cannot see the actual error. **You have both** — check Vercel's function logs for the `tickets/retrieve` invocations around the two test timestamps for a thrown error from `getResend().emails.send()`, and check the Resend dashboard's own send/activity log for these two attempts (they'll show as sent-with-error, rejected, or simply absent, which narrows the cause).
- **Most likely candidates, ranked**, for you to check directly (I can't check any of these myself):
  1. `RESEND_API_KEY` in Vercel's Production environment is missing, invalid, or revoked.
  2. `RESEND_FROM_EMAIL`'s domain doesn't actually match what's verified in Resend (e.g. verified `deltaharvestfestival.ca` at the domain level but the code sends from a subdomain that wasn't part of that verification, or vice versa) — the code's fallback is `tickets@deltaharvestfestival.ca`; confirm this exact address's domain shows fully verified (both SPF and DKIM green) in the Resend dashboard, not just "added."
  3. DNS propagation lag on the SPF/DKIM records themselves — "verified" in Resend's dashboard can sometimes precede full propagation; if the dashboard shows verified as of just now, allow more time and retry.
  4. Resend account-level restriction (new accounts/domains sometimes have sending limits or a review step before outbound mail is fully unblocked).

This directly changes the go-live recommendation — see the updated score/decision below.

---

## Changes Made This Pass (Phase 1.6)

1. **Removed two dead Stripe metadata fields** (`lib/payments/checkout.ts`): `festival_year` and `ticket_count` were written into every Checkout Session's metadata but never read anywhere — confirmed via a full-repo grep. `fulfill-order.ts`'s `requireMeta()` only reads `event_id`, `order_number`, `customer_name`, `adult_qty`, `kids_qty`, `adult_unit_price`, `kids_unit_price`, all of which remain untouched. Zero behavior change; `tsc --noEmit` clean.

2. **Fixed a dormant date-range formatting bug** (`lib/tickets/present.ts`'s `formatDateRange`): the function always rendered the start date as a bare day number (`"26–September 27, 2026"`), which only reads correctly when start/end fall in the same month and year. A future festival spanning a month or year boundary (e.g. Nov 30–Dec 1) would have rendered an ambiguous `"30–December 1, 2026"`; a single-day event would have rendered a redundant `"26–September 26, 2026"`. Fixed to use the full month name whenever start/end aren't in the same month+year, and a single full date for single-day events. **Verified byte-identical output for the currently seeded 2026 event** (`26–September 27, 2026`, unchanged) — this only changes behavior for event data that doesn't exist yet.

---

## Findings by Area

### 1. Critical — blocks a real launch today

**`api.deltaharvestfestival.ca` does not resolve.** Both `tickets-buy.js` and `tickets-retrieve.js` hardcode `API_BASE = 'https://api.deltaharvestfestival.ca/api'`. `dig` confirms this subdomain has no DNS record; the CNAME step in `DEPLOYMENT.md`'s Deployment Order (step 6) hasn't been done yet. The actual deployed API is currently only reachable at its Vercel-assigned URL (`https://delta-harvest-tickets-api.vercel.app`), which the static site never calls.

**Mitigating factor**: `tickets-buy.js`, `tickets-retrieve.js`, `tickets.css`, and the whole `tickets/` folder are still **untracked in git** (confirmed via `git status`) — none of this has been pushed to the live GitHub Pages site yet, so no real visitor has hit this failure. But the moment these files are committed and pushed, every purchase and every retrieval attempt will fail with a network error, 100% of the time, until the CNAME is added and propagates.

**This is an infrastructure/deployment-order issue, not a code defect** — the fix is exactly `DEPLOYMENT.md`'s existing Deployment Order steps 6–8 (add the `api` CNAME → wait for it to resolve → register the Stripe webhook against it), not a code change. Do not "fix" this by pointing the client scripts at the `.vercel.app` URL permanently; that would trade one fragile dependency (unregistered DNS) for another (Vercel's default URL, which is not the documented production architecture).

### 2. High — untested against live Stripe

The full **checkout → Stripe → webhook → fulfillment** chain has never been exercised against a real (even test-mode) Stripe account, in this session or the prior one. Neither session had browser automation available to drive Stripe's hosted Checkout page, and `MOCK_PAYMENTS` is deliberately hard-blocked from working on Vercel (by design — see `lib/security/local-dev-only.ts`). Phase 1.5 validated the shared downstream core (`ensureTicketsGenerated`, `sendTicketsForOrder` → PDF render via Chromium, Resend send, Upstash rate limiting) by inserting an order directly and calling the **live** Retrieve Ticket endpoint — that path is thoroughly proven. What remains genuinely unverified is narrower than it sounds: Stripe's own `constructEvent` signature verification, the `payment_status === 'paid'` guard, and `fulfillCheckoutSession`'s metadata parsing (`api/payments/webhook.ts`, `lib/payments/fulfill-order.ts`). All three are simple, well-typed, and reviewed line-by-line here with no defects found — but "reviewed" isn't "exercised against real Stripe," and the project's own `GO_LIVE_CHECKLIST.md` explicitly requires one full test-mode purchase before switching to live keys. That step is still outstanding and belongs after DNS/webhook registration (finding #1) is resolved.

### 3. Medium — operational risk

**`delta-harvest-tickets-api` has zero git commits.** `git log` returns "your current branch 'main' does not have any commits yet," yet the app is live on Vercel — meaning it was deployed directly from the local directory via the Vercel CLI, bypassing git entirely. There is no commit history to diff, blame, or `git revert` against for this repo. Vercel's own deployment-history rollback (redeploy a prior build) still works regardless of git, so this isn't a launch blocker, but it's a real gap for future maintainability and incident response — recommend committing the current working tree and pushing to a remote before or shortly after launch.

**`package.json` pins `engines.node: "24.x"`**, but `DEPLOYMENT.md` and `INFRASTRUCTURE_SETUP_REPORT.md` both document `20.x` as the target (and the latter says `20.x` was the fix applied). Since the API is confirmed live and responding correctly, whatever Node version Vercel is actually running works — but the docs and the pinned version have drifted apart. Reconcile one way or the other; don't leave them contradicting each other.

### 4. Low — cosmetic / already-known

- Testing in Phase 1.5 consumed `order_number_seq`'s and `ticket_number_seq`'s first values; the first real customer will receive `DHF-ORD-000002` / `DHF26-000002`, not `...0001`. Cosmetic only — the numbering scheme was never documented as requiring zero gaps.
- ~~One test order still sits in the live database~~ — **resolved in Phase 1.7**: `DHF-ORD-000001` and its ticket have been deleted; the `orders`/`tickets` tables are now empty.
- No standalone ADR documents exist in either repo; several code comments cite ADR/architecture section numbers (`ADR #13`, `ADR #21`, "architecture §6/§7/§8") that point at `PHASE1_IMPLEMENTATION_SUMMARY.md`'s prose rather than a numbered source. Not a defect, but a minor traceability gap if the numbering ever needs to be checked precisely.
- `History of Old Stone Mill - short.pdf` sits untracked at the main repo's root, unrelated to ticketing — flagged for your own judgment on whether it's intentional reference material or clutter; not modified.

### 5. Verified clean — no action needed

- **SQL objects**: all 3 tables, both sequences, 13 indexes (no redundant ones), all PK/FK/unique/check constraints, RLS enabled with zero public policies (by design), both RPCs (search_path correctly pinned to `public` after Phase 1.5's fix), zero triggers — all match `supabase/schema.sql` exactly. Live behavior re-confirmed: the partial unique `one_active_event` index still rejects a second active event.
- **Every endpoint** (`create-checkout-session`, `webhook`, `tickets/retrieve`, `dev/test-email`) reviewed line-by-line: consistent CORS handling, consistent rate-limiting, consistent error envelopes, correct method gating, correct fail-open behavior on Upstash errors, correct local-dev-only gating on the two dev/mock escape hatches (`isLocalDevEnvironment()` checked in both `mock-mode.ts` and `local-dev-only.ts`, both correctly refuse to activate when `process.env.VERCEL` is set).
- **Race conditions**: the atomic claim-then-generate pattern (`orders.tickets_generated_at`, `UPDATE ... WHERE tickets_generated_at IS NULL`) is correct and was re-confirmed live in Phase 1.5 — 5 repeated Retrieve Ticket calls against the same order produced exactly 1 order and 1 ticket, no duplicates. The one theoretical residual gap (a hard process kill between claiming and inserting, as opposed to a catchable JS exception) is already documented as an accepted trade-off and isn't newly discovered here.
- **Idempotency**: `insertOrder`'s unique-violation fallback correctly re-reads by `stripe_payment_intent` rather than erroring on a Stripe webhook retry.
- **Email templates**: both the PDF ticket template and the confirmation email template escape all dynamic values except the (deliberately unescaped) email subject line — correct, confirmed by direct code reading, matching Phase 1's already-completed XSS pass.
- **PDF generation**: `renderHtmlToPdf` correctly matches viewport/page size to the ticket template's dimensions; browser is always closed in a `finally` block (no leaked Chromium processes on error).
- **Ticket numbering**: `next_order_number()`/`next_ticket_numbers()` produce the documented formats; QR tokens are independently random (128-bit), never derived from the sequential numbers — correct separation per the documented security rationale.
- **Rate limiting**: confirmed live in Phase 1.5 — a 6th request within the sliding window returns a clean `429`, not a crash; fail-open behavior on Redis errors is correct and narrowly scoped (only network/API errors, not misconfiguration, which still fails loudly at cold start by design).
- **Accessibility**: `fieldset`/`legend` grouping, `aria-live` polite/assertive switching, stepper `disabled` state, focus-visible outlines all present and correctly wired across all four ticket pages.
- **Phase 2/3 leakage**: none. Every "Phase 2" / "Phase 3" / "admin" / "check-in" hit in the codebase is a comment describing future scope, not implemented code. `tickets.status`'s extra enum values (`checked_in`, `refunded`, `void`) are inert — Phase 1 code only ever writes `'valid'`.
- **Environment variables**: every var read by the codebase (via direct `process.env.X` or `requireEnv()`/SDK-internal lookup) has a corresponding entry in `.env.example`; no undeclared or unused required variables found.
- **Static site integration** (`index.html`, `mill-history.html`, `old-town-hall.html`, `festival-map.html`, `sitemap.xml`, `styles.css`): every diff is minimal, consistent, and matches the documented change exactly — no unrelated edits, no leaked scaffolding.
- **No dead files, no `TODO`/`FIXME` residue, no stray `console.log` outside one guarded dev-only path, no `any`-typed code, `tsc --noEmit` clean.**

---

---

## Phase 1.7c Update — Chromium Fix Applied, Redeployed, Re-Verified

Production logs (checked by the project owner, not visible to me) identified the actual root cause of the Phase 1.7b email failure: **not a Resend problem at all**. The real error was `Failed to launch the browser process! /tmp/chromium: error while loading shared libraries: libnss3.so` — Chromium itself was crashing on launch, before `sendTicketsForOrder()` ever reached the Resend API call. This makes sense in hindsight: `@sparticuz/chromium@123.0.1` (Chromium 123, released ~early 2024) was badly out of date against current serverless packaging.

**Fix applied, scoped exactly to the browser-launch implementation, nothing else:**
- `@sparticuz/chromium` 123.0.1 → **148.0.0**, pinned exactly (not `^`-ranged) — this package's own versioning explicitly warns breaking changes can land at the patch level, and 148.0.0 is also the last release before it dropped CommonJS support in 149.0.0, which this project's build still requires.
- `puppeteer-core` 23.11.1 → **^24.7.2** (resolved to 24.43.1), released within days of chromium 148.0.0.
- `lib/pdf/render.ts`: launch `args` now go through `puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' })` instead of passing `chromium.args` alone, matching `@sparticuz/chromium`'s current documented usage exactly. `headless: true` → `headless: 'shell'` to match.
- `page.setContent`'s `waitUntil: 'networkidle0'` no longer type-checks against the upgraded puppeteer-core (confirmed via Puppeteer's own changelog: networkidle options were removed from `setContent` specifically because they never worked correctly there) — replaced with `'load'`, the documented replacement and already the prior default.
- No business logic, email, Stripe, Supabase, or ticket code touched. `tsc --noEmit` clean. Committed and pushed to the API repo's GitHub remote.

**I could not deploy this myself** — no Vercel CLI, API token, or dashboard access exists in this environment, and the project isn't git-connected to Vercel (it was deployed via CLI directly from the local directory). The project owner redeployed manually and confirmed it live before this re-verification pass began.

**Re-verification results — mixed again:**
- ✅ **Ticket generation, re-confirmed**: a third temporary order (`DHF-ORD-TEST0003`) correctly generated `DHF26-000004` through the real `api.deltaharvestfestival.ca` domain.
- ✅ **Database integrity, re-confirmed**: exactly 1 order, 1 ticket during the test; both deleted afterward — 0/0 remaining.
- ✅ **Rate limiting, re-confirmed**: 5 requests allowed in the sliding window (counting an earlier reachability check), clean `429`s from the 6th request onward — no crash.
- ❌ **Email delivery — still not confirmed. Third consecutive live attempt, no delivery** at `suryalionael@gmail.com` (inbox and spam checked). Ticket generation and database integrity were correct; only the email send remains unconfirmed.

**What this does and doesn't tell us**: the Chromium/puppeteer-core version fix was real, correctly scoped, and verified-safe by every check available to me (type-check, exact-version pinning per the package's own warnings, matching the current official usage pattern) — but it has **not** resolved the customer-visible symptom. I have no way to determine, from this environment, whether:
(a) the exact same `libnss3.so` crash is still happening (meaning the fix didn't fully address it, or the redeployment didn't pick up the dependency changes), or
(b) Chromium now launches successfully and a *different* error is occurring further down the same call (a genuine Resend-side issue after all, or something else in `sendTicketsForOrder`).
**I need the actual current Vercel function log text for the `tickets/retrieve` invocation around `2026-08-03T14:21:22Z` (the `DHF-ORD-TEST0003` test) to tell these apart** — without it, any further code change would be a guess, which the task instructions explicitly rule out ("do not modify any code unless a new production issue is discovered" — discovering it requires seeing the actual error).

---

## Phase 1.8 Update — Real Root Cause Found, Deployed and Verified via Vercel CLI

This pass had genuine Vercel CLI access for the first time (previously unavailable in this environment — confirmed installed and authenticated as `lionael2006-9811` mid-session), which changed what could actually be verified.

**Root-caused properly, not guessed.** The Phase 1.7c fix (version upgrade) didn't work because it was never a version problem. Reading the actual installed `@sparticuz/chromium@148.0.0` source directly (`node_modules/@sparticuz/chromium/build/cjs/index.cjs`): the package only extracts its Amazon-Linux-2023 compatibility libraries — where `libnss3.so` and its siblings actually live — when an internal check, `isRunningInAmazonLinux2023()`, passes. One of its two branches (`process.env.VERCEL && nodeMajorVersion >= 20`) should hold on this deployment but demonstrably wasn't triggering extraction in production. Confirmed **empirically, locally** (not theoretically): instrumented a working copy of the package, traced the actual check result, and verified that forcing `AWS_LAMBDA_JS_RUNTIME` to a supported version string makes the same detection succeed via the package's other, AWS-native branch — `libnss3.so`, `libnspr4.so`, and `libnssutil3.so` then get correctly extracted, and a full local launch attempt gets past library resolution entirely (it only fails on the pre-existing, already-documented `ENOEXEC` — a Linux binary can't run on this local macOS machine, an unrelated platform limitation).

**Fix**: `lib/pdf/render.ts` now explicitly forces `AWS_LAMBDA_JS_RUNTIME` and sets `LD_LIBRARY_PATH` itself, rather than depending on the package's own fragile auto-detection and its import-ordering-sensitive side effect. No business logic, email, Stripe, Supabase, or ticket code touched.

**Deployed for real this time**: `vercel --prod` run directly from `/Users/lionaelsmac/Downloads/delta-harvest-tickets-api` (verified as the correct repo first — `pwd` and `git rev-parse --show-toplevel` both confirmed). Deployment succeeded (`readyState: READY`, `target: production`), correctly aliased to `https://api.deltaharvestfestival.ca`.

**Live re-verification against the real deployment:**
- ✅ **Database integrity**: ticket `DHF26-000005` generated correctly for a fourth temporary test order; 0 orders/0 tickets after cleanup.
- ✅ **Rate limiting**: still enforcing correctly post-redeploy (5 allowed, clean `429`s after).
- ✅ **Strong indirect evidence the Chromium crash is fixed**: the retrieve call took **8.6 seconds** — noticeably longer than every prior *failing* attempt (~4.8–6.2s) — consistent with a full successful render-and-send rather than a fast process-spawn crash. `vercel logs` (both the default view and `--level error`) showed **zero errors** for this invocation.
- ⚠️ **Log capture caveat, stated plainly**: `vercel logs` in historical-fetch mode returns only HTTP request metadata (`"logs":[]` on every entry, including ones known not to have thrown) — actual runtime `console.log`/`console.error` output apparently requires live `--follow` streaming, captured at the moment it's generated. A `--follow` session was started to catch this directly on a fresh test, but it hit my own recently-imposed rate limit before the request could be sent. This diagnostic was **not completed** — the evidence above is strong but indirect, not a directly-observed clean log line.
- ❌ **Email delivery — still not confirmed.** Fourth consecutive live attempt, no delivery at `suryalionael@gmail.com` (inbox and spam checked).

**What this actually means**: given ticket generation, database writes, and (per the evidence above) Chromium/PDF rendering all now check out, and email is still not arriving, **this now looks like a genuinely separate, Resend-specific problem** — not a downstream symptom of the Chromium crash. The ranked list of Resend-specific candidates from Phase 1.7b (API key validity, `RESEND_FROM_EMAIL`'s domain match, propagation lag, account-level restriction) is the right next place to look, ideally with a `--follow` log capture (outside this rate-limit window) or the Resend dashboard's own activity log for the exact test timestamps.

---

## Production Readiness Score (as of Phase 1.8): **7 / 10**

Up half a point from 6.5. The Chromium launch crash — the thing every prior pass in this project could not get past — now has strong, locally-verified evidence of being fixed, deployed for real (not just committed), and re-verified against live production via a working Vercel CLI. Not higher, because the customer-facing outcome — does a real order's confirmation email actually arrive — is still unconfirmed, now isolated to what looks like a distinct Resend-side cause rather than a Chromium one.

## Completed This Session (Phase 1.7 / 1.7b / 1.7c)

- Corrected the Node.js version finding (docs fixed to match the already-correct `24.x`, not the reverse).
- Deleted the leftover Phase 1.5 test order/ticket from the live database.
- Re-verified Supabase schema/RLS/indexes/constraints/RPCs/seed data — unchanged, still fully correct.
- Re-confirmed Upstash rate limiting live with a fresh 6-request test.
- **Confirmed DNS is now live** for `api.deltaharvestfestival.ca` and re-ran verification through the real production domain instead of the `.vercel.app` fallback.
- **Ran two real, live Resend delivery tests against production** (temporary Supabase-only test orders, real `tickets/retrieve` calls, no Stripe, no mock mode) — **both failed to deliver**. Ticket generation and database integrity were correct both times; only the email send is unconfirmed/failing.
- Confirmed no secrets are committable in either repo; tightened `.gitignore` in the main repo (`.serena/`, stray `dbeaver-ce-*.pdf`).
- Both repos committed; `delta-harvest-tickets-api` pushed to its private GitHub repo (`suryalionael/delta-harvest-tickets-api`). Main repo committed but **not pushed** (see Go-Live Decision below — this is now doubly justified).
- Re-confirmed no Phase 2/3 leakage and no new architecture drift.
- **Diagnosed and fixed the actual root cause identified from production logs** (Chromium failing to launch — `libnss3.so` missing) by upgrading `@sparticuz/chromium`/`puppeteer-core` to a current, compatible, still-CommonJS pairing and correcting the launch-args/headless-mode/waitUntil options to match. Scoped exactly to `lib/pdf/render.ts` + the two dependency files; typechecked clean; committed and pushed.
- **Re-ran the full live verification after the project owner redeployed** — DNS, ticket generation, database integrity, and rate limiting all reconfirmed working through the real production domain; email delivery still not confirmed (third consecutive failure).

## Remaining Manual Tasks (non-Stripe)

1. **Get the actual current Vercel function log text** for the `tickets/retrieve` invocation around `2026-08-03T14:21:22Z` (the `DHF-ORD-TEST0003` test). This is the single most valuable missing piece — it will show whether the `libnss3.so` crash is still happening (fix incomplete, or redeploy didn't pick up the dependency changes) or a different error is now occurring further down the same call (a genuine Resend-side issue). I cannot get this myself; no Vercel log access exists in this environment.
2. **Once the current error is known, fix that specific thing** (which may or may not require another code change) and re-run this same live test again — a temporary Supabase-only order plus a real `tickets/retrieve` call — before trusting it for a real customer.
3. **Manually confirm Vercel's production environment variables** (all present, no Preview values leaking into Production) — this requires dashboard or `vercel env pull` access this environment doesn't have.
4. **Push the static ticket pages to GitHub Pages** — only after email delivery is actually confirmed working, not before. Pushing now would put a purchase flow live where paying customers may not receive their tickets.
5. Optional: decide whether `History of Old Stone Mill - short.pdf` (unrelated to ticketing) should stay untracked, be gitignored, or be committed.

## Remaining Stripe-Only Tasks (explicitly out of scope this pass)

1. Stripe account/company setup and test-mode secret key.
2. Registering the `checkout.session.completed` webhook against the now-live `api.*` URL and setting `STRIPE_WEBHOOK_SECRET`.
3. One real end-to-end test-mode purchase (`4242...` test card) to prove the checkout→webhook→fulfillment chain against real Stripe — the one piece of the system this project's own `GO_LIVE_CHECKLIST.md` requires and no session so far has been able to exercise.
4. Switching to live Stripe keys and a final real/refunded purchase, only after everything above is green.

## Recommended Go-Live Decision: **Not Ready**

Unchanged. A real root cause was found and fixed (Chromium failing to launch — confirmed via production logs the project owner checked, not something I could see myself), and it was a legitimate, well-scoped fix: correct-version dependencies, matching the current official usage pattern, verified type-safe. But the customer-facing outcome hasn't changed — three consecutive live attempts, zero confirmed email deliveries. This is not a "minor caveat" or a dashboard checkbox that hasn't been clicked; it's a proven, reproducible functional gap in a piece the project's own `GO_LIVE_CHECKLIST.md` requires working before go-live ("Confirmation email received... do not skip actually opening it"). Do not push the static ticket pages live until a live test actually delivers an email. Everything else audited across all phases — schema, endpoints, templates, numbering, rate limiting, DNS, database integrity — remains solid; email delivery is the one open question, and the fastest way to close it is the current Vercel log text for the exact failing invocation.
