import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import { clickScreen as pointerScreen, screenPoint } from './canvas-v2-screen-input-helpers';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/canvas-v2-e2e/codex/agent', { data: { op: 'reset-fixture' } });
  expect(response.ok()).toBe(true);
});

async function preview(page: Page) {
  const mode=page.getByRole('button',{name:'Design view',exact:true});
  if(await mode.getAttribute('aria-pressed')==='true')await mode.click();
  await expect(mode).toHaveAttribute('aria-pressed','false');
}

async function clickScreen(page: Page, selector: string, options?: {button?:'left'|'right';clickCount?:number}) {
  if(options?.button==='right')await enterEdit(page);
  return pointerScreen(page,selector,options);
}

async function createScreen(page: Page, dependent=false, gradient=false, ordered=false, styled=false, runtime=false, split=false) {
  await page.goto('/canvas-v2-e2e/codex');

  await page.getByRole('button',{name:'assets',exact:true}).click();
  await page.getByRole('button',{name:'Add project images',exact:true}).click();
  await page.getByLabel('Choose images for the canvas',{exact:true}).setInputFiles(path.resolve('public/northstar/design-references/evidence-canvas.png'));
  await expect(page.getByRole('button',{name:'Preview evidence canvas',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'chat',exact:true}).click();
  await page.getByRole('textbox',{name:'Message North Star'}).fill('screen direct asset'+(dependent?' dependent':'')+(gradient?' gradient':'')+(ordered?' ordered':'')+(styled?' styled':'')+(runtime?' runtime':'')+(split?' split':''));
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByText('The studio screen is ready for direct editing.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Show latest work on canvas',exact:true}).click();
  return page.frameLocator('iframe[title="Fieldnotes · studio editing"]');
}

