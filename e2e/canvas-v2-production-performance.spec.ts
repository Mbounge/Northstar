import { expect, test, type Page } from "@playwright/test";

const image = (page: Page, index: number) => page.locator(`[data-canvas-v2-node-id="stress-image-${index}"]`);

async function center(page: Page, index: number) {
  const bounds = await image(page, index).boundingBox();
  if (!bounds) throw new Error(`Image ${index} is outside the production test viewport.`);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function move(page: Page, index: number) {
  const point = await center(page, index);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 18, point.y + 16, { steps: 4 });
  await page.mouse.up();
}

test("optimized production canvas keeps screenshot-rich consecutive interactions responsive", async ({ page }) => {
  await page.goto("/canvas-v2-e2e/stress?scenario=composition");
  // The canvas virtualizes offscreen nodes: the 240-image revision keeps about
  // 70 images mounted in a desktop viewport while preserving the full document.
  await expect.poll(() => page.locator('[data-canvas-v2-native-scene] img').count()).toBeGreaterThan(50);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-canvas-v2-native-scene] img')].every((item) => item.complete));
  await expect(page.locator('[data-testid="canvas-v2-committed-revision"]')).toHaveText("stress-composition");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorX)).toBe("none");

  await page.getByRole('button',{name:'Design view',exact:true}).click();
  await page.evaluate(() => window.__northstarCanvasPerf?.clear());
  // Use adjacent columns; the contextual toolbar intentionally occupies the next row.
  const ids = [96, 97, 98, 99];
  for (let index = 0; index < ids.length; index += 1) {
    await move(page, ids[index]);
    if (index + 1 < ids.length) {
      const next = await center(page, ids[index + 1]);
      await page.mouse.click(next.x, next.y);
      await page.mouse.click(next.x, next.y);
      const selected = page.getByTestId("canvas-v2-element-selection");
      await expect.poll(async () => {
        const overlay = await selected.boundingBox();
        const target = await image(page, ids[index + 1]).boundingBox();
        return Boolean(overlay && target && Math.abs(overlay.x - target.x) < 3 && Math.abs(overlay.y - target.y) < 3);
      }).toBe(true);
    }
  }

  const beforePan = await page.locator('[data-canvas-v2-workspace-surface]').getAttribute("style");
  await page.mouse.move(710, 510);
  await page.mouse.wheel(250, 0);
  await expect.poll(() => page.locator('[data-canvas-v2-workspace-surface]').getAttribute("style")).not.toBe(beforePan);
  expect(page.url()).toContain("/canvas-v2-e2e/stress?scenario=composition");

  const records = await page.evaluate(() => window.__northstarCanvasPerf?.records ?? []);
  const releases = records.filter((item) => item.kind === "pointerup");
  const slowFrames = records.filter((item) => item.kind === "long-animation-frame" && (item.duration ?? 0) > 200);
  test.info().annotations.push({ type: "production-canvas-performance", description: JSON.stringify({ releases: releases.length, slowFrames: slowFrames.map((item) => Math.round(item.duration ?? 0)) }) });
  expect(releases.length).toBeGreaterThanOrEqual(7);
  expect(slowFrames).toEqual([]);
  expect(await page.locator('[data-canvas-v2-native-scene] img').count()).toBeGreaterThan(50);
});

