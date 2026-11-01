# Capture-grounded app simulation agent

Entry points: `scripts/northstar-simulation-agent.ts` and
`capture-runner/simulation_agent.py`. This fills the reusable generation step
between the capture agents and Northstar's existing isolated native-screen
runtime. Follow the [preview standard](app-simulator-preview-standard.md).

## What it builds

An agent plans the captured states and observed journeys, authors native HTML,
CSS and JavaScript, and repairs defects reported by actual Chromium execution
and a separate visual-review pass. Original screenshots are evidence, not app
backgrounds with transparent click targets. Native fields, text, buttons,
selection, scrolling and navigation remain real UI. The host provides the
captured-state navigator and a **Restart preview** button that remounts the
sandbox, resetting all local data, fields and timers.

Verification means **reviewed captured scope**, never an entire app or its real
backend. Missing destinations are explicit boundaries. Inferred transitions,
missing controls, broken journeys, unreviewed pixels and temporal requirements
that cannot be checked from static evidence prevent release. Do not label an
unverified draft an accurate replica.

## Connections to existing capture work

| Existing output | Used by the simulation workflow |
| --- | --- |
| Android onboarding `onboarding_manifest.json` | Ordered screenshots and action timeline; external inbox captures excluded |
| Browsing `session_manifest.json` | Survey/interaction screenshots and recorded observations |
| iOS `ios_capture_state.json` | Saved screens and transitions; root app identity excludes external apps |
| Reviewed `capture_storyboard.json` | Lane screenshots and explicit source edges |
| APK analyzer `apk_intelligence.json` | Palette, typography and extraction context, with source hash |
| APK `extracted_fonts/`, `extracted_icons/` | Automatically retained authentic font/icon bytes |
| Curated `--assets-dir` | Additional PNG, JPEG, WebP, TTF, OTF, WOFF and WOFF2 assets |
| Existing Northstar screen runtime | The same screen validation, retained asset binding and isolated runtime used by canvas screens |

The media exporter still owns splash clips and onboarding reels. This agent
reads the same capture session; it does not replace that exporter, rerun paid
APK analysis, control a device or modify original captures. For a custom
capture source, supply `simulation_capture.json` with `app`,
`captures: [{file, label, external?}]`, `observations: [{file, detail}]` and
`limitations: []`. All referenced files must live inside the session.

## Run without paid API calls

Requirements: Node 20.19+ with this repository's npm dependencies, Python 3 for
the optional launcher, and Playwright Chromium (`npx playwright install chromium`
if not already installed). Run commands from the repository root. The capture
host needs these dependencies before enabling this optional processing step.

```sh
python3 capture-runner/simulation_agent.py prepare \
  --session /absolute/path/to/capture-session \
  --output /absolute/path/to/private-simulation-run

npm run agent:simulation -- run \
  --output /absolute/path/to/private-simulation-run
```

`prepare` only reads and hashes evidence. `run` defaults to **exchange** mode:
it writes a schema-bound agent job and returns `awaiting_agent` with the exact
`request.json` path. It does not automatically spawn an agent, contact a model
or spend API credits. An existing authorized subscription agent/coordinator
must read that request, inspect its listed full-size local images and supply
the requested JSON. A reply must be genuine agent work, not a scripted approval.

```sh
npm run agent:simulation -- reply \
  --request /absolute/path/to/run/jobs/plan-HASH/request.json \
  --response /absolute/path/to/authored-plan.json

npm run agent:simulation -- run --output /absolute/path/to/run
npm run agent:simulation -- status --output /absolute/path/to/run
```

Repeat reply/run through planning, implementation and independent review.
Use a separate reviewer context from the author. The coordinator must honor
the job's instructions/schema and current image hashes; the script cannot
prove who performed an external review. Never fabricate a reply to clear a gate.
Completed jobs are reused only for identical evidence and requests.

To combine onboarding and browsing for the same app, add
`--related-session /absolute/path/to/browsing-session` to `prepare` (repeat up
to four times). Both sessions must use the same viewport and app identity.
Use a custom manifest to scope captures with inconsistent historical names.
`--select screenshot.png` can scope a family; each supplied selection must
exist in every combined source. `--manifest FILE` selects a primary manifest.
`--width`/`--height` set the logical device viewport. Mixed viewport sizes or
stitched panoramas require a separately scoped manifest; they are not stretched
to fit. A curated `--assets-dir` replaces automatic icon/font discovery.

