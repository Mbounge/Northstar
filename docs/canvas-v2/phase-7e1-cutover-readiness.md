# Phase 7E.1 — Production cutover readiness

Phase 7E.1 establishes the exact transition from the independently working V2
engine to North Star's canonical Canvas. It does not switch users, delete V1,
add remote persistence, or claim production readiness before real authenticated
proof. The machine-readable authority is
`config/canvas-v2-cutover-manifest.json`; the verifier is
`npm run check:canvas-v2-cutover`.

## Readiness verdict

The architecture is bounded and ready for Phase 7E.2 production proof.
It is not yet authorized for the 7E.3 route switch or 7E.4 deletion.

The audit found and repaired one fail-open test boundary: the deterministic V2
research route had no availability guard, while the other E2E routes could be
enabled in a production process by setting `NORTHSTAR_E2E=1`. Every deterministic
page and API now returns not found whenever `NODE_ENV=production`, regardless of
that flag. The authentication bypass in `proxy.ts` now requires both a
non-production process and `NORTHSTAR_E2E=1`.

The deterministic app fixture was moved from `lib/canvas-v2/testing` into the
test-only route root, and the unused Canvas V2 preview harness was removed.
Production V2 source is statically forbidden from importing the fixture, any
E2E route, V1 authority, or a benchmark marker.

## Current route ownership

| Surface | Current owner | 7E decision |
| --- | --- | --- |
| `/canvas` | Hybrid server route; `CANVAS_ENGINE=v2` selects V2, otherwise V1 | 7E.3 replaces it with unconditional V2 and removes the flag |
| `/canvas-v2` | Authenticated V2 preview route | 7E.3 redirects it to canonical `/canvas` |
| `/api/canvas-v2/route` | Authenticated semantic router | Keep |
| `/api/canvas-v2/design` | Authenticated model design/research director | Keep |
| `/api/canvas-v2/research` | Authenticated tenant research adapter | Keep |
| `/api/canvas-ai` | V1 streaming model and mutation engine | Delete in 7E.4 |
| `/api/canvas-ai/artifact-ack` | V1 browser acknowledgement loop | Delete in 7E.4 |
| `/api/canvas-artifacts/prototype` | V1 prototype artifact runtime | Delete in 7E.4 |
| `/canvas-v2-e2e/**` | Deterministic V2 release harness | Keep test-only; impossible to execute in production |
| `/__northstar-e2e` | V1 browser harness | Delete with V1 in 7E.4 |

No application-shell link or redirect to `/canvas` or `/canvas-v2` exists in the
current repository. The routes are currently direct entry points. If a product
navigation entry is desired, 7E.3 must add one pointing only to `/canvas`; it
must not introduce a second route owner.

## Runtime and environment inventory

### V2 production runtime

- 31 source files under `app/api/canvas-v2`, `components/canvas-v2`, and
  `lib/canvas-v2`.
- One workspace component with exactly three production endpoint defaults.
- One neutral tenant adapter at `lib/app-data/canvas-v2-catalog.ts`.
- Supabase is used for authentication, tenant resolution, and read-only loading
  of `user_profiles`, `target_apps`, flows, icons, and screenshot locations.
- Committed V2 history and chat recovery remain browser-local under
  `northstar.canvas-v2.local-recovery.v1`.
- There is no V2 database write, remote canvas persistence, V1 runtime-document
  import, or V1 fallback inside the V2 engine.

### Environment controls

- `CANVAS_ENGINE` is consumed only by `app/canvas/page.tsx`. It is temporary
  dual-run authority and must disappear in 7E.3.
- `CANVAS_V2_MODEL` selects the production design model.
- `CANVAS_V2_ROUTER_MODEL` optionally selects the production interaction router.
- `GEMINI_API_KEY` is required by both production model routes.
- `NORTHSTAR_E2E` is test-only and cannot override the production-deny boundary.

### V1 retirement inventory

The legacy runtime consists of exactly 54 files under:

- `components/canvas/**`;
- `lib/canvas-ai/**`;
- `lib/canvas-artifacts/**`;
- `app/api/canvas-ai/**`;
- `app/api/canvas-artifacts/**`.

