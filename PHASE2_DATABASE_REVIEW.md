# Phase 2 — Database Review

Status: **Approved, with amendments — Sprint 2.1 migrations below.**

**Revision note (post-approval):** the originally-proposed `admin_users` allow-list table is replaced with a `profiles` table carrying a real role (`SUPER_ADMIN`/`ADMIN`/`VOLUNTEER`), specifically so Phase 3 can reuse the same authentication system for check-in staff instead of building a second one. The `admin_audit_log` action vocabulary is finalized (not just sketched) and logging begins in Sprint 2.1, not deferred to a later sprint. See `PHASE2_ARCHITECTURE.md` §3, §6, §7 for the reasoning.

Verified live on 2026-08-04 against Supabase project `zcohmiqvkcaempgafeuh` via direct schema inspection and the security/performance advisors (not just read from Phase 1 docs — cross-checked against the running database).

---

## 1. Current schema (as-is, do not modify)

Three tables, three migrations applied to date:

```
20260803073142  phase1_ticketing_schema
20260803073300  pin_search_path_on_numbering_functions
20260803073338  fix_search_path_pin_to_public
```

### `events` (1 row today)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` |
| `name` | text | |
| `year` | int4 | |
| `venue` | text | |
| `start_date` / `end_date` | date | |
| `adult_price` / `kids_price` | int4 | cents; source of truth for pricing, snapshotted onto `orders` at purchase time |
| `is_active` | bool, default `true` | partial unique index enforces **at most one active event at a time** |
| `created_at` | timestamptz | |

### `orders` (0 rows today — pre-launch)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `event_id` | uuid, FK → `events.id` | |
| `order_number` | text, **unique** | `DHF-ORD-000001` via `next_order_number()` RPC |
| `stripe_payment_intent` | text, **unique** | webhook idempotency backbone |
| `stripe_checkout_session_id` | text, **unique** | |
| `stripe_customer_id` | text, nullable | |
| `stripe_receipt_url` | text, nullable | |
| `customer_name` | text | |
| `customer_email` | text | normalized lowercase at insert |
| `adult_qty` / `kids_qty` | int4, default 0 | |
| `adult_unit_price` / `kids_unit_price` | int4 | price **snapshot**, not a live join to `events` |
| `total_amount` | int4 | |
| `payment_status` | text, check `IN ('paid','failed')` | deliberately narrow — no `refunded` value exists yet |
| `tickets_generated_at` | timestamptz, nullable | atomic fulfillment claim (`UPDATE ... WHERE tickets_generated_at IS NULL`) |
| `created_at` | timestamptz | |

### `tickets` (0 rows today)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `order_id` | uuid, FK → `orders.id` | |
| `event_id` | uuid, FK → `events.id` | denormalized for Phase 3 scoped queries |
| `ticket_type` | text, check `IN ('adult','kids')` | |
| `ticket_number` | text, **unique** | `DHF26-000001` via `next_ticket_numbers()` RPC |
| `qr_token` | text, **unique** | 128-bit random, independent of sequential numbering |
| `status` | text, check `IN ('valid','checked_in','cancelled','refunded','void')`, default `'valid'` | only `'valid'` is ever written in Phase 1 — the rest are reserved for Phase 3 (check-in) and future refund/cancel flows |
| `created_at` | timestamptz | |

### RLS state (verified via advisor)

All three tables have RLS **enabled with zero policies** — confirmed as `INFO`-level (not `WARN`) findings, meaning this is a recognized, intentional deny-all posture, not an oversight. Only the service-role key (used exclusively server-side in the API project) can read or write. **Do not add RLS policies as part of Phase 2** — see the reasoning in `PHASE2_ARCHITECTURE.md` §2/§3 for why the admin dashboard should go through the API layer instead of a policy-scoped anon-key client.

### Advisor findings (informational only, no action required)

- `unused_index` on `orders.event_id` and `tickets.event_id` — expected, since there are 0 rows and the app hasn't gone through a real purchase cycle yet. Not a Phase 2 concern; will resolve itself as real query patterns run, or can be revisited after Festival Day if still unused.
- No security `WARN`/`ERROR` findings of any kind.

