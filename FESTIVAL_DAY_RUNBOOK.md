# Festival Day Runbook

Operational guide for running check-in on the day of the event. Code reference: `FINAL_PHASE3_REPORT.md`. Pre-event setup: `PRE_LAUNCH_CHECKLIST.md`. Wind-down after the event: `POST_EVENT_CHECKLIST.md`.

This document assumes the pre-launch checklist is already done — volunteer accounts exist, devices are tested, and real paid tickets exist to scan.

---

## 1. Roles on the day

- **SUPER_ADMIN** (event lead): full dashboard access, creates/manages volunteer accounts, can also scan.
- **ADMIN**: full dashboard access (Orders/Tickets/Reports/Settings), can also scan. Cannot manage volunteers.
- **VOLUNTEER**: scanner only (`/admin/scan`). Signing in anywhere else redirects here automatically.

## 2. Before gates open

1. Event lead signs in at `https://api.deltaharvestfestival.ca/admin`, confirms Dashboard shows the expected ticket counts.
2. Open the **Volunteers** tab, confirm every volunteer account for the day exists and is **Active**. Create any missing ones now — each creation shows a one-time temporary password; write it down or hand it to that volunteer directly, it will not be shown again (a "Reset password" button on that row generates a new one later if it's lost).
3. Hand each volunteer their phone/device pre-loaded to `https://api.deltaharvestfestival.ca/admin/scan`, or have them sign in themselves with the credentials from step 2.
4. Have every volunteer do one real test scan on a real ticket before the gate opens — confirms camera permission is granted, the camera picked the right lens (back-facing), and the account works. Camera/torch permission prompts only appear once per browser; getting them out of the way now avoids a volunteer fumbling through a permission dialog with a line forming.
5. Confirm the live attendance tile at the top of the scanner screen shows real numbers (not all `—`) on at least one device — confirms the stats endpoint is reachable from the venue's actual network.

## 3. Volunteer quick reference (print or screenshot this section)

**Sign in** with the email and password given to you. Check "Remember me" if it's your own device you'll use again.

**To check someone in**: point the camera at their ticket's QR code. Hold steady a moment — it scans automatically, no button to press.

**What the result screen means:**
| Screen | Sound | Meaning | What to do |
|---|---|---|---|
| Green, "Checked In" | one clear tone | First scan — valid | Let them in |
| Amber, "Already Checked In" | double tone | This ticket was already scanned (shows when) | Ask a supervisor before letting them in a second time |
| Red, "Void Ticket" / "Cancelled" / "Refunded" | low tone | This ticket cannot be used | Do not let them in; direct them to a supervisor |
| Red, "Invalid Ticket" | low tone | The code isn't a recognized ticket | Try again, or use manual entry below |
| Dark, "No Connection" | none | Network issue — the scan wasn't recorded | Tap the screen to retry once you have signal |

The result screen clears itself after about 2 seconds (except "No Connection," which waits for your tap) — no button to dismiss it.

**Manual entry** (torn/smudged/unreadable code): tap the ticket-icon button at the bottom, or press **M** on a keyboard, and type the ticket number printed under the QR code. Same result screens apply.

**Switch camera / flashlight**: buttons at the bottom of the screen, only shown if your device has more than one camera / a flash. If you don't see them, your device doesn't support that feature — this is normal, not a bug.

**To sign out**: the logout button (top-right, or inside the manual-entry panel on narrower screens).

## 4. Event lead / SUPER_ADMIN responsibilities during the event

- Keep the Dashboard open on a separate device or tab if possible, to watch live attendance without interrupting volunteers at the gate.
- If a volunteer reports a dispute (e.g., someone claims their ticket was wrongly marked "Already Checked In"), use **Orders → search** or **Tickets → search** to look up the ticket directly and see its real status and check-in time — the scanner's own screen is deliberately minimal and won't show this detail.
- If a volunteer's device is lost, stolen, or compromised during the event: go to **Volunteers**, deactivate that account immediately (**Deactivate** button) — it takes effect on their very next request, not just their next login.
- If a new volunteer needs to be added mid-event, use **Volunteers → + Add Volunteer** the same way as pre-event setup.

## 5. Mid-event troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Camera shows black / never asks for permission | Permission was denied earlier | Browser settings → site permissions → allow camera for this site, then reload `/admin/scan` |
| "No camera found" message | Device genuinely has no camera, or it's in use by another app | Close other camera apps; otherwise use manual entry for that volunteer |
| Scanner screen frozen on old frame | Camera disconnected mid-session (rare — e.g. backgrounding on some Android browsers) | The scanner detects this and shows a "Camera disconnected" message; it also auto-recovers if a camera becomes available again. If not, reload the page. |
| "No Connection" appearing repeatedly | Venue WiFi/cellular is down or overloaded | Move volunteer to a manual paper backup process temporarily (see below); retry once signal returns — tapping the screen resumes scanning |
| Volunteer forgot their password | — | SUPER_ADMIN: Volunteers → find their row → **Reset password** → hand them the new one-time password shown |
| Volunteer can see the Dashboard/Orders/etc. instead of just the scanner | Their account isn't actually a VOLUNTEER role, or was created incorrectly | Confirm their role in the Volunteers list; if this happens, stop and get engineering involved — this would be a real access-control bug, not expected behavior |
| Live attendance numbers look wrong | A supervisor manually corrected a ticket outside the scanner, or two volunteers scanned the same ticket in the same second | Numbers are computed live from the database on every poll (every 5s) — refresh is automatic, no action needed unless the discrepancy persists |

**If the network goes down entirely** (no graceful degradation covers a sustained outage — see `FINAL_PHASE3_REPORT.md` §7): fall back to a paper guest list / visual ticket check at the gate, and reconcile check-ins against the database once connectivity returns. This is a manual, non-technical fallback — there is no offline mode to switch into.

## 6. End of day

1. Have every volunteer sign out on their device (or a SUPER_ADMIN deactivates all volunteer accounts at once from the Volunteers list — see `POST_EVENT_CHECKLIST.md`).
2. Note the final attendance numbers shown on the scanner or Dashboard for your own records before closing anything down.
3. Proceed to `POST_EVENT_CHECKLIST.md`.
