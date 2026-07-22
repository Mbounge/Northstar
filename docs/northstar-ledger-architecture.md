# Northstar browser-session ledger architecture

Status: Phase 0 contract with corrected Phase 1 ledger authority, corrected Phase 2 stateless turns, Phase 3 direct projection, and Phase 4 production architecture cutover implemented.

This document is the implementation contract for the Northstar orchestration rewrite. Later phases may extend these contracts, but they may not weaken them or reintroduce a second source of truth.

## Purpose

Northstar needs one authoritative, inspectable history of everything that has happened during an artboard run. The language model decides what it wants to accomplish. The control system creates and owns the task representing that obligation. The task remains unresolved through every attempt until the intended result is committed, deliberately cancelled, or explicitly superseded.

The intended loop is:

```text
read confirmed ledger state
→ LLM chooses one next activity
→ control system creates a task and task ID
→ control system starts an attempt and attempt ID
→ activity executes
→ result is validated
→ artboard result is projected when required
→ commit advances ledger HEAD
→ task completes
→ only then may the LLM choose another activity
```

## Authority model

The responsibilities are deliberately separated:

- **LLM:** chooses the next bounded activity and supplies task content. It never supplies task, attempt, sequence, commit, or event identity.
- **Browser-owned ledger:** owns the run, task, attempt, commit, event sequence, current HEAD, and progression gate.
- **Task controller:** asks the LLM for a decision only when no unresolved task exists; executes and retries the active task until it reaches a legitimate terminal state.
- **Artboard runtime:** prepares a detached candidate and applies bounded primitive operations to one mounted surface. It is orchestration-blind and never an independent source of truth.
- **Server/API:** becomes stateless and turn-based in Phase 2. It receives a ledger context and returns one decision or one attempt result.
- **Debug inspector:** reads the same ledger without changing it.

## Phase 1 persistence boundary

The Phase 1 ledger is intentionally ephemeral:

- one ledger instance belongs to one browser workspace session;
- it is stored only in memory;
- it is not written to Supabase or another database;
- it is not written to `localStorage`, IndexedDB, the filesystem, or a server-global registry;
- a page refresh starts a new ledger;
- a manual JSON export will be added with the inspector in a later phase.

The store interface is designed so persistence can be introduced later without changing task semantics.

## Core invariants

### Single source of truth

The ledger HEAD is the authoritative committed state. React component state, runtime messages, progress labels, acknowledgement delivery, and the visible DOM are projections or transport details. They cannot advance the run independently.

### System-owned identity

The control layer creates:

- run IDs;
- task IDs;
- attempt IDs;
- commit hashes;
- task, attempt, commit, and event sequence numbers.

An LLM activity draft contains intent, expected outcome, kind, and execution input only.

### One unresolved obligation

A run may have at most one active task. The next LLM decision cannot be requested while a task is unresolved.

An unresolved task can be:

- newly created or active;
- waiting for transport resolution;
- waiting for detached artboard preparation;
- waiting for projection of one prepared candidate;
- waiting for a preparation or projection retry;
- blocked and requiring correction.

A run may progress only after the task is completed, cancelled, or superseded through an explicit ledger transition.

### Attempts are not tasks

A task represents the outcome the LLM wants. An attempt is one execution try under that task.

```text
Task T7
├── Attempt A1 — transient request failure
├── Attempt A2 — correctable validation failure
└── Attempt A3 — committed successfully
```

Retries never create a new task and never count as independent progress.

### Atomic progression

A successful task transition records, in one reducer command:

- the completed attempt;
- the immutable commit;
- the new HEAD;
- the completed task;
- the released active-task slot;
- the corresponding ordered event.

A failed attempt changes none of those committed-state fields.

### Artboard completion gate

In later integration phases, an artboard task cannot complete merely because an operation was generated or prepared. Preparation creates one deterministic candidate containing both:

- a candidate commit hash;
- an expected candidate state hash.

