import { expect, type Page } from "@playwright/test";

/** Finish placement after selecting a creation tool. Existing manipulation
 * tests deliberately leave text mode before exercising object gestures. */
export async function placeActivatedTool(page: Page) {
  const workspace = page.getByRole("region", { name: "Canvas workspace" });
  const count = await workspace.locator('[data-canvas-v2-native-scene="true"] [data-canvas-v2-origin="user"][data-canvas-v2-primitive]').count();
  const bounds = await workspace.boundingBox();
  await workspace.click({ position: { x: Math.min(bounds!.width - 180, 680 + (count % 4) * 70), y: 250 + (count % 3) * 85 } });
  const editor = workspace.locator('[data-canvas-v2-direct-editing="true"]');
  if (await editor.count()) await editor.press("Escape");
}

export async function fitAllCanvas(page: Page) {
  const workspace = page.getByRole("region", { name: "Canvas workspace" });
  await workspace.focus();
  await workspace.press("Shift+Digit1");
  await expect(workspace).toBeVisible();
}
