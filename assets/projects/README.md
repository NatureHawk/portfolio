# Project previews

Drop a preview image here named exactly as `projects.js` expects and it appears
on that project's card. Nothing else needs changing — no layout, no CSS.

| Project | Expected file |
|---|---|
| Ambassu | `ambassu-preview.webp` |
| LockedIn | `lockedin-preview.webp` |
| SwipeSort | `swipesort-preview.webp` |
| HawkOS | `hawkos-preview.webp` |
| RetailHub | `retailhub-preview.webp` |

The filename is not magic — it comes from the `preview` field on each entry in
[`projects.js`](../../projects.js). Change the field and the card follows.

**Until a file exists**, the card shows a "PREVIEW PENDING" plate instead. That
is not an error state: `code.js` loads the image off-DOM and only swaps it in
once it has actually decoded, so a missing file leaves the pending plate up
rather than a broken image or an empty well.

**Sizing.** The well is roughly 560 × 190 CSS px at the largest card width, and
the image is cropped with `object-fit: cover`. Export around 1120 × 380 for a
2× screen. The card is a teaser — a whole application UI shrunk to this size is
unreadable, so crop to one recognisable region rather than fitting the lot in.
