import { expect, test } from "@playwright/test";

test("lost terminal and acknowledgement delivery recover without remounting or blanking", async ({ page }) => {
  const acknowledgementAttempts = new Map<string, number>();
  let injectedAcknowledgementFault = false;
  await page.route("**/api/canvas-ai/artifact-ack", async (route) => {
    const body = route.request().postDataJSON() as { ackToken?: string; status?: string };
    const token = body.ackToken ?? "unknown";
    acknowledgementAttempts.set(token, (acknowledgementAttempts.get(token) ?? 0) + 1);
    if (body.status === "applied" && !injectedAcknowledgementFault) {
      injectedAcknowledgementFault = true;
      await route.abort("connectionfailed");
      return;
    }
    await route.continue();
  });

  await page.goto("/__northstar-e2e");
  const frame = page.getByTestId("northstar-live-artboard-frame");
  await expect(frame).toBeVisible();

  await page.evaluate(() => {
    const releaseWindow = window as typeof window & {
      __northstarDroppedTerminal?: boolean;
      __northstarRemovedFrames?: number;
    };
    releaseWindow.__northstarDroppedTerminal = false;
    releaseWindow.__northstarRemovedFrames = 0;
    const originalPostMessage = window.postMessage.bind(window);
    window.postMessage = ((message: unknown, targetOrigin: string, transfer?: Transferable[]) => {
      const candidate = message as { type?: string } | null;
      if (candidate?.type === "northstar.artifact.commit-projected" && !releaseWindow.__northstarDroppedTerminal) {
        releaseWindow.__northstarDroppedTerminal = true;
        return;
      }
      originalPostMessage(message, targetOrigin, transfer ?? []);
    }) as typeof window.postMessage;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node instanceof HTMLIFrameElement || (node instanceof Element && node.querySelector("iframe"))) {
            releaseWindow.__northstarRemovedFrames = (releaseWindow.__northstarRemovedFrames ?? 0) + 1;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  await expect(page.getByTestId("northstar-e2e-status")).toHaveText("mutation-1-pending");
  const runtime = page.frameLocator('[data-testid="northstar-live-artboard-frame"]');
  await expect(runtime.locator('[data-ns-node-id="title"]')).toHaveText("One living artboard");
  await expect(page.getByTestId("northstar-e2e-status")).toHaveText("mutation-2-pending", { timeout: 12_000 });
  await expect(runtime.locator('[data-ns-node-id="title"]')).toHaveText("One living artboard");
  await expect(runtime.locator('[data-ns-node-id="proof-1"]')).toBeVisible();
  await expect(page.getByTestId("northstar-e2e-status")).toHaveText("complete", { timeout: 20_000 });
  await expect(page.getByTestId("northstar-e2e-commit-count")).toHaveText("2");
  expect(injectedAcknowledgementFault).toBe(true);
  expect([...acknowledgementAttempts.values()].some((attempts) => attempts >= 2)).toBe(true);

  await expect(runtime.locator('[data-ns-node-id="proof-1"]')).toBeVisible();
  await expect(runtime.locator('[data-ns-node-id="proof-2"]')).toBeVisible();
  await expect(page.getByText("Mounting the one live artboard…")).toHaveCount(0);

  const continuity = await page.evaluate(() => {
    const releaseWindow = window as typeof window & {
      __northstarDroppedTerminal?: boolean;
      __northstarRemovedFrames?: number;
    };
    const frames = document.querySelectorAll('[data-testid="northstar-live-artboard-frame"]');
    return {
      droppedTerminal: releaseWindow.__northstarDroppedTerminal,
      removedFrames: releaseWindow.__northstarRemovedFrames,
      liveFrameCount: frames.length,
      surfaceId: frames[0]?.getAttribute("data-ns-surface-id"),
    };
  });
  expect(continuity).toEqual({
    droppedTerminal: true,
    removedFrames: 0,
    liveFrameCount: 1,
    surfaceId: "northstar-e2e-surface",
  });
});