A projection receipt must identify that exact commit and report that exact projected state hash. A caller-provided `verified` boolean is insufficient by itself. The ledger independently compares the receipt with the prepared candidate before HEAD can advance.

### Idempotency

Repeating an already accepted task, attempt, failure, projection, or commit command must either:

- return the existing state unchanged, or
- reject a contradictory duplicate.

The public store and the reducer both enforce this rule. A completed task cannot silently accept a different result, state snapshot, attempt, candidate, or projection identity. It must never produce a second commit or duplicate visible work.

### Projection retry identity

A transient projection failure does not invalidate the prepared attempt. The same task ID, attempt ID, candidate commit hash, and candidate state hash remain active:

```text
candidate C7 prepared under attempt A3
→ projection response lost
→ retry or inspect C7 under A3
→ confirm C7 or explicitly fail A3
```

The executor and LLM are not called again merely because projection transport was uncertain. A new attempt is allowed only after the existing prepared attempt is explicitly resolved as a non-transient failure.

### External-boundary safety

Thrown decision-provider, correction-provider, executor, and projector errors are converted into structured ledger failures. No rejected promise may leave an attempt silently active or cause the controller to move to another task.

### Deterministic ledger values

Ledger values are validated as finite, plain JSON data before cloning, hashing, or committing. The foundation rejects non-finite numbers, undefined values, sparse arrays, accessors, non-enumerable properties, class instances, functions, symbols, and circular references. Invalid runtime data cannot collapse into another valid JSON value or create a hash collision through JSON coercion.

### Observer isolation

Ledger subscribers are observational. A failing inspector or React subscriber cannot abort, roll back, or alter an authoritative ledger transition.

### Complete operational history

The context built for the next LLM decision contains the complete ordered run history:

- run objective and status;
- current HEAD and committed state;
- every task;
- every attempt and failure;
- every commit and result;
- every ledger event;
- the current unresolved obligation, when one exists.

This is operational history, not hidden model chain-of-thought.

## Required task lifecycle

```text
created
→ active
→ completed
```

Retryable failure:

```text
created/active
→ retryable-failure
→ active with a new attempt
```

Correctable or terminal failure:

```text
active
→ blocked
→ active with corrected input
```

Artboard task:

```text
active
→ awaiting-projection with one prepared candidate
→ transient projection retry on that same candidate
→ completed after exact commit-and-state verification
```

Explicit exits:

```text
unresolved
→ cancelled
```

or:

```text
unresolved
→ superseded
```

## Event model

Every meaningful state transition appends a monotonically ordered event. Phase 1 includes events for:

- run creation;
- root commit creation;
- LLM decision recording;
- task creation;
- attempt start;
- attempt preparation;
- attempt failure;
- transient projection retry;
- terminal projection failure;
- control-boundary failure;
- commit creation;
- task completion;
- task cancellation or supersession;
- run completion or failure.

The event stream is append-only. The debug inspector introduced later will observe this stream without invoking ledger commands.

## Prohibited dependencies for the new ledger path

Files under `lib/canvas-ledger/` must not import or call:

- `lib/canvas-ai/northstar-artboard-ack.ts`;
- `lib/canvas-ai/northstar-artboard-actor.ts`;
- `lib/canvas-artifacts/northstar-repository.ts`;
- `lib/canvas-artifacts/northstar-repository-reducer.ts`;
- `/api/canvas-ai/artifact-ack`;
- Supabase;
- `localStorage`;
- IndexedDB;
- filesystem persistence;
- `globalThis` registries.

The old path may remain untouched until hard cutover, but the new ledger path may not depend on it.

## Phase boundaries

### Phase 0 — contract and guardrails

- architecture contract;
- static boundary tests;
- opt-in legacy baseline test that demonstrates current DOM replacement behavior.

### Phase 1 — isolated browser-owned ledger

- ledger contracts;
- pure reducer;
- ephemeral store;
- complete LLM context builder;
- task controller with retry and correction semantics;
- one stable workspace-owned instance behind `NEXT_PUBLIC_NORTHSTAR_LEDGER_FOUNDATION=true`;
- no control over the production artboard yet.

