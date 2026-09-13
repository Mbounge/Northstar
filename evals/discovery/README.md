# Northstar discovery evaluations

Version 0.4.0 contains four fully authored **draft development cases** spanning economics, game-announcement clues, creator marketing and multimedia product design. Read [SCORING.md](SCORING.md) for scoring, [READINESS.md](READINESS.md) for the current freeze and review limits, and [CATALOG.md](CATALOG.md) for coverage, evidence, scenario provenance and remaining review requirements. It does not contain a measured Northstar baseline. The CLI validates the dataset, prepares agent inputs, controls a manual episode on `/canvas`, and records observations and human grading. It never calls a model, spends API credits, launches a browser, or certifies that an observation is true.

The purpose is to measure whether Northstar helps someone understand a difficult business problem: discover evidence that changes the explanation or decision, explain its significance, distinguish facts from hypotheses, and maintain a useful investigation on the canvas as the work changes. A convincing paragraph, successful API response, or attractive screenshot alone cannot establish success.

## What is stored where

| Path | Purpose | Agent access |
| --- | --- | --- |
| `benchmark.json` | Suite version, cases, split files and proposed budgets | Controller only |
| `cases/<id>/case.json` | Identity, family, version, reviews and SHA-256 file references | Controller only |
| `cases/<id>/input.md`, `assets/`, `initial-canvas.json` | Original problem, user media and starting-state declaration | Initial bundle only |
| `cases/<id>/episode.json` | External events, prerequisites and observation checkpoints | Controller only; messages released when eligible |
| `references/<id>/` | Researched evidence, withheld inspiration, atomic rubric and limitations | Grader only |
| `calibration/` | Proposed examples for human grader calibration | Grader only |
| `schemas/` | Strict JSON Schema contracts for stored records | Controller |
| `splits/` | Development, validation and holdout family assignments | Controller |
| `runner/`, `tests/` | Execution bookkeeping, grading checks and deterministic regressions | Operator |
| `baselines/` | Reviewed summary policy; currently no baseline | Reviewer |
| `artifacts/discovery/` at repository root | Local run manifests, transcripts, screenshots, board states and judgments | Never exposed wholesale to the evaluated agent; Git-ignored |

JSON holds structured cases and rubrics. JSONL holds independent evidence records. Markdown holds readable inputs and review explanations. The private dataset includes the two user-provided screenshots and publisher-owned source media including one 36.4 MB creator video with provenance; large future media should use content-addressed external storage or Git LFS, with hashes and provenance in the case. Do not commit credentials, private customer data, or large raw run logs. Publication requires a separate rights and privacy review.

