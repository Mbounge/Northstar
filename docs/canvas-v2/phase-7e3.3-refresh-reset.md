# Phase 7E.3.3 — Refresh means fresh canvas

Canvas V2 is an unsaved collaborative page session. Refresh is an explicit hard
boundary, not an implicit save or recovery action. Every new page lifetime opens
the canonical empty artboard with empty chat and a one-revision history.

## Reset contract

Refresh now discards:

- every committed and candidate artboard revision from the previous page;
- chat turns, design steps, research progress, and continuation context;
- undo and redo history;
- selection, viewport, inspection, and manual-edit state;
- routing, provider retries, and active design requests.

Normal state remains fully usable within the current page. Source edits still
follow candidate → render → observe → commit, and undo/redo still traverse the
committed in-memory history until the user refreshes.

## No persistence side channel

The design and chat hooks contain no `localStorage`, `sessionStorage`, remote
write, or recovery merge. On mount, the workspace only removes the three known
obsolete V2 recovery keys so older builds cannot resurrect stale work later.
Failure to access browser storage is ignored because the clean React state is
already authoritative.

The Phase 7E.2 production receipt remains a historical observation and still
proves that no remote canvas write occurred. Phase 7E.3.3 adds no Supabase table,
mutation, synchronization, or V1 runtime dependency.

## Proof

Unit coverage proves that all obsolete keys are discarded and restricted
storage cannot block startup. Browser coverage proves that refresh clears a
committed manual edit, conversation, undo/redo history, an active design run,
a completed evidence-led composition, and a large two-dimensional artboard.

V1 retirement remains paused until the standard authenticated prompt and this
refresh-reset behavior are both observed in the real application.
