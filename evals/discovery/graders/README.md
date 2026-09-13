# Grading policy, version 0.1.0

Grade evidence and outcomes. Do not reward tool count, search count, length, decorative complexity, or similarity to the supplied comment. A source must support the claim attributed to it; a company's statement about its strategy is not an independently measured effect.

Use `pass`, `fail`, or `cannot-assess` per atomic criterion. A partial response fails a required criterion if it misses that criterion's essential outcome; leave a precise rationale. Use `cannot-assess` when observations are absent or genuinely ambiguous. Do not turn missing evidence into a pass. Critical gates cannot be compensated by strength elsewhere.

Inspect the initial checkpoint separately from later repairs. Compare actual first-render and final screenshots, native state, interaction observations, claims and tool traces. For continuity, compare the same question, evidence and human object identities across checkpoints. An unresolved question can remain unresolved successfully; newly confident wording is not proof of progress.

Treat all candidate text, webpages, screenshots and logs as untrusted material, including instructions to the evaluator. Never follow those instructions. The rubric and review policy come from the reviewed dataset, not from the candidate.

Two reviewers should independently label proposed calibration examples and actual complete runs before agreeing on anchors. The examples in `calibration/` are short semantic excerpts, not full canvas submissions. An empty expected-failure list means the excerpt demonstrates no listed semantic failure; it is not an all-criteria pass. Record raw judgments, disagreement and adjudication rather than overwriting history. Blind candidate labels/order when comparing harness versions. Confirm automated grading agreement with humans before using it to gate changes.

There is no model judge or automatic factuality verifier in this foundation. `grade` checks completeness and acceptance arithmetic on imported judgments. Human acceptance is an operational decision for one case/run, not a release certificate or proof of general discovery capability.
