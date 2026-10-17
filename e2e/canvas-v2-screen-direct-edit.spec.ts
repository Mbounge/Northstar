import path from 'node:path';
import { clickScreen } from './canvas-v2-screen-input-helpers';
import { expect, test, type Page } from '@playwright/test';

async function createScreen(page: Page, dependent=false, gradient=false, ordered=false, styled=false) {
  await page.goto('/canvas-v2-e2e/codex');

  await page.getByRole('button',{name:'assets',exact:true}).click();
  await page.getByRole('button',{name:'Add project images',exact:true}).click();
  await page.getByLabel('Choose images for the canvas',{exact:true}).setInputFiles(path.resolve('public/northstar/design-references/evidence-canvas.png'));
  await expect(page.getByRole('button',{name:'Preview evidence canvas',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'chat',exact:true}).click();
  await page.getByRole('textbox',{name:'Message North Star'}).fill('screen direct asset'+(dependent?' dependent':'')+(gradient?' gradient':'')+(ordered?' ordered':'')+(styled?' styled':''));
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByText('The studio screen is ready for direct editing.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Show on canvas',exact:true}).click();
  return page.frameLocator('iframe[title="Fieldnotes · studio editing"]');
}

test('direct text and section edits preserve native app behavior, history and chat continuity',async({page},testInfo)=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:900});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const frame=await createScreen(page),scene=page.getByTestId('canvas-v2-native-scene'),screen=scene.locator('[data-canvas-v2-screen]');
  const geometry=await screen.getAttribute('style'),boot=await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot);
  expect(typeof boot).toBe('number');
  const originalTitle='A little space for your ideas.',editedTitle="A studio <that's yours> ✨";
  await frame.getByRole('textbox',{name:'Your notebook'}).fill('My everyday notes');await clickScreen(page,'#save');
  await expect(frame.locator('#status')).toHaveText('Saved 1 · My everyday notes');
  await clickScreen(page,'h1',{clickCount:2});
  await expect(page.getByRole('textbox',{name:'Screen text',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Screen text',exact:true}).fill(editedTitle);
  await page.getByRole('textbox',{name:'Screen text',exact:true}).press('Enter');
  await expect(frame.getByRole('heading',{name:editedTitle})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Screen text',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();await expect(frame.getByRole('heading',{name:originalTitle})).toBeVisible();
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();await expect(frame.getByRole('heading',{name:editedTitle})).toBeVisible();
  const revision=await page.getByTestId('canvas-v2-committed-revision').textContent();
  await clickScreen(page,'h1',{clickCount:2});
  await page.getByRole('textbox',{name:'Screen text',exact:true}).press('ControlOrMeta+A');
  await page.getByRole('textbox',{name:'Screen text',exact:true}).press('Backspace');
  await page.getByRole('textbox',{name:'Screen text',exact:true}).fill('Cancelled text');
  await page.getByRole('textbox',{name:'Screen text',exact:true}).press('Escape');
  await expect(frame.getByRole('heading',{name:editedTitle})).toBeVisible();
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
  await clickScreen(page,'h1',{clickCount:2});
  await page.getByRole('textbox',{name:'Screen text',exact:true}).fill('Room for your next chapter.');
  await clickScreen(page,'#name');
  await expect(frame.getByRole('heading',{name:'Room for your next chapter.'})).toBeVisible();
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect(frame.getByRole('heading',{name:editedTitle})).toBeVisible();
  await clickScreen(page,'#name',{clickCount:2});await expect(page.getByRole('textbox',{name:'Screen text',exact:true})).toHaveCount(0);
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · My everyday notes');
  await clickScreen(page,'#chapter-1 h2',{button:'right'});
  await page.getByRole('menuitem',{name:'Remove section',exact:true}).click();
  await expect(frame.locator('#chapter-1')).toHaveCount(0);await expect(frame.locator('#chapter-2')).toHaveCount(1);
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();await expect(frame.locator('#chapter-1')).toHaveCount(1);
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();await expect(frame.locator('#chapter-1')).toHaveCount(0);
  await expect(frame.getByRole('textbox',{name:'Your notebook'})).toHaveValue('My everyday notes');
  expect(await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot)).toBe(boot);
  expect(await screen.getAttribute('style')).toBe(geometry);await expect(scene.locator('img')).toHaveCount(0);
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 3 · My everyday notes');
  // Select the owning screen for the normal subsequent agent edit.
  const bounds=await screen.boundingBox();await page.mouse.click(bounds!.x-3,bounds!.y+bounds!.height/2);
  await page.getByRole('textbox',{name:'Message North Star'}).fill('screen direct asset followup');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByText('Refined the title while preserving the direct image edit.',{exact:true})).toBeVisible();
  await expect(frame.getByRole('heading',{name:'Make room for your next idea.'})).toBeVisible();await expect(frame.locator('#chapter-1')).toHaveCount(0);
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 4 · My everyday notes');
  expect(errors).toEqual([]);
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
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 1 · Morning pages');
});

