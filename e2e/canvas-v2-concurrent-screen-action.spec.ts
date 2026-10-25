import { expect, test } from '@playwright/test';
import { placeActivatedTool } from './canvas-v2-authoring-helpers';

test('an acknowledged live action survives an unrelated human canvas commit without replay', async ({ page }) => {
  test.setTimeout(90_000);
  // Delay one genuine frame acknowledgement so the human edit deterministically
  // commits between execution and receipt. The result/source/token are unchanged.
  await page.addInitScript(() => {
    const host = window as typeof window & { releaseSaveAcknowledgement?: () => void };
    const receive = (event: MessageEvent) => {
      if (event.data?.protocol !== 'northstar-screen-v1' || !event.data?.result?.gesture || !String(event.data.result.text).includes('Saved 1')) return;
      event.stopImmediatePropagation();
      window.removeEventListener('message', receive, true);
      host.releaseSaveAcknowledgement = () => {
        delete host.releaseSaveAcknowledgement;
        window.dispatchEvent(new MessageEvent('message', { data: event.data, origin: event.origin, source: event.source }));
      };
    };
    window.addEventListener('message', receive, true);
  });
  await page.goto('/canvas-v2-e2e/codex');
  await page.getByRole('textbox', { name: 'Message North Star' }).fill('screen concurrent action');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { releaseSaveAcknowledgement?: () => void }).releaseSaveAcknowledgement)).toBe('function');
  const frame = page.frameLocator('iframe[title="Shared studio draft"]');
  await expect(frame.locator('#count')).toHaveText('Saved 1');
  await page.getByRole('button', { name: 'Create Shape · drag to place', exact: true }).click();
  await placeActivatedTool(page);
  const humanObject = page.getByTestId('canvas-v2-native-scene').locator('[data-canvas-v2-primitive="shape"][data-canvas-v2-origin="user"]');
  await expect(humanObject).toHaveCount(1);
  await page.evaluate(() => (window as typeof window & { releaseSaveAcknowledgement?: () => void }).releaseSaveAcknowledgement!());
  await page.getByRole('button', { name: 'Open North Star panel', exact: true }).click();
  await expect(page.getByText('Saved once while unrelated human work changed. The draft and new canvas object remain intact.', { exact: true })).toBeVisible();
  await expect(frame.locator('#count')).toHaveText('Saved 1');
  await expect(frame.locator('#draft')).toHaveValue('Human draft');
  await expect(humanObject).toHaveCount(1);
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
});
