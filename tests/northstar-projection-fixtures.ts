import {
  NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA,
  NORTHSTAR_PROJECTION_STATE_SCHEMA,
  type NorthstarArtboardMutationDraft,
  type NorthstarProjectionState,
} from "@/lib/canvas-projection/types";

export function projectionFixtureState(): NorthstarProjectionState {
  return {
    schema: NORTHSTAR_PROJECTION_STATE_SCHEMA,
    root: {
      kind: "element",
      id: "root",
      tag: "div",
      namespace: "html",
      attributes: { "aria-label": "Northstar artboard" },
      classes: [],
      styles: {},
      children: [
        { kind: "text", id: "root-leading-text", text: "\n  " },
        {
          kind: "element",
          id: "artboard",
          tag: "main",
          namespace: "html",
          attributes: { "data-stage": "evidence" },
          classes: ["artboard"],
          styles: {
            display: { value: "grid", priority: "" },
          },
          children: [
            {
              kind: "element",
              id: "title",
              tag: "h1",
              namespace: "html",
              attributes: {},
              classes: ["headline"],
              styles: {},
              children: [
                { kind: "text", id: "title-text", text: "Original title" },
              ],
            },
            { kind: "text", id: "between-title-evidence", text: "\n" },
            {
              kind: "element",
              id: "evidence",
              tag: "section",
              namespace: "html",
              attributes: {},
              classes: ["evidence"],
              styles: {},
              children: [
                {
                  kind: "element",
                  id: "card-a",
                  tag: "article",
                  namespace: "html",
                  attributes: { "data-evidence-id": "a" },
                  classes: ["card"],
                  styles: {},
                  children: [
                    { kind: "text", id: "card-a-text", text: "Alpha" },
                  ],
                },
                {
                  kind: "element",
                  id: "card-b",
                  tag: "article",
                  namespace: "html",
                  attributes: { "data-evidence-id": "b" },
                  classes: ["card"],
                  styles: {},
                  children: [
                    { kind: "text", id: "card-b-text", text: "Beta" },
                  ],
                },
              ],
            },
          ],
        },
        { kind: "text", id: "root-trailing-text", text: "\n" },
      ],
    },
    cssLayers: {
      base: ".artboard{min-height:720px}",
    },
    space: { left: 0, top: 0, right: 0, bottom: 0 },
  };
}

export function projectionDraft(
  operations: NorthstarArtboardMutationDraft["operations"],
): NorthstarArtboardMutationDraft {
  return {
    schema: NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA,
    operations,
  };
}
