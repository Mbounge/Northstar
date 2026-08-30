# Patch 9.6 — Human-Guided Validation and Discovery Continuation

Patch 9.6 closes the loop between understanding and learning. Northstar turns
one decision-relevant hypothesis or evidence gap into the smallest useful
human validation, retains the outcome in the active inquiry, and then
continues, reframes, decides, or stops.

## Product contract

- Northstar may design interview questions, experiments, measurement plans,
  research briefs, comparison criteria, and decision gates.
- Every validation names the uncertainty it resolves, why it matters now, the
  human-owned method, the signals that would strengthen, weaken, or overturn
  the current view, and the decision the result can unlock.
- Validation is selective. Northstar proposes only the highest-value next
  learning action and keeps a bounded backlog of genuinely useful alternatives.
- The person may accept, reject, defer, start, or complete a validation. Those
  conclusions are durable inquiry memory and are never silently overridden.
- A supplied result receives stable human provenance, updates the existing
  inquiry, and can narrow or resolve uncertainty, revise a hypothesis, reframe
  the problem, support a decision, or expose the next material question.
- The person may attach up to eight combined items to a message. The supported
  surface is optimized PNG, JPEG, and WebP images plus long text pasted directly
  into the composer. Videos are not accepted.
- The composer condenses long pasted material into a named text card instead of
  letting it obscure the person's actual prompt. Image and text cards share a
  responsive horizontal carousel, remain removable before send, and persist in
  the sent conversation.
- Northstar reads the actual image pixels and exact supplied text as supplied
  evidence, preserves limitations and lineage, and can synthesize either with
  the inquiry. Per-item and group bounds prevent the convenience surface from
  becoming an unbounded model payload.
- Uploaded images remain graph-only by default. A visual director may select
  an exact image for a material evidence role, after which the compiler—not
  model-authored URLs—binds those same pixels into a narrative canvas island.
  Attachments are never dumped onto the canvas automatically.
- A validation plan is not a consequential external action. Northstar designs
  the work and collaborates on its interpretation; the person owns execution
  and supplies or authorizes the result.
- The canvas communicates the domain meaning naturally. It may show questions
  worth asking, a lightweight test, signals to watch, what would change the
  recommendation, or a decision rule. It never exposes backlog, validation
  state, uncertainty IDs, orchestration, schemas, or other runtime vocabulary.
- Simple requests remain direct. Validation appears only when it can materially
  reduce uncertainty or distinguish decision-relevant alternatives.
- Waiting for human action is a successful discovery outcome, not an error,
  retry, budget pause, or failed composition.
- Cross-session persistence is not introduced here; that remains Patch 11.

## Acceptance contract

Patch 9.6 is complete when tests and the production canvas prove that Northstar
can design each supported validation form, keep a bounded prioritized backlog,
record accepted/rejected/deferred conclusions, ingest a human result with exact
lineage (including images and condensed long-paste results supplied in chat),
selectively reuse exact supplied pixels on the canvas, update rather than restart the inquiry, and continue non-linearly
without executing consequential external actions or leaking internal control
language onto the canvas.
