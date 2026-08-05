# Post-Event Checklist

Wind-down steps after Festival Day is over. Companion to `FESTIVAL_DAY_RUNBOOK.md`.

---

## Immediately after gates close

1. **Record final attendance.** Note the numbers shown on the Dashboard (`Checked In` / `Remaining` / `Total` / `Attendance %`) before doing anything else — this is your authoritative record of the day.
2. **Export a final report.** Admin dashboard → Reports → set the date range to cover the event → **Export CSV**. Keep this file — it's the permanent record (revenue, orders, ticket breakdown) independent of the live database.
3. **Sign out every volunteer device** if it wasn't already done at the gate.

## Security cleanup (within a day or two)

4. **Deactivate every volunteer account.** Admin dashboard → Volunteers → **Deactivate** on each row. This takes effect immediately (their very next request gets a 403), unlike deleting the account — deactivating preserves their activity history for the review step below, and lets you reactivate the same account next year without re-creating it. Don't delete Supabase Auth users directly unless you're certain you won't reuse the account.
5. **Review the audit log for anomalies.** Volunteers → each row → **Activity**, or query `admin_audit_log` directly for the event date. Look for: an unusually high `LOGIN_FAILED` count for any account (possible credential-guessing attempt), any `CHECK_IN_TICKET` activity outside the event's actual hours, or any volunteer account used from more devices/IPs than expected.
6. **Rotate the SUPER_ADMIN/ADMIN passwords** if you have any reason to think they were exposed or shared beyond intended staff during the event.

## Data hygiene

7. **Decide what to do with the event's real order/ticket data.** Unlike the Sprint 3.2 test data (which should already be gone by now — see `PRE_LAUNCH_CHECKLIST.md` item 2), this is real customer data covered by whatever retention/privacy commitments you've made to attendees. Keep it if you need it for accounting/records; don't delete it casually.
8. **Confirm no leftover test/debug data was accidentally created during the event** (e.g., a volunteer test-scanning their own device before an official ticket existed) — check for any ticket numbers or order numbers that look out of place in the export from step 2.

## Review

9. **Note what worked and what didn't** while it's fresh — venue connectivity, volunteer learnability, scan speed under real queue pressure, any disputes that came up. This is exactly the kind of input that would justify revisiting the "explicitly out of scope" items in `FINAL_PHASE3_REPORT.md` §7 (offline mode, per-gate reporting, manual void action) next time, rather than guessing at what's worth building.
10. **File any real bugs found during the event** separately from feature requests — if something behaved incorrectly (not just "could be nicer"), that's worth fixing promptly regardless of whether there's a Phase 4.

## Looking ahead

11. **Decide on next steps.** With Phase 3 complete and a real event now run against it, you're in the best position to judge whether Phase 4 (if any) should prioritize the deferred items above, address something the event actually surfaced, or whether the system is simply done for now.
