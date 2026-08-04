# Phase 3 — Database Review

Status: **Planning — no migrations applied yet.** Every fact below verified live against Supabase project `zcohmiqvkcaempgafeuh` on 2026-08-04 (schema, advisors, and migration history all re-queried for this review, not recalled).

---

## 1. Current schema, as it affects Phase 3

Five tables exist today (`events`, `orders`, `tickets`, `profiles`, `admin_audit_log`), all RLS-enabled with zero policies (service-role key only, server-side — unchanged posture, see §3). Eight migrations applied to date, spanning Phase 1 and Phase 2. Full column-level history is in `PHASE2_DATABASE_REVIEW.md`; only what's directly relevant to Phase 3 is repeated here.

### `tickets` — the table Phase 3 actually touches

| Column | Type | Phase 3 relevance |
|---|---|---|
| `id` | uuid, PK | — |
| `ticket_number` | text, **unique** | Already indexed via the unique constraint — the manual-entry fallback (`PHASE3_ARCHITECTURE.md` §5) needs no new index to look up by this column fast. |
| `qr_token` | text, **unique** | Same — the primary check-in lookup path is already O(index lookup), not a scan. |
| `status` | text, check `IN ('valid','checked_in','cancelled','refunded','void')` | **`checked_in` has been a valid value since Phase 1 and has never been written.** Phase 3's entire state machine fits inside this existing constraint — no migration needed for the check itself. |
| `created_at` | timestamptz | — |

**Confirmed live**: 0 rows in `orders`/`tickets` today (checkout is still broken — see `PHASE3_ARCHITECTURE.md` §1). Every check described below has been verified against the schema, not against real data, because there isn't any yet.

### `profiles` — the table that makes `VOLUNTEER` real

| Column | Type | Phase 3 relevance |
|---|---|---|
| `role` | text, check `IN ('SUPER_ADMIN','ADMIN','VOLUNTEER')` | `VOLUNTEER` has been a valid value since Sprint 2.1. **Zero rows use it** (confirmed live: 1 row total, the `SUPER_ADMIN`). No schema change needed to provision volunteers — just new rows, and the authorization-enforcement code change covered in `PHASE3_ARCHITECTURE.md` §4. |

### `admin_audit_log` — the table that already expected this phase

| Column | Type | Phase 3 relevance |
|---|---|---|
| `action` | text, check includes `'CHECK_IN_TICKET'`, `'VOID_TICKET'` | Both reserved since Sprint 2.1, **neither ever written**. Confirmed live: 9 rows exist today, none with these two actions. No migration needed to start logging check-ins. |
| `target_type` | text, check includes `'ticket'` | Already correct for check-in events. |
| `actor_id` | uuid, nullable, references `profiles(user_id)` | Will record which volunteer performed each check-in — the accountability the roadmap's "concurrent volunteers" requirement needs. |

---

## 2. Schema additions needed

**One additive migration.** Two new nullable columns on `tickets`:

```sql
alter table tickets add column checked_in_at timestamptz;
alter table tickets add column checked_in_by uuid references profiles(user_id);
```

**Why these, given `admin_audit_log` already records every check-in event with a timestamp and actor**: technically redundant with a join, but the check-in flow's whole design goal is speed at a busy gate (`PHASE3_ARCHITECTURE.md` §5). The "already checked in — when, and by whom?" response on a duplicate scan is the one place this system needs that answer *fast* and *constantly* (every duplicate scan hits it). Denormalizing onto `tickets` turns that into a single-row read already fetched as part of the check-in lookup itself, instead of a second query against `admin_audit_log` on every duplicate. This is the same kind of judgment call Phase 1 already made with `orders.tickets_generated_at` — a timestamp that duplicates information otherwise reconstructable from order/webhook history, kept denormalized because the code that needs it needs it on the hot path.

Both columns stay `null` for every ticket until first checked in; both get set atomically in the same `UPDATE` that flips `status` to `'checked_in'` (`PHASE3_ARCHITECTURE.md` §5) — one write, not two.

**No index needed on either new column.** Neither is a lookup key — `checked_in_at`/`checked_in_by` are only ever *read* alongside a row already located by `id`, `qr_token`, or `ticket_number`, all of which are already indexed.

**No changes needed to `orders` or `events`.** Phase 3 is scoped to the ticket-level check-in state machine; it doesn't touch order or event data.

---

## 3. RLS posture: unchanged, and that's the right call again

Every table stays deny-all, service-role-key-only, exactly as established in Phase 1 and reaffirmed through every Phase 2 sprint. The new check-in endpoint reads/writes through the same service-role client every other admin route uses; `requireAdmin()` (identity) plus the new `requireRole()` check (authorization, `PHASE3_ARCHITECTURE.md` §4) are what actually gate access — not Postgres policies. Introducing RLS policies now, just for this phase, would mean maintaining two authorization systems (policies *and* the existing middleware pattern) for no benefit at this scale — the same reasoning that ruled out RLS-based admin access back in Sprint 2.1's architecture review still applies.

---

## 4. Advisory findings (verified live for this review)

- **Five `rls_enabled_no_policy` `INFO`-level findings** (one per table) — expected, deliberate, unchanged from every prior review. Not a regression.
- **New since the last review: `auth_leaked_password_protection` (`WARN`)** — Supabase Auth's HaveIBeenPwned compromised-password check is disabled project-wide. Not caused by anything in this codebase; a Supabase Auth setting, not a schema issue. Flagged here because Phase 3 is about to provision a batch of new accounts (volunteers) — a free, zero-code toggle worth flipping on before doing that, not because any existing account is known to be compromised. See `PHASE3_ROADMAP.md` for where this lands in the implementation order.

---

## 5. Migration plan

One migration, applied the same way every Phase 2 migration was (`mcp__supabase__apply_migration`, verified against the live schema immediately after):

1. `phase3_ticket_checkin_columns` — adds `checked_in_at`, `checked_in_by` to `tickets`. Purely additive, no risk to existing data (there is none yet), trivially reversible (`alter table tickets drop column ...`) per the same rollback philosophy documented since Phase 1's `ROLLBACK.md`.

No second migration is needed for volunteer accounts or audit logging — both already work with the schema as it stands today.

---

## 6. Summary of review findings

- The ticket/audit/role schema was genuinely built with this phase in mind — `checked_in` status, `CHECK_IN_TICKET`/`VOID_TICKET` audit actions, and the `VOLUNTEER` role have all sat ready and unused since Phase 1/Sprint 2.1. Phase 3's core mechanics need exactly one small additive migration, not a redesign.
- The real gap this review surfaces isn't schema — it's the authorization code that was never written to check `role` beyond "is this a known admin" (`PHASE3_ARCHITECTURE.md` §4). No column is missing for that; the fix is in the route handlers, not the database.
- One new, unrelated advisory finding (leaked-password protection) is cheap to fix and well-timed to fix now, given this phase provisions more accounts.
