# Canvas V2 Phase 4 North Star integration

Phase 4 moves the proven V2 engine out of the engineering layout and into a
North Star canvas shell.

## Integrated experience

- North Star header and canvas title;
- application navigation rail;
- Chat, Shapes, and Apps panel structure;
- chat-driven automatic design objectives;
- model progress and rendered-turn summaries;
- living V2 iframe artboard;
- artboard selection;
- select and pan modes;
- trackpad/mouse canvas navigation;
- centered zoom controls;
- familiar bottom canvas toolbar;
- visible stop control that preserves the committed revision.

The shell is implemented inside `components/canvas-v2`. It does not import V1
workspace, mutation, relation, diagnostic, or artifact-host modules.

## Engine isolation

Phase 3 orchestration now lives in `use-canvas-v2-design-loop.ts`. The shell
consumes that hook but does not know how provider calls, candidates, commits, or
observations are implemented. Changing canvas presentation cannot create a
second design controller.

## Manual tools

Select, pan, wheel navigation, and zoom are functional. The remaining shape and
content tool icons are intentionally disabled. Shapes and Apps panels explain
their Phase 5 boundary instead of silently dispatching legacy V1 actions.

## Unchanged authority

The model remains the designer. The iframe remains the renderer. The browser
returns the exact observation. The user remains the visual evaluator. The new
shell supplies interaction and presentation only.

## Still deferred

- competitor application and evidence adapters;
- existing V1 artifact import;
- persistent revisions and undo;
- element-level selection context;
- manual primitive authoring;
- removal of the temporary direct `/canvas-v2` route;
- V1 cutover and deletion.