async function enterEdit(page:Page) {
  const collapse=page.getByRole('button',{name:'Collapse North Star panel',exact:true});
  if(await collapse.isVisible())await collapse.click();
  if(await page.getByRole('button',{name:'Close appearance editor',exact:true}).count())await page.getByRole('button',{name:'Close appearance editor',exact:true}).click();
  const mode=page.getByRole('button',{name:'Design view',exact:true});if(await mode.getAttribute('aria-pressed')!=='true')await mode.click();
  await page.getByTestId('canvas-v2-native-scene').getByText('Fieldnotes · studio editing',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Back to canvas',exact:true})).toBeVisible();
}

// Design owns its rails even with no selection; the bottom tools belong to the
// canvas in both modes. A focused app is only one possible rail contents.
test('canvas modes retain rails without a selection and keep creation tools in Preview',async({page})=>{
  await page.setViewportSize({width:1512,height:900});
  await page.goto('/canvas-v2-e2e/codex');
  const mode=page.getByRole('button',{name:'Design view',exact:true});
  const left=page.getByRole('complementary',{name:'Object layers',exact:true});
  const right=page.getByRole('complementary',{name:'Design properties',exact:true});
  const tools=page.locator('[aria-label="Canvas tools"]');
  const fullTools=async()=>{
    await expect(tools).toBeVisible();
    for(const name of ['Select','Pan','Draw freehand','Create Shape · drag to place','Upload image, GIF, or video'])await expect(tools.getByRole('button',{name,exact:true})).toBeVisible();
  };
  await expect(mode).toHaveAttribute('aria-pressed','false');
  await expect(left).toHaveCount(0);await expect(right).toHaveCount(0);await fullTools();
  await page.getByRole('button',{name:'Collapse North Star panel',exact:true}).click();
  await mode.click();
  await expect(left).toBeVisible();await expect(right).toBeVisible();await expect(right).toContainText('Choose an object');await fullTools();
  await page.getByRole('region',{name:'Canvas workspace',exact:true}).click({position:{x:700,y:350}});
  await expect(left).toBeVisible();await expect(right).toBeVisible();
  await mode.click();await expect(left).toHaveCount(0);await expect(right).toHaveCount(0);await fullTools();
  await tools.getByRole('button',{name:'Select',exact:true}).click();
  await expect(mode).toHaveAttribute('aria-pressed','true');await expect(left).toBeVisible();await expect(right).toBeVisible();
  await mode.click();await tools.getByRole('button',{name:'Create Shape · drag to place',exact:true}).click();
  await expect(mode).toHaveAttribute('aria-pressed','true');await expect(left).toBeVisible();await expect(right).toBeVisible();await fullTools();
});

test('Design chat leaves the bottom tools reachable at a narrow desktop width',async({page})=>{
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/canvas-v2-e2e/codex');
  await page.getByRole('button',{name:'Design view',exact:true}).click();
  await page.getByRole('button',{name:'Open North Star panel',exact:true}).click();
  const panel=page.getByTestId('canvas-v2-floating-panel'),tools=page.locator('[aria-label="Canvas tools"]');
  await expect(panel).toBeVisible();
  const chatBounds=await panel.boundingBox(),toolBounds=await tools.boundingBox();
  expect(toolBounds!.x).toBeGreaterThanOrEqual(chatBounds!.x+chatBounds!.width+10);
  for(const name of ['Undo canvas action','Redo canvas action','Select','Pan']){
    const button=tools.getByRole('button',{name,exact:true});
    expect(await button.evaluate(element=>{
      const rect=element.getBoundingClientRect(),top=element.ownerDocument.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return Boolean(top&&element.contains(top));
    })).toBe(true);
  }
  await tools.getByRole('button',{name:'Pan',exact:true}).click();
  await expect(tools.getByRole('button',{name:'Pan',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('app selection, Back and three mode roundtrips preserve rails, full tools and live app state',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:900});
  const frame=await createScreen(page);
  await page.getByRole('button',{name:'Collapse North Star panel',exact:true}).click();
  const mode=page.getByRole('button',{name:'Design view',exact:true});
  const left=page.getByRole('complementary',{name:'Object layers',exact:true});
  const right=page.getByRole('complementary',{name:'Design properties',exact:true});
  const tools=page.locator('[aria-label="Canvas tools"]');
  const caption=page.getByTestId('canvas-v2-native-scene').getByText('Fieldnotes · studio editing',{exact:true});
  await frame.locator('#name').fill('Rail-contract retained draft');await clickScreen(page,'#save');
  await expect(frame.locator('#status')).toHaveText('Saved 1 · Rail-contract retained draft');
  await mode.click();await expect(left).toBeVisible();await expect(right).toBeVisible();
  await caption.click();await expect(page.getByRole('button',{name:'Back to canvas',exact:true})).toBeVisible();
  await page.getByRole('treeitem',{name:'Select layer A little space for your ideas.',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Text size',exact:true}).fill('36');await mode.click();
  await expect(frame.locator('h1')).toHaveCSS('font-size','36px');
  const hero=await screenPoint(page,'#hero');
  await page.mouse.move(hero.x,hero.y);await page.mouse.wheel(0,900);
  await expect.poll(()=>frame.locator('#feed').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  const baseline={box:await page.locator('iframe[title="Fieldnotes · studio editing"]').boundingBox(),scroll:await frame.locator('#feed').evaluate(el=>el.scrollTop)};
  for(let cycle=0;cycle<3;cycle++){
    await mode.click();await expect(left).toBeVisible();
    // Returning with an active layer shows its real appearance editor.
    await expect(page.getByRole('button',{name:'Close appearance editor',exact:true}).or(right)).toBeVisible();
    await expect(tools.getByRole('button',{name:'Create Shape · drag to place',exact:true})).toBeVisible();
    await mode.click();await expect(left).toHaveCount(0);await expect(right).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Close appearance editor',exact:true})).toHaveCount(0);
    await expect(tools.getByRole('button',{name:'Draw freehand',exact:true})).toBeVisible();
    expect(await page.locator('iframe[title="Fieldnotes · studio editing"]').boundingBox()).toEqual(baseline.box);
    expect(await frame.locator('#feed').evaluate(el=>el.scrollTop)).toBe(baseline.scroll);
    await expect(frame.locator('#name')).toHaveValue('Rail-contract retained draft');await expect(frame.locator('#status')).toHaveText('Saved 1 · Rail-contract retained draft');
  }
  await clickScreen(page,'#chapter-6 h2',{button:'right'});await page.getByRole('menuitem',{name:'Edit design',exact:true}).click();
  await expect(mode).toHaveAttribute('aria-pressed','true');await expect(left).toBeVisible();
  await page.getByRole('button',{name:'Back to canvas',exact:true}).click();
  await expect(mode).toHaveAttribute('aria-pressed','true');await expect(left).toBeVisible();await expect(right).toBeVisible();await expect(right).toContainText('Choose an object');
  await page.getByRole('region',{name:'Canvas workspace',exact:true}).click({position:{x:1000,y:500}});
  await expect(left).toBeVisible();await expect(right).toBeVisible();await expect(tools.getByRole('button',{name:'Draw freehand',exact:true})).toBeVisible();
});

test('direct text and section edits preserve native app behavior, history and chat continuity',async({page},testInfo)=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:900});
  await page.addInitScript(() => {
    const trace: unknown[] = [];
    (window as typeof window & { editTrace?: unknown[] }).editTrace=trace;
    window.addEventListener('northstar-screen-direct-edit',event=>{
      const detail=(event as CustomEvent).detail;
      trace.push({action:detail.action,text:detail.text,html:detail.html,styles:detail.styles});
    });
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const frame=await createScreen(page),scene=page.getByTestId('canvas-v2-native-scene'),screen=scene.locator('[data-canvas-v2-screen]');
  const geometry=await screen.getAttribute('style'),boot=await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot);
  expect(typeof boot).toBe('number');
  const originalTitle='A little space for your ideas.',editedTitle="A studio <that's yours> ✨";
  await frame.getByRole('textbox',{name:'Your notebook'}).fill('My everyday notes');await clickScreen(page,'#save');
  await expect(frame.locator('#status')).toHaveText('Saved 1 · My everyday notes');
  await enterEdit(page);await clickScreen(page,'h1',{clickCount:2});
  await expect(page.getByRole('textbox',{name:'Screen text',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Screen text',exact:true})).toHaveText(originalTitle);
  await page.getByRole('textbox',{name:'Screen text',exact:true}).fill(editedTitle);
  await page.getByRole('textbox',{name:'Screen text',exact:true}).press('Enter');
  await expect(frame.getByRole('heading',{name:editedTitle})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Screen text',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect(frame.getByRole('heading',{name:originalTitle})).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(()=>(window as typeof window & { editTrace?: unknown[] }).editTrace)).toHaveLength(1);
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();await expect(frame.getByRole('heading',{name:editedTitle})).toBeVisible();
  const revision=await page.getByTestId('canvas-v2-committed-revision').textContent();
  await enterEdit(page);await clickScreen(page,'h1',{clickCount:2});
  await page.getByRole('textbox',{name:'Screen text',exact:true}).press('ControlOrMeta+A');
  await page.getByRole('textbox',{name:'Screen text',exact:true}).press('Backspace');
  await page.getByRole('textbox',{name:'Screen text',exact:true}).fill('A fresh human edit');
  await page.getByRole('textbox',{name:'Screen text',exact:true}).press('Escape');
  await expect(frame.getByRole('heading',{name:'A fresh human edit'})).toBeVisible();
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).not.toBe(revision);
  await enterEdit(page);await clickScreen(page,'h1',{clickCount:2});
  await page.getByRole('textbox',{name:'Screen text',exact:true}).fill('Room for your next chapter.');
  await clickScreen(page,'#name');
  await expect(frame.getByRole('heading',{name:'Room for your next chapter.'})).toBeVisible();
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect(frame.getByRole('heading',{name:'A fresh human edit'})).toBeVisible();
  await clickScreen(page,'#name',{clickCount:2});await expect(page.getByRole('textbox',{name:'Screen text',exact:true})).toHaveCount(0);
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · My everyday notes');
  await clickScreen(page,'#chapter-1 h2',{button:'right'});
  await page.getByRole('menuitem',{name:'Remove section',exact:true}).click();
  await expect(frame.locator('#chapter-1')).toHaveCount(0);await expect(frame.locator('#chapter-2')).toHaveCount(1);
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();await expect(frame.locator('#chapter-1')).toHaveCount(1);
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();await expect(frame.locator('#chapter-1')).toHaveCount(0);
  await expect(frame.getByRole('textbox',{name:'Your notebook'})).toHaveValue('My everyday notes');
  expect(await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot)).toBe(boot);
  expect(await screen.getAttribute('style')).toBe(geometry);await expect(scene.locator('img')).toHaveCount(0);
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 3 · My everyday notes');
  // Select the owning screen for the normal subsequent agent edit.
  await enterEdit(page);
  if(await page.getByRole('button',{name:'Open North Star panel',exact:true}).isVisible())await page.getByRole('button',{name:'Open North Star panel',exact:true}).click();
  await page.getByRole('textbox',{name:'Message North Star'}).fill('screen direct asset followup');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByText('Refined the title while preserving the direct image edit.',{exact:true})).toBeVisible();
  await expect(frame.getByRole('heading',{name:'Make room for your next idea.'})).toBeVisible();await expect(frame.locator('#chapter-1')).toHaveCount(0);
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 4 · My everyday notes');
  expect(errors).toEqual([]);
  const openChat=page.getByRole('button',{name:'Open North Star panel',exact:true});if(await openChat.isVisible())await openChat.click();
  await page.getByRole('button',{name:'assets',exact:true}).click();
  const screenshot=testInfo.outputPath('text-and-section-editing.png');
  await page.screenshot({path:screenshot});
  await testInfo.attach('Direct studio editing',{path:screenshot,contentType:'image/png'});
});

test('an order-dependent section prepares a code change and leaves the working app intact',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1512,height:1000});
  const frame=await createScreen(page,false,false,true);
  const before=await page.getByTestId('canvas-v2-committed-revision').textContent();
  const original=await frame.locator('article').evaluateAll(nodes=>nodes.map(node=>({id:node.id,sequence:(node as HTMLElement).dataset.sequence})));
  await clickScreen(page,'#chapter-2 h2',{button:'right'});
  await page.getByRole('menuitem',{name:'Move section',exact:true}).hover();
  await page.getByRole('menuitem',{name:'Up with Northstar',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue('Move the tagged section up by one section and keep its interactions working.');
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(before);
  expect(await frame.locator('article').evaluateAll(nodes=>nodes.map(node=>({id:node.id,sequence:(node as HTMLElement).dataset.sequence})))).toEqual(original);
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 1 · Morning pages');
});

test('removing a section with app dependencies prepares a targeted code edit instead of breaking the app',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1512,height:1000});
  const frame=await createScreen(page,true);
  await clickScreen(page,'#note-count',{button:'right'});
  await expect(page.getByRole('menuitem',{name:'Edit with Northstar',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await preview(page);await clickScreen(page,'#add-note');await expect(frame.locator('#note-count')).toHaveText('Notes 1');
  const before=await page.getByTestId('canvas-v2-committed-revision').textContent();
  await clickScreen(page,'#notes h2',{button:'right'});await page.getByRole('menuitem',{name:'Remove with Northstar',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue('Remove the tagged section and update any app behavior that depends on it. Keep the rest of this screen intact.');
  await expect(frame.locator('#notes')).toHaveCount(1);expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(before);
  await preview(page);await clickScreen(page,'#add-note');await expect(frame.locator('#note-count')).toHaveText('Notes 2');
  await expect(page.getByRole('alert')).not.toContainText('This section needs its interactions');
  await clickScreen(page,'#note-count',{button:'right'});
  await page.getByRole('menuitem',{name:'Edit with Northstar',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue(/Change the tagged text to:/);
  await expect(frame.locator('#note-count')).toHaveText('Notes 2');
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(before);

});


test('a gradient heading stays readable while editing and retains the original typography and effect',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1512,height:900});
  const frame=await createScreen(page,false,true);
  const before=await frame.locator('h1').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundImage,transform:s.textTransform,variant:s.fontVariant,font:s.fontFamily}});
  await enterEdit(page);await clickScreen(page,'h1',{clickCount:2});
  const input=page.getByRole('textbox',{name:'Screen text',exact:true});await expect(input).toBeVisible();
  const editing=await input.evaluate(el=>{const s=getComputedStyle(el);return {color:s.color,caret:s.caretColor,transform:s.textTransform,variant:s.fontVariant,font:s.fontFamily}});
  expect(editing.color).not.toBe('rgba(0, 0, 0, 0)');expect(editing.caret).toBe(editing.color);
  expect(editing.transform).toBe(before.transform);expect(editing.variant).toBe(before.variant);expect(editing.font).toBe(before.font);
  await input.fill('Room for a beautiful idea.');await input.press('Enter');
  await expect(frame.locator('h1')).toHaveText('Room for a beautiful idea.');
  const after=await frame.locator('h1').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundImage,transform:s.textTransform,variant:s.fontVariant,font:s.fontFamily}});
  expect(after).toEqual(before);
});

