# Discovery foundation — Patch 1

This patch extends the existing discovery runtime. It does not introduce a new canvas form factor or a fixed research sequence.

## Audit findings and changes

- Investigation lines existed in durable state, but provider transitions could not create, defer or resume them. Transitions now support explicit question and line status updates with reasons and validated identities. Newly opened questions receive a branch when not explicitly linked. Deferred questions cannot silently complete an active branch.
- Contradictions could be added but not explicitly resolved, accepted as an unresolved tension, or reopened. Updates now require an explanation; resolution requires exact supporting evidence. Original opposing evidence and creation timestamps remain attached.
- Compact model context excluded deferred lines/questions, answered questions and decided alternatives. Bounded context now includes those records and settled contradictions, so continuation can refer to existing identities. Full durable state remains on the revision; these bounded lists are not a claim of unlimited long-term recall.
- A continuing human message could inherit satisfied criteria from the prior completed request. New human turns now clear that credit and require a fresh assessment. Ordinary continuing messages are retained as human input. This does not make every open research question block completion of a requested provisional brief.
- Human replies were assigned to the last open question, potentially a different branch. The waiting state now records the asked question's ID. Validation results no longer automatically answer an unrelated research question.
- Restating a finding could reset its status and creation date. Rejected statements and decided candidates retain their existing content/status; ordinary revisions preserve creation dates. These guards protect known identities; they do not semantically detect every paraphrase under a new ID.

- Model requests now use call-local short references for existing questions, branches, findings, contradictions, candidates, uncertainties and validation plans. Responses decode to canonical identities before strict lifecycle validation. Human prose is not decoded as an identity.

## Canvas and composition contract

Relationships are optional unless the original human request explicitly requires them. A routed paraphrase cannot turn “any relationships must be native” into a requirement to add connectors. Content is committed and measured before a separate relationship turn. New or rebound connectors must reference measured individual objects, including the separate background surfaces the native compiler creates. Both authoring stages receive an explicit endpoint directory. Native scene projection includes those generated objects and reconciled connector endpoints, rather than leaving the next turn with the earlier HTML's containers and geometry.

Human endpoints follow the pointer: exact interior attachment, immediate detachment outside an object, and no outside magnetic band. Relative anchors survive movement/resizing. Text observations and selection use painted glyph bounds. Native connector observation includes ordinary native edges, explicit interior attachments and immediate route backtracking. These checks do not establish that every possible composition is aesthetically good.

Rejected private updates have a bounded recovery budget. After three attempts without a commit, the run pauses truthfully; it does not mark incomplete work complete. This prevents an unbounded retry loop and does not substitute for fixing invalid model contracts.

Discovery state commits with the artifact revision and follows undo/redo. The deterministic branch scenario uses the real `/canvas` route and the production transition parser/reducer. It opens two investigations, defers one, then resumes it. Human text, the other investigation and the shared native connector stay on the board.

## Verification

- 587 active unit tests passed; typecheck, production webpack build and canonical cutover checks passed.
- Lint: 0 errors, 174 existing warnings.
- In-app deterministic `/canvas`: branch creation (two composition moves), deferral and resumption; human note preservation; undo/redo; independent selection; painted text bounds; interior connector attachment; exact outside detachment; compiler-created stage backgrounds connected in a separate turn.
- Live provider tests are authorized and use actual model calls. Earlier failed runs are retained as failures, not counted as successes. The optional-relationship comparison completed without connectors after correcting original-request authority. The previously failing three-stage handoff resumed successfully after the measured endpoint contract fix. A fresh handoff also completed without rejected provider responses: stages, arrows, then one spacing refinement.
- The Playwright regression spec is included. Standalone Chromium terminates during launch before assertions in this environment; that suite is not reported as passing. In-app automation verified targeted gestures, but its two-point drag API did not execute the full continuous multi-point mouse-down test from the spec.
- Final stable live deferral and resumption succeeded without retries using the same durable IDs. The teaser question changed from open to deferred and back to open; hiring remained active. All 35 observed canvas nodes retained their exact text and inline styles, including the manually edited team note. The final inquiry creation had one private discovery-direction retry for an omitted continuation condition.
- A development reload cleared the test boards during an earlier replay; that replay is excluded from continuity proof. The final sequence ran without server edits. Browser history also contains an unattributed startup MutationObserver error.
- Targeted live success is not full release certification. Broad cross-browser behavior and general visual quality are not certified. No deployment was performed.

## Next boundaries

Source/media acquisition is Patch 2; richer discovery compositions are Patch 3; ongoing monitoring and broader sustained-investigation validation are Patch 4. No Meta ads integration, new media provider, monitoring job, or deferred interactive-composition experiment is enabled here.
