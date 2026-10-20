## Designer studio authoring (local implementation, 17 October 2026)

The focused Edit view now includes source-backed shared controls across native apps/sites, layered posters/images and SVG artwork. Multiple selection is both a manual editing scope and a Northstar conversation scope. Changes use the existing current-source checks, retained assets, user authorship and one native undo transaction per action.

- **Shared manual editing:** mixed property values remain explicit. Set shared dimensions, typography, colour, opacity, rotation or scale; move, align against selection bounds, and distribute unequal objects with equal gaps. Ancestor-plus-descendant selections reject rather than applying a transform twice. SVG translation uses its parent coordinate basis.
- **Native layers:** rename without changing IDs; reorder siblings, duplicate with unique IDs and rewritten local references, group adjacent siblings, ungroup unchanged wrappers, delete and lock/unlock native layers. The layer tree reflects real source. Selection is remembered across structural undo/redo. ID-bound CSS rules are copied for duplicates and inserted components. Locked parts remain selectable; source-owned behavior or structural selectors require a scoped Northstar change.
- **Design systems:** bounded, persisted per-screen shared styles, linked component instances and named source variants; responsive width/stack/grid presets with a read-only preview at real iframe widths; additional text case, decoration, tracking, leading and OpenType feature controls. Shared style updates preserve local property overrides. Libraries are retained through subsequent AI source revisions. These are local screen libraries, not cross-document team libraries or a full constraint solver.
- **Artwork and delivery:** numeric editing of real SVG anchors and Bézier handles, with relative/absolute curves and elliptical arcs retained as native paths; non-destructive ellipse, inset and polygon image masks, including restoring original clipping. PNG exports preserve transparency and use the original native viewport; standalone native HTML embeds retained assets and product data; SVG exports the containing native artwork with definitions and embedded resources. There is no vector boolean/pen tool, automatic subject segmentation, raster retouching, 3D/WASM packaging or editable raster text extraction in this milestone.
- **Comparison:** saved versions identify You/Northstar and display an earlier design beside the current source, with changed layer/style/behavior summaries. Both comparison and responsive previews disable authored scripts and interaction, so opening them does not create another running copy of the live app. Restore remains an undoable source revision.

Safe source reconciliation preserves existing DOM elements, listeners and live form/closure state when native layer structure changes. It validates owners and live topology before changing anything, applies only source differences, and preserves current focus. Unknown runtime-created structure does not silently become an editing target. HTML layout groups use `display: contents` to retain existing flow; their children must be selected for transforms and painted surfaces, rather than accepting a visually ineffective wrapper transform.

The controls remain contextual, save automatically and share Northstar's compact rails, custom menus and hidden scrollbar treatment. There is no Apply step. Review the dated verification receipt for executed checks and remaining boundaries; source test files alone are not evidence of an executed browser pass.

The final local verification passed 1,327 active tests with no skips, 65 browser DOM contracts, TypeScript, affected-file lint and an isolated production build. Sol subagents exercised the editing workflows in Chrome and independently inspected the actual PNG, SVG and HTML export bytes. The final interaction pass verified that a blurred field saves to its original layer while the first click selects a different layer, Shift-selection scopes both layers for Northstar, structural undo/redo restores selection, and the original live app draft and Save closure survive. The deterministic Northstar fixture verifies source and selection handoff, rather than fresh model design quality. See `outputs/designer-studio-verification-20261017/verification-receipt.json` and `browser-receipt-final-F.json` for exact evidence and execution boundaries. These changes are local; they have not been committed or deployed.

# Direct canvas editing — October 10, 2026

The first direct-manipulation milestone replaces an existing image inside an authored product screen. It changes that screen's saved component source and uses the same canvas revision history and source that chat edits read.

## User experience

