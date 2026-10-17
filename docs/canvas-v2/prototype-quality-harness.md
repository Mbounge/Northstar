# Prototype quality checks

Northstar quality has two separate requirements: observed reference components must match their evidence, and inferred frontend experiences must work coherently with mock data. Passing a transport call or clicking a button does not establish either requirement.

## Current checks

`/canvas-v2-e2e/prototype-quality` is development-only (`NORTHSTAR_E2E=1`). It mounts real authored screen objects and exercises the same isolated journey runtime and raster capture used by Northstar. It makes no model or external API calls.

| Regression | Required result |
| --- | --- |
| Sheet return under fixed navigation | Journey fails on the covered return button |
| Sheet correctly layered above navigation | Open and return assertions pass |
| Control with only an exposed corner | Centre-hit reachability fails |
| No-op tab | Destination/previous-view assertions fail |
| Connected mock edit/save/tab/return/reopen | Saved field and view assertions persist |
| Fixed navigation during actual scrolling | Scroll offset changes; viewport bar bounds remain stable |
| Moving CSS sticky navigation | Measured anchoring check fails |
| Unique class selectors and nested scroll owners | Measured aliases match actual unique elements |
| Short page with fixed navigation | Clearance passes without inventing a scroll range |
| Live state through CSS and SVG revisions | Saved data, fields, active view and scroll persist; an intentional changed seed resets |

Negative cases are expected to fail as product journeys. The suite passes only when it correctly detects those failures. All per-step observations and rendered end states remain visible in the page.

`canvas_screen_interact` supports direct `drag` and private journey drag steps. Use one visible selector and `drag: {from: {x: 0.5, y: 0.5}, to: {x: 0.5, y: -4}, durationMs: 300, moves: 12, end: "up", pointerType: "mouse"}`. Coordinates use the initial target rectangle: starts are fractions 0–1, endpoints -4–5 permit travel beyond small handles, and absolute travel is limited to two viewport lengths. Durations are 0–2500ms with 1–60 moves; combined journey durations and waits are at most six seconds. `end: "cancel"` sends cancellation without a click. Tap steps emit pointerdown/up and the subsequent compatibility click, so duplicate release/click handlers remain observable. Pointer capture is emulated only for the synthetic pointer and restored on every exit; real pointer IDs retain native capture methods. Results identify synthetic untrusted input and report path, moves, capture, cancellation and target bounds. Use actual numeric state/postconditions and retained end-state pixels to judge the supplied gesture; this cannot establish trusted hardware capture, focus, native scrolling/pinch gestures or animation frame rate. Verify those with native interaction separately. Private journeys retain the existing isolated state, focus and audio boundaries.

Journey replies begin with `verification`. Failed journeys are delivered as failed tool activities, retaining the trace and pixels for correction. A missing or incomplete journey result cannot become a passing receipt. Exploratory clicks without postconditions can still be inspected, but a button-only journey cannot establish completed product behavior in final review. Empty text expectations are rejected; an intentionally empty field value remains a valid assertion.

The current visible-selector check also requires a hit-testable point. Painted text with `pointer-events: none` can therefore return a false negative. Keep input reachability separate from pixel visibility: inspect the actual rendered text and use a meaningful visible containing surface or state assertion where appropriate. Do not change a product's intentional pass-through behavior solely to satisfy this helper, or treat a failed hit test as proof that text was not painted.

Construction plans retain a navigation map on bottom-navigation containers: actual selector, scroll owner, anchoring, bottom content clearance, active tab, and observed/inferred destinations. Each tab supplies a control selector, a destination view selector outside the permanent navigation, and expected destination text. Final review requires successful cited clicks for every mapped tab with scoped `expectedVisibleSelector` assertions; permanent tab labels cannot satisfy destination checks. `expectedHiddenSelector` can establish that a previous view closed. Review also checks measured component bounds at distinct actual scroll offsets, including short scroll ranges and refinements, and the last content control's clearance at the actual scroll end. Declared padding and the position keyword alone are insufficient. Every detected horizontal bottom bar needs a map, including refinements; unrelated edits still preserve and recheck it. Measured unique class aliases can identify the same element as its canonical selector. Unmeasured or nonunique aliases cannot substitute for actual bounds. A navigation plan is evidence to verify, not automatic component recognition.

