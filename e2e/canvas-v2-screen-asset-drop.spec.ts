import path from 'node:path';
import { clickScreen,screenPoint } from './canvas-v2-screen-input-helpers';
import { expect, test, type Page } from '@playwright/test';
import { fitAllCanvas } from './canvas-v2-authoring-helpers';

const original = path.resolve('public/northstar/design-references/evidence-canvas.png');
const replacement = path.resolve('public/northstar/design-references/decision-atelier.png');

async function dropFile(page: Page, target: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const data = {items:[],files:[replacement],dragOperationsMask:1};
  await cdp.send('Input.dispatchDragEvent',{type:'dragEnter',...target,data});
  const surface = page.getByTestId('screen-asset-drop-surface');
  await expect(surface).toBeVisible();
  await surface.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await cdp.send('Input.dispatchDragEvent',{type:'dragEnter',x:target.x+1,y:target.y+1,data});
  await cdp.send('Input.dispatchDragEvent',{type:'dragOver',...target,data});
  await expect(surface.getByText('Replace image',{exact:true})).toBeVisible();
  await cdp.send('Input.dispatchDragEvent',{type:'drop',...target,data});
  await expect(surface).toHaveCount(0);
  await cdp.detach();
}

for (const background of [false,true]) {
  test(`direct drop changes one ${background?'background':'image'} and preserves the running app, source, geometry and history`,async({page})=>{
    test.setTimeout(120000);
    await page.setViewportSize({width:1680,height:1100});
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/canvas-v2-e2e/codex');

    if (background) await page.getByLabel('Choose images for the canvas',{exact:true}).setInputFiles(original);
    else {
      await page.getByRole('button',{name:'assets',exact:true}).click();
      await page.getByRole('button',{name:'Add project images',exact:true}).click();
      await page.getByLabel('Choose images for the canvas',{exact:true}).setInputFiles([original,replacement]);
      await expect(page.getByRole('button',{name:'Preview decision atelier',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Preview decision atelier',exact:true}).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button',{name:'chat',exact:true}).click();
    }
    const nativeImageCount = background ? 1 : 0;
    await expect(page.getByTestId('canvas-v2-native-scene').locator('img[data-canvas-v2-native-runtime-node]')).toHaveCount(nativeImageCount);
    await page.getByRole('textbox',{name:'Message North Star'}).fill(`screen direct asset ${background?'background':''}`);
    await page.getByRole('button',{name:'Send message',exact:true}).click();
    await expect(page.getByText('The studio screen is ready for direct editing.',{exact:true})).toBeVisible();
    await fitAllCanvas(page);
    const scene=page.getByTestId('canvas-v2-native-scene'), object=scene.locator('[data-canvas-v2-screen]');
    const frame=page.frameLocator('iframe[title="Fieldnotes · studio editing"]');
    await expect(frame.locator('#hero')).toBeVisible();
    const value=()=>frame.locator('#hero').evaluate(el=>{const value=el.tagName==='IMG'?(el as HTMLImageElement).src:getComputedStyle(el).backgroundImage;let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return (hash>>>0).toString(16)});
    const sourceBefore=await object.getAttribute('data-canvas-v2-screen');
    const before=await value(),mark=await frame.locator('#mark').getAttribute('src');
    const geometry=await object.getAttribute('style'),camera=await scene.evaluate(el=>el.parentElement?.style.transform);
    const boot=await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot);
    expect(typeof boot).toBe('number');
    await frame.locator('#name').fill('A notebook of my own');
    await clickScreen(page,'#save');
    await expect(frame.locator('#status')).toHaveText('Saved 1 · A notebook of my own');
    await frame.locator('#feed').evaluate(el=>{el.scrollTop=45;});
    const scroll=await frame.locator('#feed').evaluate(el=>el.scrollTop);
    const target=await screenPoint(page,'#hero');
    if (background) await dropFile(page,target);
    else {
      await page.getByRole('button',{name:'assets',exact:true}).click();
      const origin=await page.getByRole('button',{name:'Preview decision atelier',exact:true}).boundingBox();
      await page.mouse.move(origin!.x+origin!.width/2,origin!.y+origin!.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:12});await page.mouse.up();
      await page.getByRole('button',{name:'chat',exact:true}).click();
    }
    await expect.poll(value).not.toBe(before);
    await expect(frame.locator('#name')).toHaveValue('A notebook of my own');
    expect(await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot)).toBe(boot);
    expect(await frame.locator('#feed').evaluate(el=>el.scrollTop)).toBe(scroll);
    expect(await frame.locator('#mark').getAttribute('src')).toBe(mark);
    expect(await object.getAttribute('style')).toBe(geometry);
    expect(await scene.evaluate(el=>el.parentElement?.style.transform)).toBe(camera);
    await expect(scene.locator('img[data-canvas-v2-native-runtime-node]')).toHaveCount(nativeImageCount);
    const sourceAfter=await object.getAttribute('data-canvas-v2-screen');
    expect(sourceAfter).not.toBe(sourceBefore);
    const readSource=(encoded:string)=>JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    expect(readSource(sourceAfter!).javascript).toBe(readSource(sourceBefore!).javascript);
    expect(readSource(sourceAfter!).referenceAssetIds).toHaveLength(2);
    await clickScreen(page,'#save');
    await expect(frame.locator('#status')).toHaveText('Saved 2 · A notebook of my own');
    await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
    await expect.poll(value).toBe(before);
    await expect(frame.locator('#name')).toHaveValue('A notebook of my own');
    expect(await frame.locator('body').evaluate(()=> (window as unknown as {studioBoot:number}).studioBoot)).toBe(boot);
    await page.getByRole('button',{name:'Redo canvas action',exact:true}).click();
    await expect.poll(value).not.toBe(before);
    await clickScreen(page,'#save');
    await expect(frame.locator('#status')).toHaveText('Saved 3 · A notebook of my own');
    const edge=await object.boundingBox();
    await page.mouse.click(edge!.x-3,edge!.y+edge!.height/2);
    await page.getByRole('textbox',{name:'Message North Star'}).fill('screen direct asset followup');
    await page.getByRole('button',{name:'Send message',exact:true}).click();
    await expect(page.getByText('Refined the title while preserving the direct image edit.',{exact:true})).toBeVisible();
    await expect(frame.getByRole('heading',{name:'Make room for your next idea.'})).toBeVisible();
    expect(readSource((await object.getAttribute('data-canvas-v2-screen'))!).referenceAssetIds).toHaveLength(2);
    await expect.poll(value).not.toBe(before);
    await expect(frame.locator('#name')).toHaveValue('A notebook of my own');
    await clickScreen(page,'#save');
    await expect(frame.locator('#status')).toHaveText('Saved 4 · A notebook of my own');
    expect(errors).toEqual([]);
  });
}
