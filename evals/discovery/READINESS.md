# Scoring revision readiness — v0.4.0

This revision incorporates qualitative feedback across four development cases. All cases remain **draft**; there is no live Northstar baseline, independent human approval or certified discovery result. See [SCORING.md](SCORING.md) for the scoring contract and [calibration/discussion.md](calibration/discussion.md) for agreements, disagreements and the delegated final Slack choice.

## What changed

- 49 criteria across four cases and 21 checkpoints. Seven new criteria assess actual investigative value and rendered narrative clarity. Existing criteria now address customer purpose, stakeholder incentives and proportionate decisions without requiring a single solution.
- 40 proposed calibration examples, each with context and explicit scoped pass/fail/cannot-assess judgments. Twenty new scenarios contrast plausible insight with unsupported evidence, source lists with executed research, and different valid recommendations.
- Shared and case-specific grader guidance is pinned. New schema and runner checks reject contradictory failure indexes, duplicate or invalid judgment targets and incorrect checkpoints.
- Original feedback and assistant precommits are archived under `reviews/0.4.0/calibration/`. They are discussion records, not model runs or approval signatures.
- All case versions are 0.4.0. Initial prompts, media, source ledgers and episode delivery are unchanged from 0.3.0. No product or discovery-harness code changed. Old digests and approvals cannot silently carry forward.

## Evidence and access limits

The source research and media inspection remain those documented in the [0.3.0 readiness review](reviews/0.3.0/readiness.md). No new live web verification was performed for this scoring-only revision. Current product behavior or source availability is not inferred from stored historical evidence. This is not a new media, app or API certification.

Purposeful source discovery is now assessed explicitly, but the runner still cannot execute it: it controls manual episode records and checks imported observations. Current-web contamination and known historical answers remain limitations, especially for Emio. No isolated historical corpus, extra external connector or broad domain coverage was added. `independentDiscoveryCertified` remains false.

## Remaining work

1. Independently assess the revised rubric and scoped examples. Conversational agreement did not establish numeric inter-rater reliability or unanimous agreement on evidence standards. No case is ready merely because these records validate.
2. Run a zero-credit `/canvas` preflight for actual media insertion/playback, model access to representations, independent editing, preservation, persistence and evidence capture. Keep deterministic controller tests distinct from application observations.
3. Pin the app, model, available tools and budget before an explicitly authorized draft live baseline. Retain first renders, later revisions, source traces, native state, errors and actual cost. Required missing observations remain cannot-assess, never inferred passes.
4. Grade the complete observed episode under the frozen scoring version. Do not compare changed rubrics as though their results used identical conditions.

The new freeze at `reviews/0.4.0/freeze.json` pins exact files and review subjects. It is an author-reviewed draft record, not independent approval. No API credits were used for this revision.
