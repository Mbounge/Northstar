import { expect, test } from '@playwright/test';

test('precise feedback preserves live input, saved state, source scope and camera; motion review retains three real frames', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await page.goto('/canvas-v2-e2e/codex');
  const send = async (message: string) => { await page.getByLabel('Message North Star').fill(message); await page.getByRole('button', { name: 'Send message', exact: true }).click(); };
  await send('screen creative');
  await expect(page.getByText('Created the screen with a saved product identity and reviewed three distinct motion frames.', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Show latest work on canvas', exact: true }).click();
  const scene = page.getByTestId('canvas-v2-native-scene'), object = scene.locator('[data-canvas-v2-screen]');
  const frame = page.frameLocator('iframe[title="GRAET · creative review"]');
  const mode = page.getByRole('button', { name: 'Design view', exact: true });
  const collapseChat = async () => {
    const collapse = page.getByRole('button', { name: 'Collapse North Star panel', exact: true });
    if (await collapse.isVisible()) await collapse.click();
  };
  const enterDesign = async () => {
    await collapseChat();
    if (await mode.getAttribute('aria-pressed') !== 'true') await mode.click();
    if (!await page.getByRole('button', { name: 'Back to canvas', exact: true }).isVisible()) {
      await scene.getByText('GRAET · creative review', { exact: true }).click();
    }
    await expect(page.getByRole('tree', { name: 'Editable layers' })).toBeVisible();
  };
  const selectHeadline = async () => {
    await enterDesign();
    await page.getByRole('tree', { name: 'Editable layers' }).locator('[data-layer-selector="#headline"]').click();
  };
  await frame.getByRole('button', { name: 'Save team', exact: true }).click();
  await frame.getByRole('textbox', { name: 'Your goal' }).fill('Score 24 goals');
  const geometry = await object.getAttribute('style'), before = await scene.evaluate(el => el.parentElement?.style.transform);
  const encoded = await object.getAttribute('data-canvas-v2-screen');
  const source = JSON.parse(Buffer.from(encoded!, 'base64').toString());
  await selectHeadline();
  await page.getByRole('button', { name: 'Ask Northstar about selection', exact: true }).click();
  await page.getByRole('textbox', { name: 'Comment for marked area', exact: true }).fill('Change this headline only.');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel canvas feedback', exact: true })).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByRole('button', { name: /^Review 1 comments?$/ })).toBeVisible();
  await send('precise feedback — change this headline only');
  await expect(page.getByText('Refined only the selected headline; the saved product identity and interaction state were retained.', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(frame.getByRole('heading', { name: 'Your next chapter.', exact: true })).toBeVisible();
  await expect(frame.getByRole('textbox', { name: 'Your goal' })).toHaveValue('Score 24 goals');
  await expect(frame.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  expect(await object.getAttribute('style')).toBe(geometry);
  expect(await scene.evaluate(el => el.parentElement?.style.transform)).toBe(before);
  const revised = JSON.parse(Buffer.from((await object.getAttribute('data-canvas-v2-screen'))!, 'base64').toString());
  expect(revised.javascript).toBe(source.javascript); expect(revised.css).toBe(source.css);
  expect(revised.productIdentityId).toBe('graet-test');
  await collapseChat();
  await expect(page.getByRole('button', { name:'Move screen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name:'Review screen quality' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare changes', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Compare design changes', exact: true });
  await expect(history.getByRole('navigation', { name:'Screen versions' })).toContainText('Refined the selected headline');
  await expect(history.getByRole('navigation', { name:'Screen versions' })).toContainText('Starting version');
  await history.getByRole('button', { name:'Close version history' }).click();
  await expect(frame.getByRole('textbox', { name:'Your goal' })).toHaveValue('Score 24 goals');
  await expect(frame.getByRole('button', { name:'Saved',exact:true })).toBeVisible();
  await mode.click();
  await frame.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Save team', exact: true })).toBeVisible();
  await selectHeadline();
  await page.getByRole('button', { name: 'Ask Northstar about selection', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel canvas feedback', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Comment on this area', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-visual-feedback-overlay]')).toHaveCount(0);

});


test('adding an inspiration rail retains saved native screen coordinates and live state', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/canvas-v2-e2e/codex');
  const send = async (message: string) => { await page.getByLabel('Message North Star').fill(message); await page.getByRole('button', { name: 'Send message', exact: true }).click(); };
  await send('screen creative');
  await expect(page.getByText('Created the screen with a saved product identity and reviewed three distinct motion frames.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show latest work on canvas', exact: true }).click();
  const screen = page.locator('[data-canvas-v2-screen]');
  const position = () => screen.evaluate(el => [el.style.getPropertyValue('--canvas-v2-native-x'), el.style.getPropertyValue('--canvas-v2-native-y')]);
  const before = await position();
  await page.frameLocator('iframe[title="GRAET · creative review"]').getByRole('button', { name: 'Save team', exact: true }).click();
  await send('creative flow preserve');
  await expect(page.getByText('Added the full inspiration flow without moving the existing screen.', { exact: true })).toBeVisible({ timeout: 90000 });
  expect(await position()).toEqual(before);
  await expect(page.locator('[data-canvas-v2-canonical-flow]')).toHaveCount(1);
  await send('creative flow preserve');
  await expect(page.getByText('Added the full inspiration flow without moving the existing screen.', { exact: true })).toHaveCount(2);
  await expect(page.locator('[data-canvas-v2-canonical-flow]')).toHaveCount(1);
  expect(await position()).toEqual(before);
  await expect(page.frameLocator('iframe[title="GRAET · creative review"]').getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
});

test('runtime checks reject clipped, transparent and covered controls and hold short transitions', async ({ page }) => {
  await page.goto('/canvas-v2-e2e/codex');
  await page.getByLabel('Message North Star').fill('screen reachability');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Hidden and covered controls were rejected; the reachable control produced three distinct 80ms motion frames.', { exact: true })).toBeVisible({ timeout: 90000 });
});


test('feedback spans screens and canvas references; restoring a version preserves siblings and geometry', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await page.goto('/canvas-v2-e2e/codex');
  const send = async (message: string) => { await page.getByLabel('Message North Star').fill(message); await page.getByRole('button',{name:'Send message',exact:true}).click(); };
  for(let i=1;i<=2;i++) {
    await send('screen creative');
    await expect(page.getByText('Created the screen with a saved product identity and reviewed three distinct motion frames.',{exact:true})).toHaveCount(i,{timeout:90000});
  }
  await send('creative flow preserve');
  await expect(page.getByText('Added the full inspiration flow without moving the existing screen.',{exact:true})).toBeVisible({timeout:90000});
  await page.getByRole('button',{name:'Show latest work on canvas',exact:true}).click();
  const screens=page.locator('[data-canvas-v2-screen]');
  const first=screens.nth(0), second=screens.nth(1);
  const firstId=await first.getAttribute('data-canvas-v2-node-id'), secondId=await second.getAttribute('data-canvas-v2-node-id');
  const frame1=page.frameLocator(`[data-canvas-v2-node-id="${firstId}"] iframe`), frame2=page.frameLocator(`[data-canvas-v2-node-id="${secondId}"] iframe`);
  await frame1.getByRole('button',{name:'Save team',exact:true}).click();
  await frame1.getByLabel('Your goal').fill('Score 24 goals');
  const geometry1=await first.getAttribute('style'),geometry2=await second.getAttribute('style');
  const canonical=page.locator('[data-canvas-v2-canonical-flow]'), reference=await canonical.getAttribute('data-canvas-v2-canonical-flow');
  const mode=page.getByRole('button',{name:'Design view',exact:true});
  const fit=async()=>{const board=page.getByRole('region',{name:'Canvas workspace',exact:true});await board.focus();await board.press('Shift+Digit1');};
  const back=async()=>{const button=page.getByRole('button',{name:'Back to canvas',exact:true});if(await button.isVisible())await button.click();};
  const collapse=async()=>{const button=page.getByRole('button',{name:'Collapse North Star panel',exact:true});if(await button.isVisible())await button.click();};
  const caption=page.getByTestId('canvas-v2-native-scene').getByText('GRAET · creative review',{exact:true});
  const openHistory=async()=>{await collapse();await back();await fit();await caption.first().click({button:'right'});await page.getByRole('menuitem',{name:'Version history',exact:true}).click();};
  // A person can accumulate precise comments across separate Design scopes.
  // Each Done keeps earlier comments attached to the same pending request.
  for(let index=0;index<2;index++){
    await collapse();await back();
    if(await mode.getAttribute('aria-pressed')!=='true')await mode.click();
    await fit();await caption.nth(index).click();
    await page.getByRole('tree',{name:'Editable layers'}).locator('[data-layer-selector="#headline"]').click();
    await page.getByRole('button',{name:'Ask Northstar about selection',exact:true}).click();
    await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).fill('Refine only this selected headline.');
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await expect(page.getByRole('button',{name:'Review 1 comments',exact:true})).toHaveCount(index+1);
  }
  await collapse();await back();await fit();
  const referenceLeaf=canonical.getByRole('img',{name:'Landing',exact:true});
  await referenceLeaf.click();await page.getByRole('button',{name:'Give feedback on selection',exact:true}).click();
  await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).fill('Keep this reference unchanged.');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.getByRole('button',{name:'Review 1 comments',exact:true})).toHaveCount(3);
  await send('feedback collection');
  await expect(page.getByText('Refined every tagged screen detail together and retained the tagged canvas reference.',{exact:true})).toBeVisible({timeout:90000});
  await expect(frame1.getByRole('heading',{name:'Refined detail 1',exact:true})).toBeVisible();
  await expect(frame2.getByRole('heading',{name:'Refined detail 2',exact:true})).toBeVisible();
  await expect(frame1.getByLabel('Your goal')).toHaveValue('Score 24 goals');
  await expect(frame1.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
  expect(await canonical.getAttribute('data-canvas-v2-canonical-flow')).toBe(reference);
  const sibling=await second.getAttribute('data-canvas-v2-screen');
  await openHistory();
  const history=page.getByRole('dialog',{name:'Compare design changes',exact:true});
  await history.getByRole('button').filter({hasText:'Starting version'}).click();
  await history.getByRole('button',{name:'Use this version',exact:true}).click();
  await expect(history).toHaveCount(0);
  await expect(frame1.getByRole('heading',{name:'Your next season.',exact:true})).toBeVisible();
  // Explicit version restoration restarts this app with the restored seed.
  await expect(frame1.getByRole('button',{name:'Save team',exact:true})).toBeVisible();
  expect(await second.getAttribute('data-canvas-v2-screen')).toBe(sibling);
  expect(await first.getAttribute('style')).toBe(geometry1);expect(await second.getAttribute('style')).toBe(geometry2);
  await openHistory();
  await expect(history.getByText('On canvas',{exact:true})).toHaveCount(1);
  await expect(history.getByRole('button',{name:'On canvas',exact:true})).toBeDisabled();
});


test('motion review samples staggered reveals on one shared timeline', async ({ page }) => {
  await page.goto('/canvas-v2-e2e/codex');
  await page.getByLabel('Message North Star').fill('screen temporal');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Verified the shared timeline: the first reveal finishes before the second starts, and playback is restored.', { exact: true })).toBeVisible({ timeout: 90000 });
});


test('native image uploads become inspected retained material inside an authored screen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/canvas-v2-e2e/codex');
  await page.getByLabel('Choose images for the canvas', { exact: true }).setInputFiles('app/canvas-v2-e2e/codex/media-assets/reference.png');
  await expect(page.locator('[data-canvas-v2-native-scene] img')).toHaveCount(1);
  await page.getByLabel('Message North Star').fill('screen canvas asset');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('The native canvas image is retained, inspected and loaded inside the interactive screen.', { exact: true })).toBeVisible({ timeout: 90000 });
  const frame = page.frameLocator('iframe[title="Retained canvas image"]');
  await expect(frame.getByRole('img', { name: 'Chosen canvas material' })).toHaveAttribute('src', /^data:image\/png;base64,/);
  await frame.getByRole('button', { name: 'Save direction', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Direction saved', exact: true })).toBeVisible();
  await expect(page.locator('[data-canvas-v2-native-scene] img')).toHaveCount(1);
});

test('GIF references keep their original animated bytes inside an authored screen', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/canvas-v2-e2e/codex');
  await page.getByLabel('Message North Star').fill('screen gif asset');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('The retained GIF is loaded inside the interactive screen.', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.frameLocator('iframe[title="Retained GIF playback"]').getByRole('img', { name: 'Chosen canvas material' })).toHaveAttribute('src', /^data:image\/gif;base64,/);
});


test('live motion review captures genuine procedural canvas/3D states without a media surrogate',async({page})=>{
 await page.goto('/canvas-v2-e2e/codex');
 await page.getByLabel('Message North Star').fill('screen procedural');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('Verified a genuine animated book and responsive light in four live frames, with no video or GIF.',{exact:true})).toBeVisible({timeout:90000});
 const frame=page.frameLocator('iframe[title="Interactive motion study"]');
 await expect(frame.getByText('100% open',{exact:true})).toBeVisible();
 await frame.getByRole('button',{name:'Close book',exact:true}).click();
 await frame.getByRole('button',{name:'Open book',exact:true}).click();
 await expect(frame.getByText('100% open',{exact:true})).toBeVisible();
 expect(await frame.locator('video,img').count()).toBe(0);
});

test('native uploaded video is inspectable and playable inside an authored screen',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/canvas-v2-e2e/codex');
 await expect(page.getByRole('button',{name:'Upload image, GIF, or video',exact:true})).toBeEnabled();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload image, GIF, or video',exact:true}).click();
 await(await chooser).setFiles('app/canvas-v2-e2e/codex/media-assets/demo.mp4');
 await expect(page.getByRole('button',{name:'Pause video',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Open North Star panel',exact:true}).click();
 await page.getByLabel('Message North Star').fill('screen video asset');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('The uploaded video is retained, inspected, rendered and playing inside the interactive screen.',{exact:true})).toBeVisible({timeout:90000});
 await expect(page.frameLocator('iframe[title="Retained video playback"]').locator('video')).toHaveAttribute('src',/^data:video\/mp4;base64,/);
});


test('human input interrupts live review without rolling back the new product state',async({page})=>{
 await page.goto('/canvas-v2-e2e/codex');
 await page.getByLabel('Message North Star').fill('screen procedural interrupt');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('Review screen motion…',{exact:true})).toBeVisible({timeout:90000});
 await page.frameLocator('iframe[title="Interactive motion study"]').getByRole('button',{name:'Close book',exact:true}).click();
 await expect(page.getByText('The live review yielded to your interaction without changing the screen.',{exact:true})).toBeVisible({timeout:90000});
 await expect(page.frameLocator('iframe[title="Interactive motion study"]').getByText('0% open',{exact:true})).toBeVisible();
});


test('procedural motion chooses live review automatically and leaves the screen usable',async({page})=>{
 await page.goto('/canvas-v2-e2e/codex');
 await page.getByLabel('Message North Star').fill('screen procedural auto');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('Verified automatic live review; the animated screen is ready to use.',{exact:true})).toBeVisible({timeout:60000});
 const screen=page.frameLocator('iframe[title="Interactive motion study"]');
 await expect(screen.getByText('100% open',{exact:true})).toBeVisible();
 await screen.getByRole('button',{name:'Close book',exact:true}).click();
 await expect(screen.getByText('0% open',{exact:true})).toBeVisible();
});
