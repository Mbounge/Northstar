# Northstar worker connection

## What this delivers

Northstar on Vercel remains the signed-in application and authorized account-data gateway. A separate persistent Node service runs the same pinned Codex runtime. Browser canvas tools, composition planning, evidence handling, Apps and native edits retain their existing implementations.

1. The browser POSTs to `/api/canvas-v2/codex/connect` using its Northstar session.
2. Vercel verifies the user with Supabase and returns a five-minute, signed grant bound to that user, app origin and worker origin. Neither the OpenAI API key nor the signing secret enters the browser.
3. The browser sends model input, tool results and streaming requests directly to the worker’s `/v1/codex` endpoint. Prompts, images and long streams do not transit Vercel functions.
4. The worker verifies the grant and origin before dispatching to the existing session host. A session token also belongs to its authenticated owner. Account Apps reads continue to use Northstar’s authenticated `/api/canvas-v2/account` route.
5. Access renews through Northstar before expiry. Renewal preserves the existing session and request IDs. A network error does not cause automatic resubmission of uncertain model input.

Without `NORTHSTAR_WORKER_URL`, local development keeps the embedded runtime. Vercel fails explicitly if the worker is missing; it never tries to spawn Codex in a serverless function. Existing legacy/Agents runtime settings remain available.

## Render setup

Use a **Render Web Service**, not Render’s background-worker service type: browsers need an HTTPS endpoint. The repository’s `render.yaml` configures a portable Docker build, one `1c-2g` instance (1 CPU, 2 GB), Virginia region, readiness checks and manual deployments. This is a paid preview starting point, not a measured production-capacity claim. Verify the current price in Render before creating the service.

The image installs locked `@openai/codex@0.153.4`, checks the binary version, and runs as an unprivileged user under `tini`. Only worker source and its dependencies enter the build; `.env` files, local profiles, account snapshots and evaluation media are excluded. The Dockerfile never references build arguments containing credentials.

After the worker changes are committed to a branch available on GitHub:

1. In Render, create a Blueprint from that repository using `render.yaml`. Review the paid service before creating it.
2. Set `OPENAI_API_KEY` in Render’s secrets. Use the server-side project API key authorized for the tested model.
3. Set `NORTHSTAR_ALLOWED_ORIGINS` to the exact HTTPS Vercel preview origin, without a path or trailing slash. Multiple explicit origins can be comma-separated. Do not allow every `*.vercel.app` deployment.
4. Render generates `NORTHSTAR_WORKER_SECRET`. Copy that same value into Vercel’s server-side preview environment. Do not use a `NEXT_PUBLIC_` variable for it.
5. Deploy the worker. Its `RENDER_EXTERNAL_URL` supplies its public origin automatically. `/readyz` should return `200` with `{"ready":true}`. If using a custom worker domain, set `NORTHSTAR_WORKER_PUBLIC_URL` to that HTTPS origin instead.
6. In Vercel’s **Preview** environment, set `NORTHSTAR_DISCOVERY_RUNTIME=codex`, `NORTHSTAR_WORKER_URL=https://your-worker.onrender.com`, and the matching `NORTHSTAR_WORKER_SECRET`. Redeploy that preview. Existing Supabase configuration remains required.
7. Use the signed-in preview `/canvas` to test chat, source retrieval, multiple Apps, composition, localized edits, cancellation and stream reconnection. A request to `/api/canvas-v2/codex/connect` should succeed; subsequent Codex traffic should go to the worker. No browser cookie or Supabase session is sent to the worker.

For a fixed preview hostname, use a dedicated preview branch/domain and allowlist that exact origin. Update the allowlist explicitly if the preview hostname changes. Grant renewal refuses a mid-conversation worker-URL switch, preventing silent loss or redirection of an active conversation.

## Local worker

Keep local `.env.local` and real keys outside Git. Install and build the independent worker package:

```sh
cd /Users/mbounge/Desktop/competitor-terminal
npm ci --prefix worker
npm --prefix worker run build
```

Configure the following in the worker process environment, then run `npm --prefix worker start`:

| Worker variable | Local value |
| --- | --- |
| `NODE_ENV` | `development` |
| `PORT` | `10000` |
| `NORTHSTAR_WORKER_PUBLIC_URL` | `http://localhost:10000` |
| `NORTHSTAR_ALLOWED_ORIGINS` | Exact local app origin, e.g. `http://localhost:3000` |
| `NORTHSTAR_WORKER_SECRET` | A randomly generated secret of at least 32 bytes |
| `OPENAI_API_KEY` | Server API key |
| `NORTHSTAR_CODEX_BINARY` | Absolute path to `worker/node_modules/.bin/codex` |

Set `NORTHSTAR_WORKER_URL=http://localhost:10000` and the same signing secret in the local Next.js environment, then restart it. Plain HTTP is accepted only for loopback development origins. `npm --prefix worker start` does not automatically load `.env.local`; use your shell or process manager to supply its environment.

To build the same Linux image as Render from the repository root:

```sh
docker build -f worker/Dockerfile -t northstar-worker .
```

## Capacity and current limits

The Render template starts with four resident conversations per worker and two per user. `NORTHSTAR_MAX_SESSIONS` and `NORTHSTAR_MAX_SESSIONS_PER_USER` tune admission without changing model behavior or setting a limit on app/screen counts. Benchmark CPU/memory before raising capacity. An actively connected turn no longer expires simply because it has run for 30 minutes. Active work disconnected from all streams still stops after the existing 30-second grace period; idle sessions expire after 30 minutes without activity. An open Codex page renews its idle lease once per minute without calling the model. Page refresh deliberately closes the old session and starts with an empty canvas and chat.

This step does **not** add durable conversations, saved canvas/media, restart recovery, multi-instance routing or unattended browser-side canvas execution. Keep one worker instance. Worker restarts/redeploys end in-memory conversations; the UI reports failure instead of claiming recovery or completion. Manual deploys prevent an ordinary Git push from automatically interrupting the preview worker. Durable storage and restart recovery are explicitly deferred to a later patch. This release is an ephemeral workspace: continuation and brief connection recovery work while the page remains open; refresh starts fresh. Do not horizontally scale this in-memory session host. Health checks establish process readiness, not model-account entitlement or benchmark quality.

## Verification

- Automated signed-grant tamper/expiry/origin/audience tests, authenticated connection bootstrap, cross-user session denial, CORS preflight and oversized-request handling.
- A 6 MB tool response over actual HTTP, grant renewal, no automatic retry after uncertain input transport failure, and refusal to redirect an existing session to another worker.
- Existing Codex fixture through the actual HTTP server: streamed answer, follow-up context, reconnect snapshot and idempotent cancellation.
- Signed-in Chrome `/canvas` on one local process connected to a separate worker process: chat response, two-island native composition and rendered-pixel tool responses. The Codex peer was deterministic; no model API credits were consumed.
- Production Next.js build with `VERCEL=1` and an isolated output directory; standalone worker bundle build.

The pinned Linux image built and started successfully on Render on September 13, 2026. The authenticated Vercel branch preview completed live chat, same-conversation follow-up and native canvas composition through that worker. Production remains unchanged until the scoped rollout acceptance checks pass.

References: [OpenAI App Server](https://learn.chatgpt.com/docs/app-server), [Render Docker](https://render.com/docs/docker), [Render compute plans](https://render.com/docs/compute-plans), [Render Blueprint fields](https://render.com/docs/blueprint-spec).