Declared font faces record whether visible glyphs use that family/style/weight. Faithful captures must include font diagnostics. Used fonts must be loaded before runtime health passes; unused declared weights do not block a screen. Visual glyph comparison and exact font provenance are separate: readable reference pixels can support a visual assessment without establishing an exact font family.

Live controller results, trusted input and changed-data checkpoints refresh the same bounded retained snapshot. Active documents checkpoint changing product data at most once per second; a reparent can restore a checkpoint up to a second old. Unchanged JSON seed keys are compared semantically, while array order and changed values remain meaningful. Authored views must render from `northstarProduct.data` after a rebuild and use `northstarProduct.rehydrated` to restore active clocks/loops once. State held only in DOM attributes or closures cannot be restored automatically. The continuity regression exercises a well-behaved authored runtime and does not certify every generated app’s rehydration logic.

## Genuine agent runs

Use `/canvas-v2-e2e/codex-subagent` to replace only the model transport with Codex subscription subagents. Production prompts, tools, source guards, authoring, rendering and review orchestration remain active. Construction, initial appearance and final review inherit the effort selected for the current task; record the model and effort actually dispatched for each relay call separately, since a relay's model mapping may differ from the production selection. Do not infer model parity from a configured effort alone. Separate reviewers must inspect their supplied packets; authors cannot write their own approvals.

`scripts/northstar-subagent-pending.mjs` lists pending author/reviewer exchanges without exposing source or asset bytes. The controlling conversation dispatches agents; this script does not call a model or claim an agent was scheduled. `scripts/northstar-subagent-reply.mjs` rejects stale/stopped exchanges and malformed actions before writing, refuses replacement of pending/consumed actions, permits identical retries without executing twice, then waits for the transport ledger to acknowledge consumption. A written reply, a consumed model action, a successful tool result, a passing journey and a quality approval are separate facts. Manual dispatch and native Codex context differ from production transport. Longer test deadlines accommodate dispatch overhead and are not a production latency measurement.

Run `node scripts/northstar-subagent-pending.mjs [relay-root-or-session-directory]`. With no argument it scans the default temporary relay root; an explicit session directory lists only that session's current exchange. A missing explicit path or invalid session fails with a corrective error instead of reporting an empty queue. A default root that has not been created yet returns `[]`. `submitted: true` means a response file exists; the author can remain in that state while an independent reviewer is pending. Scan the relay root to see both jobs, and do not resubmit an already submitted exchange.

Local `prepare_asset` jobs use retained bytes and the same deterministic crop script as the hosted tool. Configure `NORTHSTAR_SUBAGENT_PYTHON` with an absolute Pillow-enabled Python. Crops verify original dimensions, integer selection, masks and output bytes. Arbitrary model-authored shell commands, image generation, external sources and hosted workspaces remain disabled in this test route.

Do not edit imported client/runtime code during a live generation: development hot reload can reset the ephemeral test canvas and close its relay. Finish and archive the run first. Restore archived prototypes through native Northstar copy/paste, preserving assets and identity, rather than writing private React state.

## Evidence and remaining coverage

Archive exact source, portable rendered HTML, native restore payload, reference pixels, journey traces, screenshots and author/reviewer exchanges. Record quality verdicts separately from helper acceptance and interrupted runs. Current evidence lives in `outputs/northstar-prototype-archive/` and `outputs/northstar-harness/` at the parent workspace.

Next regression batches should cover multiple reference/design languages, desktop/mobile responsive layouts, long lists and scroll restoration, asset drag/drop and direct edits, modal focus/keyboard behavior, gestures, motion/reduced motion, rapid reversals, cancellation and retry. Private journeys suppress focus and audio; they do not establish keyboard usability, native gestures, frame rate, provider billing or production latency. Those require separate live checks.

## Creative studio coverage

`config/northstar-prototype-evaluation-cases.json` defines reusable user tasks across original creation, observed recreation, new inferred pages, individual pattern borrowing, multiple inspirations, full redesigns, side-by-side working alternatives, direct structural edits, asset framing, connected mock journeys, post-interaction refinement, responsive screens, motion/media, games/gestures, canvas exploration and cancellation/history. The cases specify user outcomes and required evidence, not preferred templates or visual scores. Unrun cases remain explicitly unrun.

