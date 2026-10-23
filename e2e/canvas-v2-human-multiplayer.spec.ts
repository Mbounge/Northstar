import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// These peers use the production workspace/client with the explicitly DEV-only
// HTTP fixture. Real account authorization is covered by separate PostgreSQL/RLS
// tests; this suite must never be described as real cross-account verification.
const scene = (page: Page) => page.getByTestId('canvas-v2-native-scene');
const object = (page: Page, id: string) => scene(page).locator(`[data-canvas-v2-node-id="${id}"]`);
const cursor = (page: Page, peer: string) => page.locator(`[data-collaborator-cursor^="${peer}-"]`);
const state = async (page: Page) => JSON.parse(await page.getByTestId('multiplayer-fixture-status').innerText());
const camera = (page: Page) => page.getByTestId('canvas-v2-workspace-surface').evaluate(element => getComputedStyle(element).transform);
const geometry = (page: Page, id: string) => object(page, id).evaluate(element => {
  const style = getComputedStyle(element);
  return ['x','y','width','height','rotation','preview-x','preview-y','delta-x','delta-y'].map(key => style.getPropertyValue('--canvas-v2-native-'+key));
});
test.use({ viewport: { width: 1512, height: 790 } });

async function openPeer(context: BrowserContext, room: string, peer: 'alice' | 'bob' | 'quinn', prepare?: (page:Page)=>Promise<unknown>) {
  const page = await context.newPage();
  await prepare?.(page);
  await page.goto(`/canvas-v2-e2e/human-multiplayer?room=${room}&peer=${peer}&hardening=1`);
  await expect.poll(async () => (await state(page)).phase).toBe('live');
  await expect(object(page, 'note-alice')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Shared journal A"]').getByRole('button', { name: 'Save draft', exact: true })).toBeVisible();
  return page;
}

async function editNote(page: Page, id: 'note-alice' | 'note-bob', text: string) {
  await design(page);
  await object(page, id).dblclick();
  const editor = page.getByRole('textbox', { name: `Edit ${id} on canvas`, exact: true });
  await expect(editor).toBeVisible();
  await editor.fill(text); await editor.press('ControlOrMeta+Enter');
  await expect(object(page, id)).toHaveText(text);
}

async function design(page: Page) {
  const toggle = page.getByRole('button', { name: 'Design view', exact: true });
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

async function waitSaved(page: Page) { await expect.poll(async () => (await state(page)).pending).toBe(0); }

async function openPrivatePeer(context: BrowserContext, room: string, peer: 'alice' | 'bob', device = 'first') {
  const page = await context.newPage();
  await page.goto(`/canvas-v2-e2e/human-multiplayer?room=${room}&peer=${peer}&device=${device}&personal=1&hardening=1`);
  await expect(page.getByTestId('multiplayer-private-status')).toContainText('"phase":"saved"');
  return page;
}

async function privateReceipt(page: Page) {
  const field = page.getByRole('textbox', { name: 'Own private cloud receipt', exact: true });
  const sample = await field.count() ? JSON.parse(await field.inputValue()).sample : 0;
  await page.getByRole('button', { name: 'Read own private receipt', exact: true }).click();
  // The monotonic server sample prevents an old textarea value from masking
  // an asynchronous upload that happened during camera movement.
  await expect.poll(async () => JSON.parse(await field.inputValue()).sample).toBeGreaterThan(sample);
  return JSON.parse(await field.inputValue());
}

async function ownChat(page: Page, name: 'Alice' | 'Bob') {
  const other = name === 'Alice' ? 'Bob' : 'Alice';
  await expect(page.getByRole('article')).toContainText(`${name} private planning history`);
  await expect(page.getByText(`${other} private planning history`, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message North Star', exact: true })).toHaveValue(`${name} typed private draft for cloud restore`);
}

test('HTTP peers share colored world-space cursors, selections and in-progress movement without cursor-driven workspace renders', async ({ context }, info) => {
  test.setTimeout(180_000);
  const room = 'awareness-' + randomUUID(), alice = await openPeer(context, room, 'alice'), bob = await openPeer(context, room, 'bob');
  try {
    expect(await camera(alice)).not.toBe(await camera(bob));
    await alice.mouse.move(700, 650);
    await expect(cursor(bob, 'alice').locator('svg')).toBeVisible();
    await expect(cursor(bob, 'alice').locator('span')).toHaveText('Alice');
    await bob.mouse.move(1100, 650);
    await expect(cursor(alice, 'bob').locator('svg')).toBeVisible();
    const aliceColor = await cursor(bob, 'alice').locator('path').getAttribute('stroke');
    const bobColor = await cursor(alice, 'bob').locator('path').getAttribute('stroke');
    expect(aliceColor).toMatch(/^#[0-9A-Fa-f]{6}$/); expect(bobColor).not.toBe(aliceColor);
    const frameBox = await alice.locator('iframe[title="Shared journal A"]').boundingBox();
    expect(frameBox).not.toBeNull();
    const framePointer = { x: frameBox!.x + 80, y: frameBox!.y + 100 };
    await alice.mouse.move(framePointer.x, framePointer.y);
    const expectedWorld = await alice.getByTestId('canvas-v2-workspace-surface').evaluate((element, pointer) => {
      const transform = new DOMMatrix(getComputedStyle(element).transform);
      return { x: (pointer.x - transform.e) / transform.a, y: (pointer.y - transform.f) / transform.d };
    }, framePointer);
    await expect.poll(async () => Math.abs(Number(await cursor(bob, 'alice').getAttribute('data-world-x')) - expectedWorld.x)).toBeLessThan(2);
    await expect.poll(async () => Math.abs(Number(await cursor(bob, 'alice').getAttribute('data-world-y')) - expectedWorld.y)).toBeLessThan(2);
    await expect.poll(async () => cursor(bob, 'alice').evaluate(element => {
      const surface = element.ownerDocument.querySelector('[data-testid="canvas-v2-workspace-surface"]')!;
      const overlay = element.closest('[data-testid="canvas-multiplayer-overlay"]')!;
      const transform = new DOMMatrix(getComputedStyle(surface).transform), bounds = element.getBoundingClientRect(), base = overlay.getBoundingClientRect();
      return Math.hypot(bounds.x - base.x - transform.e - Number((element as HTMLElement).dataset.worldX) * transform.a, bounds.y - base.y - transform.f - Number((element as HTMLElement).dataset.worldY) * transform.d);
    })).toBeLessThan(2);

    await design(alice); await design(bob);
    const aliceCamera = await camera(alice), bobCamera = await camera(bob);
    await object(alice, 'note-alice').click();
    await expect(bob.locator('[data-collaborator-selection="note-alice"]')).toBeVisible();
    const source = await object(alice, 'note-alice').boundingBox(), before = await object(bob, 'note-alice').boundingBox();
    expect(source).not.toBeNull(); expect(before).not.toBeNull();
    await alice.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2); await alice.mouse.down();
    try {
      await alice.mouse.move(source!.x + source!.width / 2 + 84, source!.y + source!.height / 2 + 42, { steps: 8 });
      // The receiving user must see movement while the source pointer is down.
      await expect.poll(async () => Math.abs((await object(bob, 'note-alice').boundingBox())!.x - before!.x)).toBeGreaterThan(25);
    } finally { await alice.mouse.up(); }
    await waitSaved(alice);
    // The native CSS variables already exist in the seed. Wait for Bob's
    // actual final geometry, including transient-drag cleanup, before taking
    // the steady-state render counter baseline.
    await expect.poll(async () => geometry(bob, 'note-alice')).toEqual(await geometry(alice, 'note-alice'));
    expect(await camera(alice)).toBe(aliceCamera); expect(await camera(bob)).toBe(bobCamera);

    // Empty-space pointer updates do not change selection, hover target or UI.
    await bob.mouse.move(700, 670);
    await bob.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await alice.mouse.move(700, 670); await expect(cursor(bob, 'alice').locator('svg')).toBeVisible();
    // Drag completion and presence membership are separate asynchronous deliveries.
    // Establish a stable baseline before measuring cursor-only updates.
    let observedRenders=-1,stableSince=Date.now();
    await expect.poll(async()=>{
      const next=Number(await bob.getByTestId('multiplayer-workspace-body-renders').innerText());
      if(next!==observedRenders){observedRenders=next;stableSince=Date.now();}
      return Date.now()-stableSince;
    }).toBeGreaterThan(500);
    const renders = observedRenders;
    for (let index = 0; index < 100; index++) await alice.mouse.move(700 + index % 70, 670 + index % 8);
    const finalWorldX = await alice.getByTestId('canvas-v2-workspace-surface').evaluate(element => {
      const transform = new DOMMatrix(getComputedStyle(element).transform);
      return (729 - transform.e) / transform.a;
    });
    await expect.poll(async () => Math.abs(Number(await cursor(bob, 'alice').getAttribute('data-world-x')) - finalWorldX)).toBeLessThan(2);
    expect(Number(await bob.getByTestId('multiplayer-workspace-body-renders').innerText())).toBe(renders);
    await bob.getByRole('button', { name: 'Read fixture server receipt', exact: true }).click();
    const receipt = JSON.parse(await bob.getByRole('textbox', { name: 'Fixture public server receipt', exact: true }).inputValue());
    expect(receipt.presencePackets).toBeGreaterThan(2);
    expect(receipt.presenceBytes / receipt.presencePackets).toBeLessThan(12_000);
    await info.attach('HTTP awareness receipt', { body: JSON.stringify(receipt, null, 2), contentType: 'application/json' });
    await bob.screenshot({ path: info.outputPath('world-space-peer-cursor.png') });
  } finally { await alice.close(); await bob.close(); }
});

test('HTTP peers keep distinct edits and runtime state, recover same-element conflicts, reconnect and enforce fixture viewer/removal roles', async ({ context }, info) => {
  test.setTimeout(240_000);
  const room = 'editing-' + randomUUID(), alice = await openPeer(context, room, 'alice'), bob = await openPeer(context, room, 'bob');
  let quinn: Page | undefined;
  try {
    const a = alice.frameLocator('iframe[title="Shared journal A"]');
    await a.getByRole('textbox', { name: 'Your draft', exact: true }).fill('Private Alice runtime draft');
    await a.getByRole('button', { name: 'Save draft', exact: true }).click();
    await a.getByRole('textbox', { name: 'Your draft', exact: true }).fill('Retain this unsaved runtime draft');
    // Entering Design may reveal the selected object around the new rails.
    // Measure stability after that local mode transition, before peer edits.
    await design(alice); await design(bob);
    const aliceCamera = await camera(alice), bobCamera = await camera(bob);

    await bob.getByRole('button', { name: 'Disconnect fixture network', exact: true }).click();
    await editNote(bob, 'note-bob', 'Bob edited a separate object offline');
    await expect.poll(async () => (await state(bob)).phase).toBe('reconnecting');
    await editNote(alice, 'note-alice', 'Alice edited the first object online'); await waitSaved(alice);
    await bob.getByRole('button', { name: 'Reconnect fixture network', exact: true }).click();
    await expect(object(alice, 'note-bob')).toHaveText('Bob edited a separate object offline');
    await expect(object(bob, 'note-alice')).toHaveText('Alice edited the first object online'); await waitSaved(bob);

    await object(alice, 'note-alice').click();
    const previousColor = await object(bob, 'note-alice').evaluate(element => getComputedStyle(element).color);
    await alice.getByRole('button', { name: 'Change text color', exact: true }).click();
    await alice.getByRole('button', { name: 'Use Violet', exact: true }).click();
    await expect.poll(() => object(bob, 'note-alice').evaluate(element => getComputedStyle(element).color)).not.toBe(previousColor);
    await expect.poll(() => object(bob, 'note-alice').evaluate(element => getComputedStyle(element).color)).toBe(await object(alice, 'note-alice').evaluate(element => getComputedStyle(element).color));
    await expect(a.getByRole('textbox', { name: 'Your draft', exact: true })).toHaveValue('Retain this unsaved runtime draft');
    await expect(a.locator('#status')).toContainText('Saved 1');
    expect(await camera(alice)).toBe(aliceCamera); expect(await camera(bob)).toBe(bobCamera);

    await bob.getByRole('button', { name: 'Disconnect fixture network', exact: true }).click();
    await editNote(bob, 'note-alice', 'Bob conflicting draft must remain recoverable');
    await editNote(alice, 'note-alice', 'Alice accepted final wording'); await waitSaved(alice);
    await bob.getByRole('button', { name: 'Reconnect fixture network', exact: true }).click();
    await expect(bob.getByTestId('canvas-collaboration-recovery')).toBeVisible();
    await expect(object(bob, 'note-alice')).toHaveText('Alice accepted final wording');
    expect((await state(bob)).recovery.html).toContain('Bob conflicting draft must remain recoverable');
    await expect(object(alice, 'note-alice')).toHaveText('Alice accepted final wording');

    // A late join reads the committed room, rather than depending on earlier
    // presence or operation events it never observed.
    const viewer = quinn = await openPeer(context, room, 'quinn');
    await design(viewer); await object(viewer, 'note-alice').dblclick();
    await expect(viewer.getByRole('textbox', { name: 'Edit note-alice on canvas', exact: true })).toHaveCount(0);
    await expect.poll(async () => (await state(viewer)).role).toBe('viewer');
    await expect(object(viewer, 'note-alice')).toHaveText('Alice accepted final wording');
    await alice.getByRole('button', { name: 'Fixture remove Bob', exact: true }).click();
    await expect.poll(async () => (await state(bob)).phase, { timeout: 15_000 }).toBe('blocked');
    await expect(bob.getByTestId('canvas-collaboration-status')).toContainText('Access changed');
    await expect(object(alice, 'note-alice')).toHaveText('Alice accepted final wording');
    await alice.getByRole('button', { name: 'Design view', exact: true }).click();
    await a.getByRole('button', { name: 'Save draft', exact: true }).click(); await expect(a.locator('#status')).toContainText('Saved 2');
    await info.attach('Fixture conflict and membership receipt', { body: JSON.stringify({ alice: await state(alice), bob: await state(bob), viewer: await state(viewer), scope: 'DEV HTTP fixture identities; real authorization tested separately' }, null, 2), contentType: 'application/json' });
    await bob.screenshot({ path: info.outputPath('same-element-recovery-and-removal.png') });
  } finally { await alice.close(); await bob.close(); await quinn?.close(); }
});

test('a known teammate reservation prevents entering a trapped inline editor and allows selecting another object', async ({ context }) => {
  const room = 'claims-' + randomUUID(), alice = await openPeer(context, room, 'alice'), bob = await openPeer(context, room, 'bob');
  try {
    await design(alice); await design(bob);
    await object(alice, 'note-alice').dblclick();
    await expect(alice.getByRole('textbox', { name: 'Edit note-alice on canvas', exact: true })).toBeVisible();
    await object(bob, 'note-alice').click();
    await expect.poll(async () => (await state(bob)).busyObjects).toContain('note-alice');
    await object(bob, 'note-alice').dblclick();
    await expect(bob.getByRole('textbox', { name: 'Edit note-alice on canvas', exact: true })).toHaveCount(0);
    await expect(object(alice, 'note-alice')).toHaveText("Alice's planning note");
    await object(bob, 'note-bob').click();
    await expect(bob.getByRole('complementary', { name: 'Design properties', exact: true })).toContainText('note-bob');
    await expect.poll(async () => (await state(bob)).busyObjects).toEqual([]);
  } finally { await alice.close(); await bob.close(); }
});

test('board position drafts survive peer movement and Escape restores the current shared value', async ({ context }) => {
  test.setTimeout(120_000);
  const room = 'board-draft-' + randomUUID(), alice = await openPeer(context, room, 'alice'), bob = await openPeer(context, room, 'bob');
  try {
    await design(alice); await design(bob);
    await object(alice, 'note-alice').click(); await object(bob, 'note-alice').click();
    const ax = alice.getByRole('textbox', { name: 'Object X', exact: true });
    const bx = bob.getByRole('textbox', { name: 'Object X', exact: true });
    const original = Number(await bx.inputValue()), peerX = original + 30, ownX = original + 60;
    await ax.fill(String(ownX));
    await bx.fill(String(peerX)); await bx.press('Enter'); await waitSaved(bob);
    await expect.poll(async () => parseFloat((await geometry(alice, 'note-alice'))[0])).toBe(peerX);
    await expect(ax).toHaveValue(String(ownX));
    await ax.press('Escape'); await expect(ax).toHaveValue(String(peerX));
    await waitSaved(alice); await expect(bx).toHaveValue(String(peerX));

    // Commit an absolute X against the newest shared geometry, preserving Y.
    await ax.fill(String(ownX));
    const by = bob.getByRole('textbox', { name: 'Object Y', exact: true });
    const peerY = Number(await by.inputValue()) + 25;
    await by.fill(String(peerY)); await by.press('Enter'); await waitSaved(bob);
    await expect.poll(async () => parseFloat((await geometry(alice, 'note-alice'))[1])).toBe(peerY);
    await ax.press('Enter'); await waitSaved(alice);
    await expect(bx).toHaveValue(String(ownX)); await expect(by).toHaveValue(String(peerY));
    await alice.getByRole('button', { name: 'Undo canvas action', exact: true }).click(); await waitSaved(alice);
    await expect(bx).toHaveValue(String(peerX)); await expect(by).toHaveValue(String(peerY));
    // Merely focusing a rounded display must not round the shared geometry.
    await bx.fill(String(peerX + 0.12345)); await bx.press('Enter'); await waitSaved(bob);
    await expect.poll(async () => geometry(alice, 'note-alice')).toEqual(await geometry(bob, 'note-alice'));
    const precise = await geometry(alice, 'note-alice');
    await ax.focus(); await ax.press('Tab'); await waitSaved(alice);
    expect(await geometry(alice, 'note-alice')).toEqual(precise);
    expect(await geometry(bob, 'note-alice')).toEqual(precise);
    await expect(alice.getByRole('button', { name: 'Retry preview', exact: true })).toHaveCount(0);
  } finally { await alice.close(); await bob.close(); }
});

test('a shared in-app text/style edit preserves each peer private input and JavaScript closure', async ({ context }, info) => {
  test.setTimeout(180_000);
  const room = 'screens-' + randomUUID(), alice = await openPeer(context, room, 'alice'), bob = await openPeer(context, room, 'bob');
  const a = alice.frameLocator('iframe[title="Shared journal A"]'), b = bob.frameLocator('iframe[title="Shared journal A"]');
  try {
    for (const [frame, name] of [[a, 'Alice'], [b, 'Bob']] as const) {
      await frame.getByRole('textbox', { name: 'Your draft', exact: true }).fill(name + ' saved runtime draft');
      await frame.getByRole('button', { name: 'Save draft', exact: true }).click();
      await frame.getByRole('textbox', { name: 'Your draft', exact: true }).fill(name + ' private unsaved runtime draft');
    }
    await design(alice); await object(alice, 'journal-a').click();
    await alice.getByRole('treeitem', { name: 'Select layer heading', exact: true }).click();
    await alice.getByRole('textbox', { name: 'Element text', exact: true }).fill('A human edited this together.');
    // Closing immediately exercises the real editor save/drain boundary.
    await alice.getByRole('button', { name: 'Close appearance editor', exact: true }).click();
    await expect(b.getByRole('heading', { level: 1 })).toHaveText('A human edited this together.');
    await alice.getByRole('treeitem', { name: 'Select layer heading', exact: true }).click();
    await alice.getByRole('textbox', { name: 'Text colour', exact: true }).fill('#c24f5a');
    await alice.getByRole('button', { name: 'Close appearance editor', exact: true }).click();
    await expect.poll(() => b.getByRole('heading', { level: 1 }).evaluate(element => getComputedStyle(element).color)).toBe('rgb(194, 79, 90)');
    for (const [frame, name] of [[a, 'Alice'], [b, 'Bob']] as const) {
      await expect(frame.getByRole('textbox', { name: 'Your draft', exact: true })).toHaveValue(name + ' private unsaved runtime draft');
      await expect(frame.locator('#status')).toHaveText('Saved 1 · ' + name + ' saved runtime draft');
    }
    await alice.getByRole('button', { name: 'Design view', exact: true }).click();
    for (const [frame, name] of [[a, 'Alice'], [b, 'Bob']] as const) {
      await frame.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(frame.locator('#status')).toHaveText('Saved 2 · ' + name + ' private unsaved runtime draft');
    }
    await info.attach('Interactive screen continuity', { body: JSON.stringify({ heading: await b.getByRole('heading', { level: 1 }).textContent(), alice: await a.locator('#status').textContent(), bob: await b.locator('#status').textContent() }), contentType: 'application/json' });
  } finally { await alice.close(); await bob.close(); }
});

test('a rejected peer preview patch rebuilds the saved design and permits further edits without a History detour', async ({ context }, info) => {
  test.setTimeout(180_000);
  const room = 'preview-recovery-' + randomUUID(), alice = await openPeer(context, room, 'alice'), bob = await openPeer(context, room, 'bob');
  const a = alice.frameLocator('iframe[title="Shared journal A"]'), b = bob.frameLocator('iframe[title="Shared journal A"]');
  try {
    const bobCamera = await camera(bob);
    await b.getByRole('textbox', { name: 'Your draft', exact: true }).fill('Bob keeps his private input through preview recovery');
    // Simulate a generated app changing its live DOM after the source was
    // saved. A precise text patch must reject this missing target; the host
    // must recover the committed source rather than blanking the artwork.
    await b.locator('#heading').evaluate(element => element.remove());
    await design(alice); await object(alice, 'journal-a').click();
    await alice.getByRole('treeitem', { name: 'Select layer heading', exact: true }).click();
    await alice.getByRole('textbox', { name: 'Element text', exact: true }).fill('The shared design survives a failed preview patch.');
    await alice.getByRole('button', { name: 'Close appearance editor', exact: true }).click();
    await expect(b.locator('#heading')).toHaveText('The shared design survives a failed preview patch.');
    await expect(bob.getByRole('button', { name: 'Retry preview', exact: true })).toHaveCount(0);
    await expect(b.getByRole('textbox', { name: 'Your draft', exact: true })).toHaveValue('Bob keeps his private input through preview recovery');
    expect(await camera(bob)).toBe(bobCamera);
    await waitSaved(alice);
    await alice.getByRole('button', { name: 'Back to canvas', exact: true }).click();
    await object(alice, 'note-bob').click();
    await design(bob); await object(bob, 'journal-a').click();
    await bob.getByRole('treeitem', { name: 'Select layer heading', exact: true }).click();
    await bob.getByRole('textbox', { name: 'Element text', exact: true }).fill('Bob can keep designing after automatic recovery.');
    await bob.getByRole('button', { name: 'Close appearance editor', exact: true }).click();
    await expect(a.locator('#heading')).toHaveText('Bob can keep designing after automatic recovery.');
    await waitSaved(bob);
    await bob.reload();
    await expect(b.locator('#heading')).toHaveText('Bob can keep designing after automatic recovery.');
    await expect(bob.getByRole('button', { name: 'Retry preview', exact: true })).toHaveCount(0);
    await info.attach('Recovered shared design', { body: JSON.stringify({ alice: await state(alice), bob: await state(bob) }), contentType: 'application/json' });
  } finally { await alice.close(); await bob.close(); }
});

test('a slow peer patch cannot overwrite a newer committed text edit', async ({ context }) => {
  test.setTimeout(180_000);
  const room = 'preview-order-' + randomUUID(), alice = await openPeer(context, room, 'alice');
  // Install before app boot so the original handler cannot also run this
  // command. Hold it until a second edit is durably saved on the other peer.
  await context.addInitScript(() => {
    if (window === parent) return;
    const win = window as typeof window & { delayedPeerPatch?: { started: boolean; released: boolean }; releasePeerPatch?: () => void };
    win.delayedPeerPatch = { started: false, released: false };
    const delay = (event: MessageEvent) => {
      if (event.source !== parent || !event.data?.command?.action?.startsWith('patch-')) return;
      window.removeEventListener('message', delay, true);
      event.stopImmediatePropagation(); win.delayedPeerPatch!.started = true;
      win.releasePeerPatch = () => {
        if (!win.delayedPeerPatch!.released) {
          win.delayedPeerPatch!.released = true;
          window.dispatchEvent(new MessageEvent('message', { data: event.data, source: event.source, origin: event.origin }));
        }
      };
    };
    window.addEventListener('message', delay, true);
  });
  const bob = await openPeer(context, room, 'bob'), b = bob.frameLocator('iframe[title="Shared journal A"]');
  try {
    await design(alice); await object(alice, 'journal-a').click();
    const change = async (text: string) => {
      await alice.getByRole('treeitem', { name: 'Select layer heading', exact: true }).click();
      await alice.getByRole('textbox', { name: 'Element text', exact: true }).fill(text);
      await alice.getByRole('button', { name: 'Close appearance editor', exact: true }).click();
      await expect(alice.frameLocator('iframe[title="Shared journal A"]').locator('#heading')).toHaveText(text);
      await waitSaved(alice);
    };
    await change('First edit waits for a slow preview.');
    await expect.poll(() => b.locator('body').evaluate(() => (window as typeof window & { delayedPeerPatch?: { started: boolean } }).delayedPeerPatch?.started)).toBe(true);
    await change('The newest edit is the one both people see.');
    await b.locator('body').evaluate(() => (window as typeof window & { releasePeerPatch?: () => void }).releasePeerPatch!());
    await expect.poll(() => b.locator('body').evaluate(() => (window as typeof window & { delayedPeerPatch?: { released: boolean } }).delayedPeerPatch?.released)).toBe(true);
    await expect(b.locator('#heading')).toHaveText('The newest edit is the one both people see.');
    await expect(bob.getByRole('button', { name: 'Retry preview', exact: true })).toHaveCount(0);
    await alice.getByRole('button', { name: 'Undo canvas action', exact: true }).click();
    await expect(b.locator('#heading')).toHaveText('First edit waits for a slow preview.');
    await alice.getByRole('button', { name: 'Redo canvas action', exact: true }).click();
    await expect(b.locator('#heading')).toHaveText('The newest edit is the one both people see.');
    await waitSaved(alice);
  } finally { await alice.close(); await bob.close(); }
});

test('real private sync and blob codec restore each account chat on cache-empty devices without camera-driven history uploads', async ({ context }, info) => {
  test.setTimeout(180_000);
  const room = 'private-' + randomUUID(), alice = await openPrivatePeer(context, room, 'alice'), bob = await openPrivatePeer(context, room, 'bob');
  const devices: Page[] = [alice, bob];
  try {
    for (const [page, name] of [[alice, 'Alice'], [bob, 'Bob']] as const) {
      await page.getByRole('textbox', { name: 'Message North Star', exact: true }).fill(`${name} typed private draft for cloud restore`);
      await page.getByRole('button', { name: 'Flush private history', exact: true }).click();
      await expect(page.getByTestId('multiplayer-private-status')).toContainText('"phase":"saved"');
      await ownChat(page, name);
      await expect.poll(async () => Number(await page.getByTestId('multiplayer-camera-writes').innerText())).toBeGreaterThan(0);
      await expect(page.locator('[data-chat-privacy="personal"]')).toHaveAttribute('title', 'Only you can see this conversation');
    }
    const before = { alice: await privateReceipt(alice), bob: await privateReceipt(bob), aliceCopies: await alice.getByTestId('multiplayer-private-codec-copies').innerText(), bobCopies: await bob.getByTestId('multiplayer-private-codec-copies').innerText() };
    const bobCamera = await camera(bob), cameraWrites = Number(await alice.getByTestId('multiplayer-camera-writes').innerText());
    await alice.getByRole('button', { name: 'Pan', exact: true }).click();
    await alice.mouse.move(800, 640); await alice.mouse.down(); await alice.mouse.move(840, 660, { steps: 20 }); await alice.mouse.up();
    await alice.getByRole('button', { name: 'Select', exact: true }).click();
    const bodyRenders = await bob.getByTestId('multiplayer-workspace-body-renders').innerText();
    for (let index = 0; index < 100; index++) await alice.mouse.move(900 + index % 50, 640 + index % 6);
    await expect.poll(async () => Number(await alice.getByTestId('multiplayer-camera-writes').innerText())).toBeGreaterThan(cameraWrites);
    await expect(alice.getByTestId('multiplayer-private-status')).toContainText('"phase":"saved"');
    const after = { alice: await privateReceipt(alice), bob: await privateReceipt(bob), aliceCopies: await alice.getByTestId('multiplayer-private-codec-copies').innerText(), bobCopies: await bob.getByTestId('multiplayer-private-codec-copies').innerText() };
    expect(after.alice.uploads).toBe(before.alice.uploads); expect(after.bob.uploads).toBe(before.bob.uploads);
    expect(after.aliceCopies).toBe(before.aliceCopies); expect(after.bobCopies).toBe(before.bobCopies);
    expect(await bob.getByTestId('multiplayer-workspace-body-renders').innerText()).toBe(bodyRenders);
    expect(await camera(bob)).toBe(bobCamera);
    const writesBeforeEditing = Number(await alice.getByTestId('multiplayer-camera-writes').innerText());
    await editNote(alice, 'note-alice', 'Shared team edit; personal chats stay private');
    await expect(object(bob, 'note-alice')).toHaveText('Shared team edit; personal chats stay private');
    if (await alice.getByRole('button', { name: 'Design view', exact: true }).getAttribute('aria-pressed') === 'true') await alice.getByRole('button', { name: 'Design view', exact: true }).click();
    await ownChat(alice, 'Alice'); await ownChat(bob, 'Bob');
    // Entering Design deliberately reveals the selection around its rails.
    // Reload restores that latest local camera, not the pre-edit camera.
    const personalCamera = await camera(alice);
    await expect.poll(async () => Number(await alice.getByTestId('multiplayer-camera-writes').innerText())).toBeGreaterThan(writesBeforeEditing);
    await alice.reload(); await bob.reload();
    await ownChat(alice, 'Alice'); await ownChat(bob, 'Bob');
    await expect.poll(() => camera(alice)).toBe(personalCamera);
    for (const peer of ['alice', 'bob'] as const) {
      const page = await openPrivatePeer(context, room, peer, 'cache-empty-' + peer); devices.push(page);
      await expect(page.getByTestId('multiplayer-private-cache-state')).toContainText('"cacheInitiallyPresent":false');
      await ownChat(page, peer === 'alice' ? 'Alice' : 'Bob');
      await expect(object(page, 'note-alice')).toHaveText('Shared team edit; personal chats stay private');
    }
    await info.attach('Private account history and camera isolation', { body: JSON.stringify({ before, after, scope: 'Production private sync/codec/cache over DEV HTTP account-service fixture; hosted Auth/Realtime not claimed' }, null, 2), contentType: 'application/json' });
  } finally { for (const page of devices) await page.close(); }
});


test('typing in a screen inspector survives a peer editing a different layer before autosave',async({context})=>{
 test.setTimeout(120_000);
 const room='inspector-draft-'+randomUUID(),alice=await openPeer(context,room,'alice'),bob=await openPeer(context,room,'bob',page=>page.addInitScript(()=>{
  // Hold only the inspector's debounce until explicit close flushes it.
  // Network polling and preview ACKs retain their real clocks.
  const schedule=window.setTimeout.bind(window);
  window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>schedule(handler,delay===350?60000:delay,...args)) as typeof window.setTimeout;
 }));
 try{
  await design(alice);await design(bob);
  await object(alice,'journal-a').click();await object(bob,'journal-a').click();
  await alice.getByRole('treeitem',{name:'Select layer description',exact:true}).click();
  await bob.getByRole('treeitem',{name:'Select layer heading',exact:true}).click();
  const draft=bob.getByRole('textbox',{name:'Element text',exact:true});
  await draft.fill('Bob is still typing this heading');
  await alice.getByRole('textbox',{name:'Element text',exact:true}).fill('Alice refined the supporting description.');
  await alice.getByRole('button',{name:'Close appearance editor',exact:true}).click();await waitSaved(alice);
  await expect(alice.frameLocator('iframe[title="Shared journal A"]').locator('#description')).toHaveText('Alice refined the supporting description.');
  // The delayed local autosave must not lose its draft on peer delivery.
  await expect(bob.frameLocator('iframe[title="Shared journal A"]').locator('#description')).toHaveText('Alice refined the supporting description.');
  await expect(draft).toHaveValue('Bob is still typing this heading');
  await bob.getByRole('button',{name:'Close appearance editor',exact:true}).click();await waitSaved(bob);
  for(const page of [alice,bob]){
   const frame=page.frameLocator('iframe[title="Shared journal A"]');
   await expect(frame.locator('#heading')).toHaveText('Bob is still typing this heading');
   await expect(frame.locator('#description')).toHaveText('Alice refined the supporting description.');
   await expect(page.getByRole('button',{name:'Retry preview',exact:true})).toHaveCount(0);
  }
 }finally{await alice.close();await bob.close();}
});

test('a pending same-field edit retains its draft and Undo returns to the delivered teammate value',async({context})=>{
 test.setTimeout(120_000);
 const room='same-field-draft-'+randomUUID(),alice=await openPeer(context,room,'alice'),bob=await openPeer(context,room,'bob',page=>page.addInitScript(()=>{
  const schedule=window.setTimeout.bind(window);
  window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>schedule(handler,delay===350?60000:delay,...args)) as typeof window.setTimeout;
 }));
 try{
  await design(alice);await design(bob);
  for(const page of [alice,bob]){await object(page,'journal-a').click();await page.getByRole('treeitem',{name:'Select layer heading',exact:true}).click();}
  const draft=bob.getByRole('textbox',{name:'Element text',exact:true});await draft.fill('Bob pending final headline');
  await alice.getByRole('textbox',{name:'Element text',exact:true}).fill('Alice delivered headline');
  await alice.getByRole('button',{name:'Close appearance editor',exact:true}).click();await waitSaved(alice);
  await expect(bob.frameLocator('iframe[title="Shared journal A"]').locator('#heading')).toHaveText('Alice delivered headline');
  await expect(draft).toHaveValue('Bob pending final headline');
  await bob.getByRole('button',{name:'Close appearance editor',exact:true}).click();await waitSaved(bob);
  for(const page of [alice,bob])await expect(page.frameLocator('iframe[title="Shared journal A"]').locator('#heading')).toHaveText('Bob pending final headline');
  await bob.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  for(const page of [alice,bob])await expect(page.frameLocator('iframe[title="Shared journal A"]').locator('#heading')).toHaveText('Alice delivered headline');
  await bob.getByRole('button',{name:'Redo canvas action',exact:true}).click();
  for(const page of [alice,bob]){await expect(page.frameLocator('iframe[title="Shared journal A"]').locator('#heading')).toHaveText('Bob pending final headline');await expect(page.getByRole('button',{name:'Retry preview',exact:true})).toHaveCount(0);}
 }finally{await alice.close();await bob.close();}
});

test('inline text keeps typing across an unrelated peer revision before its debounce',async({context})=>{
 test.setTimeout(120_000);
 const room='inline-draft-'+randomUUID(),alice=await openPeer(context,room,'alice',page=>page.addInitScript(()=>{
  const schedule=window.setTimeout.bind(window);
  window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>schedule(handler,delay===350?60000:delay,...args)) as typeof window.setTimeout;
 })),bob=await openPeer(context,room,'bob',page=>page.addInitScript(()=>{
  const schedule=window.setTimeout.bind(window);
  window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>schedule(handler,delay===300?60000:delay,...args)) as typeof window.setTimeout;
  // Keep the draft active while the test controls a second browser window.
  // Normal focus changes finish inline editing, which would save before the
  // incoming revision rather than exercising the unsaved-draft boundary.
  for(const type of ['blur','focusout'])window.addEventListener(type,event=>{if((event.target as Element|null)?.matches?.('[aria-label="Screen text"]'))event.stopImmediatePropagation();},true);
 }));
 try{
  await design(alice);await design(bob);
  await object(alice,'journal-a').click();await object(bob,'journal-a').click();
  await alice.getByRole('treeitem',{name:'Select layer description',exact:true}).click();
  await bob.getByRole('treeitem',{name:'Select layer heading',exact:true}).click();
  await alice.getByRole('textbox',{name:'Element text',exact:true}).fill('Alice peer description during inline typing');
  await bob.getByRole('button',{name:'Edit text on canvas',exact:true}).click();
  const draft=bob.getByRole('textbox',{name:'Screen text',exact:true});await draft.fill('Bob inline typing survives');
  // Deliver the peer's real UI commit without focusing Alice's window:
  // switching windows intentionally finishes Bob's inline edit on blur.
  await alice.getByRole('button',{name:'Close appearance editor',exact:true}).evaluate(button=>(button as HTMLButtonElement).click());await waitSaved(alice);
  await expect(alice.frameLocator('iframe[title="Shared journal A"]').locator('#description')).toHaveText('Alice peer description during inline typing');
  await expect(bob.frameLocator('iframe[title="Shared journal A"]').locator('#description')).toHaveText('Alice peer description during inline typing');
  await expect(draft).toHaveText('Bob inline typing survives');await draft.press('Enter');await waitSaved(bob);
  for(const page of [alice,bob]){
   await expect(page.frameLocator('iframe[title="Shared journal A"]').locator('#heading')).toHaveText('Bob inline typing survives');
   await expect(page.frameLocator('iframe[title="Shared journal A"]').locator('#description')).toHaveText('Alice peer description during inline typing');
  }
 }finally{await alice.close();await bob.close();}
});

