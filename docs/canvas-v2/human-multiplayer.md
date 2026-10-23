# Human multiplayer

## Experience

Sharing a saved canvas enables a durable shared room. The Share action creates
an expiring editor or viewer link, copied to the clipboard; it sends no email.
The invitation landing retains its fragment through sign-in and opens the same
canvas. Existing legacy tabs discover the upgrade through a same-browser hint
and an authoritative room check before renewing their old writer lease.

Teammates have colored versions of Northstar's cursor, names, selection outlines
and live drag previews. Their pointers are expressed in world coordinates, so
each person can pan, zoom, and switch Design/Preview independently. Awareness
from sandboxed interactive designs uses the existing source/token-checked
runtime bridge. Pointer packets never carry document source or image bytes.

Clicking a teammate's avatar follows their live canvas view and Design/Preview
mode. Their unobscured world region is centered and fitted to the follower's
screen, including different window sizes and panel layouts. Camera interpolation
uses world centers to avoid drift when zooming around large canvas coordinates.
The small colored frame and Following indicator expose the active connection;
click the avatar again, use Stop/Escape, or navigate/edit locally to leave it.
Peer departure and follow cycles end following safely. Camera packets use the
same bounded Broadcast slot as pointers, with no durable operation or Presence
track per frame. Private chat, drafts, UI content and runtime inputs are never
copied into the follower's workspace.

Manual content, styles, placement, structural edits and evidence are shared.
Each person's chat, unsent prompt, model choice, interactive form values
and running app state stay personal. Opening Design does not move a teammate's
camera or change their UI mode unless they explicitly follow that view. Camera
rectangles are ephemeral awareness; saved camera checkpoints stay device-local.
Each account has its own chat UI and durable
conversation history for the canvas. Private history uses owner-only cloud
storage and its own account/canvas metadata; camera and runtime state remain
device-local. Teammates never inherit the owner's conversation.

## Durable authority

`collaboration-document.ts` partitions exact source bytes into document fields,
stable node openings/bodies/closings and evidence records. A parent contains
references to its children. Editing a child does not replace its neighbours.
The codec handles quoted attributes, comments, raw-text elements, Unicode IDs,
duplicate identities and incomplete/cyclic hierarchies.

`collaboration-client.ts` keeps an optimistic pending queue and an ordered
accepted log. RPC commits hold a room row lock, check current membership and
expected field hashes, validate the reconstructed graph, then atomically store
the cells and operation. Operation IDs are idempotent, including reload after a
lost response. A stale field cannot silently overwrite a teammate's work.
Undo applies only the current person's guarded inverse operation.

Unrelated changes rebase. Competing changes to the same field preserve a local
recovery version and keep the accepted shared version. IndexedDB retains pending
operations and recovery data. An unavailable recovery store does not prevent
opening a room, but the tab must remain open while edits are unsaved.
Recovery retains the whole queued human branch across multiple conflicts and
reloads, including exact field deltas when structural changes prevent rendering.
Earlier revision-only recovery branches remain in the downloaded recovery file.
Failed local journal writes retry even when no new edit occurs. Journal checkpoints
are serialized, including recovery dismissal, so a slower earlier write cannot
replace the newest branch. Closing a client cancels late startup/catch-up
delivery and prevents subscriptions from restarting; already-requested recovery
checkpoints still finish. Authoritative
roster refreshes update editor/viewer controls while preserving room ownership.
An open human edit pins its actual source basis independently of the bounded
peer-history cache. If an explicit parent is unavailable, the edit is retained
for recovery instead of being diffed against newer teammate content. Active
crop, tidy, connector and drawing gestures defer shared scene replacement until
the gesture finishes; a missing native authority cannot enter a legacy mutation.

`native-scene-source.ts` compares serializations of the before/after native
scene and applies only their actual delta to the original source. It does not
write compiler-materialized styles back into untouched objects. Placement
persistence also distinguishes a human child-content edit from an explicit
move of its parent. Shared setup installs geometry rules and normalizes empty
script placeholders once, before independent edits begin.

