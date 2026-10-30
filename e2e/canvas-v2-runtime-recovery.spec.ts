import { expect, test } from '@playwright/test';

test('an expired AI session reports its boundary and the next explicit message starts a fresh retained conversation', async ({ page, request }) => {
  await request.post('/canvas-v2-e2e/codex/agent', { data: { op: 'reset-fixture' } });
  await page.routeWebSocket('**/_next/webpack-hmr*', socket => { const server = socket.connectToServer(); server.onMessage(() => {}); });
  const creations: Record<string, unknown>[] = [];
  let unavailable = false;
  await page.route('**/canvas-v2-e2e/codex/agent', async route => {
    const body = route.request().postDataJSON();
    if (body.op === 'create') creations.push(body);
    if (body.op === 'stream' && unavailable) {
      unavailable = false;
      await route.fulfill({ status: 400, json: { error: 'This Codex session is unavailable. Start a new conversation.' } });
    } else await route.continue();
  });
  await page.goto('/canvas-v2-e2e/codex');
  const send = async (message: string) => {
    await page.getByRole('textbox', { name: 'Message North Star', exact: true }).fill(message);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
  };
  await send('chat readable parity');
  await expect(page.getByText('The comparison is ready.', { exact: false })).toBeVisible();
  unavailable = true;
  await send('Do not replay this failed instruction');
  await expect(page.getByText('The previous AI session ended. Your canvas is safe. Send a follow-up to continue in a fresh session.', { exact: true })).toBeVisible();
  expect(creations).toHaveLength(1);
  await send('chat readable parity');
  await expect(page.getByText('The comparison is ready.', { exact: false })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Stop current response' })).toHaveCount(0);
  expect(creations).toHaveLength(2);
  expect(creations[1].message).toBe('chat readable parity');
  expect(creations[1].restoredHistory).toContain('The comparison is ready.');
  expect(creations[1].requestId).not.toBe(creations[0].requestId);
});