### RPCs

`next_order_number()` and `next_ticket_numbers()` — both `search_path` pinned to `public` (fixed in the second/third migrations after an initial advisor warning). Exist because PostgREST can't call `nextval()` directly. **Phase 2 does not need to touch these** — nothing in the admin dashboard generates new orders or tickets.

---

## 2. Schema additions needed for Phase 2

Two new tables. Nothing about the existing three tables changes in Sprint 2.1 — this is additive-only, consistent with how Phase 1 itself was built (`create table if not exists` throughout). (§4 below covers what *will* need to change in `events` when Settings ships, later.)

### `profiles` (new — replaces the originally-proposed `admin_users`)

Authorization + role — being in this table with an active row is what makes a Supabase Auth identity an admin, and the role determines what they can do.

```sql
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('SUPER_ADMIN', 'ADMIN', 'VOLUNTEER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- **Role semantics** (Sprint 2.1 only *authenticates* against these; per-role authorization on individual actions is layered in as later sprints add the actions):
  - `SUPER_ADMIN` — full access, including future role management (promoting/demoting other profiles) and event editing (Settings).
  - `ADMIN` — day-to-day operations: Dashboard, Orders, Tickets, Reports. No role management.
  - `VOLUNTEER` — the Phase 3 check-in role. Narrow access: ticket lookup + check-in only, once that exists. Included now (rather than added later) specifically so Phase 3 doesn't need a `profiles` schema change to onboard scanner staff — it only needs new endpoints that check for this role.
- `is_active` lets access be revoked (e.g. after the festival, or if someone's role should be pulled) without deleting their audit trail — `admin_audit_log.actor_id` references `profiles.user_id`, and deleting a profile would either cascade-delete or orphan that history. Deactivating, not deleting, is the correct operation here.
- `updated_at` exists for the future role-change endpoint (`SUPER_ADMIN`-only) to stamp — not written anywhere in Sprint 2.1.
- RLS: enable, no public policies (same deny-all pattern as the other three tables) — this table is also only ever read/written by the service-role key, from the admin auth middleware.
- Provisioning the first admin is a manual one-off via the Supabase Auth Admin API (create the `auth.users` row, then insert the matching `profiles` row with `role = 'SUPER_ADMIN'`), not a signup flow — see `PHASE2_ARCHITECTURE.md` §3.

### `admin_audit_log` (new)

```sql
create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(user_id),
  action text not null check (action in (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'VIEW_ORDER',
    'VIEW_TICKET',
    'RESEND_EMAIL',
    'REGENERATE_PDF',
    'EXPORT_REPORT',
    'UPDATE_EVENT',
    'VOID_TICKET',
    'CHECK_IN_TICKET'
  )),
  target_type text check (target_type in ('order', 'ticket', 'event', 'auth', 'report')),
  target_id uuid,
  ip text,
  metadata jsonb,                    -- small structured context, e.g. which email a resend went to
  created_at timestamptz not null default now()
);

