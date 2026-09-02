import { expect, test, type Page } from "@playwright/test";

const STANDARD_PROMPT = "Build a balanced executive comparison of Awin and Whop onboarding. Choose representative flows and screenshots, keep the main board simple, and leave your working surface visible so I can inspect how the solution came together.";

function canvasApp(page: Page) {
  return page.getByRole("main");
}

function canvasWorkspace(page: Page) {
  return canvasApp(page).getByRole("region", { name: "Canvas workspace" });
}

async function openHeavyDeterministicCanvas(page: Page) {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await page.getByLabel("Message North Star").fill(STANDARD_PROMPT);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await expect(canvasApp(page).getByTestId("canvas-v2-native-compiler")).toHaveCount(0);
  await expect(canvasWorkspace(page).locator('[data-canvas-v2-evidence-role="canonical"]')).toHaveCount(66);
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000);
  await openHeavyDeterministicCanvas(page);
});

test("heavy canvas preserves the current light and dark visual contract", async ({ page }) => {
  const workspace = canvasWorkspace(page);
  const volatileStatus = page.getByTestId("canvas-v2-committed-revision");

  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await expect(workspace).toHaveScreenshot("heavy-canvas-dark.png", {
    animations: "disabled",
    caret: "hide",
    mask: [volatileStatus],
    maxDiffPixelRatio: 0.001,
  });

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
  await expect(workspace).toHaveScreenshot("heavy-canvas-light.png", {
    animations: "disabled",
    caret: "hide",
    mask: [volatileStatus],
    maxDiffPixelRatio: 0.001,
  });
});

test("heavy canvas navigation remains frame-paced and keeps the velvet on the camera transaction", async ({ page }) => {
  const workspace = canvasWorkspace(page);
  const measurement = await workspace.evaluate(async (element) => {
    const surface = element.querySelector<HTMLElement>('[data-canvas-v2-workspace-surface]');
    const atmosphereLayer = element.querySelector<HTMLElement>('[data-testid="canvas-v2-atmosphere"]');
    if (!surface) throw new Error("Canvas workspace surface is missing.");
    if (!atmosphereLayer) throw new Error("Canvas atmosphere layer is missing.");

    const percentile = (values: number[], ratio: number) => {
      if (!values.length) return 0;
      const sorted = [...values].sort((left, right) => left - right);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
    };
    const atmosphere = () => ({
      primaryX: atmosphereLayer.style.getPropertyValue("--canvas-v2-atmosphere-primary-x"),
      primaryY: atmosphereLayer.style.getPropertyValue("--canvas-v2-atmosphere-primary-y"),
      secondaryX: atmosphereLayer.style.getPropertyValue("--canvas-v2-atmosphere-secondary-x"),
      secondaryY: atmosphereLayer.style.getPropertyValue("--canvas-v2-atmosphere-secondary-y"),
      angle: atmosphereLayer.style.getPropertyValue("--canvas-v2-atmosphere-angle"),
    });
    const snapshot = () => ({ transform: surface.style.transform, atmosphere: atmosphere() });
    const before = snapshot();
    const renderCountBefore = Number(element.getAttribute("data-canvas-v2-render-count") ?? "0");
    const previewFrameBefore = Number(element.getAttribute("data-canvas-v2-camera-preview-frame") ?? "0");
    const frameTimes: number[] = [];
    const longFrames: number[] = [];
    let observer: PerformanceObserver | undefined;
    if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longFrames.push(entry.duration);
      });
      observer.observe({ type: "long-animation-frame", buffered: false });
    }

    let previousFrame: number | undefined;
    const bounds = element.getBoundingClientRect();
    await new Promise<void>((resolve) => {
      let sent = 0;
      const drive = (time: number) => {
        if (previousFrame !== undefined) frameTimes.push(time - previousFrame);
        previousFrame = time;
        if (sent >= 72) {
          requestAnimationFrame(() => resolve());
          return;
        }
        element.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + bounds.width * 0.62,
          clientY: bounds.top + bounds.height * 0.48,
          deltaX: sent % 3 === 0 ? 3.5 : 2.25,
          deltaY: sent % 4 === 0 ? 2.75 : 1.5,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        }));
        sent += 1;
        requestAnimationFrame(drive);
      };
      requestAnimationFrame(drive);
    });
    const atGestureEnd = snapshot();
    await new Promise((resolve) => setTimeout(resolve, 140));
    observer?.disconnect();
    const afterSettle = snapshot();
    const renderCountAfter = Number(element.getAttribute("data-canvas-v2-render-count") ?? "0");
    const previewFrameAfter = Number(element.getAttribute("data-canvas-v2-camera-preview-frame") ?? "0");

    return {
      before,
      atGestureEnd,
      afterSettle,
      renderDelta: renderCountAfter - renderCountBefore,
      previewFrameDelta: previewFrameAfter - previewFrameBefore,
      samples: frameTimes.length,
      medianFrameMs: percentile(frameTimes, 0.5),
      p95FrameMs: percentile(frameTimes, 0.95),
      maxFrameMs: Math.max(0, ...frameTimes),
      overTwentyMs: frameTimes.filter((duration) => duration > 20).length,
      longAnimationFrames: longFrames.length,
      longestAnimationFrameMs: Math.max(0, ...longFrames),
      workspaceOwnsAtmosphereVariables: element.style.getPropertyValue("--canvas-v2-atmosphere-primary-x") !== "",
      atmosphereContainment: getComputedStyle(atmosphereLayer).contain,
    };
  });

  test.info().annotations.push({ type: "canvas-navigation", description: JSON.stringify(measurement) });
  expect(measurement.samples).toBeGreaterThanOrEqual(70);
  expect(measurement.previewFrameDelta).toBeGreaterThanOrEqual(70);
  expect(measurement.renderDelta).toBeLessThanOrEqual(2);
  expect(measurement.atGestureEnd.transform).not.toBe(measurement.before.transform);
  expect(measurement.atGestureEnd.atmosphere).not.toEqual(measurement.before.atmosphere);
  expect(measurement.afterSettle).toEqual(measurement.atGestureEnd);
  expect(measurement.workspaceOwnsAtmosphereVariables).toBe(false);
  expect(measurement.atmosphereContainment).toBe("strict");
  expect(measurement.overTwentyMs).toBeLessThanOrEqual(1);
  expect(measurement.p95FrameMs).toBeLessThan(20);
  expect(measurement.maxFrameMs).toBeLessThan(50);
});
