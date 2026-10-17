import type { Page } from '@playwright/test';

/** Chromium's frame locators return layout coordinates for transformed frames.
 * Exercise real native input at the control's displayed canvas position. */
export async function screenPoint(page: Page, selector: string) {
  const frame=page.frameLocator('iframe[title="Fieldnotes · studio editing"]');
  const inner=await frame.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  const outer=await page.locator('iframe[title="Fieldnotes · studio editing"]').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,scaleX:r.width/el.clientWidth,scaleY:r.height/el.clientHeight}});
  return {x:outer.x+inner.x*outer.scaleX,y:outer.y+inner.y*outer.scaleY};
}

export async function clickScreen(page: Page,selector: string,options?: {button?:'left'|'right';clickCount?:number}) {
  await page.frameLocator('iframe[title="Fieldnotes · studio editing"]').locator(selector).scrollIntoViewIfNeeded();
  const point=await screenPoint(page,selector);
  await page.mouse.click(point.x,point.y,options);
}