// The development recorder's DOM snapshots can themselves block a dense board.
// Measure the optimized app, without tracing, and retain explicit timing data.
test('optimized production inspector preserves its value, private state and history across 52-app saves', async ({ page }, info) => {
  await page.setViewportSize({width:1512,height:1000});
  await page.goto('/canvas-v2-e2e/responsive-editing');
  await expect(page.locator('iframe')).toHaveCount(52);
  const sources=()=>page.locator('[data-canvas-v2-node-id][data-canvas-v2-screen]').evaluateAll(es=>es.map(e=>[e.getAttribute('data-canvas-v2-node-id'),e.getAttribute('data-canvas-v2-screen')]));
  const original=await sources();
  const frame=page.frameLocator('iframe[title="Campaign · responsive headline"]');
  await expect.poll(()=>frame.locator('body').evaluate(()=>(window as typeof window&{fixtureBoot?:number}).fixtureBoot)).toBeTruthy();
  await frame.locator('#draft').fill('Production private draft');
  // Chromium frame locators can report unscaled layout coordinates here.
  // Send actual pointer input at the displayed control, as the editing suite does.
  const inner=await frame.locator('#save').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
  const outer=await page.locator('iframe[title="Campaign · responsive headline"]').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,sx:r.width/el.clientWidth,sy:r.height/el.clientHeight}});
  await page.mouse.click(outer.x+inner.x*outer.sx,outer.y+inner.y*outer.sy);
  await expect(frame.locator('#status')).toHaveText('Saved 1');
  const boot=await frame.locator('body').evaluate(()=>(window as typeof window&{fixtureBoot:number}).fixtureBoot);
  await page.getByRole('button',{name:'Collapse North Star panel',exact:true}).click();
  await page.getByRole('button',{name:'Design view',exact:true}).click();
  await page.getByTestId('canvas-v2-native-scene').getByText('Campaign · responsive headline',{exact:true}).click();
  await page.getByRole('treeitem',{name:'Select layer YOUR BEST.',exact:true}).click();
  const colour=page.getByRole('textbox',{name:'Text colour',exact:true});
  await expect(colour).toBeVisible();
  await page.evaluate(()=>{
    const state=window as typeof window&{productionSamples:{started:number;values:string[]}[];productionLongTasks:number[]};
    state.productionSamples=[];state.productionLongTasks=[];
    document.querySelector('[aria-label="Text colour"]')!.addEventListener('input',()=>{
      const sample={started:performance.timeOrigin+performance.now(),values:[] as string[]};state.productionSamples.push(sample);
      const read=()=>{if(state.productionSamples.at(-1)!==sample)return;const field=document.querySelector<HTMLInputElement>('[aria-label="Text colour"]');sample.values.push(field?.value??'MISSING');requestAnimationFrame(read);};requestAnimationFrame(read);
    });
    new PerformanceObserver(list=>{state.productionLongTasks.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask',buffered:false});
  });
  await frame.locator('.first').evaluate(el=>{
    const state=window as typeof window&{productionPaints:number[]};state.productionPaints=[];let last=getComputedStyle(el).color;
    new MutationObserver(()=>{const next=getComputedStyle(el).color;if(last===next)return;last=next;requestAnimationFrame(()=>state.productionPaints.push(performance.timeOrigin+performance.now()));}).observe(el,{attributes:true,attributeFilter:['style']});
  });
  const before:string[]=[],timings:number[]=[];
  const requested=['#FFC84B','#AB98FF','#68CFE5','#F7A0AD','#FFFFFF'];
  const source=page.locator('[data-canvas-v2-node-id="studio-0"][data-canvas-v2-screen]');
  for(const [index,value] of requested.entries()){
    before.push((await source.getAttribute('data-canvas-v2-screen'))!);
    await colour.fill(value);
    await expect.poll(()=>frame.locator('body').evaluate(()=>(window as typeof window&{productionPaints:number[]}).productionPaints.length)).toBeGreaterThan(index);
    const paint=await frame.locator('body').evaluate(()=>(window as typeof window&{productionPaints:number[]}).productionPaints.at(-1)!);
    const started=await page.evaluate(()=>(window as typeof window&{productionSamples:{started:number}[]}).productionSamples.at(-1)!.started);
    timings.push(paint-started);
    await expect(source).not.toHaveAttribute('data-canvas-v2-screen',before[index]);
    await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  }
  const measured=await page.evaluate(()=>{
    const state=window as typeof window&{productionSamples:{started:number;values:string[]}[];productionLongTasks:number[]};
    const result={samples:state.productionSamples.map(s=>({...s,values:[...new Set(s.values)]})),longTaskMs:state.productionLongTasks};state.productionSamples=[];return result;
  });
  const {writeFile}=await import('node:fs/promises');
  const report={build:'optimized production',trace:false,screens:52,inputToPaintMs:timings,...measured};
  await writeFile(info.outputPath('production-inspector-timing.json'),JSON.stringify(report,null,2));
  await info.attach('Production inspector timings',{path:info.outputPath('production-inspector-timing.json'),contentType:'application/json'});
  for(const [index,value] of requested.entries())expect(measured.samples[index].values,`inspector must not flash an old value after ${value}`).toEqual([value]);
  expect(Math.max(...timings)).toBeLessThan(150);
  expect(measured.longTaskMs.filter(ms=>ms>200)).toEqual([]);
  for(const expected of before.toReversed()){
    await page.getByRole('button',{name:'Undo canvas action',exact:true}).click();
    await expect(source).toHaveAttribute('data-canvas-v2-screen',expected);
    await expect(colour).toBeVisible();
  }
  expect(await sources()).toEqual(original);
  await expect(colour).toHaveValue('#FFFFFF');
  await expect(frame.locator('#draft')).toHaveValue('Production private draft');
  await expect(frame.locator('#status')).toHaveText('Saved 1');
  expect(await frame.locator('body').evaluate(()=>(window as typeof window&{fixtureBoot:number}).fixtureBoot)).toBe(boot);
  await page.screenshot({path:info.outputPath('production-inspector-restored.png')});
});
