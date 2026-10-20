# Canvas navigation performance

The navigation fixes apply to canvas apps and reference media objects. They preserve authored app sources, object geometry and product clocks. A bounded last-known image can briefly cover a returning app while its live frame resumes presentation; it is never saved source or review/export evidence.

## Input and workload changes

- Pan and held Space suppress pointer input on all native descendants, including iframes whose inline pointer style previously intercepted drags. Select restores normal app input.
- Runtime checkpoints avoid rebuilding retained DOM state when product state and tracked form, focus, and scroll state are unchanged. Trusted input snapshots are batched while the immediate human-input signal remains intact.
- Host-owned Three rendering skips offscreen default-framebuffer draws. Authored animation callbacks and render-target passes continue; returning to the viewport or a tool capture forces a current draw.
- Reference media playback notifications update only the selected toolbar button. They no longer set workspace React state. The workspace also ignores stable-prop parent save-status renders through normal React memoization.
- Each reference media object retains a stable viewport observer. Native videos pause immediately outside the viewport. Up to four recently viewed offscreen video/GIF resources stay warm for 45 seconds; visible resources do not compete for that offscreen budget. Exact clip time and human pause preference survive eviction and return. Initial source loading stays lazy. External provider players still tear down offscreen because they do not expose a universal safe pause contract.
- Media metadata parsing is cached by source. GIF poster decoding runs once per source and releases its temporary decoder; recently viewed GIFs retain their existing image element, hidden offscreen, within the shared warm-media budget.

## Verified development-browser comparison

The comparator used four real held vertical drags of 400 pixels each over the reference library. The initial camera, intermediate object rectangles, and final return rectangles matched between runs. Only the isolated library patch was reversed for the baseline; the Pan fix and runtime changes were present in both runs.

| Main-document metric | Baseline | Optimized |
| --- | ---: | ---: |
| Sample wall time | 5.705 s | 4.768 s |
| TaskDuration | 3.116771 s | 1.884284 s |
| ScriptDuration | 2.192419 s | 0.930271 s |
| RecalcStyleDuration | 0.034106 s | 0.040483 s |
| LayoutDuration | 0.004198 s | 0.005309 s |

Normalizing each work duration by its sample wall time gives approximately 27.7% less task work and 49.2% less script work. Style and layout work rose slightly. This is one development-browser pair, not an FPS, GPU, or production-performance result. Evidence is stored in `/Users/mbounge/Documents/Codex/2026-09-05/do-x20/outputs/northstar-harness/2026-10-12-motion-and-teaser/proofs/canvas-performance/library-{baseline,optimized,comparison}-valid.json`.

## Regression checks and diagnostics

Focused tests cover unselected playback notification isolation, decoder release, source reattachment races, retained playback time and human pause, runtime checkpoint dirtiness, and continued offscreen authored clocks. TypeScript and scoped ESLint checks pass. Browser verification confirmed Pan/Space movement, Select interaction, offscreen video reset, visible autoplay, and exact restoration of a manually paused clip.

Public DOM diagnostics include `data-canvas-v2-render-count`, `data-canvas-v2-camera-preview-frame`, `data-canvas-v2-media-nearby`, and `data-canvas-v2-media-observed-bounds`. Held camera previews should move object rectangles and advance the preview counter without workspace renders from unselected media. A gesture-end viewport commit legitimately renders; development Strict Mode can double that count.