- Assets is a fourth tab in the main North Star panel, alongside Chat, Shapes and Apps. There is no separate floating asset widget or asset toolbar button.
- Add imports images into the project library without placing extra objects on the canvas. Retained agent assets are available from project memory even before they are used in a screen.
- Click an asset to inspect it at full size; Escape closes the preview. Thumbnails preserve the image's aspect ratio.
- Drag a retained image onto an existing image or a single image background in an authored screen. A local outline identifies the replacement target.
- Dropping onto the canvas instead places a normal canvas image. Files can also be dropped directly onto a screen image.
- Replacement preserves the component owner and layout. The mounted runtime receives a bounded image patch instead of restarting its JavaScript. Form values, event handlers, closure state and scroll positions remain in that runtime.
- Undo and redo restore the image binding. A later chat edit reads the updated source and retained asset lineage.

## Text and sections

- Double-click native headings or body text to edit in place. Enter or clicking away saves; Shift+Enter adds a line break; Escape cancels. Unchanged text does not create a revision.
- The editor uses the product's font, size, weight, line height, spacing, capitalization and font features. Transparent gradient text gets a readable editing color and caret; committing changes only its text, preserving the original effect.
- Right-click a native section for removal. Semantic sections/articles and existing `data-northstar-component` or `data-northstar-source-container` containers are supported. Source edits do not append a second component.
- A simple removal detaches the mounted section; undo reinstates the same DOM nodes, including their handlers and field values. The layout owner and style rules stay intact; remaining content reflows naturally. Source assets, the owning screen's geometry and unrelated mock state are preserved.
- Known app-dependent sections and code-rendered text use **Remove with Northstar** or **Edit with Northstar**. They tag the exact target and prepare a plain-language request in chat, preserving an existing draft. The user sends that request; a dependency-bearing section remains functional until the code change is made.
- The default authoring guidance asks for semantic component markers on existing containers. It does not require a wrapper or alter the app's design language.

## Adding and arranging sections

- Right-click a native section to move it up/down within the same layout owner. Only adjacent real sections are exchanged; headers, navigation and unrelated siblings are not crossed. The action is unavailable at an edge. No permanent move mode or canvas widget is added.
- Moving exchanges the existing source and mounted DOM nodes. Typography, assets, form state, closures and scroll ownership stay with the actual screen. Undo/redo reverses the same structural operation.
- Add section above/below tags the exact insertion anchor and prepares a concise request in the existing chat. Describe the desired section and send it. Northstar reads the updated app source and authors a real sibling in that location, using the primary app’s design language. No stock production card or duplicate overlay is appended.
- An insertion anchor remains explicit when other components are tagged as context; choosing another anchor clears the previous anchor role without discarding its reference tag or an existing draft. Authored frame messages cannot supply that role.
- Submitting a tagged edit authorizes only that current owning screen with an explicit modify policy; users do not need to separately select the phone after direct editing. Locked, hidden, read-only and stale sources remain protected. Other screens retain their ownership protections.
- An exact passive section insertion with unchanged CSS/JavaScript can enter the mounted app without a restart. Active components or changes to event code/style architecture still use the normal runtime rebuild and review path. Newly inserted markup is bounded, retained images are bound by the host, and unsafe or duplicate identities are rejected.
- Order-dependent scripts, dynamic structure, positioned/reversed layouts and interaction-bearing sections use a targeted Northstar request so their behavior can be updated. This is conservative: arbitrary component drag rearrangement and automatic dependency analysis are not claimed.

## Boundaries

This supports retained PNG, JPEG and WebP images, native IMG elements and single CSS URL backgrounds. It does not infer arbitrary nested insertion points, directly edit a registered read-only simulation, replace screenshot-backed interface regions, or handle picture/srcset, video or animated-GIF replacement. An editable native component must exist first. Arbitrary section dragging, richer asset replacement and native animation authoring remain further milestones. Direct editing requires native source markup; data-bound or generated DOM needs a corresponding code/data change.