test('sections rearrange and new sections enter the chosen layout without restarting the app',async({page},testInfo)=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const frame=await createScreen(page);
  const boot=await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot);
  expect(typeof boot).toBe('number');
  await frame.locator('#name').fill('A real working notebook');await clickScreen(page,'#save');
  await expect(frame.locator('#status')).toHaveText('Saved 1 · A real working notebook');
  const original=await frame.locator('article').evaluateAll(nodes=>nodes.map(node=>node.id));
  const style=await frame.locator('#chapter-2').evaluate(el=>{const s=getComputedStyle(el);return {padding:s.padding,border:s.borderTop,color:s.color,font:s.fontFamily}});
  await clickScreen(page,'#chapter-2 h2',{button:'right'});
  await page.getByRole('menuitem',{name:'Move section',exact:true}).hover();
  await page.getByRole('menuitem',{name:'Up',exact:true}).click();
  await expect.poll(()=>frame.locator('article').evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(['chapter-2','chapter-1',...original.slice(2)]);
  expect(await frame.locator('#chapter-2').evaluate(el=>{const s=getComputedStyle(el);return {padding:s.padding,border:s.borderTop,color:s.color,font:s.fontFamily}})).toEqual(style);
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect.poll(()=>frame.locator('article').evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(original);
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();
  await expect.poll(()=>frame.locator('article').evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(['chapter-2','chapter-1',...original.slice(2)]);
  await clickScreen(page,'#chapter-2 h2',{button:'right'});
  await page.getByRole('menuitem',{name:'Move section',exact:true}).hover();
  await expect(page.getByRole('menuitem',{name:'Up',exact:true})).toHaveCount(0);
  await page.getByRole('menuitem',{name:'Down',exact:true}).click();
  await expect.poll(()=>frame.locator('article').evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(original);
  await clickScreen(page,'#chapter-2 h2',{button:'right'});
  await page.getByRole('menuitem',{name:'Add section below',exact:true}).click();
  const draft=page.getByRole('textbox',{name:'Message North Star'});
  await expect(draft).toHaveValue('Add a new section below the tagged section, in this app’s design language. The new section should: ');
  await expect(frame.locator('#new-chapter')).toHaveCount(0);
  await draft.fill((await draft.inputValue())+'give me space for a new direction.');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByText('Added a chapter in the chosen place.',{exact:true})).toBeVisible();
  await expect(frame.locator('#new-chapter')).toHaveCount(1);
  await expect.poll(()=>frame.locator('article').evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(['chapter-1','chapter-2','new-chapter',...original.slice(2)]);
  expect(await frame.locator('#new-chapter').evaluate(el=>{const s=getComputedStyle(el);return {padding:s.padding,border:s.borderTop,color:s.color,font:s.fontFamily}})).toEqual(style);
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();await expect(frame.locator('#new-chapter')).toHaveCount(0);
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();await expect(frame.locator('#new-chapter')).toHaveCount(1);
  await expect(frame.locator('#name')).toHaveValue('A real working notebook');
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · A real working notebook');
  expect(await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot)).toBe(boot);
  expect(errors).toEqual([]);
  await clickScreen(page,'#chapter-2 h2',{button:'right'});
  const screenshot=testInfo.outputPath('section-arrangement.png');await page.screenshot({path:screenshot});
  await testInfo.attach('Section editing',{path:screenshot,contentType:'image/png'});
});

test('section insertion keeps an existing draft and gives Northstar the precise place',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1512,height:1000});
  const frame=await createScreen(page,true),draft=page.getByRole('textbox',{name:'Message North Star'});
  // Retain an unrelated tagged component as context. The newly chosen section
  // must remain the unique insertion anchor rather than the first tag in a list.
  await clickScreen(page,'#note-count',{button:'right'});await page.getByRole('menuitem',{name:'Edit with Northstar',exact:true}).click();
  await draft.fill('Keep the notebook calm and readable.');
  await clickScreen(page,'#chapter-2 h2',{button:'right'});await page.getByRole('menuitem',{name:'Add section above',exact:true}).click();
  await expect(draft).toHaveValue('Keep the notebook calm and readable.\n\nAdd a new section above the tagged section, in this app’s design language. The new section should: ');
  await draft.fill((await draft.inputValue())+'make space for a new chapter.');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByText('Added a chapter in the chosen place.',{exact:true})).toBeVisible();
  await expect(frame.locator('#new-chapter')).toHaveCount(1);
  expect(await frame.locator('article').evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(['chapter-1','new-chapter','chapter-2','chapter-3','chapter-4','chapter-5','chapter-6','chapter-7','chapter-8']);
  await preview(page);await clickScreen(page,'#add-note');await expect(frame.locator('#note-count')).toHaveText('Notes 1');
});

