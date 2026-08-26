# Canvas V2 composition evaluation

Patch 8E adds a repeatable composition-evaluation harness before the discovery and research expansion in Patch 9. It answers two different questions without confusing them:

1. Did Northstar produce structurally valid native canvas truth?
2. Did the resulting composition communicate the prompt well?

The first question is automated. The second is reviewed by a human from screenshots and factual receipts. There is deliberately no aggregate aesthetic score, prescribed layout, or template match.

## What the structural receipt verifies

Each run records the terminal state, revision, native object counts and kinds, stable identities, independent selectability, authorship, evidence, relationship endpoints, world bounds, clipping, overflow, runtime errors, and image alt metadata. A structural state of `verified` means those factual checks passed; it does not declare the composition beautiful or useful.

Across different prompt categories, the suite also identifies repeated structural or visible-content fingerprints. Repetition is a human-review signal rather than an automatic failure because a shared structure can sometimes be intentional.

## What remains a human judgment

The generated `review.md` asks the reviewer to inspect intent fidelity, reading logic, hierarchy, legibility, creative specificity, evidence reasoning, decision value, and restraint. Every case also carries prompt-specific review questions. The reviewer chooses Ready, Revise, or Rerun and writes the reason in plain language.

## Corpus

The 8E.1 corpus covers eight empty-canvas creation situations:

- a founder market-entry decision landscape;
- a signal-to-decision causal system;
- a large two-dimensional discovery landscape;
- the real Awin/Whop evidence comparison;
- a launch learning sequence;
- a customer-confidence journey;
- an opportunity-prioritization field;
- a sparse founder brief.

Cases state semantic facts required by their prompt, such as visible evidence or native relationships. They never specify a target layout.

Patch 8E.3 extends that foundation into a generalization and follow-up corpus. It deliberately mixes four modes:

- evidence-free creation, including positioning, facilitation, campaign, operating-model, and service-design prompts;
- synthesis from facts or quotes supplied directly by the user;
- account-grounded work such as the Awin/Whop comparison;
- multi-turn continuation that must advance the revision while preserving prior native objects.

Evidence is therefore an available input, not an admission ticket to the canvas. An evidence-free prompt fails its factual contract if the interaction router starts research or the resulting board invents evidence objects. A grounded prompt fails if its required evidence is absent. These are prompt-specific truths, not a global preference for either mode.

A release proof is also blocked by any user-visible recovery boundary: a failed, paused, interrupted, or stopped turn; a visible chat error; a browser console/runtime error; or a candidate that replaces verified canvas state before passing validation. The runner may resume a paused case to diagnose whether recovery is possible, but the receipt still records that pause as a blocking failure. Provider corrections that remain internal and end in one clean verified result are permitted.

The 8E.3 cases cover positioning alternatives, pricing and packaging hypotheses, customer-quote synthesis, a founder workshop, an experiment portfolio, an outcome roadmap, a lean operating model, a launch campaign, an investor update, and a service-recovery blueprint. The Awin/Whop case remains the grounded counterpart. The corpus does not require evidence lanes, hypotheses, connectors, or any other visual device unless the user actually asked for it.

Patch 8E.4 closes the loop between a composition that merely looks participatory and one the user can actually use. Prompts that request workshops or live facilitation can require native writable surfaces in their factual contract. The receipt counts those objects; browser acceptance then proves direct selection, double-click entry, one-entry undo/redo, durable human authorship, and later Northstar continuation without replacing the person's text. Blank decorative paint does not satisfy this contract.

## Running the harness

Start Northstar with the E2E fixture environment, then run the fast deterministic smoke suite:

```bash
npm run evaluate:canvas-v2:compositions -- --base-url http://127.0.0.1:3112
```

Show the browser while it runs:

```bash
npm run evaluate:canvas-v2:compositions -- --base-url http://127.0.0.1:3112 --headed
```

Run selected cases:

```bash
npm run evaluate:canvas-v2:compositions -- --base-url http://127.0.0.1:3112 --case founder-market-entry-landscape,signal-to-decision-causal-system
```

Run every 8E.1 case:

```bash
npm run evaluate:canvas-v2:compositions -- --base-url http://127.0.0.1:3112 --tag 8e.1
```

Run the 8E.3 generalization and continuation corpus:

```bash
npm run evaluate:canvas-v2:compositions -- --base-url http://127.0.0.1:3112 --tag 8e.3
```

Run the production-model participatory acceptance case from 8E.4:

```bash
npm run evaluate:canvas-v2:compositions -- --mode production --base-url http://127.0.0.1:3112 --tag 8e.4 --headed --strict
```

Run one multi-turn preservation journey:

```bash
npm run evaluate:canvas-v2:compositions -- --base-url http://127.0.0.1:3112 --case positioning-territories-without-research --strict
```

Run the real production model boundary on `/canvas` only when its provider is configured:

```bash
npm run evaluate:canvas-v2:compositions -- --mode production --base-url http://127.0.0.1:3112 --case sparse-founder-brief --headed
```

Use `--repeat 3` to inspect consistency and `--strict` when structural attention should fail CI. `--list` prints every corpus case without opening a browser.

## Artifacts

Every run creates:

- one viewport screenshot per prompt step;
- a raw native composition snapshot per step;
- a structural receipt per step, including interaction routes and research-request counts;
- `suite.json` with cross-case review signals;
- `review.md` for qualitative review;
- `run.json` with execution metadata.

The default destination is `artifacts/canvas-v2-composition-evaluation/<timestamp>`. Generated artifacts are evidence, not source, and should be archived only when they represent a deliberate baseline or a release proof.