An actual host drop supplies edit authority; authored iframe code can only signal a drag or report a hit target. The host checks the current source again after file preparation, then commits through the existing native manual transaction. Deleted, hidden and locked screens are rejected by that transaction. Unknown drag payloads do not mutate the canvas. Target changes cancel the gesture. Newer image patches supersede older decoding work, and changes are compared against the mounted source so successive replacements retain both bindings.

## Verification

- TypeScript and changed-file ESLint passed. The production build passed with an isolated output directory; the final build completed successfully after the final editor changes.
- Previous active unit suite: 992 passed. Discovery evaluation tests: 53 passed. The final section milestone checks are recorded below. A new check compiles all isolated-runtime scripts to catch interpolation and script-boundary errors that static types cannot catch.
- Installed Chrome now runs the project browser tests. Five scenarios passed: image replacement from the main library, external-file background replacement, direct text/section/history/chat continuity, dependency-aware requests, and readable gradient text with unchanged typography/effects. The latter text scenarios were rerun after their final changes.
- The UI checks exercise actual displayed mouse positions at canvas zoom, not synthetic clicks on the app's DOM. They verify input values and closure counters, source edits, screen/camera geometry, untouched images, undo/redo, cancellation, blur-to-save, literal markup/Unicode text, and later chat edits.
- Fast library drops now activate the host drop surfaces at drag start. Asset hit-testing uses the displayed frame scale, including canvas zoom. A file drag waits for the host surface to paint before the test re-enters it, matching the real drag target transition.
- Context-menu events are isolated from canvas selection gestures. The editor preserves typography and remains readable for a transparent-color heading. Code-rendered labels are identified before they change, as well as after runtime text differs from static source.
- The development fixture server logged an intermittent webpack module error while compiling its first route; the browser workflows completed, and the production build passed. This is not a claim of tested production startup or deployed end-user behavior.
- The deterministic Fieldnotes fixture is development-only and generic. These checks establish editing behavior; they do not prove a model's aesthetic judgment, reference fidelity, animation quality, or correctness for every arbitrary app/script.

Changes remain local until deployment. Unrelated checkout changes and historical production proof receipts are preserved. The manifest's production source count increases by four for the asset helper/panel and direct-edit helper/controls.

## Section milestone verification

The new browser checks exercise both move directions and boundaries, undo/redo, exact above/below insertion, inherited component styles, retained input values and save counters, and multiple tagged components with a unique insertion anchor. A separate case checks order-dependent code remains untouched while a targeted request is prepared. These are deterministic interaction fixtures; they do not validate arbitrary model-generated aesthetics or guarantee faithful recreation for every app. Final check results are recorded in the local output receipt.

Final October 10 checks passed: 8 browser scenarios, 993 active tests, 53 discovery evaluation tests, TypeScript, changed-file ESLint, and the isolated production build. The cold development fixture compile warning remains recorded above; production startup/deployment is not claimed.


## Appearance milestone

Right-click an existing native element and choose **Appearance** to change text colour, background, text size, weight or corners. The temporary editor opens beside the phone when space permits and scrolls on small viewports. Apply is disabled until a field changes. Cancel and Escape discard the draft. Only changed properties enter the source; an inherited transparent background is not replaced with its parent's fill.

Apply uses the existing source transaction, mounted runtime and version history. It does not append a decorative overlay or rebuild the app. The edited phone becomes the selected owner for a subsequent chat edit, and undo/redo retains that owner. Unselected human work remains protected. This closes a browser-observed gap where a normal follow-up after a direct edit was previously rejected unless the person selected the phone's border again.

Elements whose appearance is controlled by script, or screens with important CSS rules, use **Style with Northstar**. The exact current element is tagged and a request is prepared in chat. This conservative fallback avoids a temporary inline change that would be overwritten by the app. It does not infer arbitrary code dependencies or directly recolour image/SVG pixels.

Verification for this milestone uses the in-app browser against the development-only Fieldnotes fixture. It confirmed native button background/corner changes, undo/redo, retained input and closure counter state, cancellation, rejection of an invalid colour, heading size changes with unchanged transparent fill, and a later chat source refinement retaining the direct styles and working control. A second concurrently mounted prototype confirmed a script-controlled button stays functional while a precise styling request is prepared. The fixture tests source integration, not a live model's design judgment.

