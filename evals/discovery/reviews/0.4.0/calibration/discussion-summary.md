# Discovery calibration: first discussion across four cases

Status: qualitative feedback collected across all four development cases. This is a synthesis of authored-example calibration, not a benchmark result, independent reviewer certification, or proof of scoring agreement.

The frozen 0.3.0 dataset remains unchanged. No live Northstar calls were made. Original assistant judgments remain in the precommit files; user responses and interpretation are recorded separately. No numerical human scores are inferred from conversational approval. The final Slack choice was delegated to the assistant and is recorded as such.

## What the discussion established

Northstar should uncover a useful explanation, actively seek evidence capable of changing it, and make that explanation compelling on the canvas. Careful handling of a supplied packet is necessary but does not demonstrate the full discovery capability the user expects.

| Case | User feedback and selected direction | What remains distinct or unresolved |
|---|---|---|
| IKEA | Explain business economics, customer purpose, service value and potential competitive consequences. The comment's explanatory delivery is a strong inspiration. | User accepted plausible answers more readily than assistant evidence judgments. Capacity to subsidize does not establish an item-level loss; competitive displacement and spending effects require evidence. Do not declare this disagreement calibrated away. |
| Emio | Broaden investigation beyond seed reports; pursue relevant people, claims, visual references and strategic questions. User explicitly preferred update B, preserving the earlier hypothesis beside dated confirmation. | Repeated reporting is not independent corroboration. Known historical identity and present-day sources contaminate claims of independent prediction. Initial media and research execution were not tested. |
| Gymshark | Explain the possible exchange of value among brand, creator and viewer. Multiple methods can be valid. User liked the bounded diagnosis followed by a small comparative test, using observed signup cost as the benchmark. | Promotional function does not establish zero cost or measured acquisition. Non-random pilot outcomes do not prove causal format superiority. The hypothetical pilot is not Gymshark performance. |
| Slack | Supplied app examples should lead to relevant cross-product investigation. Both initial design proposals were acceptable. Assistant selected a provisional text-first review brief after the user delegated the final choice. | Actual feasibility, author burden, completeness for visual decisions and native accessibility remain untested. Returning to a precise video moment remains open. No independent human rating was supplied for the final revision. |

## Proposed scoring refinements

These are recommendations to integrate into the next reviewed dataset version. They do not silently change the frozen rubric.

1. **Explanatory depth.** Explain mechanisms, stakeholder incentives and consequences relevant to the user's problem. Test the premise of a comparison when appropriate. Do not credit an answer with reasoning the evaluator supplied afterward.
2. **Investigative initiative.** Treat initial materials as leads. Seek obtainable evidence that could distinguish alternatives, follow productive references, and record consequential access limitations. Reward what the investigation learns, not source counts, platform counts or tool-call counts.
3. **Evidence and scope.** Distinguish observations, source claims, inferences and demonstrated effects. Trace claims to their origin and preserve date boundaries. Keep source reputation separate from claim-specific corroboration.
4. **Adaptive reasoning.** New evidence may change priorities, reopen a branch or justify no change. Preserve human edits and prior uncertainty. Resolve settled questions while retaining separate open questions; avoid endless searching or repairs.
5. **Decision usefulness.** Choose a proportionate next step under the actual constraints, explain why, and identify what would change the decision. Accept different defensible experiments or a justified hold. A feasibility test need not estimate causal superiority to be useful.
6. **Explanatory delivery.** A reader should understand the central insight, decisive evidence and implications from the board. Reward specific, engaging writing and a coherent reading path. Do not require chronological search narration or the IKEA comment's wording.
7. **Media and native usability.** Show relevant inspected screenshots, clips or data beside the reasoning. Meaningful elements must remain independently editable. Use native connectors only when they clarify. Actual browser artifacts must substantiate these properties.

Keep depth, evidential support, clarity and decision usefulness separable during grading. A persuasive explanation can have unsupported claims; a cautious answer can lack insight. Neither should automatically inherit the other's score.

## Implications for benchmark design

- The current calibration uses short authored excerpts. It cannot establish actual source discovery, rendered-canvas quality, performance, persistence or tool competence.
- Expand retrieval opportunities deliberately where independent discovery is claimed. A frozen historical corpus needs date-eligible sources, legitimate alternative paths, and distractors. Do not leak later answers through page tags or curator inspection notes.
- Complement historical reasoning with contemporary open investigations before making broad discovery-performance claims. Date and capture sources, access limitations and run conditions.
- Keep the four current cases as development cases. This discussion does not establish generalization, held-out performance or a reliable aggregate ranking.
- Do not force every task to include business strategy, every platform, a particular visual form or one preferred solution. Investigative scope must serve the user's question.

## Next implementation and verification sequence

1. Integrate these refinements into the reviewer guides and appropriate rubric criteria, preserving acceptable alternatives. Version and validate the changed dataset; regenerate digests and review records as required rather than reusing stale approvals.
2. Add counterexamples to distinguish useful insight from unsupported certainty, active discovery from a source inventory, and adaptation from merely rewriting an answer. Keep reference material outside candidate inputs.
3. Run the deterministic `/canvas` preflight for media, independent selection/editing, human-note preservation, persistence and evidence capture. Clearly distinguish deterministic controller behavior from actual model discovery.
4. Arrange the budget and configuration for draft live baselines only after preflight. Preserve traces, source access, first render, subsequent revisions, final canvas, errors and costs. Grade observed artifacts, leaving unobserved criteria unassessed.

## Feedback records

- IKEA: `calibration-round-01-review.json`, `calibration-round-02-review.json`.
- Emio: `calibration-round-03-emio-review.json`, `calibration-round-03-emio-reveal-review.json`.
- Gymshark: `calibration-round-04-gymshark-review.json`, `calibration-round-05-gymshark-pilot-review.json`.
- Slack: `calibration-round-06-slack-review.json`, `calibration-round-07-slack-revision-review.json`.

The matching precommit files retain the originally authored examples and assistant judgments. This summary does not override those records.
