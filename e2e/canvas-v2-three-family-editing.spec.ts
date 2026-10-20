import { FIXTURE_PHOTO_DATA_URL, FIXTURE_LOGO_DATA_URL, FIXTURE_REPLACEMENT_DATA_URL } from '../app/canvas-v2-e2e/direct-edit-contract/fixture-assets';
import { expect, test, type Page } from '@playwright/test';

const titles={app:'Responsive app fixture',poster:'Layered poster fixture',svg:'Native fox artwork fixture'};
async function create(page:Page,family:keyof typeof titles){
  await page.setViewportSize({width:1512,height:1000});await page.goto('/canvas-v2-e2e/codex');
  if(family==='poster'){
    await page.getByRole('button',{name:'assets',exact:true}).click();await page.getByRole('button',{name:'Add project images',exact:true}).click();
    await page.getByLabel('Choose images for the canvas',{exact:true}).setInputFiles([{name:'fixture-photo.png',mimeType:'image/png',buffer:Buffer.from(FIXTURE_PHOTO_DATA_URL.split(',')[1],'base64')},{name:'fixture-logo.png',mimeType:'image/png',buffer:Buffer.from(FIXTURE_LOGO_DATA_URL.split(',')[1],'base64')}]);
    await expect(page.getByRole('button',{name:/Preview.*fixture.*logo/i})).toBeVisible();await page.getByRole('button',{name:'chat',exact:true}).click();
  }
  await page.getByRole('textbox',{name:'Message North Star'}).fill('editing workspace '+family);await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByText('The '+family+' editing workspace fixture is ready.',{exact:true})).toBeVisible({timeout:60000});await page.getByRole('button',{name:'Show on canvas',exact:true}).click();
  return page.frameLocator('iframe[title="'+titles[family]+'"]');
}
async function enter(page:Page,family:keyof typeof titles){
  const mode=page.getByRole('button',{name:'Design view',exact:true});if(await mode.getAttribute('aria-pressed')!=='true')await mode.click();
  await page.getByTestId('canvas-v2-native-scene').getByText(titles[family],{exact:true}).click();
  await expect(page.getByRole('button',{name:'Back to canvas',exact:true})).toBeVisible();
  await expect(page.getByRole('complementary',{name:'Object layers'})).toBeVisible();
}
async function backToPreview(page:Page){
  await page.getByRole('button',{name:'Back to canvas',exact:true}).click();
  const mode=page.getByRole('button',{name:'Design view',exact:true});
  await expect(mode).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('complementary',{name:'Object layers',exact:true})).toBeVisible();
  await expect(page.getByRole('complementary',{name:'Design properties',exact:true})).toBeVisible();
  await expect(page.locator('[aria-label="Canvas tools"]')).toBeVisible();
  await mode.click();await expect(mode).toHaveAttribute('aria-pressed','false');
}
const row=(page:Page,selector:string)=>page.getByRole('tree',{name:'Editable layers'}).locator('[data-layer-selector="'+selector+'"]');
async function stageSelectedFeedback(page:Page,comment:string){
  await page.getByRole('button',{name:'Ask Northstar about selected layers',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Comment on this area',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).fill(comment);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cancel canvas feedback',exact:true})).toHaveCount(0,{timeout:60000});
  await expect(page.getByTestId('canvas-feedback-comments').getByRole('button',{name:/^Review 1 comments?$/})).toHaveAttribute('aria-expanded','false');
  await page.getByRole('button',{name:/^Review 1 comments?$/}).click();
  await expect(page.getByTestId('canvas-feedback-comments')).toContainText(comment);
  await page.getByRole('button',{name:/^Review 1 comments?$/}).click();
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue('');
}
async function source(page:Page){
  const encoded=await page.getByTestId('canvas-v2-native-scene').locator('[data-canvas-v2-screen]').getAttribute('data-canvas-v2-screen');
  return JSON.parse(Buffer.from(encoded!,'base64').toString('utf8')) as {html:string;css:string;javascript:string;referenceAssetIds:string[]};
}
async function clickNative(page:Page,family:keyof typeof titles,selector:string,clickCount=1){
  const iframe=page.locator('iframe[title="'+titles[family]+'"]'),frame=page.frameLocator('iframe[title="'+titles[family]+'"]');
  await frame.locator(selector).scrollIntoViewIfNeeded();
  const inside=await frame.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  const outside=await iframe.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,sx:r.width/el.clientWidth,sy:r.height/el.clientHeight}});
  await page.mouse.click(outside.x+inside.x*outside.sx,outside.y+inside.y*outside.sy,{clickCount});
}