test('automatic appearance edits preserve working controls through history and later chat edits',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
  const frame=await createScreen(page);
  await frame.locator('#name').fill('My working prototype');await clickScreen(page,'#save');
  await expect(frame.locator('#status')).toHaveText('Saved 1 · My working prototype');
  await enterEdit(page);await clickScreen(page,'#save');

  await page.getByRole('textbox',{name:'Background colour',exact:true}).fill('#3149aa');
  await expect(frame.locator('#save')).toHaveCSS('background-color','rgb(49, 73, 170)');
  await page.getByRole('spinbutton',{name:'Corner radius',exact:true}).fill('24');
  await expect(frame.locator('#save')).toHaveCSS('border-radius','24px');
  await expect(page.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect(frame.locator('#save')).toHaveCSS('border-radius','12px');
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();
  await expect(frame.locator('#save')).toHaveCSS('border-radius','24px');
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · My working prototype');
  await enterEdit(page);await clickScreen(page,'h1');
  const revision=await page.getByTestId('canvas-v2-committed-revision').textContent();

  await page.getByRole('textbox',{name:'Background colour',exact:true}).fill('not-a-colour');
  await expect(page.getByRole('alert').filter({hasText:'Choose a valid background color.'})).toBeVisible();
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
  await page.getByRole('textbox',{name:'Background colour',exact:true}).fill('transparent');
  await expect(page.getByRole('alert').filter({hasText:'Choose a valid background color.'})).toHaveCount(0);

  await page.getByRole('spinbutton',{name:'Text size',exact:true}).fill('42');
  await expect(frame.locator('h1')).toHaveCSS('font-size','42px');
  await page.getByRole('button',{name:'Close appearance editor',exact:true}).click();
  if(await page.getByRole('button',{name:'Open North Star panel',exact:true}).isVisible())await page.getByRole('button',{name:'Open North Star panel',exact:true}).click();
  await page.getByRole('textbox',{name:'Message North Star'}).fill('screen direct asset followup');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(frame.getByRole('heading',{name:'Make room for your next idea.'})).toBeVisible();
  await expect(frame.locator('h1')).toHaveCSS('font-size','42px');
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 3 · My working prototype');
});


test('code-controlled appearance prepares a targeted edit without changing source or breaking the control',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1512,height:900});
  const frame=await createScreen(page,false,false,false,true);
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 1 · Morning pages');
  const revision=await page.getByTestId('canvas-v2-committed-revision').textContent();
  await clickScreen(page,'#save',{button:'right'});
  await page.getByRole('menuitem',{name:'Style with Northstar',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Appearance',exact:true})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue(/Change the appearance of the tagged element and update any app code/);
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · Morning pages');
  await expect.poll(()=>frame.locator('#save').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(86, 98, 74)');
});


test('edit inspector changes the actual selected element and preserves preview state',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:900});
  const frame=await createScreen(page);
  await frame.getByRole('textbox',{name:'Your notebook'}).fill('A real studio');
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 1 · A real studio');
  await enterEdit(page);await clickScreen(page,'#save');
  await expect(page.getByRole('textbox',{name:'Element text',exact:true})).toHaveValue('Save notebook');
  await expect(frame.locator('#status')).toHaveText('Saved 1 · A real studio');
  await page.getByRole('button',{name:'Close appearance editor',exact:true}).click();
  await clickScreen(page,'h1');
  await page.getByRole('textbox',{name:'Element text',exact:true}).fill('Room for your next idea.');
  await expect(frame.locator('h1')).toHaveText('Room for your next idea.');
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect(frame.locator('h1')).toHaveText('A little space for your ideas.');
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();
  await expect(frame.locator('h1')).toHaveText('Room for your next idea.');
  await page.getByRole('button',{name:'Font family',exact:true}).click();await page.getByRole('menuitemradio',{name:'Georgia',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Text size',exact:true}).fill('38');
  await page.getByRole('textbox',{name:'Text colour',exact:true}).fill('#763F2B');
  await expect(page.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0);
  await expect(frame.locator('h1')).toHaveText('Room for your next idea.');
  await expect(frame.locator('h1')).toHaveCSS('font-family','Georgia, serif');
  await expect(frame.locator('h1')).toHaveCSS('font-size','38px');
  await expect(frame.locator('h1')).toHaveCSS('color','rgb(118, 63, 43)');
  await page.getByRole('button',{name:'Move selected element',exact:true}).press('Shift+ArrowRight');
  await expect(frame.locator('h1')).toHaveCSS('translate','10px');
  const bounds=await page.getByRole('button',{name:'Move selected element',exact:true}).boundingBox();
  expect(bounds).toBeTruthy();
  await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+bounds!.height/2);
  await page.mouse.down();await page.mouse.move(bounds!.x+bounds!.width/2+24,bounds!.y+bounds!.height/2+20,{steps:8});await page.mouse.up();
  await expect.poll(()=>frame.locator('h1').evaluate(el=>parseFloat(getComputedStyle(el).translate))).toBeGreaterThan(10);
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · A real studio');
  await expect(frame.getByRole('textbox',{name:'Your notebook'})).toHaveValue('A real studio');
});


