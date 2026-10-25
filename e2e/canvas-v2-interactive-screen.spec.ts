import path from 'node:path';
import { expect, test } from '@playwright/test';

test.beforeEach(async({request})=>{const response=await request.post('/canvas-v2-e2e/codex/agent',{data:{op:'reset-fixture'}});expect(response.ok()).toBe(true);});

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
  await page.getByRole('button', { name: 'Show latest work on canvas', exact: true }).click();
  const collapse=page.getByRole('button',{name:'Collapse North Star panel',exact:true});if(await collapse.isVisible())await collapse.click();
  await expect(page.getByRole('button', { name: 'Interact with screen' })).toHaveCount(0);
  await frame.getByRole('textbox', { name: 'Your name', exact: true }).fill('Casey Brooks');
  await frame.getByRole('textbox', { name: 'Your name', exact: true }).press('Enter');
  await expect(frame.getByText('Application prepared for Casey Brooks', { exact: true })).toBeVisible();
  await frame.getByRole('button', { name: 'Back to teams' }).click();
  await frame.getByRole('button', { name: 'Save team' }).click();
  await expect(frame.getByRole('button', { name: 'Saved', exact: true }).first()).toBeVisible();
  await page.getByRole('button',{name:'Design view',exact:true}).click();
  await scene.getByText('GRAET · next team',{exact:true}).click();
  await expect(page.getByRole('tree',{name:'Editable layers'})).toBeVisible();
  await page.getByRole('button',{name:'Design view',exact:true}).click();
  await expect(frame.getByRole('button',{name:'Saved',exact:true}).first()).toBeVisible();
});

test('private product journeys exercise rapid actions, saved values and both motion preferences without resetting live user state',async({page})=>{
 const automaticPreparations: Array<{preparation:string}> = [];
 let explicitPlanResults=0;
 const preservation: Array<{operation?:string;canvasPreservation?:{basis?:string;htmlOutsideTargetScreenPayloads?:boolean;canvasStylesheet?:boolean}}> = [];
 page.on('request',request=>{
  if(!request.url().includes('/canvas-v2-e2e/codex/agent')||request.method()!=='POST')return;
  try{
   const body=request.postDataJSON();if(body.op!=='result')return;
   if(String(body.callId).endsWith(':canvas_plan_screen'))explicitPlanResults++;
   for(const part of Array.isArray(body.output)?body.output:[]){
    if(part.type!=='input_text')continue;
    try{const value=JSON.parse(part.text);if(Array.isArray(value.sourceChangeReceipts))preservation.push(...value.sourceChangeReceipts);if(value.preparation==='measured-copy-refinement')automaticPreparations.push(value);}catch{/* Other tool text is not receipt metadata. */}
   }
  }catch{/* Non-JSON requests do not carry edit receipts. */}
 });
 await page.goto('/canvas-v2-e2e/codex');
 await page.getByRole('textbox',{name:'Message North Star'}).fill('screen journey');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText('Verified rapid reversals, save/reopen continuity and both motion preferences in private copies. The live user goal is unchanged.',{exact:true})).toBeVisible({timeout:60000});
 const frame=page.frameLocator('iframe[title="Product journey checks"]');
 await expect(frame.getByText('User live goal',{exact:true})).toBeVisible();
 await expect(frame.getByText('Twelve goals',{exact:true})).toHaveCount(0);
 await expect(page.locator('iframe[title="Private product journey check"]')).toHaveCount(0);
 await expect(frame.getByRole('heading',{name:'Your next season',exact:true})).toBeVisible();
 expect(automaticPreparations).toHaveLength(1);
 expect(explicitPlanResults).toBe(2); // Creation and CSS refinement; copy preparation is inside the editor.
 const refinements=preservation.filter(receipt=>receipt.operation==='refine');
 expect(refinements.length).toBeGreaterThan(0);
 for(const receipt of refinements){
  expect(receipt.canvasPreservation?.basis).toBe('exact-saved-canvas-comparison');
  expect(receipt.canvasPreservation?.htmlOutsideTargetScreenPayloads).toBe(true);
  expect(receipt.canvasPreservation?.canvasStylesheet).toBe(true);
 }
});

