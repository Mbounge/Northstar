# Northstar harness and canvas release, 17 October 2026

This release carries the accumulated canvas/runtime work since 39cbaee and corrects the creative review gate. It does not change saved campaign artwork.

## Creative review

- New reviewer output classifies visual assessments and work as a user requirement, observable defect, or preference. Original/inspired directions carry cited findings with the actual requirement and observed failure.
- Holistic craft/distinctness judgments remain visible, but no longer require aesthetic approval. Explicit preference work is returned as advisoryWork and removed from blocking work in both initial and final review.
- Concrete readability/content defects, explicit brief violations, current-source evidence, faithful reference comparison, runtime health and behavior proof still block completion.
- An appearance-review timeout no longer tells the author to correct styling without evidence of a defect.
- Explicit creative refinements retain the product's reference assets. Narrow local edits keep bounded reference selection.
- The published design-direction schema now advertises the parser's 500-character limit per field.

## Included platform work

The release includes accumulated native asset/model editing, retained WebAssembly and Three/WebGPU runtime support, interaction/transition/motion review, cooperative capture scheduling, viewport/navigation/media lifecycle work, and backward-compatible snapshot deduplication/compression with visible save recovery.

Local evaluation routes remain guarded. Research output archives and generated GoodLife campaign files are not release dependencies and remain local.

## Validation

- Active suite: 1,275 passing canvas tests, three skipped; 53 discovery evaluation tests passing.
- Additional film, private audio, text collision and transaction checks: 14 passing.
- TypeScript, Next production build, worker build and canonical cutover verification pass.
- Full ESLint: zero errors, 178 warnings (includes generated worker output). Final targeted source lint: zero errors, one existing unused variable warning.
- Browser verification uses Chrome. The complete Playwright E2E suite was not run for this release.

## Limits and rollback

This change separates review advice from blocking findings; it does not guarantee good taste or perfect model classification. Large-board native full-canvas capture still has unresolved failures observed locally. Individual current-source product review remains required; do not represent a failed capture as visual approval.

Deploy the same commit to the Vercel application and the single Render worker. Do not rerun the installed session migration or change worker admission/security settings. Previous release: 39cbaee. A worker replacement interrupts in-memory runs; saved sessions persist. Roll back both services together if production checks fail.

## Production smoke follow-up

The first live counter run generated a working screen but exposed a strict API schema rejection: original-design fields and several product-review fields were defined in properties without appearing in required. Fixture transports did not enforce that API rule. Every object in the reviewer output schema now lists every property in required, with explicit inapplicability assessments for static work; legacy parsing remains compatible. A recursive contract regression covers the entire schema, and the real pinned Codex/API review probe now returns valid feedback. The follow-up focused review suite passes all 94 tests.