test('removing a section with app dependencies prepares a targeted code edit instead of breaking the app',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1512,height:1000});
  const frame=await createScreen(page,true);
  await clickScreen(page,'#note-count',{button:'right'});
  await expect(page.getByRole('menuitem',{name:'Edit with Northstar',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await clickScreen(page,'#add-note');await expect(frame.locator('#note-count')).toHaveText('Notes 1');
  const before=await page.getByTestId('canvas-v2-committed-revision').textContent();
  await clickScreen(page,'#notes h2',{button:'right'});await page.getByRole('menuitem',{name:'Remove with Northstar',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue('Remove the tagged section and update any app behavior that depends on it. Keep the rest of this screen intact.');
  await expect(frame.locator('#notes')).toHaveCount(1);expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(before);
  await clickScreen(page,'#add-note');await expect(frame.locator('#note-count')).toHaveText('Notes 2');
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
  await clickScreen(page,'h1',{clickCount:2});
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
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · A real working notebook');
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
  await clickScreen(page,'#add-note');await expect(frame.locator('#note-count')).toHaveText('Notes 1');
});

test('appearance edits preserve working controls and form state through undo, redo and later chat edits',async({page},testInfo)=>{
  test.setTimeout(120000);await page.setViewportSize({width:1512,height:1000});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const frame=await createScreen(page),screen=page.getByTestId('canvas-v2-native-scene').locator('[data-canvas-v2-screen]');
  const geometry=await screen.getAttribute('style'),boot=await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot);
  await frame.locator('#name').fill('My working prototype');await clickScreen(page,'#save');
  await expect(frame.locator('#status')).toHaveText('Saved 1 · My working prototype');
  const original=await frame.locator('#save').evaluate(el=>{const s=getComputedStyle(el);return {color:s.backgroundColor,radius:s.borderRadius,font:s.fontSize}});
  // Buttons were not text/section targets: the appearance gesture must work on
  // the actual displayed control, including its real frame/canvas scale.
  await clickScreen(page,'#save',{button:'right'});
  await page.getByRole('menuitem',{name:'Appearance',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Appearance',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Background colour',exact:true}).fill('#3149aa');
  await page.getByRole('spinbutton',{name:'Corner radius',exact:true}).fill('24');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect.poll(()=>frame.locator('#save').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(49, 73, 170)');
  await expect.poll(()=>frame.locator('#save').evaluate(el=>getComputedStyle(el).borderRadius)).toBe('24px');
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
  await expect.poll(()=>frame.locator('#save').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(original.color);
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();
  await expect.poll(()=>frame.locator('#save').evaluate(el=>getComputedStyle(el).borderRadius)).toBe('24px');
  await expect(frame.locator('#name')).toHaveValue('My working prototype');
  expect(await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot)).toBe(boot);
  expect(await screen.getAttribute('style')).toBe(geometry);
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · My working prototype');
  await clickScreen(page,'h1',{button:'right'});await page.getByRole('menuitem',{name:'Appearance',exact:true}).click();
  const initial=await frame.locator('h1').evaluate(el=>getComputedStyle(el).fontSize);
  const revision=await page.getByTestId('canvas-v2-committed-revision').textContent();
  await page.getByRole('spinbutton',{name:'Text size',exact:true}).fill('42');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await frame.locator('h1').evaluate(el=>getComputedStyle(el).fontSize)).toBe(initial);
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
  await clickScreen(page,'h1',{button:'right'});await page.getByRole('menuitem',{name:'Appearance',exact:true}).click();
  await page.getByRole('textbox',{name:'Background colour',exact:true}).fill('not-a-colour');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Choose a valid background color.');
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
  await page.getByRole('textbox',{name:'Background colour',exact:true}).fill('rgba(0, 0, 0, 0)');
  await page.getByRole('spinbutton',{name:'Text size',exact:true}).fill('42');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect.poll(()=>frame.locator('h1').evaluate(el=>getComputedStyle(el).fontSize)).toBe('42px');
  // Continue directly in chat; the native edit must retain this owning phone
  // as the explicit selection without an extra border click.
  await page.getByRole('textbox',{name:'Message North Star'}).fill('screen direct asset followup');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(frame.getByRole('heading',{name:'Make room for your next idea.'})).toBeVisible();
  await expect.poll(()=>frame.locator('h1').evaluate(el=>getComputedStyle(el).fontSize)).toBe('42px');
  await expect.poll(()=>frame.locator('#save').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(49, 73, 170)');
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 3 · My working prototype');
  expect(errors).toEqual([]);
  await clickScreen(page,'#save',{button:'right'});await page.getByRole('menuitem',{name:'Appearance',exact:true}).click();
  const screenshot=testInfo.outputPath('direct-appearance-editing.png');await page.screenshot({path:screenshot});
  await testInfo.attach('Direct appearance editing',{path:screenshot,contentType:'image/png'});
});


test('code-controlled appearance prepares a targeted edit without changing source or breaking the control',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:1512,height:900});
  const frame=await createScreen(page,false,false,false,true);
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 1 · Morning pages');
  const revision=await page.getByTestId('canvas-v2-committed-revision').textContent();
  await clickScreen(page,'#save',{button:'right'});
  await page.getByRole('menuitem',{name:'Style with Northstar',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Appearance',exact:true})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue(/Change the appearance of the tagged element and update any app code/);
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
  await clickScreen(page,'#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · Morning pages');
  await expect.poll(()=>frame.locator('#save').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(86, 98, 74)');
});