Existing processing can hand off directly without invoking any model:

```sh
python3 capture-runner/processing_pipeline.py \
  --session /absolute/path/to/capture-session --simulation-prepare
```

## Optional automatic provider mode

Explicit opt-in only:

```sh
npm run agent:simulation -- run --output /absolute/path/to/run \
  --provider openai --model YOUR_AVAILABLE_MODEL \
  --max-rounds 3 --max-calls 24
```

Requires an existing `OPENAI_API_KEY` environment variable. No environment files
are loaded. Model default: `MOBILESPY_SIMULATION_MODEL`, then
`MOBILESPY_PROCESSING_MODEL`, then the existing processing alias `gpt-6-luna`.
Use a model identifier available to your provider account. The adapter uses
the [Responses API](https://developers.openai.com/api/reference/python/resources/responses/methods/create)
with image inputs and [strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses),
high reasoning effort, `store: false`, bounded output and request timeout.
Tests use fake transport responses, never a real paid endpoint.

Provider mode sends the chosen screenshots and retained asset evidence to that
provider. Metadata redaction does **not** redact pixels. Review private account
details in captures before opting in. Keep run directories private; they include
source paths, images and reports. Publication needs its own data review.

Each provider stage writes an exclusive started receipt. If interrupted after
submission, the same stage is never automatically billed again. Recover a known
completed response or start a deliberately new run after checking the provider.
Both repair rounds and total unique jobs have durable limits; resuming cannot
reset the call budget. A budget failure preserves a draft, not a quality pass.

## Quality gates and outputs

1. Immutable capture contract: every chosen screenshot maps to a named state;
   journeys cite recorded observations. Original source, context and asset
   hashes are rechecked. Unsupported formats or missing evidence stop the run.
2. Native source validation: retained assets only, no external dependencies,
   full-screen screenshot assets, remote requests or canvas-painted interfaces.
   Artwork-only crops have bounded coordinates and provenance for review.
3. Real browser checks: fresh entry, every state, actual form/navigation steps,
   expected values (including empty), visible/hidden controls, no-op failures,
   missing images, horizontal overflow, runtime errors, explicit boundaries,
   reachability and two factory resets after dirtying local data.
4. Independent review: original/reference pairs for every checkpoint, the fresh
   entry and **every executed journey step**. All samples need typography,
   layout, icon, imagery, content and interaction verdicts. Similarity numbers
   are diagnostics only. Static captures do not verify temporal fidelity.
5. Bounded repair, then a hash-bound release receipt or `needs_review`.

`attempt-N/preview.html` is self-contained and opens locally; unfinished attempts
are labelled **Draft**. `artifact.json` carries a validated Northstar screen,
plan, source fingerprint and limitations. `retained-assets.json` holds exact
bound bytes. `verification.json`, rendered PNGs and `reviews.json` preserve the
evidence. A successful `release.json` binds these files to one candidate and
scope. Rerunning a verified, unchanged release uses its receipt without another
model call. Tampered releases are refused.

This is a local generation/review pipeline. It does not silently register a new
simulator, replace the existing Medito/GRAET implementations or publish it to
tenant accounts. A consumer must review the release and use the existing
tenant-authorized preview/canvas publication path. Its artifact uses Northstar's
existing screen contract and asset tokens for that integration.

Limits: 48 screenshots, 100 retained assets/30 MB, 300 journey steps, 180 seconds
per browser verification attempt, 1–5 repair rounds, 1–100 model jobs. Provider
image payloads are capped at 24 MB/64 images; choose a coherent smaller family
when needed. Oversized/incomplete evidence is reported, never silently omitted.
Dynamic animation, real authentication/payment/backend calls and uncaptured
destinations cannot be certified by this first version.

## Validation

```sh
npm run test:simulation
npm run typecheck
python3 -m unittest discover -s capture-runner -p 'test_simulation_agent.py'
```

Tests cover real browser behavior and intentionally broken candidates, exchange
integrity, immutable source data, external inbox exclusion, APK assets, durable
budgets, interrupted provider requests and release tampering. The packaging
fixture uses a scripted reviewer to test protocol mechanics; it is explicitly
not evidence that a real app reconstruction passed visual review.