This is object/field collaboration, not character-by-character text merging.
An encoded interactive design is one source field. Its internal layers can be
edited and shared, but two people should edit different objects/designs;
short-lived claims prevent known competing edits to the same object. Passive
selection remains available to everyone; only an active manual edit holds a claim.
Finish and cancellation release it while leaving the selection visible. Claim
RPCs are serialized and coalesced, including the final release on tab closure,
so a delayed acquisition cannot recreate a finished edit. Durable
hash guards remain authoritative when a claim or connection is delayed.

## Presence and performance

- Pointer and live-motion awareness is throttled to roughly 25 packets/second.
  Remote painting is imperative, interpolated, and reprojects against the local
  camera without rerendering the workspace for every packet.
- Presence registers membership once per subscription; changing awareness and
  four-second heartbeats use broadcasts, avoiding hosted per-client Presence
  limits. A late joiner receives current awareness on the next broadcast.
  Idle cursors expire locally after twelve
  seconds. Edit claims expire after twenty seconds and renew only during active editing.
- Durable catch-up and membership checks run independently of pointer traffic.
  Continuous movement cannot postpone authorization checks or fallback polling.
- Supabase channel teardown is awaited before a same-topic replacement, including
  transport instances sharing the browser's singleton auth client.
- Applying shared source uses the existing interactive runtime patch path, which
  preserves per-person unsaved input and JavaScript closure state when supported.
- Shared source carries accepted world placement. A receiving device does not
  reposition new objects or pin moved objects to its previous local scene.
- Identical session-status reports are suppressed during navigation, and the
  shell refreshes saved-session listings only when a save completes.

## Access and privacy

The database migration adds rooms, members, cells, operations, claims, invitations,
security-definer RPCs with fixed search paths, and private Realtime topic policies.
All durable RPCs reauthorize against the current account. A removed member cannot
read or commit through them, and outstanding invitation links are revoked on
removal. Viewer access cannot author changes. New owner-created links may
intentionally readmit a removed person.

Members may read session metadata and shared cells. They may **not** download the
owner's legacy snapshot blob: it contains private pre-sharing chat, drafts and
working context. The existing owner-only Storage policy remains in force.

Cursor identity is advisory UI, never an authorization or audit identity. The
durable operation actor comes from `auth.uid()`. Realtime sends awareness and
version hints only; receiving a hint always leads to an authorized RPC read.
Members refresh their authoritative roster and discard awareness from removed
users. Immediate eviction of a hostile client from an already-authorized hosted
WebSocket has not been proven locally; Supabase channel authorization can be
cached until token refresh. Stronger immediate awareness confidentiality would
require topic rotation or server-side disconnects.

## Personal conversation persistence

`private-workspace.ts` selects only personal conversation fields and strips
shared source/evidence and camera authority from its root payload. It reuses the
existing worker-based snapshot codec, compression and retained attachment bytes.
Historical messages may still contain source a user already saw; access removal
does not erase previously received private history.

`private-workspace-sync.ts` owns a separate ordered outbox. Its first-change
checkpoint is bounded rather than reset by every keystroke or camera event.
Unchanged personal memory keeps its identity during navigation, so pan/zoom
creates no transcript encoding or cloud upload. Offline work is checkpointed
locally; close/pagehide/online and periodic checks flush outstanding work.

Personal cloud pointers use `(auth.uid(), canvas)` and compare-and-swap versions.
Only that account can read its row or blob, including when another room member
is the room owner. Viewer members can save their own conversation. Each tab has
its own durable pending/recovery branch under the stable collaborator client ID;
only clean, monotonically newer checkpoints update the account's local cache.
A conflicting device cannot erase another tab's unsent draft.
If local caching fails but cloud storage confirms the latest conversation, the
save indicator reports that confirmed result and clears the unsaved warning.

An unknown cloud read never authorizes overwriting history with an empty chat.
Exact save identities support lost-response replay. Conflicting account-device
saves keep the device's version and expose **Save my copy** and **Open saved
chat**. Restoring normalizes interrupted routing/running turns to stopped without
replaying a model request. Before a delayed Northstar edit commits, it must still
match the revision against which it was prepared; a teammate's newer edit forces
a fresh read.

