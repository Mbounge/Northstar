# Northstar Codex runtime

This implementation runs the open-source Codex App Server as a private child process. It does not call the managed Agents API and does not invoke Northstar's legacy investigator/researcher/reviewer chain. The prior runtimes remain available for rollback.

## Run

Use a persistent Node server (one worker, or sticky routing to the conversation-owning worker). Install the pinned `codex-cli 0.153.4` binary on that server. The adapter checks its exact version before starting a process. Next.js serverless functions are not a supported deployment for this implementation.

Set server-side environment variables and restart:

```sh
NORTHSTAR_DISCOVERY_RUNTIME=codex
NORTHSTAR_CODEX_BINARY=/absolute/path/to/codex
OPENAI_API_KEY=your-server-side-key
```

The key must already be authorized for the chosen model. It never enters browser responses or child-process arguments. Northstar authenticates each route with Supabase. It creates a private temporary Codex home and workspace per conversation and logs in through the stdio protocol. It does not inherit the operator's personal Codex profile, skills, plugins, environment credentials, or shell access. The API key is held in that temporary profile until the process exits and cleanup removes it.

### Network trust

The private child retains configured `CODEX_CA_CERTIFICATE` (preferred), `SSL_CERT_FILE`, `SSL_CERT_DIR`, and standard HTTP/HTTPS/ALL/NO proxy variables, including lowercase variants. CA paths are resolved before switching to the private workspace. Other environment variables, including credentials and TLS-verification bypasses, are not forwarded.

On macOS, if no CA file or directory is configured, the adapter supplies the OS bundle `/etc/ssl/cert.pem` through Codex's supported `CODEX_CA_CERTIFICATE` setting. This fixes `UnknownIssuer` when native keychain root discovery fails in the isolated process. Other platforms retain native root discovery. An explicit or macOS-default PEM bundle must be readable and contain valid certificates; invalid trust configuration fails before session creation. Administrators can override the bundle with their approved PEM file. Certificate and hostname verification remain enabled.

The real pinned binary was checked with unauthenticated `codex doctor` network probes: the original environment failed HTTPS and WebSocket certificate validation; the corrected environment reached both endpoints and received HTTP 401 because no credentials were supplied. This verifies transport trust, not model access, discovery quality, or response latency. No model turn was submitted for this correction.

The preview retains the existing Luna High cost constraint. It checks `model/list` for that exact model and effort and refuses substitution. Actual account/provider compatibility remains a live-test prerequisite. No model call was made during implementation validation.

## Architecture and customization

The browser's existing ongoing-chat client talks to `/api/canvas-v2/codex`. The server maps those operations to `thread/start`, `turn/start`, `turn/steer`, `turn/interrupt`, and dynamic-tool replies. One Codex thread retains model/tool history; Northstar projects message and tool events for display. The adapter does not decide which investigation to do next.

Codex's base instructions are preserved. Northstar's general discovery/canvas guidance is supplied through `developerInstructions`. The shared instructions and application tool specifications live in `lib/canvas-v2/managed-agent/config.ts` (the path is retained for compatibility; using this module does not invoke the Agents API). Change those instructions and tool implementations to tune discovery. Do not add mandatory model roles between tool results and the next Codex step.

Tools: public HTML/source reading, image inspection, native canvas reading, and revision-checked native edits. Built-in live web search belongs to Codex. Source media retains its original asset handle for composition. Uploaded images are written as private files and passed as `localImage` inputs; the original benchmark image is tested byte-for-byte. Codex owns its downstream model image preparation; live acceptance is not inferred from this local check.

Canvas edits still pass through the existing native engine, validation and undo. Tool replies are tied to pending call IDs; duplicate operations are deduplicated; late results after cancellation are refused. Chat is the default, with the canvas offered through instructions and tools when requested. No IKEA answer, fixed hypothesis count, media quota or composition quota is inserted.

Customization boundaries:

- Display/interaction: the Northstar chat panel, Markdown renderer and ongoing-chat hook.
- Product tools: source/media tools and native canvas engine.
- General behavior: Northstar developer instructions; Codex base instructions remain intact.
- Core execution: pinned upstream Codex. Regenerate protocol types and retest before updating its version.

## Lifetime and failure behavior

This remains an in-memory workspace experience. Refresh starts fresh; there is no durable cross-worker recovery or canvas persistence in this patch. A transient stream disconnect on the same worker can recover from a snapshot and pending tool calls. Processes expire after 30 minutes without application requests; active work disconnected from all streams is stopped after a 30-second grace period (checked every five seconds). Limits are two resident conversations per user and twenty per worker. There is no routine Resume button.

An uncertain input submission stops the private process rather than silently repeating a prompt. Model process failure is surfaced as failure, not completion. Stop cancels local pending edits and interrupts Codex. A message submitted immediately after Stop waits for cancellation before being classified as a new turn.

The protocol adapter rejects unimplemented server requests rather than granting permissions. Shell, multi-agent and code-mode features are disabled; the thread uses read-only sandboxing. This is a deliberately scoped discovery runtime, not a general remote shell.

## Validation and rollback

Generated protocol types come from the installed 0.153.4 binary. Local tests exercise real Northstar client/server behavior against a deterministic App Server peer. Separate checks initialized the actual binary and created a thread with Northstar's developer instructions and dynamic tools, using a fake key and a local-only backend override; no model turn was submitted in those checks.