TypeScript, changed-file ESLint and 62 focused source/runtime/history/ownership tests passed. Two browser regression cases were added: appearance/history/chat continuity (without a border-selection workaround), and code-controlled styling. Their automated Playwright run could not reach the app because bundled Chromium was missing and the installed Chrome process aborted at launch. The interactions above were checked through the in-app browser instead; an automated E2E pass is not claimed. The browser log also contained unassigned MutationObserver errors during preview creation/reloads; their origin is unresolved, so a clean browser console is not claimed.

The isolated production build passed on retry after a transient next/font Google-font loader failure. Existing PostCSS and deprecated middleware-size warnings remain. Remaining verification boundaries are recorded in the local appearance receipt. These changes remain local and do not establish deployed behavior or universal reference fidelity.

## Edit view and selection inspector (October 17, local)

Select an editable app and choose Edit. Native clicks select its actual elements without activating app buttons. Preview returns input to the app. The selection outline follows the owning element at canvas zoom, names its type and supports dragging, arrow nudges, Shift increments and alignment guides. Containers keep their interiors available for selecting child elements. A move changes the selected element's CSS offset while preserving the surrounding layout; it does not reorder a flex/grid layout or implement a general component layout editor.

A compact right inspector shows the owning app and the selected element's appropriate controls. Text has content, source font families, size, weight, alignment and spacing. Images have replacement, fit and crop position. Local surface and position properties remain bounded by the existing source validation. The font menus use the canvas toolbar's custom menu styling; colour selection reuses its shared palette. Number fields hide native steppers. Scrolling the inspector stays within its content region and does not navigate the canvas. The selection header remains visible and scrollbar chrome is hidden.

Changes save automatically after a short pause; there is no Apply or Cancel action. Switching selection or returning to Preview flushes pending input. Edits use the native source transaction, ownership checks and history. Source-controlled text/appearance and baked image pixels retain their existing boundaries and a scoped Ask Northstar path. A native font selector cannot change lettering baked into a raster image or SVG paths.

The deterministic Chrome fixture has verified direct native source changes, custom font selection, actual keyboard and pointer movement, image fit/crop and replacement, unchanged unrelated imagery, undo/redo and retained form values/closure counters. Automatic text saving was verified with the caret still focused after the actual app text changed. These local checks do not claim deployed behaviour, universal support for arbitrary authored scripts, or an aesthetic quality guarantee. The automated browser regression source has been updated; a fresh automated Playwright pass is not claimed.

### Native inline text and scroll continuity

Double-click a text element, or choose “Highlight and edit on canvas,” to place a caret directly in it. Select a phrase and use the existing canvas text toolbar for colour, font, size, bold, italic or strikethrough. Supported formatting becomes bounded native inline runs inside the original app element and saves automatically. The live patch preserves the owning element, app closures and input state. Switching out of text editing flushes the latest input. The same text can be reopened and its runs survive undo/redo. This path excludes links, lists, arbitrary HTML, images, controls, identities and executable markup. Source-owned text still requires an app-code change.

The inspector reports mixed typography/colour when text contains different runs. A whole-element typography change applies across its text runs; range formatting remains available through the inline toolbar. Baked image lettering and SVG paths are not converted into editable font text.

Scrolling no longer clears and recreates the selected element. Source/capability checks are retained while its scroll position changes; geometry updates through a reference read by the selection surface. This avoids parsing the complete app HTML and rebuilding the inspector on every scroll frame. The inline editing surface clips to its owning app viewport. No claim of a measured universal frame-rate guarantee is made.


