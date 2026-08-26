import { expect, test } from "@playwright/test";

import { evaluateCanvasV2Composition } from "../lib/canvas-v2/composition-evaluation";
import { canvasV2CompositionCaseById } from "../lib/canvas-v2/composition-evaluation-corpus";
import { runCanvasV2CompositionCaseInBrowser } from "../scripts/canvas-v2-composition-browser";

for (const route of ["/canvas-v2-e2e", "/canvas"] as const) {
  for (const caseId of ["founder-market-entry-landscape", "signal-to-decision-causal-system"] as const) {
    test(`${route} emits a reviewable native composition receipt for ${caseId}`, async ({ page }, testInfo) => {
      test.setTimeout(150_000);
      const promptCase = canvasV2CompositionCaseById(caseId);
      expect(promptCase).toBeDefined();
      const screenshotPath = testInfo.outputPath(`${caseId}.png`);
      const snapshot = await runCanvasV2CompositionCaseInBrowser(page, promptCase!, {
        route,
        deterministicProductionRoute: route === "/canvas",
        screenshotPath,
        timeoutMs: 120_000,
      });
      const receipt = evaluateCanvasV2Composition(promptCase!, snapshot);
      await testInfo.attach("composition-screenshot", { path: screenshotPath, contentType: "image/png" });
      await testInfo.attach("composition-receipt", { body: Buffer.from(JSON.stringify(receipt, null, 2)), contentType: "application/json" });

      expect(receipt.terminalStatus).toContain("completed");
      expect(receipt.structuralState).toBe("verified");
      expect(receipt.metrics.visibleObjectCount).toBeGreaterThan(8);
      expect(receipt.metrics.independentlyManipulableShare).toBe(1);
      expect(receipt.humanReview.status).toBe("unreviewed");
      expect(receipt.findings.some((finding) => finding.code === "unexpected-authored-surface-span")).toBe(false);
      if (caseId === "founder-market-entry-landscape") {
        expect(receipt.metrics.contentBounds?.width).toBeLessThanOrEqual(2_200);
        expect(receipt.metrics.contentBounds?.height).toBeLessThanOrEqual(1_500);
      }
      if (promptCase!.factualExpectations.requiresRelationships) {
        expect(receipt.metrics.relationshipObjectCount).toBeGreaterThan(0);
        expect(receipt.metrics.attachedRelationshipCount).toBe(receipt.metrics.relationshipObjectCount);
      }
    });
  }
}