References are creative materials. A user may retain an app's identity, borrow selected patterns, synthesize several sources, or authorize a completely new direction. Preserve the requested invariants, not every source detail irrespective of the brief. Saved `styleTransfer` records borrowed and preserved dimensions; its preserved list may be empty for a complete redesign. Unlisted dimensions still follow the target identity. A named example app is not a global style preset. A new original app defaults to `original`; a new referenced recreation defaults to `faithful` unless an explicit reinterpretation or saved style contract requests otherwise. Existing screen intent remains stable during local revisions.

The canvas identity keeps the inspiration library. A derived screen binds its explicit references, primary identity references and declared style-transfer sources; an unrelated borrowed reference used only by another alternative is not automatically made a comparison requirement. This does not waive citations for actual comparison sources or authorize missing assets.

A genuine studio run must archive each variant's exact source and independent review, prove originals and unrelated objects were preserved, and exercise each alternative's own runtime. Shared initial mock data does not mean alternatives share live state. Connected views inside each app use coherent product data; separate screens remain independently interactive alternatives.

Current broad coverage is incomplete. Private click/fill/scroll/wait journeys do not establish drag, keyboard or touch usability. Responsive work needs actual viewport captures at each requested device size. Native SVG/canvas and an opt-in, pinned local Three runtime are supported. Arbitrary Blender workflows, remote runtimes and asset-generation providers require separate integration and verification. Unit validation, runtime regression cases and a visually reviewed agent run are different evidence levels; none substitutes for the others.

## Design direction and graphics craft

A new design plan records the product's intended feeling, hierarchy, layout, density, navigation, typography, component geometry and motion. `emotionalRegister` ties the feeling to concrete choices; words such as "premium" alone are insufficient direction. Primary screens show the information needed for their task, with secondary views for further detail. This is brief-dependent: the harness does not prescribe one sparse card layout, palette, renderer or animation for all products. Measured visible reference details remain evidence-backed; inferred pages and interactions can be original within the requested design language.

Animated final review requires a separate `motionCraft` assessment covering composition, legibility, form/asset fidelity, continuity/contact/layering, timing/interruption and product fit. The assessment must cite actual current-source motion frames. Passing clocks, controls or initial styling does not establish that an athlete, character or moving graphic is well-crafted. A deliberate schematic style can be appropriate when requested; crude proportions or disjointed motion are not excused by containment or successful numeric checks.

## Trusted local 3D runtime

`trustedRuntimeLibraries: ['three']` opts an authored screen into a pinned host-owned Three.js 0.180.0/GLTFLoader bundle. No external scripts, network connection or author code budget is added. The bundled code and license are retained under `lib/canvas-v2/vendor`; `scripts/build-northstar-three-runtime.mjs` rebuilds it from exact registry versions. Embedded textures decode through local data images, preserving the existing CSP.

The asset drawer accepts self-contained GLB files or a glTF 2.0 file selected together with its local .bin and PNG/JPEG/WebP textures, up to 16 MB total. glTF resources are packed into one retained GLB without network requests or filesystem discovery. The agent binds their handles through `northstarAssets.arrayBuffer('northstar-asset:<handle>')`, parses with `northstarThree.createLoader()` and creates capture-safe renderers with `northstarThree.createRenderer(canvas, options)`. Models remain content assets; their body, clothing, animation and camera choices are not global app templates. External buffers, image URLs and codec loaders are unsupported. Missing or invalid models must be resolved before delivery.

Model previews render real geometry and embedded textures. **Add to canvas** creates a movable native reference viewer with orbit, reset, animation selection, looping and playback controls. Static models have disabled playback controls. Viewer state and the sampled paused pose survive a component remount; an independent copy starts independently. This is an asset viewer, not a default product layout or a mesh-sculpting editor. Characters, vehicles, products, buildings and scenes can use the same GLB path. OBJ, FBX, `.blend`, `.uproject`, and Draco/meshopt/KTX2 dependencies are not accepted by this implementation.

The development subagent canvas also exposes **Restore saved canvas**. It copies a validated durable snapshot into the current tab through the normal workspace entry point, retaining sources and assets without overwriting the original saved record. This recovers browser testing after a tab connection failure while keeping independent test tabs separate.

Renderer diagnostics report context availability/loss, preserved buffers and sampled RGB values. Nonblack pixels prove readable output, not aesthetic quality. Black or unreadable captures remain unresolved evidence, not an automatic judgment of the intended art. Live animation, reduced motion, pause/resume, disposal and current rendered frames still need inspection. The real-browser foundation fixture is `/canvas-v2-e2e/motion-foundation`; its retained human model and test scene are regression material, not a finished product or a universal scene implementation.

