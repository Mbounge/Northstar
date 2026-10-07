# App simulator preview standard

Use this process for every app preview. The agent's current app captures are the visual authority. A build that runs is not a completed preview.

Set up the app template before building families: app identity and target viewport; capture inventory; an asset kit with source/generated provenance, fonts, icons, and design tokens; the app's status/navigation shell; record schemas and mock-data rules; navigation/state handling; and a review sheet. This is part of building the template, not cleanup after the pages are coded. Start each family from the [page-family build sheet](app-simulator-family-template.md). Keep the simulator's record data separate from its components, mark inferred fields, and make one shared component render each repeated page type. The visual shell belongs to the app being copied; different apps must not be forced into GRAET's styling.

1. Inventory one page family at a time: the first view, every captured tab and scroll position, repeated entities, actions, overlays, and destinations. Record what is captured and what requires mock data.
2. Inventory the actual visual assets: logos, portraits, illustrations, icons, fonts, video, and image crops. Reuse source assets when available. Create missing assets with image generation or other suitable design tools when needed, then inspect the result at the real viewport and revise its crop, scale, color, and placement. Track whether each asset came from the reference or was made for the simulator.
3. Build a shared page component for that family. Records supply names, images, counts, scores, and other content. One action model controls repeated rows and cards; state changes must update the same component everywhere it appears.
4. Preserve captured default views. Put uncaptured outcomes behind distinct mock states or destinations. Do not present an invented screen as a visual match to the app.
5. Compare the running simulator with the source captures at the target phone size. Review top, middle, bottom, every screenshot join, and representative data variants. Check status and navigation bars, typography, spacing, alignment, image crops, overlays, and scroll behavior.
6. Exercise every visible control: selected states, forms, media controls when assets exist, back and return scroll, tabs, menus, share/options, and cross-page navigation. A control must produce a visible outcome, not merely register a click.
7. Run typecheck, lint, and a production build. Record which screens and interactions were visually verified, which data is mocked, and which media or destination cannot be reproduced from available captures. Only then move to the next family.

The release report must distinguish a verified captured state from a functional mock state. It must not call the whole app a one-to-one replica while any captured family or visible control remains unreviewed.

Northstar's existing Product Preview tab uses the app-to-simulator registry. A released simulator opens in that tab for its app; an app without a released simulator shows a pending state. There is no live-device fallback or separate app catalog. Direct simulator routes must enforce the tenant's app assignment. GRAET is the first app-specific implementation.
