// Northstar Visual Reference Pack v0.4.5 — eight multimodal few-shot identity references for design behaviour and rendered review.
// Every image is sent to exploration, selection, authoring, repair, and pixel review.
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  NORTHSTAR_FLOW_REFERENCE_PROTOCOL,
  NORTHSTAR_ORIGINALITY_PROTOCOL,
  NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL,
  NORTHSTAR_VISUAL_IDENTITY,
} from "@/lib/canvas-ai/northstar-design-intelligence";

export type NorthstarReferencePart =
  | { text: string }
  | { inlineData: { mimeType: "image/png"; data: string } };

export const NORTHSTAR_VISUAL_DNA = [
  NORTHSTAR_VISUAL_IDENTITY,
  NORTHSTAR_FLOW_REFERENCE_PROTOCOL,
  NORTHSTAR_ORIGINALITY_PROTOCOL,
  NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL,
].join("\n\n");

export interface NorthstarDesignReferenceDefinition {
  file: string;
  name: string;
  communicationProblem: string;
  grammarLesson: string;
  doNotCopy: string;
}

export const NORTHSTAR_DESIGN_REFERENCES: readonly NorthstarDesignReferenceDefinition[] = [
  {
    file: "storyline-observatory.png",
    name: "Storyline Observatory",
    communicationProblem: "Compare complete product journeys while keeping the decision and evidence simultaneously legible.",
    grammarLesson: "Cinematic horizontal flow storytelling, strong app identity, editorial thesis, and layered executive synthesis.",
    doNotCopy: "Do not default to this workspace shell, rail positions, matrix, or module order.",
  },
  {
    file: "decision-atelier.png",
    name: "Decision Atelier",
    communicationProblem: "Choose a product bet from heterogeneous qualitative, market, behavioral, and product evidence.",
    grammarLesson: "Asymmetrical editorial wall, evidence collage, opportunity landscape, notes, and a designed decision mechanism.",
    doNotCopy: "Do not add sticky notes, a bubble chart, or an atelier wall unless the problem genuinely benefits from them.",
  },
  {
    file: "strategic-storyline-atlas.png",
    name: "Strategic Storyline Atlas",
    communicationProblem: "Explain a strategic journey from discovery through durable growth.",
    grammarLesson: "A narrative path becomes the composition; evidence sits at meaningful moments rather than inside a dashboard grid.",
    doNotCopy: "Do not reuse the five-stage curve, sidebars, or trust-foundation strip as a standard template.",
  },
  {
    file: "evidence-constellation.png",
    name: "Evidence Constellation",
    communicationProblem: "Synthesize many evidence streams around one high-confidence conclusion.",
    grammarLesson: "Radial evidence relationships, a strong central answer, spatial hierarchy, and calm proof density.",
    doNotCopy: "Do not use orbit lines or a central circle merely as decoration.",
  },
  {
    file: "decision-studio.png",
    name: "Decision Studio",
    communicationProblem: "Compare strategic options and make a defensible executive recommendation.",
    grammarLesson: "Document-like reasoning, weighted comparison, proof artifacts, annotations, and a clear recommendation.",
    doNotCopy: "Do not force every strategic problem into a score table or three-column comparison.",
  },
  {
    file: "opportunity-atlas.png",
    name: "Opportunity Atlas",
    communicationProblem: "Map a portfolio of product opportunities and show where future investment should concentrate.",
    grammarLesson: "Spatial portfolio mapping, differentiated opportunity zones, evidence signals, and a compact prioritization layer.",
    doNotCopy: "Do not copy the four-quadrant orbital arrangement or opportunity names.",
  },
  {
    file: "narrative-pulse.png",
    name: "Narrative Pulse",
    communicationProblem: "Turn mixed-method customer research into an understandable experience narrative.",
    grammarLesson: "Storyboard rhythm, moments, emotion, friction, quotes, and implications woven into one research story.",
    doNotCopy: "Do not always use six columns or the exact research rows; choose the story structure from the evidence.",
  },
  {
    file: "launch-strategy-studio.png",
    name: "Launch Strategy Studio",
    communicationProblem: "Choose between branching launch routes under uncertainty, constraints, and readiness signals.",
    grammarLesson: "A central decision spine, branching options, evidence snippets, risk/readiness, and an editorial recommendation.",
    doNotCopy: "Do not default to three branches, weighted scorecards, or the same recommendation band.",
  },
] as const;

let cached: Promise<NorthstarReferencePart[]> | undefined;

async function imagePart(file: string): Promise<NorthstarReferencePart> {
  const filePath = path.join(process.cwd(), "public", "northstar", "design-references", file);
  const bytes = await readFile(filePath);
  return { inlineData: { mimeType: "image/png", data: bytes.toString("base64") } };
}

export function loadNorthstarDesignReferenceParts(): Promise<NorthstarReferencePart[]> {
  if (!cached) {
    cached = (async () => {
      const parts: NorthstarReferencePart[] = [
        {
          text: [
            "NORTHSTAR EIGHT-IMAGE FEW-SHOT IDENTITY PACK",
            "The next eight images are always-on visual identity references. They are not the current artifact and they are not templates.",
            "Infer shared taste, clarity, evidence choreography, spatial confidence, and finish across the set. Deliberately avoid copying any one image's layout, module order, component shapes, or named composition.",
            NORTHSTAR_VISUAL_DNA,
          ].join("\n\n"),
        },
      ];
      for (const reference of NORTHSTAR_DESIGN_REFERENCES) {
        parts.push({
          text: [
            `REFERENCE — ${reference.name}`,
            `Problem solved: ${reference.communicationProblem}`,
            `Learn: ${reference.grammarLesson}`,
            `Anti-copy instruction: ${reference.doNotCopy}`,
          ].join("\n"),
        });
        parts.push(await imagePart(reference.file));
      }
      parts.push({
        text: "REFERENCE PACK COMPLETE. Now solve the current assignment from first principles. The result should share Northstar taste while using a composition genome original to this problem.",
      });
      return parts;
    })();
  }
  return cached;
}

export function buildNorthstarVisualReviewParts(input: {
  references: NorthstarReferencePart[];
  currentRender: { mimeType: "image/png"; data: string; width: number; height: number };
}): NorthstarReferencePart[] {
  return [
    ...input.references,
    {
      text: [
        `CURRENT ARTIFACT RENDER — ${input.currentRender.width}×${input.currentRender.height}.`,
        "Judge the current render against the identity shared by all eight references, not similarity to a single image.",
        "Reject literal imitation, repeated module order, screenshot cards without purpose, clipped text, generic dashboard structure, and failure to express the selected visual metaphor.",
        "Reward unmistakable Northstar taste plus an original composition appropriate to this exact problem.",
      ].join("\n"),
    },
    { inlineData: { mimeType: input.currentRender.mimeType, data: input.currentRender.data } },
  ];
}
