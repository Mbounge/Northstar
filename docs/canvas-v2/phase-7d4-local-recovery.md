# Phase 7D.4 — Browser-local recovery and manual-edit truth

> Historical note: Phase 7E.3.3 supersedes the refresh behavior in this phase.
> Canvas V2 no longer restores or persists artboard, chat, or history state.
> Refresh now opens a completely clean in-memory canvas. The manual candidate
> safety contracts described below still apply within one page session.

Phase 7D.4 makes refresh and reopening safe before North Star has any remote
persistence. It does not create database tables, write to Supabase, synchronize
across browsers, or import the V1 persistence/runtime-document machinery.

## One versioned local envelope

Canvas V2 now stores one bounded `canvas-v2.local-recovery.v1` envelope in the
browser. It contains:

- up to 50 validated committed artifact revisions;
- the current undo/redo position;
- exact evidence provenance already belonging to each revision;
- up to 30 chat turns, including terminal design direction, spatial strategy,
  research coverage, and continuation context;
- a monotonic local generation and save timestamp.

Candidate source, render observations, screenshots of the artboard, request
controllers, selection, hover state, viewport position, and other ephemeral UI
state are deliberately absent. The authored HTML and CSS in committed revisions
remain the source of truth; there is no runtime document.

The previous standalone V2 committed-revision and chat keys migrate once into
the envelope and are removed only after the new local write succeeds.

## Restore boundary

Every revision is reconstructed through the normal committed-revision factory.
Artifact safety, exact evidence bindings, evidence continuity, committed state,
bounded strings, stable schema names, chat shapes, loop shapes, research states,
and history ancestry are checked before state reaches React.

Recovery keeps the valid contiguous history around the selected committed
revision. A corrupt or candidate history item cannot become canonical. If the
current committed revision is valid but an older undo entry is corrupt, the
current revision is salvaged and the unsafe history is dropped.

Routing, thinking, rendering, and retry state cannot resume by accident after a
page lifetime ends. Active chat and design work reopen as `stopped`, retry state
is removed, and the last committed revision stays canonical. Continuation still
requires an explicit user action through the existing lifecycle.

## Failure behavior

- unreadable JSON is removed and the clean committed starter opens with a
  visible notice;
- a known schema with partially invalid data salvages only its valid committed
  portion;
- an unknown future schema is left untouched and local writes are blocked for
  the session, preventing an older client from destroying newer work;
- disabled or quota-exhausted browser storage never crashes the working canvas;
  North Star reports that refresh recovery is not currently saved;
- large recovery state is compacted by dropping oldest chat first and then the
  furthest non-current history while preserving the selected commit.

## Manual candidates

Manual source is now validated for artifact safety, exact evidence bindings, and
evidence continuity before a candidate is rendered. It still commits only after
the normal iframe render and evidence-integrity observation. Commit failure
discards the candidate and preserves the previous committed revision.

The global Stop control also owns manual rendering: stopping discards the
uncommitted manual candidate and returns immediately to the last committed
artboard. Refresh behaves the same way because candidates are never persisted.

## Verification boundary

Unit coverage proves envelope merging, full history and index reopening, active
state normalization, corrupt-history salvage, executable-source rejection,
future-schema preservation, one-time legacy migration, and unavailable/quota
storage behavior. Browser coverage exercises manual history across refresh,
undo/redo after reopening, interrupted design reload, unreadable recovery, and
future-schema protection.
