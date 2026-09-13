# Four-case discovery dataset — v0.4.0

All four cases are fully authored development packages, **pending independent rubric approval and full artifact calibration**. No live Northstar testing or benchmark scoring has been performed. These cases are an initial breadth sample, not a statistically representative benchmark or a public ranking.

| Case | Business question | Distinct challenge | Actual input media | Non-linear episode |
| --- | --- | --- | --- | --- |
| IKEA breakfast | What explains a striking price difference? | Discover a supported mechanism without copying an unverified confident answer | Original user screenshot | Defer question; reconcile dated promotion; preserve human note; reopen saved board; revisit |
| Emio launch clues | What did the teaser justify before a reveal? | Source provenance, repeated reports, temporal limits, hypothesis revision | Nintendo teaser-site MP4 loop | Challenge apparent corroboration and add a prediction in either order; receive later announcement; decide what is resolved |
| Gymshark creator strategy | What can a small brand learn and test? | Creative interpretation, campaign versus paid-ad evidence, funnel conflicts, measurement | Complete creator MP4, thumbnail and two timestamped stills | Reconcile availability notice and human goal; inspect delayed synthetic pilot CSV; adapt to smaller budget |
| Slack Clips design | What should another workflow borrow from these interactions? | Reason from moving UI evidence, distinguish historical/current behavior, transfer under constraints | Two original animated GIF examples | Incorporate hypothetical research and human constraint; adapt to transcript-storage change; design a user test |

Each case has an original input, pinned media/context files, an episode graph, inspected reference sources with scope and limitations, atomic criteria, critical gates, a reviewer explanation, proposed good/bad calibration excerpts and explicit access risks. The original input is scored before follow-up assistance. Later improvement cannot retrospectively earn first-answer credit.

## Discovery tenets and coverage

| Tenet | Where it is stressed |
| --- | --- |
| Reframe the question | IKEA economics; Gymshark's engagement versus signup objective |
| Find consequential evidence | Executed investigative-value criterion in every case; later announced facts, conditions and constraints test revision separately |
| Explain a mechanism | Retail visit, participation loop, context recovery |
| Distinguish fact, inference and uncertainty | Every case; explicit no-fabrication gates |
| Branch, challenge and revisit | Independent episode branches; source repetition; deferred margin question |
| Preserve context over time | IKEA restart; Emio historical predictions; preserved human contributions |
| Make reasoning inspectable and collaborative | Native text/media, source context and individual editability in every case |
| Make a useful next move | A discriminating source request, a bounded experiment, a stopping decision or a user test |

Connectors are optional and must clarify a specific relationship. A beautiful board cannot compensate for unsupported claims; a correct paragraph cannot compensate for an unusable canvas.

## What is real, authored or unresolved

**Real source material:** the IKEA screenshot supplied by the user; Nintendo's downloaded teaser-site loop; a creator upload linked from Gymshark's campaign article, its thumbnail and two extracted stills; Slack Design's two GIFs. Downloaded media bytes, source URLs and inspection scope are pinned. Neutral provenance accompanies inputs; curator observations stay in grader-only references. The Gymshark stills are declared visual-access aids, so this is not an unassisted video-perception benchmark. Sampled visual inspection does not imply uninterrupted viewing of every source moment.

**Authored scenario data:** the small brand's constraints and pilot CSV; the fictional review tool's workflow and three moderator notes; all operator follow-up messages. They are clearly labelled and must never become claims about Gymshark or Slack. Synthetic facts are legitimate task inputs, not measured Northstar outcomes.

**Unresolved external access:** the original Emio YouTube trailer remains an unverified lead; its content is not a required factual answer. The Gymshark creator page and full download were accessible during the readiness review. The game case's current source pages may contain later tags or links, and the historical answer may already be in model memory. It tests use of dated evidence and warranted revision; it cannot establish independent prediction. An isolated historical source environment remains necessary for that stronger claim.

**Coverage limits:** this set does not yet certify Meta Ad Library access, actual paid-ad video extraction, job-posting forensics, multi-day monitoring, multilingual research, authenticated sources or representative performance across all business domains. Add those as concrete cases rather than declaring them covered by analogy. All four current families are development data. Validation and holdout are explicitly empty.

## Review and scoring contract

Review the source ledger, input, episode and rubric together. Then independently grade the proposed calibration examples. Read [SCORING.md](SCORING.md). Each example states its context and scoped criterion judgments. Short strong excerpts are not complete submissions; empty `expectedFailure` arrays do not mean all criteria pass. Qualitative feedback is preserved in [calibration/discussion.md](calibration/discussion.md), including unresolved disagreements. Record disagreements and clarify criteria before seeing model outcomes. Never fabricate reviewer approvals.

For every initial criterion, judge the initial artifacts. For each later criterion, judge its named checkpoint and compare earlier state where relevant. Use `cannot-assess` for absent observations. Per-case acceptance requires every required criterion and gate, complete checkpoints and known budget within the agreed ceiling. Retain first compositions, repairs, tool traces, cost and failures. Report dimensions and case-specific failures before any aggregate; four cases cannot support a broad ranking.

The candidate-visible `media.json` states origin and representation. Actual curator observations are stored only in grader references. A playable reference must actually play on `/canvas` in the eventual run; a thumbnail cannot substitute for a required GIF or MP4. Capture native object identity and state to establish editability. Do not infer it from a screenshot.

`events/<event-id>/` holds delayed inputs. The runner hashes these via the episode, withholds them from `prepare`, and copies only eligible event assets into `RUN/event-input/<event-id>/` during `deliver`. Attach those copied files when sending the event payload. Do not mount the repository or grader references into the candidate environment. This is controlled delivery bookkeeping, not a search sandbox.

## Sources and reviewer entry points

- IKEA: [case reference](references/ikea-breakfast/reference.md), [rubric](references/ikea-breakfast/rubric.json), [IKEA Museum source](https://www.ikeamuseum.com/en/explore/the-story-of-ikea/the-worlds-biggest-restaurant/).
- Game clues: [case reference](references/emio-launch-clues/reference.md), [rubric](references/emio-launch-clues/rubric.json), [contemporaneous reporting](https://nintendosoup.com/nintendo-shares-mysterious-emio-teaser-video/), [later Nintendo announcement](https://www.nintendo.com/ph/news/article/3i8ydftRklIFEAQRgUnP10).
- Creator strategy: [case reference](references/gymshark-creator-strategy/reference.md), [rubric](references/gymshark-creator-strategy/rubric.json), [Gymshark campaign source](https://www.gymshark.com/blog/article/how-to-become-a-gymshark-athlete).
- Design: [case reference](references/slack-clips-design/reference.md), [rubric](references/slack-clips-design/rubric.json), [Slack Design source](https://slack.design/articles/the-story-of-slack-clips/).

Keep publisher-owned media private unless redistribution is cleared. The next step is independent review of the revised scoring and a zero-credit application preflight, followed by an agreed live baseline configuration and budget. Dataset validation itself does not call a model.

## Author readiness review

See [READINESS.md](READINESS.md) for the v0.4.0 changes, case-by-case findings and remaining independent review and application preflight. Each reference folder includes a pinned `reviewer-guide.md`. No live testing was performed.