## Motion follows the brief

Construction and independent review share `MOTION_INTENT_POLICY`. Motion is chosen from the latest prompt and inspected references: trigger, affected layers, timing/easing, choreography, continuous versus deliberate steps, and applicable loop/pause/reversal/end/reduced-motion states. No universal animation treatment or rendering technology is prescribed.

Use intermediate live samples for procedural motion and paired reference timestamps for borrowed behavior. A final still cannot establish timing; a numeric progress delta cannot establish a smooth visual fill. Functional clocks and decorative graphics need separate evidence, and any shared relationship, such as runner position and workout distance, must agree. Live captures supplement private journeys for real gestures and perceived motion quality. The current motion case ledger is retained in the parent workspace at `outputs/northstar-harness/2026-10-12-motion-and-teaser/motion-coverage.json`; unrun cases stay unrun.


## Replaying a prototype

Selecting an authored phone exposes **Reset** beside **History**. Reset remounts that exact committed source from its saved mock seed and clears only that node's retained runtime state, including fields, scroll and product progress. It does not revise the app, reset siblings or change canvas geometry/assets. Late checkpoints from the previous frame cannot repopulate cleared state. Registered reference simulations do not expose this authored-prototype reset.

Private journeys intercept media, speech synthesis and Web Audio output attempts before authored code runs and return `audioIsolation` diagnostics. They do not prove audible quality. Review input places a numbered role/source/capture caption immediately before each image so live, fresh-default, baseline and detail views remain distinguishable.

Character-led and multi-step motion must connect meaningful choices and milestones to the requested expressions, gestures, progress artwork and transitions. Idle movement cannot prove requested retry or completion behavior. Review each materially different requested motion family from its own trigger through intermediate frames to its settled state. Shared spatial scenes also require visible contact, relative scale, depth/occlusion and camera relationships across loops and their seams; floating or abstract work follows its own intended stylization.

Motion review retains up to eight distinct current-source capture families per screen, so opening, choice, progress, retry and completion need not evict one another after three captures. Source edits invalidate those captures. Complete frame labels cannot approve movement when every retained image is identical; a held or reduced-motion sequence remains useful alongside separately observed moving frames. Differing encoded images are an evidence diagnostic, not a smoothness or aesthetic score.

Each `canvas_screen_motion_review` family has an explicit `motionExpectation`: `moving` is the default, `held` requires a live capture with a unique visible `motionTargetSelector` and a rendered crop of that same target from every frame, and `reduced-motion` requires frames whose runtime confirms the reduced-motion preference. For requested movement of a particular character, control, or other subject, also use a live capture with `motionTargetSelector`; the target's own current-source crops must change across time, with visible bounds and actual elapsed timestamps, and every crop must be cited. Changing background pixels cannot substitute for movement of the requested subject. Review target crops beside their matching full frames; the overall sequence still needs a full-frame motion and craft assessment. Whole-screen motion such as a page transition may omit a target selector. For a held target, state the target-specific judgment in `heldMotionAssessment`; ambient motion may continue elsewhere. This supports procedural canvas subjects with no CSS animations and scenes whose background continues while a subject pauses. A static full scene or a label alone does not prove a held subject. Held and reduced-motion families may contain identical pixels, but they do not replace a separately evidenced moving family. Every moving family must show its own distinct frames, and where a current source version is known, every sequence and full/target frame must match it. Timeline samples do not establish a held state because the review mechanism itself pauses animations while seeking.

### Planned transition coverage and live component reuse

Experience transitions can declare a `verification` with `action` (`click`,
`fill` or `drag`), the control `selector`, destination `viewSelector` and
`expectedText`. The shared planning parser and tool schema preserve this
contract. Final review keeps each declared transition open until a successful,
current-source, cited journey observes that destination becoming visible or
changing its visible content across the declared action. Journey traces now
retain `visibleTargetBefore` as well as `visibleTarget`. An unchanged view, a
navigation label, an unrelated control, stale source or uncited result cannot
satisfy this contract. Initial appearance review remains appearance-only.
Legacy plans without verification gain no invented journey requirement.
This establishes destination coverage, not motion craft or smooth playback.

