# Canvas V2 Phase 7B — Creative direction

Phase 7B gives the model continuity of visual judgment without adding a second
design engine.

Every research, edit, and completion decision now includes:

- a creative direction: intent, visual thesis, composition strategy, visual
  language, evidence strategy, current focus, and possible next moves;
- a rendered reflection: what the exact screenshot achieves, the most
  meaningful remaining opportunity, and why the next move or completion is
  appropriate;
- a purposeful move label for visible work: research, framing, composition,
  relationship, analysis, or refinement.

The direction is descriptive model state. The runtime stores and returns it on
the next observed turn, but it does not execute a plan, select a template,
assign an aesthetic score, or override the model's visual decisions.

## North Star visual identity

The production prompt and artboard grammar now express North Star's general
visual taste: editorial intelligence, strong hierarchy, evidence-led spatial
reasoning, confident negative space, restrained semantic color, premium CSS,
and direct-on-surface composition. The model may choose any form that serves
the prompt—including novel hybrids—while avoiding generic dashboard and card
grid defaults.

## Completion

The model still decides when the requested artifact is complete. It is asked
to finish when the visible communication is resolved, not when a turn count or
checklist is satisfied. The existing render-observe-commit transaction remains
the only mutation authority.