The browser fixture is `/canvas-v2-e2e/codex` and exists only in a non-production process with `NORTHSTAR_E2E=1`. It uses the real bridge and native canvas engine, with synthetic Codex messages. It establishes interface behavior, not research quality or live latency.

Codex is now the default on `/canvas`. Set `NORTHSTAR_DISCOVERY_RUNTIME=legacy` and restart to use the old discovery runtime. Set it to `agents` only to revisit the separately frozen managed-API experiment. Do not describe either rollback option as a passed discovery benchmark.

## Composition integration correction — 2026-09-12

The initial adapter exposed a simplified canvas edit path. It did not establish parity with the original composition workflow. The correction reconnects composition capabilities to the Codex loop:

- `canvas_plan` records model-authored creative direction, reading order, evidence selection and the next island. It allocates an identity and uses the existing island execution contract and validator. The model chooses how many islands to develop; no additional discovery-model role is invoked.
- Planning returns the existing Northstar canvas grammar and local authoring/placement context. `canvas_read` returns measured islands, native connector endpoints, current selection authority, registered media and retained composition decisions.
- `canvas_edit` validates opaque media handles before expanding image bytes. It carries island execution and selected-object working context into the native scene transaction, reconciles authorship, and checks rendered evidence, content, scale, legibility, territory, narrative, relationships and multiplayer placement before commit.
- `canvas_review` returns exact committed pixels and measurements, or a selected island detail. When a draft is rejected, its screenshot and failures remain available to the same Codex loop for repair; the public canvas retains the prior revision.
- Uploaded and inspected media retains provenance. Public source reading exposes linked native video without downloading video bytes. Existing native image/crop, GIF/video and connector authoring grammar remains available during composition.
- A browser-discovered image crop bug was fixed: the internal crop image no longer inherits its frame’s former semantic parent, which previously serialized the image twice after a moved image was cropped.

Verification: 753 canvas tests and 53 discovery-eval infrastructure tests passed; typecheck, focused lint and whitespace checks passed. Zero-credit full-workspace browser checks covered chat-first behavior, reuse of an earlier-turn upload in two compositions, rejected-render repair, separate undo/redo commits, direct text/style edits, image selection/crop, and a selected human-edited title changed through the Codex adapter while retaining italic styling and neighboring content.

These are deterministic integration checks, not evidence that a live model has met the discovery benchmark or composition quality bar. Live GIF/video playback, broader composition varieties and longer live collaboration still need acceptance coverage. No new paid model run was performed for this correction. The previous steered IKEA session is not an unsteered benchmark baseline. The next live evaluation must finish discovery without steering, then evaluate the answer before requesting and evaluating composition. Persistence remains separate. Existing frozen patch artifacts have not been rewritten or repackaged.

## Canonical delivery — 2026-09-12

Normal `/canvas` now selects `/api/canvas-v2/codex` by default. Authentication remains enforced for production account sessions. Explicit legacy and agents runtime settings remain rollback choices; the deterministic old-engine evaluation flag continues to select its fixture endpoints. Unknown runtime settings fail explicitly.

For a local browser evaluation of the actual canonical API, both NORTHSTAR_E2E=1 and NORTHSTAR_CODEX_LIVE_TEST=1 are required in development/test. The browser Origin must be loopback and match Host. Production never enters this branch. It uses a distinct local owner and no account evidence. This is an evaluation option, not account login or a production authentication substitute.

The Codex composition path treats rendered layout checks as advisory feedback. It no longer rejects whole compositions for font sizes, dimensions, design overlap or narrative arrangement, or automatically enlarges authored fonts. Source bindings, safe markup, revision consistency and human/reference protections remain enforced. Heading structure belongs to the model. New Codex islands identify their layout owner so legacy CSS does not override their width, title margins or normal-flow placement. Native canvas placement, editable objects, transparent surfaces and source media remain supported.

The working workspace remains in memory; refresh clears it. This patch does not claim durable persistence or cross-worker session recovery. One persistent Node worker must own each Codex conversation. Pin the documented CLI and configure the server API key before using the default runtime.


### Final local verification, 2026-09-12

Canonical `/canvas` completed a real Luna discovery → composition → localized edit sequence (session 07). This demonstrates the route and interaction, not an IKEA benchmark pass. The answer still underdeveloped the retail business-purpose mechanism; the composition retained only uploaded media, lost some insight and required excessive typography repairs. Its one transparent island contained 152 native objects. The screenshot also exposed card text overflow.

The subsequent correction restores hard checks for painted text collisions, text leaving its containing card, and overlapping independent islands. Font-size and footprint preferences remain advisory. Existing unchanged content defects do not prevent an unrelated local edit. Both legacy width guards (source patch and runtime document) exempt new model-owned islands. Deterministic browser checks demonstrate a rejected overflowing draft followed by a successful repair, and two 9,200-unit islands committing at their authored width.

Attachment previews now have inline size bounds, and private renderer frames sit in clipped, transparent, one-pixel hosts with inline isolation from their first mount. An upload/send browser check kept the supplied image bounded at 74px in the composer and 128px in history without opening a preview dialog. The intermittent reported flash was not reliably reproduced, so this is hardening rather than proof that every flash mechanism is eliminated.

Runtime delivery remains a persistent Node host with the configured Codex binary and server-side API key. Workspace state is currently held in memory: this patch does not implement durable refresh/restart recovery or a serverless Codex worker deployment.