AI validation is revision-owned: cancelled preview callbacks cannot settle or
cancel a replacement draft. Public preview failures carry their own revision ID
and do not cancel a simultaneous candidate. Beginning a human gesture retires an
AI candidate synchronously, even before React renders the new state. A shared
revision redirects a waiting AI observation or rendering turn to current truth;
it preserves the objective and never promotes the abandoned draft.

Uploaded or human-edited images may be rebound in place to a retained direct
creative derivative when the current browser-owned selection explicitly permits
modifying that unlocked, visible image. The original remains in retained media.
This permission does not extend to reference-only selections, neighbouring
copies, locked images, or canonical/account research evidence. Derivation and
placement acceptance do not prove pixel preservation; compare the edited pixels
against the original separately for localized edits.

## Verification and rollout

The disposable local HTTP fixture exercises the real controller and workspace
with independent browser views. It is gated behind local evaluation controls
and uses synthetic accounts. Browser verification uses the user's Chrome through
CUA, without sending model requests or modifying the GoodLife canvas.

Focused tests cover codec round trips, pending replay, conflicts, own undo,
private-state exclusion, scoped source authoring and parent-placement safety.
The AI/reconnect browser regression explicitly selects legacy loop authoring,
holds a deterministic response across an offline peer edit, and verifies a
fresh shared-parent read, both final edits, private iframe inputs/closure state,
and reload. The default fixture remains on the managed entry path.
A hosted two-account check on 2026-10-23 used three real managed-model heading
edits with a teammate's open note draft, own undo/redo, an offline note edit,
reconnect, reload/private-chat isolation, and following a teammate's Design mode
and 100% camera. Both edits survived. This is a bounded live check, not an
extended real-team soak or proof of every editing/model scenario.

A disposable PostgreSQL cluster executes the migration and actual RLS, concurrent
commit, graph validation, invitation and removal paths. Production transport and
entry tests inject account/channel services to exercise the actual modules.

The migrations are `db/migrations/20261020_northstar_multiplayer.sql` followed
by `db/migrations/20261020_northstar_private_workspaces.sql`. Both were applied
to the hosted production database on 2026-10-20 after explicit approval.
The hosted catalog audit confirmed all seven tables, fourteen exact function
bodies and ten policies, with private snapshot storage. Table grants explicitly
clear hosted defaults including TRUNCATE, REFERENCES and TRIGGER before allowing
authenticated SELECT; writes use the guarded RPCs. Anonymous Data API probes
confirmed permission denials for all seven tables and three read RPCs.
An absent migration leaves existing solo sessions available; enabling sharing
and durable personal history needs both migrations.
Deploy matching application and worker code, and check separate real accounts
against hosted Auth, Storage and private Realtime,
including reconnect, late join, sign-in continuation, private history across
devices and access removal. Local
PostgreSQL and HTTP-fixture verification do not substitute for that hosted check.

Additional boundaries: presence is ephemeral, operation-log compaction is not
implemented, and deleting an account with retained operation history needs an
explicit audit-identity retention strategy. Do not cascade away the edit log.


### Localized image-edit audit (2026-10-23)

A real two-account run changed the marked suede panel on a retained uploaded
photograph. Both accounts received byte-identical final PNGs on the same image
node. Own Undo restored the original for both people; Redo and reloading both
accounts restored the derivative, keeping geometry and separate chat histories.
An independent pixel comparison found 35,519 changed pixels and zero changes
outside the retained mask. Close visual inspection still found ivory spill onto
adjacent black trim. This is a failed precision result: containment in a model's
own mask does not establish that the mask matches the requested subject.
The managed instructions now require boundary/occlusion review and inspection
of disconnected changed spots before a precision claim. That instruction change
still needs a fresh hosted run; it is not a deterministic semantic-image gate.
The observed run took 10m49s, which remains a latency issue. The hosted upload
path is separate from the bound-evidence authorization fix covered by the
controller and hook tests; do not conflate their verification.