### Phase 2 — stateless LLM turns

The browser task controller calls an API that performs exactly one decision, attempt, correction, or finalization turn and retains no authoritative run state.

### Phase 3 — direct task runtime

Artboard preparation and projection use detached canonical state and direct, idempotent operations that preserve unchanged DOM identity. Phase 3 exports the complete controller composition for Phase 4 but does not activate it in the production workspace.

### Phase 4 — complete integration

The workspace ledger, task controller, stateless API, and direct runtime become one progression loop.

### Phase 5 — ledger inspector

A read-only timeline, task, attempt, commit, diff, and event inspector is added.

### Phase 6 — hard cutover

The old acknowledgement and browser-repository architecture is removed. There is no dual authority period.

## Phase 1 acceptance criteria

Phase 1 is accepted only when:

- the ledger instance is browser-workspace-owned;
- the API route does not create or own it;
- task and attempt IDs are generated by the store;
- only one unresolved task can exist;
- retries stay under the same task;
- failures leave HEAD unchanged;
- artboard commits require an exact candidate commit and state projection;
- transient projection retries retain the same task, attempt, and candidate;
- thrown external-boundary errors are recorded without orphaning work;
- contradictory duplicate completion is rejected;
- ledger values are deterministic finite JSON;
- observer failures cannot affect authoritative transitions;
- the next decision is blocked while a task is unresolved;
- the next LLM context contains complete ordered history;
- ledger modules have no legacy or persistence imports;
- all reducer, store, controller, context, and boundary tests pass.

## Phase 2 — stateless model turns

Phase 2 adds a separate, feature-gated `POST /api/canvas-ai/turn` endpoint. It is a stateless execution service, not an orchestration authority.

The endpoint accepts exactly one of four responsibilities:

1. decide the next bounded activity;
2. execute one system-owned task attempt;
3. correct the same active task after a correctable failure;
4. finalize a run that has no unresolved work.

Every request carries an immutable ledger context. The server does not create or retain run, task, attempt, commit, or projection identity. Every response is tied to a transport correlation ID and, where relevant, echoes the exact task and attempt IDs supplied by the browser ledger.

The Phase 2 endpoint is enabled only with `NORTHSTAR_STATELESS_TURNS=true`. The legacy `/api/canvas-ai` route remains untouched until hard cutover.

### Artboard boundary

A successful artboard attempt in Phase 2 produces a mutation draft only. The browser ledger records the attempt as `drafted`, marks the task `awaiting-preparation`, leaves HEAD unchanged, and blocks the next LLM decision. Detached preparation, live application, projection verification, and commit happen in Phase 3.

### Transport ambiguity

The turn client performs no implicit semantic retry. When an execution POST has an uncertain outcome, the browser ledger records the current attempt as `transport-uncertain`, records the original request correlation ID, and marks the task `awaiting-transport-resolution`. The attempt remains the active obligation and HEAD does not change.

`resumeActiveTask()` resends the exact same request ID, task ID, and attempt ID. It does not create another attempt or ask the LLM for a new activity. A repeated uncertain result remains on that same attempt; a definitive response then either completes that attempt or records its typed failure.

The stateless server does not claim durable response deduplication in this phase. Reusing the same request ID preserves causal identity and makes explicit recovery inspectable while avoiding a silent retry under a different ledger identity.

### Tool failure classification

Tool failures are classified according to whether the active task input must change:

- unknown tools, canvas-writing tools, malformed arguments, and tool-call limits are `correctable`;
- temporary catalog or read-tool infrastructure failures are `transient`;
- invalid values returned by an internal read tool are `terminal` protocol failures.

A correctable tool failure returns to the LLM under the same task and cannot be retried unchanged as a transient attempt.

### Dual response validation

The server validates model output before returning it, and the browser independently validates the HTTP response before the ledger sees it. Attempt results, corrected execution inputs, and final summaries are all rejected when they contain ledger-owned run, task, attempt, candidate, commit, projection, or sequence identity.


