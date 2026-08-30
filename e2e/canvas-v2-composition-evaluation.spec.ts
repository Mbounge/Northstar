import { expect, test } from "@playwright/test";

import {
  canvasV2CompositionPromptSteps,
  evaluateCanvasV2Composition,
} from "../lib/canvas-v2/composition-evaluation";
import {
  CANVAS_V2_COMPOSITION_EVALUATION_CORPUS,
  canvasV2CompositionCaseById,
} from "../lib/canvas-v2/composition-evaluation-corpus";
import { runCanvasV2CompositionJourneyInBrowser } from "../scripts/canvas-v2-composition-browser";

for (const route of ["/canvas-v2-e2e", "/canvas"] as const) {
  const promptCases = route === "/canvas-v2-e2e"
    ? CANVAS_V2_COMPOSITION_EVALUATION_CORPUS
    : ["founder-market-entry-landscape", "signal-to-decision-causal-system"].map((caseId) => canvasV2CompositionCaseById(caseId)!);
  for (const promptCase of promptCases) {
    const caseId = promptCase.id;
    test(`${route} emits a reviewable native composition receipt for ${caseId}`, async ({ page }, testInfo) => {
      test.setTimeout(150_000);
      const promptSteps = canvasV2CompositionPromptSteps(promptCase);
      const screenshotPaths = Object.fromEntries(promptSteps.map((step) => [step.id, testInfo.outputPath(`${step.id}.png`)]));
      const journey = await runCanvasV2CompositionJourneyInBrowser(page, promptCase, {
        route,
        deterministicProductionRoute: route === "/canvas",
        screenshotPaths,
        timeoutMs: 120_000,
      });
      const receipts = journey.map((result, index) => evaluateCanvasV2Composition(result.promptCase, result.snapshot, {
        previousSnapshot: journey[index - 1]?.snapshot,
      }));
      const receipt = receipts.at(-1)!;
      await testInfo.attach("composition-screenshot", { path: screenshotPaths[journey.at(-1)!.promptCase.id], contentType: "image/png" });
      await testInfo.attach("composition-receipt", { body: Buffer.from(JSON.stringify(receipts, null, 2)), contentType: "application/json" });

      for (const stepReceipt of receipts) {
        if (stepReceipt.structuralState !== "verified") {
          console.log(JSON.stringify(stepReceipt, null, 2));
        }
        expect(stepReceipt.terminalStatus).toContain("completed");
        expect(stepReceipt.structuralState).toBe("verified");
      }
      if (route === "/canvas") {
        expect(receipt.metrics.visibleObjectCount).toBeGreaterThan(8);
      }
      expect(receipt.metrics.independentlyManipulableShare).toBe(1);
      expect(receipt.humanReview.status).toBe("unreviewed");
      expect(receipt.findings.some((finding) => finding.code === "unexpected-authored-surface-span")).toBe(false);
      if (caseId === "founder-market-entry-landscape") {
        expect(receipt.metrics.contentBounds?.width).toBeLessThanOrEqual(2_200);
        expect(receipt.metrics.contentBounds?.height).toBeLessThanOrEqual(1_500);
      }
      if (promptCase.factualExpectations.requiresRelationships) {
        expect(receipt.metrics.relationshipObjectCount).toBeGreaterThan(0);
        expect(receipt.metrics.attachedRelationshipCount).toBe(receipt.metrics.relationshipObjectCount);
      }
    });
  }
}
