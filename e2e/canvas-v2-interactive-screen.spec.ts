import { expect, test } from '@playwright/test';

test('the agent creates, tests, captures and revises one native screen without seizing the camera', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/canvas-v2-e2e/codex');
  const scene = page.getByTestId('canvas-v2-native-scene');
  const send = async (message: string) => {
    await page.getByLabel('Message North Star').fill(message);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
  };
  const before = await scene.evaluate(el => el.parentElement?.style.transform);
  await send('screen parity');
  await expect(page.getByText('Created and visually reviewed the screen, including a working mock application.', { exact: true })).toBeVisible({ timeout: 90000 });
  const object = scene.locator('[data-canvas-v2-screen]');
  await expect(object).toHaveCount(1);
  expect(await scene.evaluate(el => el.parentElement?.style.transform)).toBe(before);
  const geometry = await object.getAttribute('style');
  await send('screen revision');
  await expect(page.getByText('Revised the headline and verified the working mock application.', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(object).toHaveCount(1);
  expect(await object.getAttribute('style')).toBe(geometry);
  const frame = page.frameLocator('iframe[title="GRAET · next team"]');
  await expect(frame.getByRole('heading', { name: 'Your next opportunity.' })).toBeVisible();
  await expect(frame.getByText('Application prepared for Jordan Smith', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show on canvas', exact: true }).click();
  const selectEdge = async () => {
    const bounds = await object.boundingBox();
    if (!bounds) throw new Error('Screen is not visible');
    await page.mouse.click(bounds.x - 3, bounds.y + bounds.height / 2);
  };
  await selectEdge();
  await page.getByRole('button', { name: 'Review screen quality' }).click();
  const review = page.getByRole('dialog', { name: 'Screen quality review' });
  await expect(review.getByAltText('Current interactive screen review')).toBeVisible();
  await expect(review.getByText('Runtime errors: 0')).toBeVisible();
  await review.getByRole('button', { name: 'Close screen review' }).click();
  await expect(page.getByRole('button', { name: 'Interact with screen' })).toHaveCount(0);
  await frame.getByRole('textbox', { name: 'Your name', exact: true }).fill('Casey Brooks');
  await frame.getByRole('textbox', { name: 'Your name', exact: true }).press('Enter');
  await expect(frame.getByText('Application prepared for Casey Brooks', { exact: true })).toBeVisible();
  await frame.getByRole('button', { name: 'Back to teams' }).click();
  await frame.getByRole('button', { name: 'Save team' }).click();
  await expect(frame.getByRole('button', { name: 'Saved', exact: true }).first()).toBeVisible();
  await frame.getByRole('button', { name: 'Saved', exact: true }).first().press('Escape');
  await selectEdge();
  await page.getByRole('button', { name: 'Reset screen' }).click();
  await expect(frame.getByRole('button', { name: 'Save team' })).toBeVisible();
});

test('private product journeys exercise rapid actions, saved values and both motion preferences without resetting live user state',async({page})=>{
 await page.goto('/canvas-v2-e2e/codex');
 await page.getByRole('textbox',{name:'Message North Star'}).fill('screen journey');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('Verified rapid reversals, save/reopen continuity and both motion preferences in private copies. The live user goal is unchanged.',{exact:true})).toBeVisible({timeout:30000});
 const frame=page.frameLocator('iframe[title="Product journey checks"]');
 await expect(frame.getByText('User live goal',{exact:true})).toBeVisible();
 await expect(frame.getByText('Twelve goals',{exact:true})).toHaveCount(0);
 await expect(page.locator('iframe[title="Private product journey check"]')).toHaveCount(0);
});

test('registered preview review waits for Career home and retains actual reference pixels for faithful variants',async({page})=>{
 await page.goto('/canvas-v2-e2e/codex');
 await page.getByRole('textbox',{name:'Message North Star'}).fill('screen preview reference');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('Verified current light preview pixels, reusable reference assets and automatic faithful lineage. The private default-state check distinguishes a wrong dark appearance.',{exact:true})).toBeVisible({timeout:30000});
 const frames=page.locator('[data-northstar-device-frame="ios"]');
 await expect(frames).toHaveCount(2);
 for(const frame of await frames.all()) await expect(frame).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 const original=page.frameLocator('iframe[title="GRAET · interactive simulation"]');
 await expect(original.getByRole('button',{name:'Add season goal',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Interact with screen'})).toHaveCount(0);
});
