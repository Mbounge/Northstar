import { expect, test } from "@playwright/test";

const runLegacyBaseline = process.env.NORTHSTAR_RUN_LEGACY_BASELINE === "1";

test.describe("legacy Northstar failure baseline", () => {
  test.skip(
    !runLegacyBaseline,
    "Set NORTHSTAR_RUN_LEGACY_BASELINE=1 to document the pre-cutover DOM replacement failure.",
  );

  test("the legacy path replaces an unchanged committed node during progression", async ({ page }) => {
    await page.goto("/__northstar-e2e");
    const iframe = page.getByTestId("northstar-live-artboard-frame");
    await expect(iframe).toBeVisible();

    const handle = await iframe.elementHandle();
    const runtime = await handle?.contentFrame();
    if (!runtime) throw new Error("Northstar runtime frame was unavailable.");

    await runtime.waitForSelector('[data-ns-node-id="title"]');
    await runtime.evaluate(() => {
      const runtimeWindow = window as typeof window & { __northstarBaselineTitle?: Element | null };
      runtimeWindow.__northstarBaselineTitle = document.querySelector('[data-ns-node-id="title"]');
    });

    await expect(page.getByTestId("northstar-e2e-status")).toHaveText("complete", {
      timeout: 20_000,
    });

    const titleIdentityWasLost = await runtime.evaluate(() => {
      const runtimeWindow = window as typeof window & { __northstarBaselineTitle?: Element | null };
      return runtimeWindow.__northstarBaselineTitle !== document.querySelector('[data-ns-node-id="title"]');
    });

    expect(titleIdentityWasLost).toBe(true);
  });
});
