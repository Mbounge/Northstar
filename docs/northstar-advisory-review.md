# Iterative discovery review (experimental)

Enable with `NORTHSTAR_DISCOVERY_REVIEW=advisory` on the process hosting Codex. Restart after changing the setting. Unset it to retain the production native-loop baseline. This experiment is opt-in and has not been deployed.

## Review loop

The primary runs its native Codex reasoning/tool loop. The host holds its proposed final answer and calls an isolated reviewer using the same Luna model and High effort. The reviewer receives the user request, current draft, observed tool activity, available source/tool context, supplied images and earlier review feedback. Private reasoning is not collected. Source excerpts can be incomplete and that limitation is explicit.

The reviewer returns structured, prioritized work items: the gap, why it matters, concrete reasoning to develop, targeted investigation questions/source targets where useful, and what would resolve the gap. It focuses on substantive understanding, not style edits. It cannot use tools or change the canvas.

For explanatory questions, the acceptance standard asks whether the answer develops causal connections, relevant competing or interacting mechanisms, and the distinction between documented facts, deductions and conjectures. Missing specifics should bound an individual claim without replacing the broader explanation. The completion assessment must justify stopping against the current draft's substance, not merely citations, caveats or compliance with earlier feedback. This is reviewer instruction, not a deterministic depth validator or a guarantee of better reasoning.

The reviewer is asked to contribute a conditional argument connecting objectives, choices and consequences, distinguish the ability to produce an outcome from the incentive to choose it, and check whether an additional search could change the interpretation. A failed targeted check should not recur without a new lead. Revisions must preserve useful prior explanations and avoid new unsupported comparisons.

Each work item includes `draftBasis`: the passage being criticized and any existing qualification. The reviewer must account for both before diagnosing a gap. `consistencyChecks` explicitly compares consequential conclusions with the draft's premises or qualifications before the stopping decision. These assessments are forwarded intact to the primary, which can correct the reviewer's misreading. The schema checks that the fields are present, not that the LLM's interpretation is correct. The review instructions were consolidated around these obligations rather than extended with another repeating checklist.

`argumentChecks` tracks whether the strongest useful explanation from prior drafts or feedback is developed in the current answer, lost during qualification, or legitimately superseded. `sourceChecks` pairs material claims with their exact supplied citation and available source content. The reviewer distinguishes supported, mismatched and not_available; absent source content cannot count as verified support. When needed, the primary is asked to inspect the exact source with `read_source` or another tool returning the content, so subsequent reviews receive it. The reviewer itself still has no tools. Changed citations are reassessed and failed access is bounded rather than endlessly retried. These are explicit LLM assessments, not deterministic proof of causal depth or source accuracy.

Each review packet now includes an explicit `reviewHandoff`: the immediately previous draft and feedback (each capped at 24,000 characters), activity at that review, and retained observations since it. Older investigation and newer observations are partitioned rather than duplicated. Excerpt omissions are reported. This handoff survives rolling-history eviction and resets for new user input; it is explicit output history, not hidden reasoning.

If consequential work remains, the host continues the primary in its original thread with that feedback. The primary reasons, uses tools, and proposes a revised complete answer. The host reviews that new draft again. There is no need for user steering to advance the loop. Earlier feedback is retained so the reviewer can recognize resolved work and avoid repeating it or moving the goalposts.

An empty effective work list, after reconciling previously open issues, means the reviewer finds the answer satisfactory for the actual question, with honestly stated residual uncertainty where appropriate. The host then releases the reviewed answer and completes the public turn. This is an LLM assessment, not proof of correctness. No scores, fixed conclusions, minimum searches, or changes to canvas acceptance rules were introduced.

A native turn that ends without a reviewable answer fails as unfinished. It cannot bypass the reviewer's completion decision.

## Explanatory development and retained work

The reviewer now assesses explanatory development separately from citation support. Each `argumentChecks` entry includes `reasoningStatus` (`developed`, `incomplete`, or `not_needed`) and `missingConnection`. Its treatment must refer to reasoning actually present in the answer, not reasoning the reviewer silently supplies. Qualified claims, named operating models and lists of factors are not sufficient by themselves to establish a developed explanation. This remains an LLM judgment, not a code-level measure of depth.