## Phase 3 — detached preparation and direct projection

Phase 3 consumes the exact `artboard-mutation-draft` recorded by Phase 2. It does not ask the LLM to regenerate the work and does not create another task or attempt merely because preparation or projection must retry.

The authoritative sequence is:

```text
drafted attempt under active task
→ capture committed base state from ledger HEAD
→ prepare the draft against a detached browser tree
→ canonicalize the resulting target state
→ derive deterministic primitive operations
→ ledger records one prepared candidate
→ capture the mounted live surface
→ require live state to equal the committed base or exact target
→ apply operations one at a time to the same surface session
→ capture and verify the exact target state
→ issue a receipt for the exact candidate commit and state hashes
→ ledger commits, advances HEAD, and completes the task
```

### Canonical projection state

The projection state is finite deterministic ledger data containing:

- one stable root element;
- first-class element and text nodes, each with a stable node ID;
- element tag and HTML/SVG namespace;
- canonical attributes, class tokens, and inline style declarations;
- ordered children;
- bounded named CSS layers;
- finite artboard-space bounds.

HTML names are canonicalized case-insensitively where the browser does so. SVG names and CSS custom-property names preserve their required casing. Inline styles are canonicalized through browser CSSOM during detached preparation so shorthands, colors, invalid declarations, and `!important` cannot create a visually applied but hash-mismatched candidate.

### Primitive operation boundary

The direct runtime accepts only these operations:

- `insert-node`;
- `remove-node`;
- `move-node`;
- `set-text`;
- `set-attributes`;
- `set-styles`;
- `set-classes`;
- `set-css-layer`;
- `set-space`.

There is no operation for HTML strings, `innerHTML`, `outerHTML`, `replaceChildren`, `document.write`, subtree replacement, whole-document activation, repository checkout, or acknowledgement. Stable nodes whose canonical identity does not change remain the same live DOM objects. A node that changes kind, tag, or namespace must use a new ID.

### Detached preparation

Preparation never mutates the mounted artboard. The iframe bridge creates a detached tree from the committed ledger snapshot, applies the requested operations there, captures the browser-canonical result, and returns that state. The host then derives the minimal deterministic operation plan from the authoritative base to the canonical target and proves that replaying the plan reproduces the target before recording a candidate.

A preparation result that produces no canonical change is correctable rather than fabricated progress. An invalid committed base is terminal. A malformed or unsafe model draft is correctable. A transient detached-surface failure remains attached to the same drafted attempt and draft.

### Projection authority and verification

Before touching the live surface, the projector independently verifies:

- the task is still the ledger's one active task;
- the attempt is still prepared and current;
- task base commit equals current HEAD;
- candidate commit and state IDs match the attempt;
- prepared base and target hashes match the authoritative snapshots;
- replaying the prepared operations from the authoritative base produces the exact candidate target.

The projector then captures the live surface. If it already equals the target, projection is confirmed without replaying operations. If it equals neither base nor target and there is no recorded uncertain prior projection, projection terminates without mutating the surface.

Every operation targets one `surfaceSessionId`. A remount changes that ID and makes continuation or rollback terminal. React renders, iframe load events, elapsed time, and visual appearance are never commit confirmation. Only a fresh canonical capture equal to the exact target can produce a verified receipt.

### Failure, rollback, and retry semantics

A known partial projection is rolled back with the same primitive operation system and verified against the committed base. Rollback never uses whole-tree replacement. Rollback failure or a surface remount during rollback is terminal.

When an apply or final verification response is lost, the ledger records a transient projection failure with `outcomeUnknown`. Resumption keeps the same task, attempt, prepared operations, candidate commit hash, and candidate state hash. The projector first captures the same surface session:

- exact target → confirm the existing projection;
- exact base → retry the same candidate;
- partial state on the same session → roll back to base, then retry the same candidate;
- another surface session → terminal remount failure.

