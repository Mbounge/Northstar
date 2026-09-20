# Execution and generated media in Northstar

Northstar’s primary Codex model can now execute code in an isolated hosted workspace, export files, and generate or edit images. The primary model still chooses its tools and uses the existing canvas engine and discovery review loop. This patch does not change the discovery prompts, reviewer, selected primary model, or primary reasoning setting.

## Data flow

1. The primary model calls `workspace_run`, `workspace_export`, or `generate_image` as a normal dynamic tool.
2. The browser supplies only explicitly referenced retained asset bytes. Execution also receives `canvas.json`: committed HTML/CSS, current revision, viewport and measured nodes. Geometry is omitted if its measurement revision is stale.
3. The authenticated worker checks the conversation owner, token, turn and exact pending call. Commands/prompts come from that pending call, never from browser overrides.
4. The worker starts an idempotent job and the browser polls its receipt. Chat streaming remains connected. A lost start response is polled, never blindly resubmitted.
5. Outputs are downloaded immediately from the provider. Raster images enter the retained media inventory; every exported file gets a download card. The model receives metadata and execution output, not base64 file contents.
6. The model can inspect image pixels, reuse files in later commands, calculate native layouts, or place assets with `canvas_edit`. Canvas transactions, selection/editing and rendered review remain authoritative.
7. Saved sessions retain bytes, provenance and chat download cards in the existing private snapshot. Temporary sessions still disappear on refresh. Sandbox paths in answers resolve only to known exported files.

## Execution

`workspace_run` supports shell commands, UTF-8 input files, imported retained assets and requested exports. The working directory is `/mnt/data/northstar`. Python and Node are available in the provider’s environment; inspect installed libraries before relying on them. Examples include calculations, CSV analysis, chart creation, proportional image resizing, contact sheets, PDF/file preparation and graph/layout checks.

The workspace is an OpenAI-hosted container, not the shared Render host. No Northstar API keys or server environment variables enter it. Network is disabled; use Northstar research/media tools to retrieve sources, then import retained bytes. This is command execution, not a browser terminal UI or interactive TTY. Native Codex host-shell access remains disabled.

The current hosted-shell API executes via Responses. The adapter uploads a runner and payload and makes one small transport call using the selected model, with low reasoning and one allowed shell call. The native primary model writes the actual command. The adapter verifies the executed wrapper command and reads stdout, stderr, exit status and timeout from a separate result file, so provider output truncation cannot corrupt the receipt. It does not trust a transport model’s prose as the result. Luna, Terra, Sol and Astra were each tested with a live calculation.

Files persist across calls within the same active native session. Containers expire after 20 idle minutes; session close deletes them. An expired workspace is recreated with an explicit warning. Exported files survive independently and can be re-imported. Each command has a 1–120 second timeout; longer tasks must be broken into bounded commands. Each creative operation has a 10-minute ceiling. This is not durable background execution across worker restarts.

Per-operation transfer bounds: 16 imported files / 6 MB combined, 32 text files, 8 exported files / 8 MB each / 16 MB combined. Work can use further calls; these are transfer bounds, not total multimedia quotas. Saved sessions retain their existing 100 MB snapshot limit.

Canvas document validation does not impose a cumulative HTML/CSS or inline-image byte quota across imported app flows and composition islands. The former 180,000-character HTML, 120,000-character CSS and 20 MB aggregate inline-image checks have been removed. Incoming source patches still bound each authored fragment (32,000 HTML characters, 24,000 CSS characters) and each call (10 operations); inline images retain their individual 2.5 MB decoded-byte check. Errors identify the specific oversized input and its measured size. Content safety, exact evidence binding, stable identities, protected source flows and human-edit protections remain enforced. Existing transfer and saved-session storage limits still apply.

## Image generation and edits

`generate_image` creates an original illustration; `inputAssetIds` changes it to an image-edit request. Originals remain retained and untouched. Outputs include synthetic provenance and parent asset IDs. A verified derived asset can replace its prior generated version at the same model-owned image node; the original need not remain visibly duplicated. Uploaded, human-edited and canonical app evidence retain their continuity protections. Real people, app screenshots and documentary evidence continue to use retrieved authentic media. The model is instructed to inspect generated pixels before composing and keep text, cards, charts and connectors editable.

Default models: `gpt-image-2.5-flare` for generation and `gpt-image-2.5-sunburst` for edits. Worker secrets may override them with `NORTHSTAR_IMAGE_MODEL` and `NORTHSTAR_IMAGE_EDIT_MODEL`. The worker’s existing `OPENAI_API_KEY` is used. There is no silent model substitution or automatic retry of a paid request. Access errors are returned to the main model.

Only recognized PNG/JPEG/WebP/GIF bytes become canvas image assets. SVG, HTML and other exported files are downloads, not executable canvas content. Image inspection can downsample large pixels without altering retained originals. Imported app screenshots retain their original bytes unless a task explicitly requests a separate transformation.

## Deployment

Build and deploy both the Vercel application and Render worker from this patch. No new provider account, database migration or frontend secret is required. The existing OpenAI project must allow hosted containers/Responses and the image models. Those APIs have additional usage charges. Local live probes confirmed access with the configured server key; a worker using a different project needs its own check.

The patch is not deployed merely by passing local tests. Production smoke checks should create a saved canvas, generate an image and CSV, refresh, reuse the retained image in an edit, and confirm another account cannot access that session.

## Verification

Tests cover ownership/pending-call binding, duplicate requests, cancellation, container reuse and separation, altered execution commands, output bounds, generation/edit lineage, absence of base64 in model results, download-link resolution, and snapshot round trips. Existing canvas/session/discovery regressions remain in place.

Live tests exercise actual hosted Python calculations and file exports, image generation, image editing and proportional image processing. Browser tests exercise the canonical authenticated `/canvas` route, editable charts and tables, download cards and subsequent edits. See the release verification report for results and any limitations; capability access is not proof that every future answer will be better.

Official API references:
- https://developers.openai.com/api/docs/guides/tools-shell
- https://developers.openai.com/api/docs/guides/image-generation