Temporal review likewise attributes a numeric observation only to the most
recent successful control, with subsequent waits allowed. Any intervening input
ends that attribution. An earlier Pause cannot borrow a zero delta after Reset,
and an immediate unchanged Play sample does not hide a later advancing wait.
Measured nested-scroll clearance retains both canonical owner selectors and
browser-observed aliases.

Product identities may retain a component's original HTML, CSS, optional bounded
JavaScript and pinned Three runtime binding. `canvas_screen` accepts
`productIdentityId` plus `reusableComponentId`, explicit planned dimensions and
`planId` to instantiate those saved materials directly. Source overrides and
baseline copies cannot be mixed with this operation. Existing instances and
source apps stay unchanged; subsequent instance edits remain normal reviewed
screen revisions. Saving a library component does not execute it. Retained
resources, normal sandbox validation, JavaScript syntax validation at
instantiation and reference review still apply. This is exact reuse of the
saved implementation, not automatic proof that an author extracted the correct
component from an app. That identity still needs source and pixel comparison.

The prototype-quality browser fixture includes a component serialized through
product identity and instantiated through the actual screen patch path, then
clicks it in the isolated runtime. It also contrasts an unchanged destination
with a real content-changing transition, even though both pass the same text
assertion. These are behavior fixtures, not creative quality evaluations or
unassisted model-generation trials.

### Retained 3D viewer continuity

The generic retained-GLB viewer preserves imported root transforms, uses the
limiting camera field of view when fitting a bounding sphere, and recomputes
fit distance on resize while retaining the chosen orbit and relative zoom.
Wheel zoom and restored zoom share the same relative bounds. Orbit belongs to
one primary pointer and ends on release, cancellation or lost capture; other
pointers cannot take over the gesture. VM regression checks exercise those
paths. A real-browser retained model check additionally exercises clip
selection, pause and reparented-state retention. These changes extend the
existing retained GLB/Three path. Blender and Unreal glTF exports can now enter
through the bounded local resource packer, but native project files and editor
control are outside this implementation.


### Optional WebGPU runtime and local 3D interoperability

`trustedRuntimeLibraries: ['three-webgpu']` selects a separate pinned Three.js
0.180.0 WebGPURenderer bundle. Use
`await northstarThree.createRendererAsync(canvas, {backend: 'auto'})` before
rendering. `backend: 'webgpu'` requires actual WebGPU; `auto` allows Three's
WebGL2 fallback and reports the actual backend. `backend: 'webgl'` exercises
that fallback deliberately. The existing synchronous WebGL API and bundle
remain available under `['three']`. The screen accepts one runtime selection.
Both keep the existing opaque sandbox and connect-src none boundary.

Readiness waits for initialization, post-load draws and GPU submission when
available. WebGPU's presentation texture is transient, so capture re-submits the
current frame immediately before pixel readback. Backend identity, submitted
draws and observed pixels are distinct evidence. A missing or unreadable image
cannot pass visual review merely because a renderer initialized. ShaderNode
code execution requiring eval and arbitrary remote runtimes remain unsupported.

The asset drawer offers Download GLB for retained models. Local packing retains
geometry, material declarations, embedded texture bytes and animation tracks.
This is glTF interoperability with 3D tools, not native Blender/Unreal project
editing. The verification record includes a textured animated sphere exported
using Blender 5.1's official Python module, packed through the production
importer, and successfully reopened in Blender with its material, image and
animation intact. Unreal editor execution has not been tested on this host.


### Preference-specific motion captures

`canvas_screen_motion_review` accepts `motionPreference: 'reduce'` or
`'no-preference'`. An explicit preference defaults to live sampling in a
muted, focus-suppressed private copy of the exact saved code, starting from its
saved default mock state. A trigger must be reachable from that default state.
The live user's state and OS preference are untouched. Timeline mode with an
explicit preference is rejected. Each frame reports its actual preference,
copy context, requested and actual elapsed time; `motionExpectation` alone
never changes runtime preference. Offscreen browser timers can throttle these
copies, so actual timestamps must be inspected and are not frame-rate proof.

Browser verification compares the same animated source under both preferences:
normal target crops change, reduced target crops remain held, and the live
counter remains unchanged after both private captures. WebGPU live samples
also wait for current submissions and repaint the transient presentation
texture before each canvas readback, not only before the first sample.