Final local Chrome checks confirmed phrase-only violet/Georgia formatting in the real heading source; whole-element colour changes propagated across its runs and undo restored their independent styling. The original input remained “My creative studio” and its closure counter advanced from Saved 1 to Saved 2 after formatting. Native scrolling moved the app scroll owner from 0 to 753.5 and back to 0 while the inspector retained the same DOM identity, the committed revision stayed unchanged and the iframe's canvas coordinates stayed identical. The outline hid outside the app viewport and returned to the selected heading; inspector scrolling left both the app scroll and canvas camera unchanged. This establishes interaction continuity for the fixture, not a universal measured frame-rate guarantee.


### Human-to-Northstar handoff

Both chat runtimes flush pending native text/style edits before reading or submitting context. A failed save keeps the draft and reports the failure instead of running the agent against older work. Ask Northstar flushes first, then reads a fresh, validated descriptor from the current screen; it does not tag the pre-save source. The native workspace directory reports human authorship and edit versions. Instructions treat current human decisions as the refinement baseline and permit explicitly requested selected edits, while retaining protection for unrelated work. This is a source/scope contract, not proof of the model's aesthetic judgment.


## Focused Edit view: layers and properties

Edit keeps the existing live screen mounted on the canvas. The workspace saves its camera, fits the selected object between a 232px left layers rail and 280px right properties rail, places the conversation over the left layers rail when opened, and restores the camera on exit. Closing chat reveals the same layers/search/selection without leaving Edit mode. Resizing the browser refits the active object. Back to canvas and Preview flush pending manual edits before leaving. Ask Northstar flushes all pending native edits, refreshes every selected descriptor against one current source version, attaches the entire selection atomically, and opens chat within Edit mode. It does not clear the selection or restore the canvas camera.

The layers rail enumerates the entire composition from saved HTML, including nested SVG groups and individual artwork parts; selecting a part never shrinks the tree to that part's SVG. It exposes source order, actual represented parent relationships, collapse/expand, search, keyboard navigation and synchronized selection. Selecting a layer explicitly reveals it within its live scroll container. The inspector displays grouped contextual sections rather than a row of crowded property tabs. No Apply step is required.

Research references and implementation boundaries:

- [Figma layer selection](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects): the tree and canvas must identify the same object, with meaningful nested navigation. The current designer studio adds multi-selection and native layer actions; these are source operations rather than inferred image layers.
- [Figma properties panel](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar): selection determines visible editing controls. Northstar uses compact contextual typography, position, layout, image and appearance sections, with a clear empty selection state.
- [Figma auto layout](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma): fixed dimensions, content sizing and filling a parent have different semantics. Northstar currently exposes actual CSS dimensions/units, auto sizing, bounded flex/grid controls, padding and gaps. It does not claim Figma auto-layout feature parity or label every percentage as Fill.
- [Figma image properties](https://help.figma.com/hc/en-us/articles/360041098433-Adjust-the-properties-of-an-image): source imagery and its frame are distinct. Northstar retains image identities and separately editable poster text/logo layers, with image fit and crop position. Flattened raster lettering is still pixels; the tree does not invent recoverable text or subject layers.
- [Figma vector editing](https://help.figma.com/hc/en-us/articles/360039957634-Edit-vector-layers): editing a vector's points and curves is distinct from changing paint or object geometry. Current SVG controls cover native part/group selection, fill, stroke, opacity, position, rotation, scale and numeric shape dimensions; native anchor/control-point coordinates are now editable in Artwork; a pen/drawing tool is not implemented.

Native edits remain subject to current-source checks and target-owned code analysis. A script controlling one element must not disable unrelated static layers; ambiguous code ownership requires a scoped Northstar change. SVG live patches preserve definitions, IDs, unrelated elements and existing app state, including Undo/Redo.


## Collaborative selection and text geometry

Within the edited object, Cmd/Ctrl-click adds or removes a layer, Shift-click in the tree selects a range, and Shift-click on the artwork adds/removes a part. Multiple selections show their exact names and outlines in a separate right-hand summary. The summary scopes one Northstar instruction and now exposes explicit shared manual controls with mixed-value states. The existing feedback collection can append/remove those native targets and retains its combined 24-item limit across screen parts and canvas objects.

Feedback batches validate all members before attaching any. Sending waits for pending human edits and refreshes target source/text/geometry, so a later manual edit does not leave the agent with an older version. Stable IDs survive local edits/history; ambiguous positional selectors are rejected after structural shifts instead of being redirected to a sibling. Async descriptor refreshes cannot overwrite a newer user selection, and duplicate Send actions are blocked while preparing a request.

Inline text editing preserves the native element's padding, border space, horizontal alignment and glyph baseline. Source glyph bounds come from a real DOM Range inside the live frame; the host editor uses those metrics without persisting its positioning correction into the authored source. This addresses labels jumping upward when double-clicking padded or centered buttons.

The designer studio milestone adds shared manual properties, layer actions, local systems, native point coordinates, masks, export and comparison as described above. Advanced constraint solving, a pen/boolean drawing tool, raster retouching and team component libraries remain separate capabilities.

Incremental verification: `outputs/collaborative-editing-20261017/verification-receipt.json` and `browser-receipt.json` record independent Sol testing, actual Chrome interactions, source/history/state checks, and the deterministic fixture boundary. These tests verify routing and atomic refinement behavior; they do not claim a fresh live-model design-quality evaluation.


## Layer hover and visual feedback sessions (18 October, local)

Layer-row hover outlines the exact rendered element, including SVG parts and
contents groups, without changing selection, inspector, source or history.
Leaving the row clears the outline. Geometry follows motion and scrolling;
stationary bounds do not trigger repeated overlay style writes.

Ask Northstar starts a temporary feedback session within Edit view or the main
canvas. Click a part, select an area or draw a freehand mark, then write its
anchored comment. Multiple comments may refer to the same part. A closed circle
remains a drawn region. Readable numbered comment bubbles sit beside the artwork,
with leader lines to their exact regions. Saved comments remain visible while
another comment is being written; each can be reopened for editing. Placement
avoids the editing rails and separates nearby bubbles when space permits. Regions
and leaders follow pan and zoom; offscreen regions hide their bubbles. Long
comments scroll inside their bubbles. Crowded views use a scrollable column of
the same readable comments, with leaders for the currently visible rows, instead
of covering earlier comments. A newly opened editor scrolls into that column
once; typing does not keep moving the reader's position. Portal mount and size
changes invalidate placement, including when adding another comment without
moving the camera. Canvas mutation shortcuts are suspended while marking; text input
keeps its normal editing behavior. Cancel discards the temporary session.

Done includes the pending comment and prepares numbered captures alongside the
individual comments. Only an acknowledged, fully validated batch clears marks
and opens chat. Chat initially shows a compact comment count; Review expands the
individual comments and small marked-region thumbnails. Send is a separate action.
The attachment pair stores visual
metadata with stable owner IDs, selectors where available, local/world bounds
and source fingerprints. Whole-object and child-element scopes remain distinct
when removing a batch. Source changes are checked again before Send, including
restored drafts; native artwork also checks its stylesheet fingerprint. Imports
validate draft attachments and historical visual-feedback pairs before display.

Captures retain marked native subtrees while navigating to distant canvas areas.
They normalize cloned paint origins while preserving rotation and child layout.
Public camera image culling records authored visibility, which marked captures
restore only on their clones. Intentionally hidden artwork remains hidden.
These operations do not modify authored artwork or its undo history.

Large-board performance work caches screen-source indexes and lazily fingerprints
marked owners, memoizes runtime asset bindings, stabilizes the editing context,
and avoids stationary annotation/hover style updates. The opt-in DEV observer
records host callback timing, long tasks and observable selection latency. Its
versioned reports explicitly distinguish host scheduling from GPU presentation
FPS and discard background-tab captures. Actual 49-screen board receipts and
raw measurements are retained in outputs/designer-workspace-hardening-20261018.