test('repeated mixed multiplayer editing reconnects and releases held drags without corrupting live objects',async({context},info)=>{
 test.setTimeout(300_000);
 const room='mixed-soak-'+randomUUID(),alice=await openPeer(context,room,'alice'),bob=await openPeer(context,room,'bob');
 try{
  const a=alice.frameLocator('iframe[title="Shared journal A"]'),b=bob.frameLocator('iframe[title="Shared journal A"]');
  await a.getByRole('textbox',{name:'Your draft',exact:true}).fill('Alice private runtime input');
  await b.getByRole('textbox',{name:'Your draft',exact:true}).fill('Bob private runtime input');
  await a.getByRole('button',{name:'Save draft',exact:true}).click();await b.getByRole('button',{name:'Save draft',exact:true}).click();
  await design(alice);await design(bob);
  for(let round=0;round<8;round++){
   if(round%2===1)await bob.getByRole('button',{name:'Disconnect fixture network',exact:true}).click();
   await Promise.all([editNote(alice,'note-alice','Alice round '+round),editNote(bob,'note-bob','Bob round '+round)]);
   if(round%2===1)await bob.getByRole('button',{name:'Reconnect fixture network',exact:true}).click();
   await waitSaved(alice);await waitSaved(bob);
   for(const page of [alice,bob]){
    await expect(object(page,'note-alice')).toHaveText('Alice round '+round);
    await expect(object(page,'note-bob')).toHaveText('Bob round '+round);
    await expect(page.getByRole('button',{name:'Retry preview',exact:true})).toHaveCount(0);
   }
   await alice.getByRole('button',{name:'Undo canvas action',exact:true}).click();
   await expect(object(bob,'note-alice')).not.toHaveText('Alice round '+round);
   await expect(object(bob,'note-bob')).toHaveText('Bob round '+round);
   await alice.getByRole('button',{name:'Redo canvas action',exact:true}).click();
   await expect(object(bob,'note-alice')).toHaveText('Alice round '+round);
   const rect=await object(alice,'note-alice').boundingBox();expect(rect).not.toBeNull();
   await alice.mouse.move(rect!.x+rect!.width/2,rect!.y+rect!.height/2);await alice.mouse.down();
   await alice.mouse.move(rect!.x+rect!.width/2+18,rect!.y+rect!.height/2+8,{steps:5});await alice.mouse.up();
   await waitSaved(alice);
   // Source geometry is rounded to hundredths; transient presence offsets
   // can retain sub-hundredth rounding residue. Compare at source precision.
   const precise=async(page:Page)=>(await geometry(page,'note-alice')).map(value=>Math.round(parseFloat(value)*100)/100||0);
   await expect.poll(()=>precise(bob)).toEqual(await precise(alice));
   const released=await geometry(alice,'note-alice');
   await alice.mouse.move(900,620,{steps:6});expect(await geometry(alice,'note-alice')).toEqual(released);
   await expect(a.getByRole('textbox',{name:'Your draft',exact:true})).toHaveValue('Alice private runtime input');
   await expect(b.getByRole('textbox',{name:'Your draft',exact:true})).toHaveValue('Bob private runtime input');
   await expect(a.locator('#status')).toHaveText('Saved 1 · Alice private runtime input');
   await expect(b.locator('#status')).toHaveText('Saved 1 · Bob private runtime input');
  }
  await bob.reload();await expect(object(bob,'note-alice')).toHaveText('Alice round 7');await expect(object(bob,'note-bob')).toHaveText('Bob round 7');
  await info.attach('Mixed workflow receipt',{body:JSON.stringify({rounds:8,alice:await state(alice),bob:await state(bob)}),contentType:'application/json'});
 }finally{await alice.close();await bob.close();}
});