This follows published practices, with Northstar-specific episode and canvas checks: [DeepResearch Bench](https://github.com/Ayanami0730/deep_research_bench) separates questions, references and assessment; [DeepResearch Bench II](https://github.com/imlrz/DeepResearch-Bench-II) uses task-specific criteria and per-task judgments; [Anthropic's agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) distinguishes outcomes, traces, grader types and repeated trials. This directory is our implementation, not an industry-mandated format.

## The first case and three additional families

Read `references/ikea-breakfast/reference.md` and `rubric.json` together. The original price-comparison screenshot is the input; the comment is withheld inspiration, **not a verified answer key**. Research currently supports investigating food's role in the wider retail visit. It does not establish a loss on this particular breakfast, an exact sales uplift, or the economics of an unidentified restaurant.

The IKEA draft has 12 criteria across evidence, framing, analysis, uncertainty, clarity, continuity and canvas behavior, plus four critical gates. An alternative well-supported explanation can pass. No exact prose, visual template, connector count, source list or sequence of searches is required.

After the initial answer, the IKEA episode permits two branches: defer an unresolved profitability question, and examine another dated promotion. A human adds a native note. Both branches must finish before a saved-board restart, followed by revisiting the unresolved question. The episode graph describes outside events; it does not prescribe the model's internal investigation. A justified no-change conclusion is valid when the additional source was already known.

This is a short continuity case, not evidence of days-long reliability. Later cases should include longer pauses, genuinely changing sources, contradictory evidence, dead ends, images and video, and user changes to the problem. Each needs its own feasible environment and reviewed criteria.

## Validate and review before the baseline

From the repository root:

```sh
npm run eval:discovery -- validate
npm run test:discovery-evals
```

Validation checks schemas, hashes, artifact containment, unique IDs, evidence references, episode reachability, split separation and review status. It prints each case's `reviewDigest`. These checks establish record integrity, not the truth of source claims.

A case stays `draft` until its evidence, rubric, episode feasibility and budget have been reviewed. Record an author approval and a different independent human approval in `case.json.reviews`, using the printed `reviewDigest` as `subjectDigest`, actual reviewer identities, actual ISO timestamps, and `decision: "approved"`. Then set `status: "ready"`. Any unresolved `revise` decision blocks readiness. These are accountable review records, not authenticated identities; never invent a review to pass validation.

Changes to case contents require new approval. Changing status or review records changes the run identity but not the subject the reviewer approved. Retain older case versions and decisions in Git. Do not alter the rubric after seeing a candidate's result and reuse that result as if it had been judged against the original rubric.

Before promotion, two people should independently grade the calibration examples and at least one full trial. Discuss disagreements, especially plausible-but-unsupported claims, empty caution, source conflation and visual usability. Qualitative feedback on authored examples is recorded in `calibration/discussion.md`; full independent criterion-level calibration remains incomplete. The 40 scoped examples are proposed anchors, not measured or approved results. Read their contexts and record independent judgments before revealing their proposed verdicts.

## Manual live trial workflow

Only `manual-live` is implemented. `controlled-model` and `fixture` are reserved schema values which the runner explicitly refuses to execute. The deterministic tests below use synthetic observations to test bookkeeping, not to evaluate a model.

1. Choose a reviewed development case and pin the application revision (including any dirty diff hash), model identifier and settings, available tools and versions, and a spend/time ceiling. Use the same conditions for a comparison. The manifest's $5 / 600-second values are proposed defaults; choose and document a reviewed budget. Time receipts count active execution, including tools and repairs, once per interval; exclude deliberate waiting between sessions and report that waiting separately in the trace.
2. Create a run config matching `schemas/runConfig.schema.json`. Example shape (replace all placeholder values before a real run):

```json
{
  "schemaVersion": 1,
  "caseId": "ikea-breakfast",
  "appRevision": "REPLACE_WITH_COMMIT_AND_DIRTY_DIFF_HASH",
  "model": "REPLACE_WITH_ACTUAL_MODEL_ID",
  "modelConfig": { "reasoning": "REPLACE_WITH_ACTUAL_SETTING" },
  "tools": ["REPLACE_WITH_AVAILABLE_TOOL_NAMES_AND_VERSIONS"],
  "budget": { "maxSeconds": 600, "maxUsd": 5 },
  "track": "manual-live"
}
```

3. Start an unexecuted record with a fresh path:

```sh
npm run eval:discovery -- start /tmp/discovery-run-config.json artifacts/discovery/ikea-trial-001
```

Draft rehearsal only: append `--allow-draft`. It cannot become a certified benchmark result. `prepare ikea-breakfast /tmp/ikea-agent-input --allow-draft` exports the initial inputs without creating a run.

4. Open the normal `/canvas` route on the pinned app, create the empty board described by the initial-state declaration, attach the original screenshot from `agent-input/`, and submit its `input.md`. Do not provide the withheld comment, rubric, future messages, or answer hints. No eval-only application route is used. The current controller does not automate these browser operations.
5. Observe the whole attempt. Save the actual chat and tool trace, first committed composition, final screenshot, native board state, token/cost records, errors and repairs under the run directory. Test individual selection, moving, editing, deletion and undo on meaningful objects. Preserve snapshots before destructive interaction checks and undo those checks. A screenshot cannot prove native editability. Use the application's supported save/export or existing inspection facilities for board state; never manufacture a board-state file if capture is unavailable.
6. Make a checkpoint receipt matching `schemas/checkpoint.schema.json`. Its `artifactFiles` must contain relative paths under the run directory and actual SHA-256 hashes (obtain a file's hash with `shasum -a 256 FILE`). Include the run ID, checkpoint ID, observed time, terminal status, explanatory note, repair count, incremental elapsed seconds and incremental cost. If cost is unavailable, use `null`, not zero. Point to all observations needed for review. Import it:

```sh
npm run eval:discovery -- record artifacts/discovery/ikea-trial-001 /tmp/initial-receipt.json
npm run eval:discovery -- status artifacts/discovery/ikea-trial-001
npm run eval:discovery -- deliver artifacts/discovery/ikea-trial-001 defer-margin
```

7. `deliver` creates a durable event record. For `delivery: "message"`, send only its `payload` to Northstar; `instructions` are for the operator. If the delivery includes `artifacts`, attach those copied files from `RUN/event-input/<event-id>/` only at that event. Future event assets are withheld from the initial bundle and pinned through the episode. For `delivery: "operator"`, carry out the human edit or restart as instructed. Record each resulting checkpoint. Eligible branches can run in either order; failed or missing prerequisites do not release subsequent events. Reopen the same saved board during restart; do not reconstruct missing state from references.
8. If a trial fails or is interrupted, record that status and retain it. A new attempt uses a new run directory. Never overwrite the failed attempt, hide first-render problems behind a repaired screenshot, or silently exclude an infrastructure failure. The start manifest remains an immutable `unexecuted` declaration; `status` computes progress from checkpoint receipts.
9. A reviewer inspects the artifacts and writes judgments conforming to `schemas/judgments.schema.json`, copying the run's case and rubric digests. Supply every criterion and gate exactly once, with rationale and observation locations (file plus turn, timestamp or object ID). Reference evidence IDs identify the researched reference; observations identify what the candidate actually did. Novel candidate sources must be inspected and described in observations; the reference's source list is not mandatory. Missing or ambiguous evidence gets `cannot-assess`.

```sh
npm run eval:discovery -- grade artifacts/discovery/ikea-trial-001 /tmp/judgments.json
```

Each grade creates a new UUID-named record. Acceptance requires a ready case, human review, all completed checkpoints, verified budget, every required criterion and all critical gates passing. A draft's numerical/semantic pass remains `not-certified`. Model grading can be recorded for comparison but cannot certify a result in this version.

The CLI cannot stop an external API call or authenticate a human's observation. The operator must enforce the ceiling during execution. Hashes detect accidental file changes, not fraud. Artifact existence does not prove content quality. The reviewer must reject incomplete evidence. If browser state, usage or traces cannot be captured, report that gap rather than claiming a complete baseline.

## Leakage, reproducibility and interpretation

Only the exported input bundle and released event payloads belong in the evaluated agent's environment. Separate folders are not a security boundary: if an agent can read the whole repository, it can read the answer. This runner refuses to export validation or holdout cases until an isolated execution adapter exists. Keep related tasks in the same family/split; development on an IKEA variant must not be presented as independent holdout evidence.

Live web results change. Save inspected URLs, retrieval dates, excerpts and scope, plus source snapshots where appropriate and permitted. `asOf` is the case's intended historical context; it does not mechanically restrict the web. This version has no frozen searchable corpus or independently verified blocklist for the public comment and derivative answers. `independentDiscoveryCertified` is therefore false. A live result may be useful for diagnosing Northstar while still being unsuitable for an uncontaminated benchmark claim.

Case, split, schema and calibration changes invalidate run digests. Pin the runner commit and grader version as well; code changes must be disclosed when comparing records. Preserve raw outputs and score records outside Git, referenced by hashes from reviewed baseline summaries. Never compare silently changed datasets.

One case establishes neither broad discovery quality nor a public ranking. Grow development cases across product, marketing/ads, GTM, design/media, founders and strategic investigations. Add validation and hidden holdout families before making general improvement claims. Use the same cases and budgets for paired comparisons, repeat trials to expose variability, report first-attempt success and all failures, and retain disagreement/error categories. Estimate uncertainty across independent case families; repeated attempts on one IKEA question are not independent business problems.

## Next increments

First review all four cases together. No live testing is authorized by dataset validation; after review, separately agree to collect real `/canvas` baselines with the manual workflow. Then implement a tested browser/application observation adapter and a controlled retrieval track with genuine model calls. Add calibrated model graders alongside human review, score aggregation and family-level uncertainty only after the underlying records are trustworthy. Fixture replay will remain a separate product-regression track, never a substitute for measuring discovery intelligence.

## v0.3.0 review additions

Gymshark includes the full creator video and two timed stills. Candidate media manifests contain provenance, not curator observation notes. Human preservation is assessed after model action; calibration excerpts declare their checkpoint. All four cases have reviewer guides and remain draft pending independent human approval. The release receipt pins exact data and tooling; it does not constitute an approval or performance result.

## v0.4.0 scoring additions

The suite now has 49 criteria: seven additions assess executed investigative value across all four cases and explicit narrative clarity in the three cases that lacked a dedicated criterion. IKEA's existing clarity criterion is strengthened. Case guides separate explanatory depth, evidential support, customer purpose, stakeholder incentives, decision usefulness and native canvas observations. [SCORING.md](SCORING.md) and [the discussion record](calibration/discussion.md) are pinned shared grader artifacts, never candidate inputs.

Calibration examples now declare `context` and scoped `judgments` with rationale. Unlisted criteria are unassessed; `expectedFailure` must match exactly the explicit fail judgments. Validation rejects duplicate, unknown or wrong-checkpoint judgments. The runner still grades actual runs with `pass`, `fail` and `cannot-assess`; no weighted score or conversational 0–2 rating has been added.

All cases are version 0.4.0 drafts. Initial inputs, media, episodes and source ledgers are unchanged from 0.3.0. Existing run identities and reviews must not be reused with changed scoring. Qualitative agreement or a delegated design choice is not independent human certification. This patch updates evaluation guidance and validation, not the Northstar discovery harness or browser adapter.
