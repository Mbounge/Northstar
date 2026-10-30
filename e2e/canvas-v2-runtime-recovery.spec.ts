import { expect, test } from '@playwright/test';

test('Stop reaches the harness while a follow-up acknowledgement is delayed and the next message still works', async ({ page, request }) => {
  await request.post('/canvas-v2-e2e/codex/agent', { data: { op: 'reset-fixture' } });
  let releaseAcknowledgement!: () => void;
  const acknowledgement = new Promise<void>(resolve => { releaseAcknowledgement = resolve; });
  let held = false, cancelled = false;
  await page.route('**/canvas-v2-e2e/codex/agent', async route => {
    const body = route.request().postDataJSON();
    if (body.op === 'cancel') cancelled = true;
    if (body.op === 'send' && body.message === 'hold pending acknowledgement') {
      const response = await route.fetch();
      held = true;
      await acknowledgement;
      // Stop may already have aborted this HTTP request. A late acknowledgement
      // must neither restore the old running state nor fail the next message.
      await route.fulfill({ response }).catch(() => undefined);
    } else await route.continue();
  });
  await page.goto('/canvas-v2-e2e/codex');
  const send = async (message: string) => {
    await page.getByRole('textbox', { name: 'Message North Star', exact: true }).fill(message);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
  };
  try {
    await send('Explain the first comparison');
    await expect(page.getByTestId('canvas-v2-markdown').filter({ hasText: 'received 1 turns' })).toBeVisible();
    await send('hold pending acknowledgement');
    await expect.poll(() => held).toBe(true);
    await page.getByRole('button', { name: 'Stop current response', exact: true }).click();
    await expect.poll(() => cancelled, { timeout: 2000 }).toBe(true);
    await expect(page.getByRole('button', { name: 'Stop current response' })).toHaveCount(0);
    releaseAcknowledgement();
    await send('Explain the next comparison');
    await expect(page.getByTestId('canvas-v2-markdown').filter({ hasText: 'received 3 turns' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop current response' })).toHaveCount(0);
  } finally { releaseAcknowledgement(); }
});

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