create index admin_audit_log_actor_idx on admin_audit_log (actor_id);
create index admin_audit_log_target_idx on admin_audit_log (target_type, target_id);
create index admin_audit_log_created_at_idx on admin_audit_log (created_at desc);
```

- **Controlled vocabulary, enforced in Postgres, not just TypeScript.** The `action` check constraint is the source of truth; `lib/admin/actions.ts` in the API repo defines the matching TypeScript union type. No caller can insert a free-text action string — see `PHASE2_ARCHITECTURE.md` §6 for why each value is in the list, including the two (`VOID_TICKET`, `CHECK_IN_TICKET`) that no Sprint 2.1 code writes yet.
- `actor_id` is **nullable**, not `not null` as originally proposed — a `LOGIN_FAILED` row for a wrong password (or an email with no `profiles` row at all) has no established identity to attribute it to. `target_type`/`target_id` are also nullable for the same reason (`LOGIN_SUCCESS`/`LOGIN_FAILED` have no order/ticket/event target — hence `'auth'` in the target-type list).
- `ip` added (not in the original proposal) — meaningful for `LOGIN_FAILED` in particular, to spot a single source hammering the login endpoint.
- Insert-only from the API layer, via one shared `logAudit()` helper (`lib/admin/audit.ts`) — never an ad-hoc insert from individual route handlers.
- No read/delete path needed yet beyond an admin viewing an order's/ticket's own history — a simple filtered query, not a new module.
- RLS: enable, no public policies, same as everything else.

### `events`, `orders`, `tickets` — unchanged in Sprint 2.1, but see §4 for the Settings-readiness note

Sprint 2.1 is auth-only — no Orders/Tickets/Reports/Settings code ships yet, so nothing reads or writes these three tables this sprint. When those modules do ship (Sprint 2.2+), they're read + resend + report only (see `PHASE2_ARCHITECTURE.md` §4 for why write access to `events`/`orders` stays out of scope until Settings). Every future read pattern is already served by existing unique/PK indexes:

| Search need | Backed by |
|---|---|
| Order lookup by order number | existing unique index on `order_number` |
| Ticket lookup by ticket number | existing unique index on `ticket_number` |
| Ticket lookup by QR token | existing unique index on `qr_token` |
| Order lookup by Stripe payment intent (support/debug) | existing unique index on `stripe_payment_intent` |
| Order search by customer name/email | `ilike` scan — fine at expected volume (hundreds of rows); revisit only if real usage shows it's slow |

No new indexes are needed on the existing three tables at Phase 2's expected data volume.

---

## 3. Migration plan

Two migrations, applied via `mcp__supabase__apply_migration` (the same mechanism used to verify/confirm this document's Phase 1 facts against the live project), each getting a real entry in Supabase's migration history alongside the three Phase 1 migrations already there:

1. `phase2_profiles_and_roles` — creates `profiles`, enables RLS, no policies.
2. `phase2_admin_audit_log` — creates `admin_audit_log` + its three indexes, enables RLS, no policies.

Both are purely additive (`create table`), matching Phase 1's own migration style — no risk to existing data, no downtime, and trivially reversible (`drop table`) per the same rollback philosophy documented in `ROLLBACK.md`. `supabase/schema.sql` in the API repo gets a corresponding "Phase 2" section appended, matching how the file already documents the Phase 1 schema (it's a snapshot/reference doc, not itself the migration mechanism — migrations are applied directly, then the file is updated to match, same as Phase 1).

---

## 4. Future migration: Settings / event management (not built in Sprint 2.1 — see `PHASE2_ARCHITECTURE.md` §7)

Recorded here so it doesn't need re-deriving when Settings is actually scheduled. `events` needs two additive columns:

```sql
alter table events add column capacity integer;               -- null = unbounded, matches today's behavior
alter table events add column sales_status text not null
  default 'open' check (sales_status in ('open', 'paused', 'closed'));
```

`sales_status` is deliberately a separate concept from `is_active` (which selects *which* event row is current, not whether it's purchasable) — see `PHASE2_ARCHITECTURE.md` §7 for why conflating them would be a mistake. `create-checkout-session` would need one added check (`sales_status = 'open'`) once this exists; that's the only Phase 1 code this future change touches.

---

## 5. Summary of review findings

- Schema is small, clean, and well-suited to direct reuse — nothing needs to be renamed, restructured, or backfilled for Phase 2.
- The RLS deny-all posture is intentional and should be preserved, not "fixed" by adding policies — Phase 2's auth model works with it, not around it.
- Data volume (0 real rows pre-launch, low hundreds expected) means no performance engineering is warranted beyond what already exists.
- The real Sprint 2.1 gap is authorization scaffolding (`profiles`, with real roles rather than a flat allow-list) and audit logging (`admin_audit_log`, with a finalized controlled vocabulary from day one) — both small, additive, and low-risk.
- The Settings-readiness gap (`capacity`, `sales_status`) is real but explicitly deferred — documented here so it's a planned migration, not a surprise, whenever that sprint arrives.