Preparation retries similarly retain the same drafted attempt. No preparation or projection transport failure invokes the LLM or creates a new task. A correctable draft failure may produce a corrected new attempt under the same task.

Cancellation cannot close ledger authority over a partially mutated surface. If cancellation arrives after any live operation, the projector performs an independent bounded capture on the same surface session, restores the exact committed base with primitive rollback when necessary, verifies that base, and only then allows the abort to close the attempt, task, and run. A remount or failed cancellation rollback is terminal rather than being misreported as a clean cancellation.

### Runtime bridge and security boundary

The existing web-artifact document includes a dormant, self-contained projection bridge. It accepts messages only from its parent window, validates exact request and response schemas, rejects unsupported tags, event attributes, unsafe URLs and CSS, duplicate IDs, cycles, invalid indexes, oversized trees, and unknown fields. Inserted subtrees are collision-checked before the live DOM is changed.

The bridge is intentionally orchestration-blind. Its interface is only:

```text
prepare(base state, operations) → detached canonical state
capture() → canonical live state
apply(surface session, one operation) → acknowledgement
```

It does not know about the LLM, tasks, attempts, retries, commits, progression, or ledger commands.

## Phase 4 production architecture and Phase 4R product repair

Phase 4 installs the corrected Phase 1–3 authority path in the production workspace. Phase 4R repairs the product integration so that the new authority runs underneath the established North Star experience rather than replacing it with a visible ledger prototype.

Both sides of the stateless authoring boundary remain feature-gated:

```env
NEXT_PUBLIC_NORTHSTAR_TOTAL_ARCHITECTURE=true
NORTHSTAR_STATELESS_TURNS=true
```

An optional developer-only inspector is enabled separately:

```env
NEXT_PUBLIC_NORTHSTAR_DEBUG_INSPECTOR=true
```

The browser flag enables ledger-owned authoring and the direct writer. It does not redefine every chat message as an authoring objective. The server flag enables the stateless `/api/canvas-ai/turn` endpoint. The older foundation harness is suppressed while total architecture is enabled so two browser ledgers cannot exist in one workspace.

### Product routing

The existing chat remains the product boundary. A message is routed before it is appended or assigned a run:

```text
casual conversation, questions, attachments, or selection-scoped work
→ established `/api/canvas-ai` streaming experience
→ no ledger authoring run is created

clear text-only whole-canvas authoring objective
→ bind one assistant message to one future run
→ select or prepare one compatible working surface
→ create one browser-owned ledger
→ use stateless turns and direct verified projection
```

Examples such as `Hi`, `Thanks`, or `What do you think of this?` remain conversational. They must not create research tasks, modify the canvas, or inherit activity from a previous run.

A ledger snapshot may update only the assistant message that owns its exact `runId`. Before the run ID exists, the snapshot objective must exactly match the submitted objective. An older Awin/Whop ledger therefore cannot attach Whop activity to a newer `Hi` message.

### Authoritative authoring sequence

```text
user submits one explicit authoring objective
→ workspace chooses the selected compatible artifact when possible
→ otherwise chooses an existing compatible artifact
→ otherwise promotes the latest committed legacy document on the same canvas object
→ only as a last resort creates a product-oriented working surface
→ workspace captures that mounted surface canonically
→ workspace creates one ephemeral ledger from the exact capture
→ stateless API decides one bounded activity
→ ledger creates task and attempt identity
→ stateless API executes that exact attempt
→ retrieved tool evidence is recorded immutably on the attempt
→ nonvisual work commits while preserving canonical artboard state
→ visual work is drafted, prepared offscreen, projected primitively, and verified
→ verified canonical state is serialized into the normal canvas artifact payload
→ the canvas document model is updated before another model decision
→ ledger advances through the remaining bounded activities
→ finalization completes the run
```

The verified-state synchronization gate is part of progression. If the verified state cannot be written back to the canvas object model, the run fails and no later model decision is permitted.

### Protocol repair

