# Canvas V2 Phase 6A: research and app-data adapters

Phase 6A reconnects North Star's tenant-scoped product evidence without reconnecting the legacy creative engine.

## Neutral catalog

`lib/app-data/canvas-v2-catalog.ts` reads the authenticated tenant's existing `target_apps` and `app_sessions` records and normalizes:

- apps and exact app icons;
- platform and session scope;
- captured taxonomy flows;
- ordered screenshots;
- screen names, source URLs, and stable identities.

The module is product data infrastructure. It contains no prompting, design policy, canvas mutation, or V1 imports.

## Research adapter

Canvas V2 supports four bounded operations through `/api/canvas-v2/research`:

- `list-apps`
- `list-flows`
- `flow-screens`
- `search`

Every image-backed result becomes a `CanvasV2EvidenceAsset` with an exact approved URL and stable evidence ID. Authentication and tenant resolution occur before catalog access. Results never cross tenant scope.

Phase 6B surfaces this adapter through the Apps and References panels and passes selected assets into the existing evidence-insertion candidate pipeline. Phase 6C lets the design agent choose and inspect grounded results as part of a bounded objective.
