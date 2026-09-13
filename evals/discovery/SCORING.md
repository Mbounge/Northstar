# Discovery scoring guidance — 0.4.0

Grader-only guidance. Read this with the case rubric, reviewer guide, source ledger and actual run artifacts. It is pinned in each case's reviewed artifacts and must never be given to the candidate. This revision incorporates qualitative discussion across four development cases; it does not claim independent numerical calibration or measured Northstar performance.

## Judge the work the user receives

Good discovery uncovers an explanation worth understanding, finds evidence that could change it, and makes the implications useful. It can branch, return to an earlier question, or stop when further investigation no longer serves the decision. The canvas should communicate the result clearly and compellingly while keeping the evidence and meaningful earlier reasoning accessible.

Do not score resemblance to a preferred answer. The IKEA comment inspires explanatory delivery, not factual authority. A named journalist, product, platform, connector count, layout, metaphor, research sequence or experiment is never a mandatory answer unless the input itself requires it.

## Separate dimensions before judging the case

| Dimension | Look for | Do not substitute |
| --- | --- | --- |
| Framing and depth | A relevant mechanism, customer purpose, incentives or consequence that explains the problem. | Repetition of the prompt, a slogan, or insights supplied by the evaluator afterward. |
| Investigative value | Actual purposeful source inspection, comparisons or follow-up that changes an explanation, tests a live alternative, or justifies a bounded stop. | A list of platforms, promised future research, search volume or impressive source names. |
| Evidence | Correct attribution, dates, provenance and scope; hypotheses distinct from demonstrated effects. | Eloquence, popularity, repeated reporting, retrospective correctness or invented precision. |
| Decision usefulness | A feasible next step under the user's constraints, its rationale, success/failure signals and evidence that could change it. | A prescribed test template, a forced winner or indefinite requests for more information. |
| Narrative clarity | A coherent explanation from question through decisive evidence to insight and implications, legible on the actual board. | A source inventory, decorative polish, hidden chat reasoning or chronology of every search. |
| Continuity and native usability | Human contributions, context and uncertainty survive updates; meaningful objects and media work individually. | Prose promising preservation, screenshots alone proving editability, or later repairs concealing first-render failures. |

Judge each criterion independently. A commercially perceptive but unsupported claim can earn analysis credit and fail evidence. A cautious answer can pass uncertainty and fail depth. These distinctions diagnose the failure; they do not cancel each other in acceptance. Every required criterion and critical gate must still pass. Do not invent a weighted total or substitute the discussion's informal 0–2 ratings for the runner's verdicts.

## Verdicts and observations

- **Pass:** the available artifact at the named checkpoint meets this criterion. Name the observation and why it meets the standard. For a new source, inspect the material claim and its support; the reference ledger is not an exhaustive approved source list.
- **Fail:** adequate observations demonstrate a wrong claim, missing required behavior or unfulfilled requirement. A complete answer that contains no substantive explanation fails depth. A complete trace that only promises research fails investigative value. If access demonstrably prevented a required task, record the unmet requirement and the capability/access cause; do not invent a successful retrieval.
- **Cannot assess:** required observations are absent or ambiguous. A text excerpt cannot establish a legible rendered board, and a screenshot cannot prove persistence or independent manipulation. Do not treat missing artifacts as success, or convert a documented defect into uncertainty because it is inconvenient.

Separate failure causes in the rationale: unsupported inference, weak mechanism, source-access limitation, missing observation, misleading presentation, or broken interaction. A trace with a blocked optional source may still meet investigative value through useful alternatives. An accessible required source cannot be silently replaced by curator notes.

Use the initial artifacts for initial criteria and the specified later checkpoints for revision criteria. Plans can satisfy a next-step criterion but cannot prove executed discovery. A later event cannot earn initial insight credit. Gate review includes the whole attempt, including the first render, repairs and interruptions.

## Investigate beyond the seeds when it matters

Initial screenshots and sources are starting points, not a research boundary. Follow a promising reference, inspect a relevant alternative, or compare media when it could distinguish the live explanations. Trace a specific claim to its original basis regardless of whether it came from a company, journalist, anonymous post or discussion. Two articles citing one teaser are still one evidential origin.

There is no minimum number of sources, products, queries or platforms. A focused inspection of the original material can be sufficient when it answers the question. A justified no-change conclusion or bounded stop can pass. Negative results count when actual observations explain what was checked, what they ruled out or failed to distinguish, and why stopping is proportionate. They do not establish that no evidence exists anywhere.

For Emio, all initial evidence must be eligible by July 10. Current tags and remembered later identity cannot establish historical discovery. Public web access is not an isolated historical corpus. Record contamination and preserve `independentDiscoveryCertified: false`; do not claim this scoring change fixes retrieval isolation.

## Explain visually without prescribing a template

Ask of the rendered board: What is the question? What did we learn? Which evidence supports the explanation? Why does it matter? What remains open? A clear reading path can use any suitable hierarchy and spatial arrangement; it need not use these questions as headings.

Reward specific, engaging explanations that make the underlying mechanism understandable. Important screenshots, frames, clips, quotes or data should support the associated claims and be easy to inspect. Label consequential uncertainty without turning the board into a wall of caveats. Keep history accessible without making users read every investigative step to understand the current conclusion. Unsupported dramatic storytelling fails evidence even when it reads well.

Media should have locatable observations and accurate representation: seeing stills does not establish a soundtrack, and loading a player does not establish model perception. Native text, media and other meaningful objects remain individually editable; native connectors are optional and should clarify a relationship. No hidden-content interaction is required to read the principal explanation.

## Accept different sound decisions

Business strategy is relevant when it serves the question, not a required detour in every task. Test customer substitution instead of assuming it. Distinguish a potential exchange of brand/creator/viewer value from verified payment, acquisition or retention. In product research, compare interactions and user goals rather than copying whole applications.

A feasibility pilot, diagnostic check, comparative experiment, further qualitative inquiry or justified hold can be appropriate. Judge whether it answers its stated question within the constraints. Do not require a causal experiment when the stated purpose is feasibility. Do not accept causal superiority from non-random observations. A recommendation should make proportionate progress and state what could change it.

New constraints may preserve the prior recommendation, change only one assumption or require a different priority. Recognize a justified no-change result. Keep deferred problems visible as unresolved. An author-written brief is one possible Slack response, not the gold design; its completeness for visual tasks and burden on authors need testing.

## Calibration protocol and limits

The examples are synthetic excerpts or explicitly described synthetic artifact scenarios. `context` states what is available; `judgments` names only the criteria being calibrated, with `pass`, `fail` or `cannot-assess` and rationales. Unlisted criteria are unassessed. `expectedFailure` is a compatibility index of the explicit fail judgments, not a complete score. An empty array never means the whole case passes.

Give reviewers the case input plus an example's context and answer first. Withhold its proposed judgments until each reviewer records an independent judgment and rationale. Compare disagreements on the same criterion, not just whether the answer sounds plausible. Record actual feedback without inventing numerical scores or independent approval. Read [calibration/discussion.md](calibration/discussion.md) for the disagreements and delegated choice retained from this discussion.

Before promotion, independently review the changed criteria and grade actual complete trial artifacts. The conversational calibration did not inspect live Northstar outputs or prove agreement across all dimensions. All four cases remain drafts. These are development families, not held-out evidence of broad superiority.