for(const emptyInitialPreview of [false,true])test('registered preview '+(emptyInitialPreview?'recovers an empty initial document and ':'')+'review waits for Career home and retains actual reference pixels for faithful variants',async({page})=>{
 test.setTimeout(90000);
 let previewRequests=0;
 if(emptyInitialPreview)await page.route('**/canvas-v2-e2e/graet-preview',async route=>{
  previewRequests++;if(previewRequests===1)await route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});else await route.continue();
 });
 // Freeze development hot reload in this fixed-source browser check. Lazy
 // iframe-route compilation must not reload and erase the temporary workspace.
 // Actual route/build failures and browser errors still fail the test.
 await page.routeWebSocket('**/_next/webpack-hmr*',socket=>{
  const server=socket.connectToServer();
  server.onMessage(()=>{});
 });
 // The unauthenticated local fixture uses the exact bundled font bytes.
 // Production loads these same assets with the user's authenticated session.
 await page.route('**/graet-replica/fonts/MonaSans-*.ttf',async route=>{const name=path.basename(new URL(route.request().url()).pathname);await route.fulfill({path:path.join(process.cwd(),'public/graet-replica/fonts',name),contentType:'font/ttf'});});
 await page.goto('/canvas-v2-e2e/codex');
 await expect(page.getByTestId('canvas-v2-native-scene')).toHaveCount(1);
 const originalTimeOrigin=await page.evaluate(()=>performance.timeOrigin);
 await page.getByRole('textbox',{name:'Message North Star'}).fill('screen preview reference');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByText(/Copied the genuine Career implementation|Source reuse check failed:/)).toBeVisible({timeout:60000});
 expect(await page.evaluate(()=>performance.timeOrigin)).toBe(originalTimeOrigin);
 if(emptyInitialPreview)expect(previewRequests).toBe(2);
 await expect(page.getByRole('status',{name:'Loading app preview',exact:true})).toHaveCount(0);
 await expect(page.getByText('Copied the genuine Career implementation with its original assets and typography, then added and tested the goal editor without redesigning the screen. This fixture checks source reuse and behavior; visual fidelity still needs comparison with the reference.',{exact:true})).toBeVisible({timeout:60000});
 const frames=page.locator('[data-northstar-device-frame="ios"]');
 await expect(frames).toHaveCount(2);
 for(const frame of await frames.all()) await expect(frame).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 const original=page.frameLocator('iframe[title="GRAET · interactive simulation"]');
 await expect(original.getByRole('button',{name:'Add season goal',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Interact with screen'})).toHaveCount(0);
});

test('a stalled registered preview offers Retry and restores the same saved object without History',async({page})=>{
 test.setTimeout(60000);
 await page.routeWebSocket('**/_next/webpack-hmr*',socket=>{const server=socket.connectToServer();server.onMessage(()=>{});});
 let permitPreview=false,requests=0;
 await page.route('**/canvas-v2-e2e/graet-preview',async route=>{requests++;if(permitPreview)await route.continue();else await route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});});
 await page.route('**/graet-replica/fonts/MonaSans-*.ttf',async route=>{const name=path.basename(new URL(route.request().url()).pathname);await route.fulfill({path:path.join(process.cwd(),'public/graet-replica/fonts',name),contentType:'font/ttf'});});
 await page.goto('/canvas-v2-e2e/codex');
 await page.getByRole('textbox',{name:'Message North Star'}).fill('screen preview reference');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 const object=page.locator('[data-canvas-v2-screen]');await expect(object).toHaveCount(1);
 const before=await object.getAttribute('data-canvas-v2-screen');
 await expect(page.getByRole('status',{name:'Loading app preview',exact:true})).toBeVisible();
 await expect(page.getByText('This app preview did not finish loading. Retry to reconnect it.',{exact:true})).toBeVisible({timeout:20000});
 expect(requests).toBe(2);permitPreview=true;
 await page.getByRole('button',{name:'Retry preview',exact:true}).click();
 await expect(page.frameLocator('iframe[title="GRAET · interactive simulation"]').getByRole('button',{name:'Add season goal',exact:true})).toBeVisible();
 await expect(page.getByRole('status',{name:'Loading app preview',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Retry preview',exact:true})).toHaveCount(0);
 await expect(object).toHaveAttribute('data-canvas-v2-screen',before!);expect(requests).toBe(3);
});