async function nativeGlyphRect(page:Page,family:keyof typeof titles,selector:string){
  const frame=page.frameLocator('iframe[title="'+titles[family]+'"]');await frame.locator(selector).scrollIntoViewIfNeeded();
  const inner=await frame.locator(selector).evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);const r=range.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
  const outer=await page.locator('iframe[title="'+titles[family]+'"]').evaluate(element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,sx:r.width/element.clientWidth,sy:r.height/element.clientHeight}});
  return{x:outer.x+inner.x*outer.sx,y:outer.y+inner.y*outer.sy,width:inner.width*outer.sx,height:inner.height*outer.sy};
}

test('saved readable comments remain anchored while a fourth and fifth draft mount at a stationary camera',async({page})=>{
  test.setTimeout(150000);await create(page,'app');await enter(page,'app');await row(page,'#app-heading').click();
  const before=await source(page),revision=await page.getByTestId('canvas-v2-native-scene').getAttribute('data-revision-id');
  const openComment=async()=>{
    await page.getByRole('button',{name:'Ask Northstar about selection',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Comment on this area',exact:true});await expect(dialog).toBeVisible();
    const bounds=await dialog.boundingBox();expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  };
  for(const comment of ['Keep this exact heading.','A separate note on the same heading.','Preserve its relationship to the cards.']){
    await openComment();await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).fill(comment);await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).press('Enter');
  }
  await expect(page.locator('[data-visual-feedback-comment]')).toHaveCount(3);
  await openComment();await expect(page.locator('[data-visual-feedback-comment]')).toHaveCount(3);
  await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).fill('Fourth draft appears immediately without pan or resize.');await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Edit comment 1',exact:true}).click();await expect(page.getByRole('textbox',{name:'Comment for marked area',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).fill('Keep this exact heading and its wording.');await page.getByRole('textbox',{name:'Comment for marked area',exact:true}).press('Enter');
  await openComment();await page.getByRole('button',{name:'Delete this comment',exact:true}).click();await expect(page.locator('[data-visual-feedback-comment]')).toHaveCount(4);
  await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel canvas feedback',exact:true})).toHaveCount(0,{timeout:60000});
  const review=page.getByRole('button',{name:'Review 4 comments',exact:true});await expect(review).toHaveAttribute('aria-expanded','false');
  await expect(page.getByTestId('canvas-feedback-comments').getByRole('img')).toHaveCount(0);await review.click();await expect(page.getByTestId('canvas-feedback-comments').getByRole('img')).toHaveCount(4);
  expect(await source(page)).toEqual(before);await expect(page.getByTestId('canvas-v2-native-scene')).toHaveAttribute('data-revision-id',revision!);
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue('');
});

test('a sixth crowded comment scrolls into view once and leaves typing and manual scroll under user control',async({page})=>{
  test.setTimeout(150000);await create(page,'app');await enter(page,'app');await row(page,'#app-heading').click();
  const before=await source(page),scene=page.getByTestId('canvas-v2-native-scene'),revision=await scene.getAttribute('data-revision-id');
  await page.setViewportSize({width:800,height:600});
  const ask=page.getByRole('button',{name:'Ask Northstar about selection',exact:true});
  const input=page.getByRole('textbox',{name:'Comment for marked area',exact:true});
  for(let index=1;index<=5;index++){
    await ask.click();await expect(input).toBeVisible();await input.fill('Independent comment '+index+' preserves this exact heading.');await input.press('Enter');
  }
  const stack=page.getByRole('region',{name:'Canvas comments',exact:true});await expect(stack).toBeVisible();
  await expect(page.locator('[data-visual-feedback-comment]')).toHaveCount(5);
  await ask.click();const dialog=page.getByRole('dialog',{name:'Comment on this area',exact:true});await expect(dialog).toBeVisible();
  await expect.poll(async()=>{
    const box=await dialog.boundingBox(),column=await stack.boundingBox();
    return Boolean(box&&column&&box.y>=column.y-1&&box.y+box.height<=column.y+column.height+1);
  }).toBe(true);
  const autoScroll=await stack.evaluate(element=>element.scrollTop);expect(autoScroll).toBeGreaterThan(0);
  await input.fill('Sixth draft stays reachable while I type.');
  await expect.poll(()=>stack.evaluate(element=>element.scrollTop)).toBeCloseTo(autoScroll,0);
  await stack.hover();await page.mouse.wheel(0,-120);
  await expect.poll(()=>stack.evaluate(element=>element.scrollTop)).toBeLessThan(autoScroll-20);
  const manualScroll=await stack.evaluate(element=>element.scrollTop);
  await expect.poll(()=>stack.evaluate(element=>element.scrollTop)).toBeCloseTo(manualScroll,0);
  await stack.focus();await stack.press('Home');await expect.poll(()=>stack.evaluate(element=>element.scrollTop)).toBe(0);
  await stack.press('End');await expect.poll(async()=>stack.evaluate(element=>Math.abs(element.scrollHeight-element.clientHeight-element.scrollTop))).toBeLessThan(2);
  await input.fill('Sixth draft remains user controlled.');await input.press('Enter');
  await page.setViewportSize({width:1512,height:1000});await expect(page.locator('[data-visual-feedback-stack="true"]')).toHaveCount(0);
  await expect(page.locator('[data-visual-feedback-comment]')).toHaveCount(6);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cancel canvas feedback',exact:true})).toHaveCount(0,{timeout:60000});
  await expect(page.getByRole('button',{name:'Review 6 comments',exact:true})).toHaveAttribute('aria-expanded','false');
  expect(await source(page)).toEqual(before);await expect(scene).toHaveAttribute('data-revision-id',revision!);
  await expect(page.getByRole('textbox',{name:'Message North Star'})).toHaveValue('');
});

