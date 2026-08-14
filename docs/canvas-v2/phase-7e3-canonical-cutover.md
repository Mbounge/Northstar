# Phase 7E.3 — Canonical cutover

Phase 7E.3 makes Canvas V2 the sole owner of North Star's canonical `/canvas`
route. The independently proven V2 engine is no longer hidden behind
`CANVAS_ENGINE`, and `/canvas-v2` is now only a redirect alias. V1 source remains
present but dormant until the separately reviewed Phase 7E.4 retirement patch.

Phase 7E.3.1 subsequently paused that retirement after the authenticated visual
result exposed inadequate journey selection. Phase 7E.3.2 retained the hold
after the next real-use run exposed representative-flow, long-evidence geometry,
and source-correction failures. Phase 7E.3.3 also corrects the page lifetime:
refresh starts a clean in-memory canvas instead of restoring local work. The
route cutover remains reversible and V1 remains present; deletion cannot proceed
until the latest repairs receive fresh authenticated visual proof.

The machine-readable authorities are:

- `config/canvas-v2-cutover-manifest.json` for source and route ownership;
- `config/canvas-v2-canonical-cutover-receipt.json` for the secret-free
  authenticated browser smoke result;
- `npm run check:canvas-v2-cutover` for both contracts.

## Route ownership

| Surface | Phase 7E.3 owner | Behavior |
| --- | --- | --- |
| `/canvas` | Canvas V2 | Authenticates on the server, then renders `CanvasV2Workspace` without fallback |
| `/canvas-v2` | No workspace owner | Redirects to `/canvas` |
| `/api/canvas-v2/route` | Canvas V2 | Authenticated conversation and semantic routing |
| `/api/canvas-v2/design` | Canvas V2 | Authenticated model design and research direction |
| `/api/canvas-v2/research` | Canvas V2 | Authenticated read-only tenant evidence adapter |
| V1 Canvas APIs and source | Dormant legacy inventory | Retained only for reversible observation and deleted in 7E.4 |

There is no `CANVAS_ENGINE` consumer in application source. The canonical page
has no V1 import, branch, endpoint reference, workspace prop, or V1 user-email
fallback. The redirect alias has no workspace import and no duplicate
authentication/data loading path.

No existing application-shell or product-navigation entry pointed to either
Canvas URL, so this phase does not invent a new navigation surface. Any future
navigation entry has exactly one valid destination: `/canvas`.

## Authenticated canonical smoke

This is the historical 7E.3 smoke receipt. Phase 7E.3.3 supersedes only its
reload-continuity observations; the route-ownership and no-V1-request evidence
remain valid.

The cutover was exercised in the signed-in application using the real server
route and the browser-local state produced during 7E.2:

1. Direct navigation to `/canvas` rendered Canvas V2.
2. The previously committed Awin/Whop artboard, its complete evidence lanes,
   and its chat history restored at the canonical URL.
3. Direct navigation to `/canvas-v2` settled at `/canvas` while preserving the
   same workspace and local recovery state.
4. A read-only request to confirm the visible artboard routed as `inspect`
   through `/api/canvas-v2/route` and returned a grounded chat answer.
5. The inspection did not create a design run or change the committed revision.
6. Server observation recorded one V2 router request and no request to
   `/api/canvas-ai`, `/api/canvas-ai/artifact-ack`, or
   `/api/canvas-artifacts/prototype`.
7. Reloading `/canvas` preserved the artboard and the new inspection turn.

The receipt stores outcomes and counts only. It contains no user, tenant,
authentication, asset, evidence, or canvas-source material.

## Reversibility and persistence boundary

This is intentionally a route-ownership change rather than a deletion patch.
Reverting the single 7E.3 commit restores the prior dual-run page while all V1
files still exist. No user data is migrated or deleted, no Supabase canvas table
is introduced, and Canvas V2 uses in-memory page-session state. Refresh
deliberately resets the artboard, chat, and history; no Canvas V2 canvas state is
written to browser storage or Supabase.

Phase 7E.4 may delete the manifest-declared V1 runtime roots, legacy APIs,
V1-only test page, and legacy tests only after the 7E.3.3 live-proof hold is
explicitly cleared. It must not delete shared app data, screenshots, icons,
authentication infrastructure, or the V2 research adapter.

## Verification

```bash
npm run check:canvas-v2-cutover
npm run check:canvas-v2-production-proof
npm run test:canvas-v2
npm run typecheck
```

The standalone Playwright process remains unable to launch its bundled Chromium
under the current host permission boundary. This is an execution-environment
limitation rather than an application failure; the in-app authenticated browser
completed the canonical route, redirect, router, non-mutation, and reload checks.