Model execution output and wire protocol output are separate schemas. Response builders explicitly select permitted fields and never spread model output into an API response. In particular, the model-only discriminator `outcome` is not present on an `attempt-failure` response.

Successful and failed attempts may carry read-only `evidence`. That evidence is validated at the browser boundary, recorded on the exact ledger attempt, and rendered with the existing app, flow, screenshot, and research-result components. Evidence does not create identity or advance HEAD.

### Target-scoped single-writer cutover

Enabling Phase 4R does not replace every mounted artifact host. Until an explicit ledger-authoring request binds a target, existing artifacts continue using the established legacy host and retain their previous interaction behavior.

For each artifact, `CodeArtifactHost` chooses exactly one implementation:

- total architecture disabled, or artifact is not the bound authoring target → established legacy repository host;
- artifact ID equals the workspace's exact `directArtifactId` → direct projection host.

The bound direct host never initializes the legacy repository, delivers acknowledgements, activates or checks out commits, pumps proposals, or invokes legacy projection callbacks. No artifact is controlled by both hosts at once. Other artifacts may continue rendering through their established host, but they have no authority over the ledger-owned target.

This target-scoped cutover is separate from message routing. Conversational messages continue using the established streaming API. The legacy streaming route is not an alternative artboard writer for the bound ledger-owned authoring target.

### Surface preservation

Phase 4R does not insert an architecture demonstration surface on workspace mount. Surface preparation is lazy and occurs only after an explicit authoring request.

Selection preference is:

1. selected canonical artifact;
2. another existing canonical artifact;
3. selected or existing legacy artifact whose latest committed tree contains a canonical document and data bundle, promoted on the same canvas object;
4. a new North Star working surface only when no usable artifact exists.

Promotion preserves the existing canvas object identity, position, artifact ID, committed document, and committed geometry. Runtime-URL-only artifacts with no canonical committed document remain display-only.

### Product activity and diagnostics

The ordinary chat renders established product activity:

- applications and flows;
- screenshot previews;
- research details;
- task progress and human-readable failures;
- final authoring summaries.

Run, task, attempt, commit, receipt, and event internals remain available through the read-only inspector only when the developer inspector flag is enabled. Raw JSON paths and protocol validation messages are never ordinary user copy.

### Recovery semantics

Recovery controls are derived from the authoritative failure class:

- ambiguous transport → **Resume exact request** with the same request, task, and attempt IDs;
- correctable or transient task failure → **Retry this task** under the same task authority;
- terminal failure → no misleading resume control; cancel the build or start a new one after closure;
- cancellation or projection failure → preserve or restore the last exactly verified artboard.

A blocked authoring run does not prevent ordinary conversation. A new authoring request is not accepted until the old authoring run is resolved or cancelled, and this is checked before the new request is appended as an active build.

### Workspace ownership and lifecycle

One mounted workspace owns:

- one frame registry and selected projection target;
- one `NorthstarWindowProjectionSurface`;
- one `NorthstarWorkspaceRuntime`;
- at most one active authoring ledger;
- exact run-to-message binding;
- a developer-only read-only inspector.

React renders do not recreate runtime authority. Unmount aborts current work, closes unresolved ledger authority where possible, disposes the runtime and surface, clears frame registrations, and prevents late async completion from overwriting disposed state.

### Phase 4R constraints

The ledger remains browser-session ephemeral. Phase 4R adds no Supabase ledger table, local storage, IndexedDB, filesystem ledger, or server-global run registry.

Attachments and selection-scoped requests continue through the established product path until the stateless authoring protocol intentionally supports those inputs. They are not silently discarded or misclassified as text-only ledger objectives.

## Phase 4R acceptance criteria

Phase 4R is accepted only when:

