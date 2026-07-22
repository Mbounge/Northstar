import path from "node:path";
import { expect, test } from "@playwright/test";

const harnessBundle = path.join(process.cwd(), ".northstar-e2e", "phase4-browser-harness.js");

test("Phase 4 runs one browser-owned ledger through the direct writer without remounting", async ({ page }) => {
  await page.setContent(`<!doctype html>
    <html>
      <head>
        <style>
          html, body, #root { width: 100%; height: 100%; margin: 0; }
          * { box-sizing: border-box; }
          .relative { position: relative; }
          .absolute { position: absolute; }
          .fixed { position: fixed; }
          .inset-0 { inset: 0; }
          .h-full { height: 100%; }
          .w-full { width: 100%; }
          .block { display: block; }
          .overflow-hidden { overflow: hidden; }
          .pointer-events-none { pointer-events: none; }
        </style>
      </head>
      <body><div id="root"></div></body>
    </html>`);
  await page.addScriptTag({ path: harnessBundle });

  await expect(page.getByTestId("phase4-harness")).toBeVisible();
  const frame = page.getByTestId("northstar-live-artboard-frame");
  await expect(frame).toHaveAttribute("data-ns-writer", "direct-projection");

  await frame.evaluate((element) => {
    Object.assign(window, { __northstarPhase4FrameBefore: element });
  });
  await frame.contentFrame().locator('[data-ns-node-id="northstar-title"]').evaluate((element) => {
    Object.assign(window, { __northstarPhase4TitleBefore: element });
  });
  await frame.contentFrame().locator('[data-ns-node-id="northstar-evidence-card"]').evaluate((element) => {
    Object.assign(window, { __northstarPhase4EvidenceCardBefore: element });
  });

  await page.getByTestId("phase4-start").click();
  await expect(page.getByTestId("phase4-status")).toHaveText("completed", { timeout: 20_000 });
  await expect(page.getByTestId("phase4-commit-count")).toHaveText("3");
  await expect(page.getByTestId("phase4-persisted-revision")).not.toHaveText("phase4-browser-artifact-root");
  await expect(page.getByTestId("phase4-persisted-screenshot-count")).toHaveText("1");
  await expect(page.getByTestId("northstar-ledger-inspector")).toContainText("projection verified");
  await expect(frame.contentFrame().getByText("First verified visual commit", { exact: true })).toBeVisible();
  await expect(frame.contentFrame().getByText("Second verified visual commit", { exact: true })).toBeVisible();

  const identityPreserved = await frame.evaluate((element) => (
    (window as typeof window & { __northstarPhase4FrameBefore?: Element }).__northstarPhase4FrameBefore === element
  ));
  expect(identityPreserved).toBe(true);
  const authoredNodeIdentityPreserved = await frame.contentFrame().locator("html").evaluate(() => {
    const scope = window as typeof window & {
      __northstarPhase4TitleBefore?: Element;
      __northstarPhase4EvidenceCardBefore?: Element;
    };
    return scope.__northstarPhase4TitleBefore === document.querySelector('[data-ns-node-id="northstar-title"]')
      && scope.__northstarPhase4EvidenceCardBefore === document.querySelector('[data-ns-node-id="northstar-evidence-card"]');
  });
  expect(authoredNodeIdentityPreserved).toBe(true);
  await expect(page.locator('[data-northstar-writer="direct-projection"]')).toHaveCount(1);
  await expect(page.locator('[data-northstar-writer="legacy-repository"]')).toHaveCount(0);
  await expect(page.getByTestId("phase4-error")).toHaveCount(0);

  await page.getByTestId("phase4-remount").click();
  const remountedFrame = page.getByTestId("northstar-live-artboard-frame");
  await expect(remountedFrame).toBeVisible();
  await expect(remountedFrame.contentFrame().getByText("First verified visual commit", { exact: true })).toBeVisible();
  await expect(remountedFrame.contentFrame().getByText("Second verified visual commit", { exact: true })).toBeVisible();
});