Work items have stable IDs and a `central` or `supporting` priority. Guidance asks the reviewer to prioritize gaps that change the main explanation or decision, batch necessary smaller corrections, and omit distracting optional detail instead of spending repeated reviews on it. No topic-specific mechanism, minimum search count, new model, extra reviewer or larger review budget is imposed.

`DiscoveryReviewContext` retains open work separately from the rolling observation history. Each packet includes this list, so it survives history eviction. The reviewer keeps each unfinished issue in `work`, or closes it through `resolvedWork` with a disposition and basis explaining what changed. `no_longer_needed` permits retiring mistaken criticisms, refuted hypotheses and unhelpful lines of inquiry. Explicit closure is not evidence that the judgment is correct; the host validates the transport and continuity, not semantics.

The host reconciles the current feedback against retained work before deciding whether to finish. Silent omissions are carried forward, central issues are sorted first, and a still-open central issue cannot silently be downgraded. Duplicate IDs and simultaneous closure/opening of the same ID are invalid. The reviewer can explicitly retire a concern rather than forcing the primary to adopt a theory. New user input clears the list; cancellation and superseded reviews cannot commit stale updates. The existing review ceiling still bounds unsuccessful cycles.

Diagnostics retain both raw reviewer feedback and effective feedback after reconciliation. This allows evaluation to distinguish a reviewer approval from an omission the host caught. Tests exercise omitted issues across native turns, prioritization, history eviction, explicit resolution and retirement, reset, cancellation, and conflicting IDs. Passing these tests does not establish improved one-shot answer quality.

## Final claim scope

The existing consistency/source checks now explicitly examine both the opening verdict and closing conclusion. Comparative claims must stay on an established dimension and account for an unknown comparator; temporal claims must distinguish dated initiatives and historical aspirations from current availability or measured performance. The host supplies the UTC `reviewDate` in the packet. Corrections should preserve the central explanation, use a dated/narrower attribution where sufficient, and be batched within the existing review rather than adding a dedicated pass or unnecessary fresh research. This final instruction refinement has passed the existing local checks but has not had a separate live quality run.

## Streaming, stopping and limits

Progress and tool activity stream across the entire logical turn. Proposed final-answer text is held during every review and released when the review loop ends; it does not stream as an already finished answer before review. Stop cancels a reviewer or interrupts the actual active primary turn. Input arriving during review supersedes stale feedback and starts a fresh review cycle for the updated request.

`NORTHSTAR_DISCOVERY_REVIEW_MAX_ROUNDS` limits reviewer calls per user turn (default 6, configurable 1–200). This is a safety ceiling, not a quality target. If the last allowed review still has work, the host releases the latest draft with an explicit unfinished-review notice and records `budget_exhausted`, never reviewer approval. Each reviewer also has a two-minute timeout. Review failure releases the latest draft with an unavailable/unfinished notice; cancellation does not publish a held draft. A continuation that cannot start reliably fails explicitly rather than repeating paid work.

Cost scales with the number of review cycles and the primary's chosen tool work. This does not add durable background jobs or persisted conversations.

## Diagnostics and validation

Owner-authorized snapshots retain the first draft, latest continued answer, feedback, initial/completed activity, and every completed review round's draft, feedback, duration and activity. These are explicit outputs, not hidden reasoning. They remain ephemeral and are not injected into ordinary chat. Activity counts indicate observed native web operations and returned Northstar tool results, not quality or reasoning depth.

For local evaluation only, `NORTHSTAR_CODEX_REVIEW_DIAGNOSTICS=1` enables review-report logging on an idle heartbeat of the existing gated local evaluation route. Reports omit session tokens and redact the configured API key. The logger is off by default and unavailable in production; its contents are evaluation data.

Protocol tests cover repeated reviews, multiple native turns within one public turn, draft isolation, preserved tools, duplicate completions, review history, approval, budget exhaustion, reviewer failure, stopping in later rounds, answerless completion, bounded handoff history and new user input. The latest live IKEA test before the handoff changes completed three reviews in approximately 2.5 minutes; it did not demonstrate the desired improvement in causal depth. A new quality evaluation remains necessary before production enablement.

Chat rendering accepts explicit HTTP(S) URLs inside native citation tokens, including multi-source citations. Unknown native reference IDs render as “Source unavailable”; URLs are never guessed. Partial URL-citation tokens are held while streaming and literal code remains unchanged. This is presentation support, not a source-verification mechanism.

Runtime reference: https://learn.chatgpt.com/docs/app-server
