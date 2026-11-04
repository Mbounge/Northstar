# Rendered accessibility evidence

The authored-screen harness includes a local, pinned axe-core 4.14.0 audit against WCAG 2.1 A/AA rules. It checks an inert semantic snapshot of the actual rendered state at the authored width and at 320 CSS pixels. This is an authoring/remediation aid, not a conformance certificate or a legal assessment.

## Agent workflow

1. Read the existing page and the user's approved institutional guidance. Preserve teaching meaning, real destinations and unrelated content. Do not invent university approval or alternative text for unseen images.
2. Call `canvas_accessibility(nodeId)` before an accessibility repair. The host returns rule IDs, WCAG tags, element selectors, HTML, contrast measurements where available, incomplete results and exact source/DOM hashes.
3. Use the ordinary planned editing tools to repair the actual source. `canvas_screen.language` sets the BCP 47 language on the real runtime document and its HTML export.
4. Post-edit `canvas_review` also runs the host audit. The completion reviewer cannot override failing, stale, partial or failed automated evidence with a prose pass. An explicit accessibility request cannot complete its automated review without host evidence.
5. Re-check relevant dialogs, validation failures and later pages. Report unresolved human checks; do not repeatedly ask AI to approve an unmeasurable result.

Both model adapters use the shared tool configuration. The browser executes the checks; the separate worker must be deployed with the matching configuration and completion gate.

## Human evidence

Every authored preview has an **Accessibility** action next to Reset. Its modal shows tested widths, failed rules, affected source elements, measured explanations, incomplete checks, engine version, timestamp and source SHA-256. It defaults to a side-by-side visual comparison, with the original capture on the left and the latest checked version on the right. Both use the same authored width or 320px CSS reflow. Captures are inert, script-free documents in sandboxed frames; use the actual working preview for interaction testing. The findings view retains measured details and JSON download. A source edit marks the previous report stale. Further trusted input in the preview also marks its captured state for re-check; using the preview during an audit prevents that audit from being recorded as current. The report describes a captured state, not a live certification of every subsequent runtime state.

Agent audits are retained as computed JSON artifacts in existing session memory (three per page). Interactive history is bounded to twelve pages and three checks per page: the original baseline and the two most recent checks. Re-checking does not silently replace the baseline. Manual and agent checks persist as computed artifacts with the saved canvas session; they restore as historical evidence requiring a fresh runtime check. Temporary unsaved canvases do not gain durable storage. Users can explicitly start a new comparison from a current checked version. Full visual HTML/CSS stays in human evidence and is omitted from model tool text to avoid extra model context and cost.

Large findings retain total affected-element counts and the first twelve element details per rule. The UI explicitly labels truncation. Repair and re-check to surface further affected elements. A missing scan, zero executed passing rules, overflow, engine failure or source change cannot produce a successful automated completion.

## Isolation and performance

- Authored JavaScript runs only in the existing opaque-origin screen sandbox.
- A read-only runtime command serializes current semantic DOM, live form state and original CSS. It preserves document language and root theme attributes. It does not flatten the page into screenshot pixels or computed absolute geometry.
- The host strips executable content and event handlers before constructing a disposable audit frame. Its strict CSP forbids network, child frames and form submission. Only the pinned, SHA-256-verified local audit engine is permitted to execute there. The upstream license is retained alongside the engine.
- Each frame has its own message token, bounded lifetime and abort cleanup. No third-party audit service or paid model request is used.
- Auditing runs on explicit review and AI post-edit verification, not on every human keystroke. Normal canvas editing remains optimistic and responsive.

## Deliberate limits

The inert 320px snapshot checks CSS reflow and flags horizontal overflow for inspection. It does not execute responsive JavaScript, prove content loss absent or establish every exception to WCAG reflow. The audit does not verify the whole LMS/site, linked documents, institution branding approval, keyboard task completion, screen reader experience, alt-text meaning or media captions. These remain visible human review requirements. Incomplete rules remain incomplete even when automated remediation can finish.

There is no university LMS/CMS publishing integration in this change and no replacement of institutional sign-off.

## Local meeting rehearsal and verification

Start an isolated development server with `NORTHSTAR_E2E=1` and open `/canvas-v2-e2e/accessibility`. This route is unavailable in production. It uses the real authored-screen component, audit engine and report modal with a synthetic course and deterministic before/after source. The fixture is explicitly labelled; it does not pretend a paid authoring model executed the repair.

Run the host audit, inspect findings, apply the fixture remediation, observe stale proof, then re-test. The final preview still has a working form. Unit tests cover exact-source freshness, false pass claims, incomplete/failed scans, width coverage, regression comparisons, language preservation, engine integrity and the actual completion-review integration.

## Public StFX course validation

The local `/canvas-v2-e2e/accessibility/stfx` route uses a captured public STAT 101:11 course outline from Fall 2019, not a current Moodle export. Its original HTML and images are retained only in local `outputs/stfx-public-course-20261104`, with source URL, timestamp and hash. The route is unavailable in production. Third-party scripts are stripped; the original textbook link and assessment chart are retained. No live university content is edited or published.

The proposed repair adds semantic headings/landmarks, valid lists, document language, responsive layout, named image links and an accessible assessment-chart description checked against its original pixels. StFX's published palette is used as reference, without claiming institutional template approval.

The first agent `canvas_accessibility` call protects that page's source content for the current turn. All document write routes in the managed harness check the protected page before committing, including generic composition edits and page removal. This blocks missing/changed source words, leaf passages, original links/images and data-table row relationships. Separate explicit content-change requests start a fresh turn. Human direct edits are not locked by this agent-only guard.

Source preservation is not a semantic or visibility certificate: script-generated content, hidden content, figure descriptions and the correctness of teaching material require rendered/human review. Reports show the actual inventory coverage. Failed guards return concrete examples and do not commit the candidate.

The public-course keyboard rehearsal also exposed native fragment links resolving against the embedding URL in `srcdoc`. The shared runtime now handles local section links without host/preview navigation and moves keyboard focus to the destination, while honoring product handlers that prevent the default. A runtime behavior test and an actual browser Enter-key check cover the fix. Evidence and before/after reports are in `outputs/stfx-public-course-20261104/verification.json`.

Production validation exposed bundled font CSS larger than 1 MB. Snapshot budgets now distinguish structural markup from embedded retained resources, validate the expanded size before binding image handles, and retain the original media pixels and font bytes. Saved visuals pack repeated image data once. Oversized captures still fail explicitly rather than record a pass.

Live refresh testing also exposed the storage service upload ceiling on the existing large demo. Visual report documents are now stored structurally in private session memory, while downloadable findings artifacts remain compact. The snapshot dictionary can share unchanged font/media bytes between captures. Legacy encoded visual artifacts migrate without dropping captures. Large compressed JSON envelopes use a JSON-safe base85 payload to remove base64 overhead; existing plain JSON and gzip/base64 snapshots remain readable. Encoding stays off the UI thread, preserves source/media bytes, and retains bounded decompression checks. A rehearsal on the actual saved populated canvas verified an unchanged revision/chat hash and a 49.6 MB save containing three complete captures.