After source removal plus `load()`, browser `currentSrc` can retain a stale URL ([WHATWG issue 10410](https://github.com/whatwg/html/issues/10410)). Inspect paused state, absent source, `readyState` zero, and empty buffers instead of treating this string as a decoder-liveness signal. Chromium's [load implementation](https://chromium.googlesource.com/chromium/src/third_party/+/master/blink/renderer/core/html/media/html_media_element.cc) shuts down and deletes the previous media player.

Remaining work should start from another measured production trace. Authored app logic deliberately continues offscreen to preserve application clocks; suspending it globally would change product behavior.

## Warm revisits and editing controls, 2026-10-18

Independent native subtrees recently inside a 768 CSS-pixel prewarming margin
remain mounted on short return trips. The additional offscreen cache is bounded
to 96 subtrees, 2,400 native nodes and 16 million estimated image pixels, with a
60-second age limit checked on the next viewport/source update. These are
retention costs, not a total browser or GPU memory guarantee. Visible work,
selected/annotated content and live runtimes have their own mounting guarantees.
Ancestor containers now inherit live screen/model retention so culling a group
cannot accidentally destroy its live descendants. Source edits still reconcile;
stable node IDs retain mounting across unrelated scene revisions.

Layers reads the matching compiled native scene instead of reparsing the whole
serialized board. The source parser remains the fallback when no current native
scene exists. Selected-app toolbar controls reuse one memoized descriptor, and
screen ownership checks reuse the same exact parsed source. Retained app state
restores once per real mount, rather than cloning state on ordinary rerenders.
Validated iframe input also defers background capture work while the person is
interacting; authored app animation clocks continue unchanged.

The initial foreground development-board sample had a 458 ms maximum host
animation-frame callback gap. Opening Layers had 438 ms event processing and
an overlapping 453 ms long task. A bounded real-board
revisit did not demonstrate an image or app reload in that sample. Deterministic
retention tests and browser fixture checks are tracked separately from matched
large-board timings; host callback intervals are not GPU frame-rate proof.

The first settled retention-only comparison was mixed: Layers processing fell
to 165 ms, while pan/zoom processing remained over 200 ms. A separate opt-in
React render profile then measured ChatPanel updates of 174–275 ms during
ordinary camera/tool changes. Historical message rows now use standard React
memoization with stable timeline, artifact and callback props. Streaming turn,
artifact, busy, receipt and product-identity changes still invalidate the
appropriate content. Artifact aggregation retains its identity only while
the exact artifact objects and their order are unchanged. Root native leaves
also reuse their subtree when the warm-protection set changes without changing
their own mounting state; roots with native children still propagate it.

Native-media Chrome fixtures verify same-element warm video/GIF returns,
offscreen pause, the four-resource budget, eventual resource release, exact
human-paused video time restoration, source replacement, unmount cleanup and
reduced-motion behavior. A real GIF callback-ref replay failure found during
these checks was repaired: attaching a retained image restores its canonical
source if development Strict Mode replay cleared it. Retained hidden GIFs do
not imply an exact paused GIF animation clock.

## Native tile reuse at camera commit

Native nodes and child chunks now compare actual mounted/culled presence when
camera bounds change. An unchanged tile staying in the same presence state
reuses its DOM rather than rebuilding styles and descendants. Scene roots still
propagate new bounds. Crossing the overscan boundary, moving a root, source
changes and selected-object protection remain observable. Live screen/model
runtimes keep their existing mounting rules and state.

A matched-start Chrome production comparison on 2026-10-14 used the existing
240-image composition fixture and four synthesized wheel pans in each build.
JavaScript time was 422.6 ms before and 136.3 ms after; task time was 743.5 ms
before and 522.3 ms after. Function calls over 15 ms fell from 12 to 3, with the
longest falling from 45.3 ms to 28.3 ms. Gesture windows were approximately
4.05 and 3.82 seconds. This is one local comparison with other applications
open, not a stable FPS, physical input latency or mixed live-app board claim.
Actual post-pan selection was also exercised. Raw traces, metrics and the
comparison are archived under the workspace's
`outputs/northstar-harness/2026-10-14-core-hardening` directory.

## Populated live demo board, 2026-10-15

The next pass used the actual main demo canvas: 40 live previews, reference
rails and generated source photographs, with a 125,678,593-byte saved snapshot.
No authored preview source was changed.

- Root leaves now reuse their native subtree when only camera bounds change.
  Roots with children still propagate bounds for screenshot culling. Source,
  geometry and newly added children remain visible to reconciliation.
- The fixed-size device wrapper uses `content-visibility: auto` to reduce
  offscreen browser painting while keeping iframe identity and application
  state. It does not suspend authored animation callbacks. This policy was
  superseded by the warm-return correction below after longer actual-board
  pans exposed delayed repainting.
- The local demo autosave passes its existing 128 MB storage limit to the
  serialization worker. Previously the worker's 100 MB default rejected this
  board and triggered a second JSON encode on the UI thread. Production's
  default 100 MB limit is unchanged. Size rejection is now final, while actual
  worker failures retain the existing fallback.
- Durable demo saves store the materialized Blob directly in IndexedDB,
  avoiding a large text conversion and string copy for each checkpoint. Read,
  restore and export accept both the new Blob record and older records.
- Startup camera centring runs only for fresh canvases. Restoring a saved board
  preserves its camera rather than recentring or fitting reference flows.

One valid pre-fix sample and two post-fix samples used identical starting
cameras and the same four synthesized wheel pans, returning to the starting
camera each time. Main-document TaskDuration fell from 1,859 ms over a 3,587 ms
sample to 320 and 410 ms over 2,571 and 2,610 ms samples. These are local
development measurements with other applications open, not stable FPS or
physical input latency claims. The main-thread save handler's 486 ms trace
event disappeared, although initial snapshot structured cloning still produced
roughly 86–93 ms events. Heavy authored simulation loops remain a separate cost.

Two alternating containment comparisons reduced aggregate trace paint time
from 33.0/32.6 ms to 22.6/22.9 ms. Layout and style work rose slightly; total
task time varied with save timing. This supports retaining containment as a
painting optimization, not claiming that it pauses all offscreen computation.

Verification: 88 focused tests, TypeScript and scoped ESLint passed. Browser
checks covered long pan travel, Fit all, selection and focus from overview,
pause-state retention offscreen and working controls on return. A real refresh
restored all 40 exact encoded sources and the saved camera position. Evidence
and raw traces are in the parent workspace's
`outputs/northstar-harness/2026-10-15-populated-canvas-performance` directory.

## Long navigation and save transport correction, 2026-10-18

Actual Chrome navigation on the populated 49-screen board exposed a problem
that the shorter return trips missed. After a 1,600-pixel sideways trip and
return, several ordinary app cards were still blank in screenshots at 188 ms
and 538 ms, and were painted by 1,054 ms. This establishes delayed visible
return painting, not an iframe reload or a precise continuous flash duration.
Live iframe wrappers now keep `content-visibility: visible` for ordinary HTML,
simulations and trusted graphics. Trusted Three/WebGPU/WASM previews retain
their explicit viewport activity gate; retaining layout does not require
offscreen default-framebuffer rendering. The broader policy does not fully
resolve the return-paint delay: a fully warmed repeat still showed missing card
interiors at 32–178 ms. A public-DOM watch subsequently proved all 50 iframe
elements stayed connected, with unchanged identities and zero load events
during the trip. A reversible per-card `will-change: transform` experiment also
failed to remove the flash and was restored. This is a remaining rendering
issue, not evidence of source reloads. Chromium separately throttles offscreen
cross-origin frame rendering ([implementation notes](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/frame/README.md));
that mechanism is a candidate, not a proven attribution for this particular run.

The board Objects/Layers popover now mounts only its visible 32-pixel rows
plus four rows of overscan on each side, rather than building every row when
opening the panel. It retains an out-of-window focused row, reveals keyboard
targets, and traverses the full logical list for Tab, arrows, Home and End.
Selection, range selection, visibility and locking use the existing scene
mutation paths. The actual Chrome fixture passes 13 keyboard and windowing
contracts, including hidden/disabled first and last rows.

Snapshot serialization now uses a persistent worker with exact large-string
interning. Every request captures fresh mutable metadata immediately, including
same-revision state changes. Unchanged large source/image strings use worker
dictionary references; new strings transfer once. The worker emits the existing
portable snapshot format, discards obsolete dictionary entries, and reseeds
after failures. In the actual Worker fixture, the initial transfer contained
155,322 characters and a camera-only transfer contained 3,270 characters with
zero new large strings. This is a fixture payload comparison, not a main-board
latency measurement. Actual Worker round-trip contracts pass 7/7.

The latest narrow main-board profile before these last corrections measured
ChatPanel updates at 1.4–2.5 ms and NativeScene at 0.4–6.6 ms. Ordinary pan/zoom
event processing was 19–27 ms, but opening Layers still took 256 ms and worker
transfers still took 35–61 ms. These findings motivated the row window and
string transport changes. Wider navigation and combined-source timings are
tracked separately; small controlled drags alone do not establish a smooth
large-board experience.

The combined 30-second foreground Chrome run after these changes recorded a
median host callback interval of 8.3 ms, p95 of 9.9 ms and a maximum of 52.6 ms,
with one 55 ms long task. Layers opened in 30.6 ms (its own mount was 6.8 ms),
with 15 actual rows for 176 logical objects. Two main-board snapshot transfers
took 11.2 and 11.0 ms. ChatPanel rendering measured 1.4–1.8 ms, NativeScene
0.3–6.8 ms and Workspace 16.7–24.9 ms. These are development host observations,
not GPU presentation FPS or a production guarantee. The run used the current
user camera at 11.7498%; previous measurements used other cameras and are not
an exact matched percentage comparison. All 49 encoded sources, the revision
and the current camera were preserved. Raw results and limits are recorded in
`outputs/designer-workspace-hardening-20261018/performance-final-combined-30s.json`.

Repeated saves in the populated development route also reuse successful
artifact-source validation for one exact HTML/CSS/JavaScript triple. Current
snapshot metadata and feedback attachments are checked on every call; source
edits invalidate the result even when the document object and revision ID stay
the same. Imports/restores keep strict decoding. This removes a development
wrapper's repeated full-source scan; normal production saves already bypass
that redundant decode step. Worker transfer timings alone exclude metadata
capture and validation work, so long-task observations remain necessary.

## Return presentation and demand-driven observation

Opening a populated board no longer automatically requests an AI observation of
every screen. An explicit observation request, model turn or tool requiring
pixels still captures the current revision. The actual empty-board Chrome
check confirmed no private capture on mount and a current PNG and spatial
observation after an explicit request. This removes four concurrent private
review frames from ordinary startup; it does not replace a requested model
observation with a cached visual.

Returning live screens can retain an ephemeral last-known PNG. Captures run one
at a time after input settles, only for visited visible screens, and yield to
navigation or trusted input. Their longest output dimension and presentation
media readback are capped at 640 pixels. Authored geometry, responsive viewport,
root theme, form state, media dimensions and active animation styles are
preserved in an inert private copy. Strict tool reviews and exports keep their
existing live capture path.

Retention is bounded to 64 images, 16 million estimated decoded pixels and
32 million bytes of retained data-URL strings. These are estimates for this
cache, not a cap on total browser/GPU memory. Exact source and bound asset URL
changes invalidate a preview. Human input and mutating commands immediately
release and invalidate it; it cannot intercept pointer input. Eviction and
capture failures leave the original live frame available.

An inactive preview remains paintable at 0.001 opacity, rather than becoming a
newly revealed image only when the app returns. A parent viewport observer
starts a current authenticated handoff. The child yields through two animation
frames and a following task; the host yields through two further frames before
releasing the cover. Cancellation uses request identity, including repeated-ID
races. A 1,500 ms fail-open prevents an unresponsive app from being covered
indefinitely. This is an advisory rendering handoff, not an acknowledgement
from the GPU. Child intersection observers were removed after actual Main
diagnostics showed their callbacks stalling beyond the handoff deadline, even
though the child had received the request. No extra DOM sentinel is inserted.

The presentation cache is excluded from all cooperative capture clones,
persistence and model context. It does not pause authored clocks or turn a
last-known image into evidence of current app state. Initial uncached loading,
cold development-route compilation and occasional capture work remain distinct
from warm-return behavior. Current-source visual and timing receipts must be
checked before claiming that return painting or navigation has passed.

### Practical acceptance of this pass

The final actual-Chrome rapid held-Space test made two 1,600-pixel out-and-back
trips. All eight previously affected cards stayed painted in screenshots at
13, 170, 551, 1,032, 1,517, 2,017 and 2,516 ms after return. All twelve sampled
owners completed the authenticated frame handoff by 1,032 ms, with no timeout.
The same fifty iframe elements remained connected, with zero load events.
All forty-nine exact authored sources, revision and camera were preserved.

The final 20.001-second cold-cache run rebuilt 34 previews, including all eight
affected cards. Host callback p95 was 9.2 ms, with a 97.2 ms maximum interval;
three long tasks totalled 209 ms, with a 102 ms maximum. No automatic AI
observation occurred. Capture phase entries establish serialized work; sampled
private-frame counts are not a continuous maximum-concurrency measurement.

A separate 30.001-second navigation run exercised twelve pan steps, zoom out
and back, and Layers opening, scrolling and closing, with Chat left open.
Host callback p95 was 10.1 ms and maximum interval 105.6 ms. Thirteen long
tasks totalled 814 ms, with a 98 ms maximum. Layers mounted fifteen rows for
176 logical objects. Three worker transfers took 15.8, 17.8 and 23.5 ms.
Sources, revision and camera remained exact; all fifty frames were live and
34 previews remained cached. These are development host measurements, not GPU
FPS, a matched percentage improvement or a zero-lag guarantee. Occasional
hitches remain. A separate earlier attempt had an incomplete Chat-control
sequence and is explicitly excluded from this completed navigation run.

Current focused verification passes 55 tests, global TypeScript and scoped lint
(zero errors, one existing intentional image warning). Broader validation and a
new production build were not repeated for this practical acceptance. Receipts
are under `outputs/designer-workspace-hardening-20261018/`:

- `presentation-final-rapid-receipt.json`
- `presentation-final-cold-warming20.json`
- `presentation-final-navigation30.json`
- `presentation-no-io-quick-validation/verification-receipt.json`