- `Hi` and other casual messages receive normal conversational handling and create no authoring ledger;
- an old run cannot attach activity to a new message;
- explicit whole-canvas authoring starts one exact message-bound run;
- valid model failure output produces a valid browser-parseable `attempt-failure` response with no leaked `outcome` field;
- retrieved evidence survives success and failure and renders through the established product activity components;
- raw schema paths are hidden from ordinary users;
- recovery actions match transport, correctable, transient, and terminal failure classes;
- no bootstrap artifact is inserted merely by opening the workspace;
- a selected or existing compatible artifact is reused, and a committed legacy document is promoted on the same canvas object when possible;
- exactly one writer controls the bound authoring artifact, while non-target artifacts retain the established host;
- verified projection is serialized back into the normal artifact payload before another decision;
- multiple visual commits preserve iframe and stable-node identity;
- ambiguous transport and cancellation retain the Phase 1–3 authority guarantees;
- the inspector is read-only and development-only;
- corrected Phase 1, corrected Phase 2, Phase 3, Phase 4R unit tests, and both browser projection suites pass in an installed environment;
- real-provider acceptance is performed before calling the cutover production-proven.

## Phase 4R.2 prompt-grounded research and multimodal evidence

Phase 4R.2 repairs the research handoff exposed by genuine provider testing. Deterministic code owns validation, identity resolution, bounded selection, and evidence transport; it does not own the user's answer or impose a fixed research shape.

The user's prompt remains authoritative for:

- subject and comparison set;
- whether the outcome is conversational, analytical, or artboard-based;
- the number and diversity of flows that need representation;
- the depth and number of bounded research rounds;
- which screenshots must be understood before a claim or visual can be authored;
- whether additional evidence is required before finalization.

The model may plan several bounded research and analysis tasks. Each task commits its exact evidence and conclusions before another decision. The browser ledger therefore supports arbitrary prompt-grounded progression without allowing the model to invent system identity or skip verification.

### Tool contracts and exact identity

Every read-only tool call is validated at runtime against the exact registry schema. Required fields, enums, permitted properties, arrays, and positive integer bounds are enforced before tenant data is accessed. Exact tools such as `get_flow_details` and `get_flow_screenshots` may run only with exact identities returned by a prior list, search, or curation result.

An invalid or empty exact lookup is a correctable research-plan failure. Prior successful evidence remains attached to the same attempt, and correction must switch to discovery, search, or prompt-scoped curation rather than repeat a placeholder or unchanged lookup.

### Prompt-scoped evidence breadth

`prepare_composition_evidence` is a bounded curator, not a one-flow-per-app policy. Its caller explicitly supplies prompt-derived breadth and selection intent through `maxApps`, `maxFlowsPerApp`, `maxScreensPerFlow`, `limit`, and `selectionStrategy`.

The deterministic selector:

- never substitutes unrelated apps when explicitly requested apps are absent;
- preserves requested app order where identities resolve;
- can select one or many image-backed flows per app;
- distributes a global screenshot limit across selected flows rather than starving later subjects;
- reports missing apps, exact selected flow identities, candidate screenshot IDs, and truncation;
- keeps safety limits separate from product semantics.

### Screenshot understanding and multiple rounds

Authoritative screenshot URLs are extracted only from tenant tool evidence. A bounded, balanced set of screenshots is fetched server-side and attached to the exact Gemini execution turn as labeled image parts. The model may claim visual observations only for attached evidence.

A per-turn image bound never narrows the user's objective. When more screenshots are required, the ledger records the full candidate identity set and the model schedules additional bounded analysis tasks using exact screenshot IDs. Later artboard tasks can receive the committed visual evidence and analysis needed to author truthful progressive changes.

### Artboard and non-artboard outcomes

The research protocol itself is outcome-neutral. A non-artboard objective may complete with a grounded analytical answer and no projection task. An artboard objective continues from research and analysis into bounded mutation drafts, exact projection, verified commits, and normal canvas synchronization. Product routing may continue using the established conversation path for ordinary chat, but no data-retrieval component may hard-code a subject, app, flow count, or visual outcome.

### Phase 4R.2 acceptance criteria