Only two runtime files outside those roots import V1: `app/canvas/page.tsx` and
the V1-only `app/__northstar-e2e/page.tsx`. V1 also owns 63
`tests/northstar-*.test.ts` files and three `e2e/northstar-*.spec.ts` files.
Any inventory change fails the readiness verifier until the manifest is updated
deliberately.

## Keep, migrate, and delete

### Keep

- all production V2 source and its model-owned source → render → observe loop;
- `lib/app-data/canvas-v2-catalog.ts` and the existing account evidence;
- Supabase authentication, server/client utilities, tenant data, and storage;
- general application shell, company pages, product data APIs, and visual assets;
- the five current Canvas V2 browser suites and all Canvas V2 contract tests;
- browser-local V2 recovery until a later, separately designed persistence phase.

### Migrate in 7E.3

- make `/canvas` render `CanvasV2Workspace` unconditionally after authentication;
- remove the V1 workspace import and `CANVAS_ENGINE` branch;
- redirect `/canvas-v2` to `/canvas` so one canonical URL remains;
- update or add any product navigation entry to use `/canvas` only;
- preserve existing V2 browser-local recovery—do not translate a V1 mutation
  journal into V2 source.

### Delete in 7E.4

- every declared V1 runtime root and its three legacy APIs;
- the V1 E2E page and V1 browser specifications;
- all legacy Northstar contract tests whose implementation is deleted;
- benchmark objective injection, mutation journals, acknowledgement loops,
  repair controllers, competing completion authorities, and the V1
  runtime-document machinery;
- `CANVAS_ENGINE` and any dead V1 environment documentation.

Deleting V1 code does not authorize deleting user data, Supabase tables,
screenshots, icons, tenant records, or other shared evidence. Git history is the
recovery mechanism for retired source.

## Cutover gates

### Gate A — 7E.2 real production proof

Before route ownership changes, verify with a real approved account:

- authentication and tenant resolution;
- the actual Gemini router and design endpoints;
- real icons, complete flows, screenshots, and unavailable-app truth;
- the standard Awin/Whop prompt and unrelated product, marketing, business, and
  conceptual prompts;
- conversation, inspection, selection transformations, continuation, Stop,
  retries, reload, and large artboards;
- browser console, API status, asset loading, rendered geometry, and local
  recovery behavior.

The user remains the visual evaluator. This gate records behavior, factual
evidence integrity, and observed compositions; it does not create an aesthetic
scoring engine.

### Gate B — 7E.3 canonical route switch

Proceed only after Gate A passes. Make `/canvas` V2-only in one reversible
commit. Confirm no request is sent to `/api/canvas-ai`,
`/api/canvas-ai/artifact-ack`, or `/api/canvas-artifacts/prototype`. Keep the V1
files dormant for the short cutover observation window, but provide no runtime
fallback or user-facing engine toggle.

### Gate C — 7E.4 retirement

Proceed only after the V2-only route passes the cutover smoke tests. Delete the
manifested V1 roots and legacy-only tests together. The retirement patch must
fail if an undeclared importer or consumer remains.

### Gate D — 7E.5 certification

Require zero type errors, all V2 unit and browser tests, a production build, a
live authenticated smoke pass, no executable V1 route, no V1 import from
production code, and updated final architecture documentation.

## Known blockers carried into 7E.2

1. The production Gemini and authenticated tenant path has not yet been proven
   in this release sequence with real account evidence.
2. Repository typecheck still contains the known V1-only mismatch in
   `lib/canvas-ai/northstar-two-turn-design-reset.ts`. It should disappear when
   V1 is retired; no V2 code should be distorted to satisfy it.
3. The full standalone Playwright runner needs an environment allowed to launch
   Chromium. The in-app browser has validated 7D.5 behavior, but 7E.5 still
   requires the repeatable suite to execute successfully in the release
   environment.

## Commands

```bash
npm run check:canvas-v2-cutover
npm run test:canvas-v2
npm run test:e2e:canvas-v2 -- --list
```

This document records the 7E.1 readiness state. Phase 7E.2 has since updated the
manifest and verifier together to record authenticated production proof while
preserving the same dual-run route topology. They must be updated again as one
reviewed change in 7E.3 and 7E.4; silently drifting past a cutover boundary is a
release failure.
