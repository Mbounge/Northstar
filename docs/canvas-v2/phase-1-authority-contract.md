# Canvas V2 Phase 1 authority contract

Status: foundational and intentionally non-visual.

Baseline: `0231c871d2beabecee14eef3420b41f763a432c7` on `stable2`.

Canvas V2 replaces the Northstar design engine. It does not extend it.

## Product contract

Canvas V2 exists to execute a small loop:

1. Give the design model the user's instruction, the current artifact source,
   the exact rendered image of that source, and the available evidence.
2. Let the model author the next complete artifact source.
3. Render that source as a disposable candidate.
4. Return the candidate's exact rendered observation to the model.
5. Continue or commit.

The human user is the visual evaluator. Canvas V2 must not encode aesthetic
rubrics, benchmark validators, objective-specific completion rules, or a
second deterministic design intelligence.

## Authority

- The committed `CanvasV2ArtifactRevision` is the only canonical artboard.
- HTML, CSS, and optional JavaScript are the canonical authored source.
- A candidate revision is immutable and never mutates its parent revision.
- The model owns design, composition, placement, and visual correction.
- The renderer owns rendering, capture, and objective runtime facts.
- The controller owns only turn transport and revision transitions.
- The user owns final visual judgment.

No relation registry, mutation journal, geometry-intent graph, construction
plan, strategy fingerprint, repair memory, or completion evaluator is a second
source of truth.

## Permitted deterministic checks

The runtime may reject or report only technical integrity failures:

- invalid or unsafe source;
- iframe/runtime failure;
- non-finite render dimensions;
- missing approved evidence assets;
- mismatched source, render, candidate, or parent revision identity;
- stale or corrupt revision transitions.

Overflow, clipping, and overlap may be reported as observations for the model.
They do not authorize the runtime to redesign or reposition content.

## Explicit non-goals

Phase 1 does not:

- change the V1 production runtime;
- implement model calls;
- implement screenshot capture;
- implement automated visual evaluation;
- move the seven acceptance prompts into V2;
- provide compatibility wrappers around Northstar design modules.

The first functional vertical slice belongs to Phase 2. Phase 1 establishes a
clean boundary so Phase 2 cannot accidentally rebuild V1 under new names.

## Dependency rule

Production files under `lib/canvas-v2`, `components/canvas-v2`, and
`app/api/canvas-v2` must not import from:

- `lib/canvas-ai`;
- `lib/canvas-artifacts`;
- `components/canvas`;
- `app/api/canvas-ai`.

Shared product data must be extracted behind a small neutral adapter rather
than reached through a legacy design-engine module.

## Phase 1 exit gate

Phase 1 is complete when:

- this authority contract is committed;
- V1's disposition is recorded;
- V2 has standalone source, evidence, observation, decision, and revision
  contracts;
- candidate and commit transitions are immutable and tested;
- an automated dependency guard prevents legacy engine imports;
- V2 typechecks and its focused tests pass;
- the repository introduces no failures beyond the recorded V1 baseline debt;
- no V1 runtime behavior has changed.

The frozen baseline is not currently green. See `baseline-health.md`. Phase 1
records that truth instead of expanding scope into a V1 repair project.