test('inline text ranges retain native formatting, history and working app state',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
  const frame=await createScreen(page);
  await frame.locator('#name').fill('A working studio');await clickScreen(page,'#save');
  await enterEdit(page);await clickScreen(page,'h1',{clickCount:2});
  const text=page.getByRole('textbox',{name:'Screen text',exact:true});
  await expect(text).toBeVisible();
  await text.press('ArrowLeft');
  await text.press('Shift+ArrowRight');await text.press('Shift+ArrowRight');await text.press('Shift+ArrowRight');await text.press('Shift+ArrowRight');
  await page.getByRole('button',{name:'Text range colors',exact:true}).click();
  await page.getByRole('button',{name:'Use Vermilion',exact:true}).click();
  await expect.poll(()=>frame.locator('h1 span').evaluateAll(nodes=>nodes.some(node=>getComputedStyle(node).color==='rgb(255, 79, 46)'))).toBe(true);
  await expect(frame.locator('h1')).toHaveText('A little space for your ideas.');
  await expect(text).toBeVisible();
  await page.getByRole('button',{name:'Finish text editing',exact:true}).click();
  await expect(text).toHaveCount(0);
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect(frame.locator('h1 span')).toHaveCount(0);
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();
  await expect(frame.locator('h1 span')).not.toHaveCount(0);
  await clickScreen(page,'h1',{clickCount:2});await expect(text).toBeVisible();
  // Reopening intentionally selects the wording. Collapse it to its end
  // with the native arrow key before appending (Cmd+End is not portable).
  await text.press('ArrowRight');
  expect(await text.evaluate(()=>window.getSelection()?.isCollapsed)).toBe(true);
  await text.pressSequentially(' Together.');
  await expect(frame.locator('h1')).toHaveText('A little space for your ideas. Together.');
  await expect(frame.locator('h1 span')).not.toHaveCount(0);
  await page.getByRole('button',{name:'Finish text editing',exact:true}).click();
  await preview(page);await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · A working studio');
});


test('scrolling an app keeps element selection, inspector and canvas camera stable',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:900});
  const frame=await createScreen(page);await enterEdit(page);await clickScreen(page,'h1');
  const editor=await page.getByRole('textbox',{name:'Element text',exact:true}).elementHandle();
  const before=await page.locator('iframe').boundingBox(),revision=await page.getByTestId('canvas-v2-committed-revision').textContent();
  await page.mouse.move(before!.x+before!.width/2,before!.y+before!.height*0.6);
  for(let i=0;i<5;i++)await page.mouse.wheel(0,80);
  await expect.poll(()=>frame.locator('#feed').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect(await editor!.evaluate(el=>el.isConnected)).toBe(true);
  await expect(page.getByRole('textbox',{name:'Element text',exact:true})).toBeVisible();
  const after=await page.locator('iframe').boundingBox();expect(after!.x).toBeCloseTo(before!.x,1);expect(after!.y).toBeCloseTo(before!.y,1);
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
  for(let i=0;i<8;i++)await page.mouse.wheel(0,-100);
  await expect.poll(()=>frame.locator('#feed').evaluate(el=>el.scrollTop)).toBe(0);
  expect(await editor!.evaluate(el=>el.isConnected)).toBe(true);
  const selected=await page.getByRole('button',{name:'Move selected element',exact:true}).boundingBox();
  const heading=await frame.locator('h1').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y}}),scale=before!.width/390;
  expect(selected!.x).toBeCloseTo(before!.x+heading.x*scale,0);expect(selected!.y).toBeCloseTo(before!.y+heading.y*scale,0);
});

