# Page-family build sheet

Copy this sheet for each family in a new app after establishing the app-wide capture and asset kit. Fill it from the agent's current tenant captures before implementing the page. Keep it beside that app's simulator audit.

## Identity and evidence

- App / tenant / capture release:
- Family name and route(s):
- Device size and platform:
- Source captures: first view, each tab/state, middle scroll, last scroll:
- Missing views or media:

## Asset map

| UI element | Source asset or reference capture | Generated replacement, if needed | Crop / scale / placement checked |
| --- | --- | --- | --- |
|  |  |  |  |

Reuse authentic source assets first. When an image or video is unavailable, create the closest usable mock asset with image generation or another design tool and review it in the assembled page; a good standalone image is not enough if its in-app crop is wrong.

## Shared component and data

- One component used by every record in this family:
- Record IDs and captured fields (text, images, counts, scores, labels):
- Mock-only fields and why each is needed:
- App-wide pieces reused here (status bar, navigation, header, cards, media, action sheet):
- Variants that must render through the same component:

## Interaction map

| Visible control | State or destination | Back / return position | Evidence or mock |
| --- | --- | --- | --- |
|  |  |  |  |

## Visual review

Compare the running simulator beside the capture at the exact device size. Record a pass or a specific correction for each item.

| View / variant | Top | Middle | Bottom | Typography, alignment, crops, overlays | Result |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

Check screenshot joins for repeated or missing content. Check at least two records with different text lengths or image shapes, plus empty and selected states when present. Inspect every fixed or sticky element during a scroll.

## Completion gate

- Every captured view and visible control reviewed:
- Mock destinations work and are identified as inferred in the audit:
- Navigation and return scroll verified:
- Typecheck, lint, and production build:
- Remaining differences with capture IDs:
- Family status: `in progress` / `functional mock` / `capture-verified`

Only `capture-verified` means the available source views and their interactions were visually matched. `Functional mock` means the route works with inferred content; it is not a claim of one-to-one design.