- missing required flow identity is rejected before tenant lookup;
- a failed exact lookup preserves prior evidence and recommends a discovery path;
- explicit missing apps never fall back to unrelated catalog apps;
- requested multi-flow breadth is honored within explicit safety bounds;
- global screenshot limits are balanced across requested subjects and flows;
- exact flow and screenshot identities survive into later ledger context;
- screenshot pixels, not only URLs or filenames, reach the model as labeled evidence;
- multiple visual-analysis rounds can be planned from remaining exact screenshot IDs;
- non-artboard tasks can finish without fabricating an artboard mutation;
- artboard tasks begin only after sufficient prompt-grounded evidence exists;
- production code contains no Awin-, Whop-, or test-prompt-specific research policy.

## Phase 5 and Phase 6 boundary

Phase 4R is the required product-integration correction before Phase 5. Phase 5 may harden provider behavior, fault injection, performance, diagnostics, and defects found during genuine provider use only after the Phase 4R criteria pass. Phase 6 removes the disabled repository, acknowledgement, activation, checkout, compatibility flags, and other legacy code only after the repaired direct path has demonstrated product parity and persistence in production-like testing.

### Historical Phase 3-to-Phase 4 handoff

Phase 3 exported `createNorthstarProjectionTaskController()`, which composes the corrected Phase 2 turn controller with one direct preparer and one direct projector. Phase 4 has now installed that composition in the production workspace. The original handoff requirements were:

1. create one workspace-owned ledger from an initial canonical surface capture;
2. create one window projection surface for the currently mounted iframe;
3. create one projection task controller using that ledger and surface;
4. route all new-path artboard tasks through this single controller;
5. disable the legacy writer before enabling the new writer;
6. ensure unmount aborts and disposes the surface and controller;
7. allow the next LLM decision only after the ledger records the verified commit.

There must be no interval in which the legacy replacement writer and the direct projection writer both have authority over the same artboard.

## Phase 3 acceptance criteria

Phase 3 is accepted only when:

- detached preparation cannot mutate the live surface;
- mixed text and element content is canonical and replayable;
- all nine primitive operations are strictly validated;
- a deterministic diff exactly reproduces its target;
- unchanged live nodes retain identity;
- no whole-document or HTML-string mutation exists in the direct bridge;
- projection refuses stale ledger authority and divergent live bases;
- a receipt requires exact target capture, candidate commit hash, and state hash;
- transient preparation and projection retries retain the same attempt and candidate;
- uncertain projection recovery is limited to the same surface session;
- partial failures use verified primitive rollback;
- remount or rollback failure is terminal;
- the production workspace remains uncut-over;
- Phase 1, corrected Phase 2, Phase 3 unit tests, and real-browser bridge tests pass.

## Phase 4R.3 — adaptive intelligence restoration

The turn architecture must preserve North Star's general creative-intelligence behavior rather than reduce the product to a fixed research or layout pipeline.

- The user objective determines whether the outcome is written, visual, hybrid, or conversational.
- Research breadth, subjects, flows, screenshots, metadata, and number of rounds are model-decided from the prompt and committed evidence gaps.
- Deterministic tools validate authorization, schemas, exact identities, ordering, and bounds; they never choose a creative answer or fixed evidence count.
- Research results add structured evidence-graph deltas and preserve exact app, flow, screenshot, icon, and asset identity.
- Artboard objectives require a bounded design-intelligence analysis before the first visual mutation and whenever new evidence invalidates the current visual thesis.
- Design intelligence originates the viewer job, editorial argument, three-second read, visual thesis, information topology, evidence hierarchy, governing visual idea, spatial logic, emotional register, signature move, alternatives, and next visible move.
- The same prompt may produce materially different grounded concepts across runs. A run-specific diversity anchor encourages exploration but never maps request categories to layouts.
- Visual authorship is cumulative on one canonical surface: provisional inquiry, evidence, analysis, synthesis, critique, reorganization, simplification, and publication occur through verified primitive commits.
- Existing North Star design intelligence and continuous-authorship protocols remain the creative standard under the browser-owned ledger. The ledger protects integrity; it does not replace or template the intelligence.
