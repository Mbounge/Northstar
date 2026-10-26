import { expect, test, type Locator, type Page } from '@playwright/test';
import { placeActivatedTool } from './canvas-v2-authoring-helpers';

async function settled(page:Page) {
  await expect.poll(()=>page.getByRole('region',{name:'Canvas workspace',exact:true}).getAttribute('data-canvas-v2-camera-preview')).toBeNull();
}
async function box(locator:Locator) {
  const value=await locator.boundingBox();expect(value).not.toBeNull();return value!;
}
function sameBox(a:Awaited<ReturnType<typeof box>>,b:typeof a) {
  expect(b.x).toBeCloseTo(a.x,0);expect(b.y).toBeCloseTo(a.y,0);
}

test('object controls and an open line palette stay still through live and settled camera frames',async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:1700,height:1000});
  await page.goto('/canvas-v2-e2e');
  const collapse=page.getByRole('button',{name:'Collapse North Star panel',exact:true});if(await collapse.isVisible())await collapse.click();
  await page.getByTitle('Create Shape · drag to place').click();await placeActivatedTool(page);
  const shape=page.getByTestId('canvas-v2-native-scene').locator('[data-canvas-v2-primitive="shape"]');
  await shape.click();
  const toolbar=page.getByTestId('canvas-v2-context-toolbar');await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button',{name:'Change line',exact:true}).click();
  const palette=page.getByTestId('canvas-v2-line-palette');await expect(palette).toBeVisible();
  const original=await box(toolbar),menu=await box(palette),art=await box(shape);
  expect(menu.x+menu.width/2).toBeCloseTo(original.x+original.width/2,0);
  const source=await shape.getAttribute('style');
  // Physical wheel input is delivered through the open inspector too.
  const trigger=await box(toolbar.getByRole('button',{name:'Change line',exact:true}));
  await page.mouse.move(trigger.x+trigger.width/2,trigger.y+trigger.height/2);
  for(const [x,y] of [[-25,-12],[-25,-12],[20,8],[-15,-8]]) {
    await page.mouse.wheel(x,y);
    sameBox(original,await box(toolbar));sameBox(menu,await box(palette));
    await settled(page);sameBox(original,await box(toolbar));sameBox(menu,await box(palette));
  }
  expect((await box(shape)).x).not.toBeCloseTo(art.x,0);
  await page.keyboard.down('Control');await page.mouse.wheel(0,-14);await page.keyboard.up('Control');
  await settled(page);sameBox(original,await box(toolbar));sameBox(menu,await box(palette));
  expect(await shape.getAttribute('style')).toBe(source);
  const oldColour=await shape.evaluate(el=>getComputedStyle(el).borderColor);
  await palette.getByRole('button',{name:'Use Teal',exact:true}).click();
  await expect(palette.getByRole('button',{name:'Use Teal',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>shape.evaluate(el=>getComputedStyle(el).borderColor)).not.toBe(oldColour);
  sameBox(original,await box(toolbar));
  await page.setViewportSize({width:1280,height:800});await expect(toolbar).toBeVisible();
  const resized=await box(toolbar),resizedMenu=await box(palette);
  expect(resized.x).toBeGreaterThanOrEqual(0);expect(resized.x+resized.width).toBeLessThanOrEqual(1280);
  expect(resizedMenu.x).toBeGreaterThanOrEqual(11);expect(resizedMenu.x+resizedMenu.width).toBeLessThanOrEqual(1269);
  expect(resizedMenu.y).toBeGreaterThanOrEqual(11);expect(resizedMenu.y+resizedMenu.height).toBeLessThanOrEqual(789);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Design view',exact:true}).click();
  await shape.click();await expect(toolbar).toBeVisible();
  const preview=await box(toolbar);await page.mouse.move(950,650);await page.mouse.wheel(-30,-12);await settled(page);sameBox(preview,await box(toolbar));
});