test('runtime-created controls and native overlays in captured regions support layout edits without restarting their app',async({page},testInfo)=>{
 test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
 const frame=await createScreen(page,false,false,false,false,true);
 await frame.locator('#name').fill('Keep this private draft');await clickScreen(page,'#save');
 const boot=await frame.locator('body').evaluate(()=> (window as typeof window&{studioBoot:number}).studioBoot);
 const object=page.locator('[data-canvas-v2-screen]');
 const before=JSON.parse(Buffer.from((await object.getAttribute('data-canvas-v2-screen'))!,'base64').toString());
 await enterEdit(page);
 const rail=page.getByRole('tree',{name:'Editable layers'});
 await expect(rail.locator('[data-layer-selector="button.runtime-goal"]')).toBeVisible();
 await rail.locator('[data-layer-selector="button.runtime-goal"]').click();
 await expect(page.getByRole('textbox',{name:'Element text',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Move selected element',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Background colour',exact:true}).fill('#3149aa');
 await expect(frame.locator('.runtime-goal')).toHaveCSS('background-color','rgb(49, 73, 170)');
 await expect(page.getByRole('button',{name:'Move selected element',exact:true})).toHaveCSS('cursor','move');
 await page.getByRole('button',{name:'Move selected element',exact:true}).press('Shift+ArrowRight');
 await expect(frame.locator('.runtime-goal')).toHaveCSS('translate','10px');
 await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
 await expect(frame.locator('.runtime-goal')).toHaveCSS('translate','none');
 await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();
 await expect(frame.locator('.runtime-goal')).toHaveCSS('translate','10px');
 const after=JSON.parse(Buffer.from((await object.getAttribute('data-canvas-v2-screen'))!,'base64').toString());
 expect(after.html).toBe(before.html);expect(after.javascript).toBe(before.javascript);
 await rail.locator('[data-layer-selector="#native-caption"]').click();
 await expect(page.getByRole('button',{name:'Ask Northstar about selection',exact:true})).toBeVisible();
 // App-owned copy remains a source-aware edit rather than overwriting its state.
 await expect(frame.locator('#native-caption')).toHaveText('Native overlay');
 await preview(page);await clickScreen(page,'.runtime-goal');
 await expect(frame.locator('.runtime-goal-value')).toHaveText('Reach 21 points');
 await expect(frame.locator('.runtime-goal')).toHaveCSS('background-color','rgb(49, 73, 170)');
 await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · Keep this private draft');
 expect(await frame.locator('body').evaluate(()=> (window as typeof window&{studioBoot:number}).studioBoot)).toBe(boot);
 await enterEdit(page);await rail.locator('[data-layer-selector="button.runtime-goal"]').click();await page.screenshot({path:testInfo.outputPath('runtime-control-design.png')});
});

test('feedback cards can be dragged and nudged independently while their original marked area and source remain intact',async({page},testInfo)=>{
 test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
 await createScreen(page);await enterEdit(page);await clickScreen(page,'h1');
 const object=page.locator('[data-canvas-v2-screen]'),source=await object.getAttribute('data-canvas-v2-screen');
 await page.getByRole('button',{name:'Ask Northstar about selection',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Comment on this area',exact:true}),input=page.getByRole('textbox',{name:'Comment for marked area',exact:true});
 await input.fill('Give this headline more breathing room.');
 const mark=page.locator('[data-visual-feedback-overlay] svg g rect').first(),region=await mark.evaluate(el=>el.outerHTML);
 const drag=async(label:string,dx:number,dy:number)=>{const handle=page.getByRole('button',{name:label,exact:true}),box=await handle.boundingBox();expect(box).toBeTruthy();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+dx,box!.y+box!.height/2+dy,{steps:12});await page.mouse.up();};
 const initial=await editor.boundingBox();await drag('Move comment',-100,130);
 await expect.poll(async()=>Math.abs((await editor.boundingBox())!.y-initial!.y)).toBeGreaterThan(50);
 const moved=await editor.boundingBox();await page.getByRole('button',{name:'Add comment',exact:true}).click();
 const saved=page.getByRole('article',{name:'Comment 1',exact:true});await expect(saved).toBeVisible();
 expect(Math.abs((await saved.boundingBox())!.y-moved!.y)).toBeLessThan(2);
 await drag('Move comment 1',80,60);const beforeNudge=await saved.boundingBox();
 await page.getByRole('button',{name:'Move comment 1',exact:true}).press('Shift+ArrowUp');
 await expect.poll(async()=>Math.round((await saved.boundingBox())!.y-beforeNudge!.y)).toBe(-10);
 await page.getByRole('button',{name:'Edit comment 1',exact:true}).click();await expect(input).toHaveValue('Give this headline more breathing room.');await expect(editor).toBeVisible();
 await page.getByRole('button',{name:'Pan canvas',exact:true}).click();
 const relativePosition=()=>page.evaluate(()=>{const card=document.querySelector('[data-visual-feedback-editor]')!.getBoundingClientRect(),mark=document.querySelector('[data-visual-feedback-overlay] svg g rect')!.getBoundingClientRect();return {x:card.x,offset:card.x-mark.x};});
 const beforePan=await relativePosition();
 const overlay=page.locator('[data-visual-feedback-overlay]');const area=await overlay.boundingBox();
 await page.mouse.move(area!.x+70,area!.y+40);await page.mouse.down();await page.mouse.move(area!.x+40,area!.y+65,{steps:10});await page.mouse.up();
 await expect.poll(async()=>Math.round((await relativePosition()).x-beforePan.x)).toBeLessThan(-20);
 await expect.poll(async()=>Math.abs((await relativePosition()).offset-beforePan.offset)).toBeLessThan(2);
 expect(await mark.evaluate(el=>el.outerHTML)).toBe(region);
 expect(await object.getAttribute('data-canvas-v2-screen')).toBe(source);
 await page.screenshot({path:testInfo.outputPath('moved-feedback-card.png')});
 await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('button',{name:/^Review 1 comments?$/})).toBeVisible();
});

test('selection actions remain reachable in Preview and inside Design; Delete removes feedback without deleting artwork',async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
 await createScreen(page);await preview(page);
 const collapse=page.getByRole('button',{name:'Collapse North Star panel',exact:true});if(await collapse.isVisible())await collapse.click();
 const object=page.locator('[data-canvas-v2-screen]'),source=await object.getAttribute('data-canvas-v2-screen');
 await page.getByTestId('canvas-v2-native-scene').getByText('Fieldnotes · studio editing',{exact:true}).click();
 const toolbar=page.getByTestId('canvas-v2-context-toolbar');await expect(toolbar).toBeVisible();
 await expect(toolbar.getByRole('button',{name:'Edit selected design',exact:true})).toBeVisible();
 await expect(toolbar.getByRole('button',{name:'Change fill',exact:true})).toHaveCount(0);
 await toolbar.getByRole('button',{name:'Give feedback on selection',exact:true}).click();
 const input=page.getByRole('textbox',{name:'Comment for marked area',exact:true});await expect(input).toBeVisible();
 await input.press('Delete');await expect(input).toHaveCount(0);
 await expect(page.locator('[data-visual-feedback-overlay] svg g rect')).toHaveCount(0);
 expect(await object.getAttribute('data-canvas-v2-screen')).toBe(source);
 await page.getByRole('button',{name:'Cancel canvas feedback',exact:true}).click();
 await toolbar.getByRole('button',{name:'Edit selected design',exact:true}).click();
 await expect(page.getByRole('toolbar',{name:'Selected element tools',exact:true})).toBeVisible();
 await clickScreen(page,'h1');
 const actions=page.getByRole('toolbar',{name:'Selected element tools',exact:true});await expect(actions).toBeVisible();
 await expect(actions.getByRole('button',{name:'Edit selected text on canvas',exact:true})).toBeVisible();
 await actions.getByRole('button',{name:'Draw feedback on selected element',exact:true}).click();
 await expect(page.getByRole('button',{name:'Draw a mark',exact:true})).toHaveAttribute('aria-pressed','true');
 const box=await screenPoint(page,'h1');await page.mouse.move(box.x-25,box.y-12);await page.mouse.down();await page.mouse.move(box.x+30,box.y+15,{steps:8});await page.mouse.up();
 await expect(input).toBeVisible();await input.fill('Keep the type, adjust the spacing.');await input.press('Backspace');await expect(input).toHaveValue('Keep the type, adjust the spacing');
 await input.press('Enter');await expect(page.getByRole('article',{name:'Comment 1',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Move comment 1',exact:true}).press('Delete');
 await expect(page.getByRole('article',{name:'Comment 1',exact:true})).toHaveCount(0);
 await expect(page.locator('[data-visual-feedback-overlay] svg g path')).toHaveCount(0);
 expect(await object.getAttribute('data-canvas-v2-screen')).toBe(source);
 await page.getByRole('button',{name:'Cancel canvas feedback',exact:true}).click();
 await expect(actions).toBeVisible();
 await page.screenshot({path:info.outputPath('selection-actions-design.png')});
});

test('human inspector typing previews immediately while persistence is held and preserves the running app',async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
 const frame=await createScreen(page);await preview(page);await frame.locator('#name').fill('Human private state');await clickScreen(page,'#save');
 const boot=await frame.locator('body').evaluate(()=>(window as typeof window&{studioBoot:number}).studioBoot);
 await enterEdit(page);await clickScreen(page,'h1');
 const object=page.locator('[data-canvas-v2-screen]'),before=await object.getAttribute('data-canvas-v2-screen');
 // Hold the production source-save boundary, not the runtime preview path.
 await page.evaluate(()=>{const fixture=window as typeof window&{__heldHumanEdits?:unknown[];__releaseHumanEdits?:()=>void};const held:unknown[]=[],dispatch=window.dispatchEvent.bind(window);fixture.__heldHumanEdits=held;window.dispatchEvent=(event:Event)=>{if(event.type==='northstar-screen-direct-edit'){held.push((event as CustomEvent).detail);return true;}return dispatch(event);};fixture.__releaseHumanEdits=()=>{window.dispatchEvent=dispatch;for(const detail of held)dispatch(new CustomEvent('northstar-screen-direct-edit',{detail}));};});
 const input=page.getByRole('textbox',{name:'Element text',exact:true});await input.fill('A responsive human edit.');
 await expect(frame.locator('h1')).toHaveText('A responsive human edit.');
 await expect.poll(()=>page.evaluate(()=>!!(window as typeof window&{__heldHumanEdits?:unknown[]}).__heldHumanEdits?.length)).toBe(true);
 expect(await object.getAttribute('data-canvas-v2-screen')).toBe(before);
 await expect(input).toHaveValue('A responsive human edit.');
 await page.evaluate(()=>(window as typeof window&{__releaseHumanEdits?:()=>void}).__releaseHumanEdits?.());
 await expect.poll(()=>object.getAttribute('data-canvas-v2-screen')).not.toBe(before);
 await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
 await expect(frame.locator('#name')).toHaveValue('Human private state');
 expect(await frame.locator('body').evaluate(()=>(window as typeof window&{studioBoot:number}).studioBoot)).toBe(boot);
 await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
 await expect(frame.locator('h1')).not.toHaveText('A responsive human edit.');
 await page.screenshot({path:info.outputPath('responsive-text-history.png')});
});


test('classed campaign text runs remain selectable through their heading outline',async({page})=>{
  const frame=await createScreen(page,false,false,false,false,false,true);
  await enterEdit(page);
  const title=page.getByRole('treeitem',{name:'Select layer A little space for your ideas.',exact:true});
  await title.click();
  await expect(page.getByRole('button',{name:'Edit selected text on canvas',exact:true})).toHaveCount(0);
  // A selected heading must not swallow clicks on its independently styled runs.
  await clickScreen(page,'h1 .first');
  await expect(page.getByRole('button',{name:'Edit selected text on canvas',exact:true})).toBeVisible();
  await expect(page.getByRole('treeitem',{name:'Select layer A little space',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('textbox',{name:'Element text',exact:true}).fill('Your next chapter');
  await expect(frame.locator('h1 .first')).toHaveText('Your next chapter');
  await expect(frame.locator('h1 .second')).toHaveText('for your ideas.');
  await expect(page.getByText('All changes saved',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect(frame.locator('h1 .first')).toHaveText('A little space');
  await expect(frame.locator('h1 .second')).toHaveText('for your ideas.');
});


test('inspector colour, size and text reflow paint before held saves; bounds follow contents',async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
 const frame=await createScreen(page,false,false,false,false,false,true);
 await frame.locator('#name').fill('Keep this notebook draft');
 const boot=await frame.locator('body').evaluate(()=>(window as typeof window&{studioBoot:number}).studioBoot);
 await enterEdit(page);await clickScreen(page,'h1 .first');
 const object=page.locator('[data-canvas-v2-screen]'),before=await object.getAttribute('data-canvas-v2-screen');
 await page.evaluate(()=>{const state=window as typeof window&{held?:unknown[];release?:()=>void;colourInputAt?:number};const dispatch=window.dispatchEvent.bind(window);state.held=[];window.dispatchEvent=(event:Event)=>{if(event.type==='northstar-screen-direct-edit'){state.held!.push((event as CustomEvent).detail);return true;}return dispatch(event);};state.release=()=>{window.dispatchEvent=dispatch;for(const detail of state.held!)dispatch(new CustomEvent('northstar-screen-direct-edit',{detail}));};document.querySelector('[aria-label="Text colour"]')!.addEventListener('input',()=>{state.colourInputAt=performance.timeOrigin+performance.now();},{once:true});});
 await frame.locator('h1 .first').evaluate(el=>{const state=window as typeof window&{colourPaintAt?:number};const observer=new MutationObserver(()=>{if(getComputedStyle(el).color==='rgb(255, 200, 75)')requestAnimationFrame(()=>{state.colourPaintAt=performance.timeOrigin+performance.now();observer.disconnect();});});observer.observe(el,{attributes:true,attributeFilter:['style']});});
 await page.getByRole('textbox',{name:'Text colour',exact:true}).fill('#FFC84B');
 await expect(frame.locator('h1 .first')).toHaveCSS('color','rgb(255, 200, 75)');
 await expect.poll(()=>frame.locator('body').evaluate(()=>(window as typeof window&{colourPaintAt?:number}).colourPaintAt)).toBeTruthy();
 const latency=(await frame.locator('body').evaluate(()=>(window as typeof window&{colourPaintAt:number}).colourPaintAt))-(await page.evaluate(()=>(window as typeof window&{colourInputAt:number}).colourInputAt));
 expect(latency).toBeLessThan(150);
 await page.getByRole('spinbutton',{name:'Text size',exact:true}).fill('48');
 await expect(frame.locator('h1 .first')).toHaveCSS('font-size','48px');
 const initialHeight=await frame.locator('h1 .first').evaluate(el=>el.getBoundingClientRect().height);
 await page.getByRole('textbox',{name:'Element text',exact:true}).fill('Every bold idea deserves a little more room to grow');
 await expect(frame.locator('h1 .first')).toHaveCSS('white-space','pre-wrap');
 await expect.poll(()=>frame.locator('h1 .first').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(initialHeight*1.5);
 const boxes=await frame.locator('h1 .first').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const box=el.getBoundingClientRect(),glyph=range.getBoundingClientRect();return{height:box.height,width:box.width,glyphWidth:glyph.width}});
 expect(boxes.glyphWidth).toBeLessThanOrEqual(boxes.width+1);
 await expect.poll(async()=>{const outline=await page.getByRole('button',{name:'Move selected element',exact:true}).boundingBox(),iframe=await page.locator('iframe[title="Fieldnotes · studio editing"]').boundingBox();return Math.abs(outline!.height-boxes.height*iframe!.width/390);}).toBeLessThan(2);
 await expect.poll(()=>page.evaluate(()=>(window as typeof window&{held?:unknown[]}).held?.length??0)).toBeGreaterThan(0);
 expect(await object.getAttribute('data-canvas-v2-screen')).toBe(before);
 await page.evaluate(()=>(window as typeof window&{release?:()=>void}).release?.());
 await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
 await expect(frame.locator('h1 .first')).toHaveText('Every bold idea deserves a little more room to grow');
 await expect(frame.locator('h1 .first')).toHaveCSS('color','rgb(255, 200, 75)');
 await expect(frame.locator('h1 .second')).toHaveText('for your ideas.');
 await expect(frame.locator('#name')).toHaveValue('Keep this notebook draft');
 expect(await frame.locator('body').evaluate(()=>(window as typeof window&{studioBoot:number}).studioBoot)).toBe(boot);
 await info.attach('Input to visible colour latency',{body:JSON.stringify({milliseconds:latency,saveHeld:true}),contentType:'application/json'});
 await page.screenshot({path:info.outputPath('responsive-properties-and-text-flow.png')});
});

test('rejected property saves restore the saved appearance instead of leaving a false preview',async({page})=>{
 const frame=await createScreen(page);await enterEdit(page);await clickScreen(page,'h1');
 const before=await page.locator('[data-canvas-v2-screen]').getAttribute('data-canvas-v2-screen');
 const colour=await frame.locator('h1').evaluate(el=>getComputedStyle(el).color);
 await page.evaluate(()=>{const dispatch=window.dispatchEvent.bind(window);window.dispatchEvent=(event:Event)=>{if(event.type==='northstar-screen-direct-edit'){(event as CustomEvent<{resolve:(result:unknown)=>void}>).detail.resolve({ok:false,error:'Save rejected for rollback coverage.'});return true;}return dispatch(event);};});
 await page.getByRole('textbox',{name:'Text colour',exact:true}).fill('#FFC84B');
 await expect(frame.locator('h1')).toHaveCSS('color','rgb(255, 200, 75)');
 await expect(page.getByText('Save rejected for rollback coverage.',{exact:false}).first()).toBeVisible();
 await expect(frame.locator('h1')).toHaveCSS('color',colour);
 expect(await page.locator('[data-canvas-v2-screen]').getAttribute('data-canvas-v2-screen')).toBe(before);
});

test('property changes stay responsive across repeated saves on a populated 52-screen canvas',async({page},info)=>{
 test.setTimeout(180000);await page.setViewportSize({width:1512,height:1000});
 await page.goto('/canvas-v2-e2e/responsive-editing');
 await expect(page.locator('iframe')).toHaveCount(52);
 await page.getByRole('button',{name:'Collapse North Star panel',exact:true}).click();
 await page.getByRole('button',{name:'Design view',exact:true}).click();
 await page.getByTestId('canvas-v2-native-scene').getByText('Campaign · responsive headline',{exact:true}).click();
 await page.getByRole('treeitem',{name:'Select layer YOUR BEST.',exact:true}).click();
 await page.getByRole('textbox',{name:'Text colour',exact:true}).waitFor({state:'visible'});
 const frame=page.frameLocator('iframe[title="Campaign · responsive headline"]');
 await page.evaluate(()=>{const state=window as typeof window&{inputTimes:number[];longTasks:number[]};state.inputTimes=[];state.longTasks=[];document.querySelector('[aria-label="Text colour"]')!.addEventListener('input',()=>state.inputTimes.push(performance.timeOrigin+performance.now()));new PerformanceObserver(list=>{for(const item of list.getEntries())state.longTasks.push(item.duration);}).observe({type:'longtask',buffered:false});});
 await frame.locator('.first').evaluate(el=>{const state=window as typeof window&{paintTimes:number[]};state.paintTimes=[];let last=getComputedStyle(el).color;new MutationObserver(()=>{const colour=getComputedStyle(el).color;if(colour!==last){last=colour;requestAnimationFrame(()=>state.paintTimes.push(performance.timeOrigin+performance.now()));}}).observe(el,{attributes:true,attributeFilter:['style']});});
 const profiler=process.env.NS_PROFILE_EDITING==='1'?await page.context().newCDPSession(page):undefined;
 if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
 const samples:number[]=[];
 for(const colour of ['#FFC84B','#AB98FF','#68CFE5','#F7A0AD','#FFFFFF']){
   const before=await page.locator('[data-canvas-v2-node-id="studio-0"][data-canvas-v2-screen]').getAttribute('data-canvas-v2-screen');
   await page.getByRole('textbox',{name:'Text colour',exact:true}).fill(colour);
   await expect.poll(()=>frame.locator('body').evaluate(()=>(window as typeof window&{paintTimes:number[]}).paintTimes.length)).toBeGreaterThan(samples.length);
   samples.push((await frame.locator('body').evaluate(()=>(window as typeof window&{paintTimes:number[]}).paintTimes.at(-1)!))-(await page.evaluate(()=>(window as typeof window&{inputTimes:number[]}).inputTimes.at(-1)!)));
   await expect.poll(()=>page.locator('[data-canvas-v2-node-id="studio-0"][data-canvas-v2-screen]').getAttribute('data-canvas-v2-screen')).not.toBe(before);
   await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
 }
 if(profiler){const profile=await profiler.send('Profiler.stop');await writeFile(info.outputPath('editing-cpu-profile.json'),JSON.stringify(profile));await profiler.detach();}
 const tasks=await page.evaluate(()=>(window as typeof window&{longTasks:number[]}).longTasks);
 const timing={screens:52,inputToPaintMs:samples,maxInputToPaintMs:Math.max(...samples),longTaskMs:tasks};
 await writeFile(info.outputPath('populated-editing-timing.json'),JSON.stringify(timing,null,2));
 await info.attach('Populated canvas editing timing',{path:info.outputPath('populated-editing-timing.json'),contentType:'application/json'});
 expect(Math.max(...samples)).toBeLessThan(150);
 await page.screenshot({path:info.outputPath('populated-responsive-editing.png')});
});