test('inline editing keeps native padded and centered text in place without activating its button',async({page})=>{
  test.setTimeout(120000);const frame=await create(page,'app');await frame.locator('#notebook').fill('Keep the baseline');await clickNative(page,'app','#save');await expect(frame.locator('#status')).toHaveText('Saved 1 · Keep the baseline');await enter(page,'app');
  for(const selector of ['#app-heading','#save','#centered-label']){
    const original=await frame.locator(selector).textContent(),before=await nativeGlyphRect(page,'app',selector);
    await clickNative(page,'app',selector,2);const editor=page.getByRole('textbox',{name:'Screen text',exact:true});await expect(editor).toBeVisible();
    const during=await editor.evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);const r=range.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}});
    for(const coordinate of ['x','y','width','height'] as const)expect(Math.abs(during[coordinate]-before[coordinate]),selector+' glyph '+coordinate).toBeLessThanOrEqual(2);
    await expect(frame.locator('#status')).toHaveText('Saved 1 · Keep the baseline');
    await editor.fill(original+' human');await editor.press('Escape');await expect(frame.locator(selector)).toHaveText(original+' human');
  }
  await backToPreview(page);await clickNative(page,'app','#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · Keep the baseline');
});

test('one instruction refines a current native multi-selection while edit chat preserves selection, camera and human source',async({page})=>{
  test.setTimeout(150000);const frame=await create(page,'app');
  await frame.locator('#notebook').fill('Preserve this running app');await clickNative(page,'app','#save');await enter(page,'app');
  await clickNative(page,'app','#app-heading');await page.keyboard.down('Shift');try{await clickNative(page,'app','#save')}finally{await page.keyboard.up('Shift')}
  await expect(page.getByRole('heading',{name:'2 layers selected',exact:true})).toBeVisible();await expect(frame.locator('#status')).toHaveText('Saved 1 · Preserve this running app');
  // Read-only native selection inspection must work immediately after human input.
  await stageSelectedFeedback(page,'Review only these two selected native layers.');
  await page.getByRole('button',{name:'Remove canvas feedback',exact:true}).click();
  await expect(page.getByTestId('canvas-feedback-comments')).toHaveCount(0);
  await page.getByRole('button',{name:'Collapse North Star panel',exact:true}).click();
  await row(page,'#app-heading').click();await row(page,'#centered-label').click({modifiers:['Shift']});
  await expect(page.getByRole('heading',{name:'3 layers selected',exact:true})).toBeVisible();
  await row(page,'#app-heading').click();
  await page.getByRole('textbox',{name:'Element text',exact:true}).fill('My pending human revision.');
  await row(page,'#centered-label').click({modifiers:['Meta']});
  await expect(page.getByRole('heading',{name:'2 layers selected',exact:true})).toBeVisible();
  await expect(frame.locator('#app-heading')).toHaveText('My pending human revision.');
  const camera=await page.getByTestId('canvas-v2-workspace-surface').getAttribute('style');
  await stageSelectedFeedback(page,'Refine the two selected text layers while keeping my wording.');
  await expect(page.locator('[data-northstar-edit-view="true"]')).toBeVisible();
  await expect(page.getByRole('heading',{name:'2 layers selected',exact:true})).toBeVisible();
  await expect(page.getByTestId('canvas-v2-workspace-surface')).toHaveAttribute('style',camera!);
  await page.getByRole('button',{name:'Collapse North Star panel',exact:true}).click();
  await expect(row(page,'#app-heading')).toHaveAttribute('aria-selected','true');await expect(row(page,'#centered-label')).toHaveAttribute('aria-selected','true');
  // A source-bound region must be staged again after a later human edit.
  await row(page,'#app-heading').click();await page.getByRole('textbox',{name:'Element text',exact:true}).fill('My current human revision.');
  await row(page,'#centered-label').click({modifiers:['Meta']});await expect(frame.locator('#app-heading')).toHaveText('My current human revision.');
  const human=await source(page);
  await page.getByRole('button',{name:'Open Northstar chat in edit view',exact:true}).click();
  await page.getByRole('button',{name:'Remove canvas feedback',exact:true}).click();
  await page.getByRole('button',{name:'Collapse North Star panel',exact:true}).click();
  await stageSelectedFeedback(page,'Refine these two current text layers, preserving the newest human wording.');
  await page.getByRole('textbox',{name:'Message North Star'}).fill('editing workspace feedback');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByText('Refined all 2 selected layers in one canvas revision.',{exact:true})).toBeVisible({timeout:60000});
  await expect(frame.locator('#app-heading')).toHaveCSS('color','rgb(123, 67, 181)');await expect(frame.locator('#centered-label')).toHaveCSS('color','rgb(123, 67, 181)');
  await expect(frame.locator('#app-heading')).toHaveText('My current human revision.');await expect(frame.locator('#save')).toHaveCSS('color','rgb(255, 255, 255)');
  const refined=await source(page);expect(refined.css).toBe(human.css);expect(refined.javascript).toBe(human.javascript);
  await page.getByRole('button',{name:'Collapse North Star panel',exact:true}).click();
  await expect(row(page,'#app-heading')).toHaveAttribute('aria-selected','true');await expect(row(page,'#centered-label')).toHaveAttribute('aria-selected','true');
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();await expect.poll(async()=>(await source(page)).html).toBe(human.html);
  await expect(page.getByRole('heading',{name:'2 layers selected',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();await expect.poll(async()=>(await source(page)).html).toBe(refined.html);
  await expect(page.getByTestId('canvas-v2-workspace-surface')).toHaveAttribute('style',camera!);
  await backToPreview(page);await clickNative(page,'app','#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · Preserve this running app');
});

test('dedicated app editing synchronizes persistent layers, layout properties and canvas selection while preserving the live app',async({page})=>{
  test.setTimeout(120000);const frame=await create(page,'app');
  await frame.locator('#notebook').fill('Human notebook');await clickNative(page,'app','#save');await expect(frame.locator('#status')).toHaveText('Saved 1 · Human notebook');
  const camera=await page.getByTestId('canvas-v2-workspace-surface').getAttribute('style');await enter(page,'app');
  await expect(row(page,'#app-heading')).toBeVisible();await row(page,'#app-heading').click();await expect(page.getByRole('textbox',{name:'Element text',exact:true})).toHaveValue('A little room for a big idea.');
  await page.getByRole('textbox',{name:'Element text',exact:true}).fill('A human shaped this idea.');await expect(frame.locator('#app-heading')).toHaveText('A human shaped this idea.');
  await expect.poll(async()=>(await source(page)).html).toContain('A human shaped this idea.');
  await row(page,'#card-grid').click();await page.getByRole('spinbutton',{name:'Column gap value',exact:true}).fill('28');await expect(frame.locator('#card-grid')).toHaveCSS('column-gap','28px');
  await expect.poll(async()=>(await source(page)).html).toContain('column-gap: 28px');
  await page.getByRole('button',{name:'Collapse Responsive app',exact:true}).click();await expect(row(page,'#app-heading')).toHaveCount(0);await page.getByRole('button',{name:'Expand Responsive app',exact:true}).click();
  await clickNative(page,'app','#app-heading');await expect(row(page,'#app-heading')).toHaveAttribute('aria-selected','true');await expect(page.getByRole('textbox',{name:'Element text',exact:true})).toHaveValue('A human shaped this idea.');
  await backToPreview(page);await expect(page.getByRole('complementary',{name:'Object layers'})).toHaveCount(0);
  await expect(page.getByTestId('canvas-v2-workspace-surface')).toHaveAttribute('style',camera!);await clickNative(page,'app','#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · Human notebook');
});

test('SVG layer selection edits real parts and native lettering with exact history and retained closures',async({page})=>{
  test.setTimeout(120000);const frame=await create(page,'svg');const original=await source(page);
  await frame.locator('#notebook').fill('Keep my art note');await clickNative(page,'svg','#save');await expect(frame.locator('#status')).toHaveText('Saved 1 · Keep my art note');
  await enter(page,'svg');await row(page,'#left-ear').click();const selectedName=page.getByTestId('screen-inspector-header').getByRole('heading',{name:'Left ear',exact:true});await expect(selectedName).toBeVisible();await page.getByRole('slider',{name:'Element opacity',exact:true}).scrollIntoViewIfNeeded();await expect(selectedName).toBeVisible();await page.getByRole('textbox',{name:'Vector fill',exact:true}).fill('#9966cc');await expect(frame.locator('#left-ear')).toHaveCSS('fill','rgb(153, 102, 204)');
  await expect.poll(async()=>(await source(page)).html).toMatch(/fill:\s*(?:#9966cc|rgb\(153,\s*102,\s*204\))/);
  await page.getByRole('button',{name:'Collapse Head',exact:true}).click();await expect(row(page,'#left-ear')).toHaveCount(0);await page.getByRole('button',{name:'Expand Head',exact:true}).click();
  await clickNative(page,'svg','#right-eye');await expect(row(page,'#right-eye')).toHaveAttribute('aria-selected','true');await page.getByRole('spinbutton',{name:'Vector r',exact:true}).fill('12');await expect(frame.locator('#right-eye')).toHaveAttribute('r','12');
  await row(page,'#mascot-name').click();await page.getByRole('textbox',{name:'Element text',exact:true}).fill('Human Rowan');await expect(frame.locator('#mascot-name')).toHaveText('Human Rowan');
  await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();await expect(frame.locator('#mascot-name')).toHaveText('Rowan');await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();await expect(frame.locator('#mascot-name')).toHaveText('Human Rowan');
  const edited=await source(page);expect(edited.javascript).toBe(original.javascript);expect(edited.css).toBe(original.css);expect(edited.html).toContain('<linearGradient id="fur-gradient"');
  await backToPreview(page);await clickNative(page,'svg','#save');await expect(frame.locator('#status')).toHaveText('Saved 2 · Keep my art note');
});

test('poster image crop, replacement and native title remain independent source layers',async({page})=>{
  test.setTimeout(120000);const frame=await create(page,'poster');const logo=await frame.locator('#brand-logo').getAttribute('src'),photo=await frame.locator('#poster-photo').getAttribute('src');
  await enter(page,'poster');await row(page,'#poster-title').click();await page.getByRole('textbox',{name:'Element text',exact:true}).fill('FIND YOUR NEXT CHAPTER.');await expect(frame.locator('#poster-title')).toHaveText('FIND YOUR NEXT CHAPTER.');
  await row(page,'#poster-photo').click();await page.getByText('Crop position',{exact:true}).click();const crop=page.getByRole('slider',{name:'Horizontal crop position',exact:true});await crop.press('Home');for(let step=0;step<25;step++)await crop.press('ArrowRight');await expect(frame.locator('#poster-photo')).toHaveCSS('object-position','25% 50%');
  await page.getByLabel('Choose replacement image',{exact:true}).setInputFiles({name:'fixture-replacement.png',mimeType:'image/png',buffer:Buffer.from(FIXTURE_REPLACEMENT_DATA_URL.split(',')[1],'base64')});
  await expect.poll(async()=>frame.locator('#poster-photo').getAttribute('src')).not.toBe(photo);await expect.poll(async()=>(await source(page)).referenceAssetIds.length).toBeGreaterThan(2);
  await expect(frame.locator('#poster-photo')).toHaveCSS('object-position','25% 50%');expect(await frame.locator('#brand-logo').getAttribute('src')).toBe(logo);await expect(frame.locator('#poster-title')).toHaveText('FIND YOUR NEXT CHAPTER.');
  await backToPreview(page);await expect(frame.locator('#poster-title')).toHaveText('FIND YOUR NEXT CHAPTER.');
});
