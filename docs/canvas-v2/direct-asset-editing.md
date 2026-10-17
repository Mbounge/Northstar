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
