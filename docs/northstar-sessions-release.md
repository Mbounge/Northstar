# Saved canvas sessions and model selection

## Behavior

The canonical `/canvas` route keeps the existing canvas workspace and adds a collapsible session history. Saved sessions belong to the authenticated Supabase user and save automatically; there is no save button or routine success notification. Canvas revisions, media, visible chat, draft, viewport and selected model/reasoning effort restore after reopening. Temporary sessions do not enter the database and start fresh after refresh.

Open sessions retain separate mounted workspaces so users can switch while runs continue. History shows a spinner for running work. Two tabs in the same browser profile and origin can view the same session live: one lease holder executes tools and saves; the other mirrors results and forwards actions. This is same-browser coordination, not cross-device realtime collaboration. Rename and archive/restore are available. Close view leaves a saved session in History; stopping work or discarding temporary/unsaved content requires confirmation.

The compact picker has models on the left and supported thinking levels on the right. Luna High is the default. The worker advertises available model capabilities; the chosen model and effort apply to the primary runtime and discovery reviewer. Production discovery instructions and review behavior remain unchanged.

Editable note text now expands its measured selection bounds after edits, including changes received from another tab, without replacing its content or moving it.

## Database and rollout

Apply `db/migrations/20260915_northstar_sessions.sql` once before deploying the app. It creates owner-scoped session metadata, private snapshot storage, write leases and version-checked commit functions. The migration was installed in the existing Northstar Supabase project on September 15, 2026. Do not blindly rerun its policy creation statements.

Deploy the matching worker and Vercel application commits. No new API secrets are required. Retain the existing worker admission limits and single-instance configuration. A worker redeploy stops active in-memory runs, so deploy between runs.

## Verification for this release

- Production Next.js build, TypeScript check, targeted ESLint and standalone worker build passed.
- Canvas tests were run per file to avoid a hanging all-files Node 20 invocation. All 86 canvas test files passed after updating three stale structural/inventory assertions. The focused runtime/session/geometry suite passed 107 tests; worker/lifecycle/media/activity checks passed 27 tests; discovery eval unit tests passed 53 tests.
- Signed-in Chrome: saved canvas/chat/model/draft reopen; uploaded 1400 by 1050 PNG survives refresh; temporary refresh resets; rename and Close view/reopen; compact picker; same-session mirrored text edits and bounds.
- Two independent saved sessions ran concurrently, displayed two History spinners and delivered follow-up notes to their respective canvases.
- Supabase transactional checks passed for owner access, private media, writer leases, stale-write rejection, idempotent retry and cross-account isolation. Test writes were rolled back.
- Playwright CLI browser launch was blocked by the desktop sandbox; the browser scenarios above were exercised through the connected Chrome browser instead.

## Current boundaries

Persistence saves visible work, not the native model process. Refresh or worker restart stops active execution; a subsequent message uses restored visible context in a new runtime. Browser canvas tools still require an open page. Cross-device live synchronization and unattended execution remain future work.

Snapshots have a 100 MB limit. Aggregate account quotas and orphan cleanup are not included. Mirrored tabs keep their own unsent drafts; the owner workspace draft is persisted. Command deduplication is in memory and does not promise exactly-once execution across a process failure. Writer handoff can wait for the 45-second lease to expire.
