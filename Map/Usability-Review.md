# Accessibility Report — "Throughout the Village" Interactive Festival Map

This report documents the elder-first accessibility decisions in the current build of the interactive map, after the real-geography rebuild (see [Map-Revision-Report.md](Map-Revision-Report.md) for the geography itself). It treats seniors, heritage visitors, and first-time festival attendees as the primary audience — not developers or younger "digital native" users.

## Text sizes

| Element | Size | Notes |
|---|---|---|
| Marker label | 19px desktop / 16px mobile, bold | Always visible — never hidden behind a hover state |
| Event card title | 32px | The first thing read after tapping a marker |
| Event card description | 18px, line-height 1.75 | Well above typical web-default body size |
| Event time | 16px, sentence case | Changed from small uppercase tracking, which is harder to read for low-vision visitors |
| Heritage note | 18px, italic | Same size as the description — no shrinking secondary content |
| Legend labels | 16px+, sentence case | No condensed or small-caps type anywhere in the experience |

## Marker and touch-target sizes

| Control | Size |
|---|---|
| Hotspot pin | 64px desktop / 52px mobile |
| Pin icon (inside pin) | 32px desktop / 26px mobile |
| Zoom in / out / reset buttons | 52px+ (48px mobile) |
| Panel close button | 56px (48px mobile) |
| "View All Events" toggle | Full-width on mobile, 16px+ label |

Every control listed still meets or exceeds the ~44px touch-target guideline used in mobile accessibility standards, including on phone-width screens. Pins were deliberately reduced from an earlier 92px/78px in this revision (see below) and remain comfortably above that floor.

## Senior-friendly improvements specific to this revision

- **No hover-only interaction anywhere.** Every label, every piece of information, opens with a single tap or click — confirmed by testing the rebuilt map in headless Chrome at both desktop (1500×1100) and mobile (390×844) widths.
- **Labels are permanent, not conditional.** All ten festival locations are named on the map at all times.
- **A pulse animation** (disabled under `prefers-reduced-motion`) draws the eye to markers without requiring discovery.
- **Pins were intentionally shrunk to fit the real, compressed village core.** The map now uses a single uniform scale (see [Map-Revision-Report.md](Map-Revision-Report.md)) instead of artificially spacing venues apart, which means the heritage core — Mill, Town Hall, Blacksmith Shop, Russell Greenspace — sits as tightly together on the map as it really does on the ground. To keep every marker individually tappable without overlap at that true scale, hotspot pins were reduced from 92px/78px to 64px desktop / 52px mobile. This is a deliberate trade-off in favour of geographic honesty, not a regression: 64px/52px still clears the ~44px touch-target guideline with room to spare, and label text size was left untouched (19px/16px) so legibility for elder readers is unaffected.
- **A bug found and fixed during this revision:** an earlier real-geography position for Old Town Hall placed its marker so close to the top edge of the canvas that its pin-and-label stack was clipped by the map stage and didn't fully render. This was caught by rendering the rebuilt map in headless Chrome and visually inspecting the screenshot, then fixed by re-deriving the venue's position from the site's own published coordinates (see the geography report) — which also happened to improve geographic accuracy, since the corrected position lines up with the real Lower Beverley Lake Park Road.

## Mobile usability

- Zoom controls and the pan/zoom hint are hidden while the detail panel is open on phones, so they don't visually compete with the text being read.
- The map stage remains pannable and pinch-zoomable on mobile; the "Drag to pan · scroll to zoom · tap a marker for details" hint is always visible above the controls.
- On narrow viewports the festival-locations legend wraps to multiple rows above the map stage, which compresses the visible map area on phones under ~400px wide. This is a pre-existing layout characteristic (not changed in this revision) — the map itself remains fully pannable/zoomable to reach every marker, but it is worth a future pass if the legend's vertical footprint needs trimming for very small screens.
- The "Throughout the Village" trigger uses a custom-styled tooltip (`.village-trigger-tip`) on hover/focus for desktop and pointer devices, and automatically switches to a permanently-visible "Tap to explore the village map →" cue on touch devices via `@media (hover: none)` — so the discovery hint works correctly on both input types without relying on a hover state that touchscreens can't produce.

## Net effect

A local resident should recognise their own village in this map's geography (see the accuracy report), while a first-time visitor — including one who has never used an interactive map before — can still see every location named on screen at a glance, reach full event details with one tap, and fall back to a plain list view at any time, all at type and touch-target sizes well above standard web defaults.
