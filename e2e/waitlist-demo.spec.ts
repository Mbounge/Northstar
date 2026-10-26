import { expect, test } from '@playwright/test';

test('the public waitlist plays its real demo without a gesture and signup remains usable',async({page},info)=>{
  await page.setViewportSize({width:1512,height:982});
  await page.route('**/api/waitlist',route=>route.fulfill({json:{ok:true}}));
  await page.goto('/waitlist?source=twitter');
  const video=page.locator('video');
  await expect(video).toBeVisible();
  await expect.poll(()=>video.evaluate(v=>({playing:!v.paused,loaded:v.readyState>=2,muted:v.muted,time:v.currentTime>0})),{timeout:30000}).toEqual({playing:true,loaded:true,muted:true,time:true});
  expect(await video.evaluate(v=>({controls:v.controls,inline:v.playsInline,loop:v.loop,source:v.currentSrc}))).toEqual({controls:true,inline:true,loop:true,source:expect.stringContaining('northstar-demo-20261026.mp4')});
  const media=await page.request.get('/northstar/demo/northstar-demo-20261026.mp4',{headers:{Range:'bytes=0-1023'}});
  expect(media.status()).toBe(206);expect(media.headers()['content-type']).toContain('video/mp4');
  await page.screenshot({path:info.outputPath('waitlist-desktop.png')});
  await page.getByLabel('Email address',{exact:true}).fill('demo-trial@example.invalid');
  await page.getByRole('button',{name:'Join the waitlist',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('You’re on the list.');
});

test('phones receive the smaller inline demo with no horizontal overflow',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/waitlist');
  const video=page.locator('video');
  await expect.poll(()=>video.evaluate(v=>v.currentSrc)).toContain('northstar-demo-20261026-720p.mp4');
  await expect.poll(()=>video.evaluate(v=>!v.paused&&v.currentTime>0),{timeout:30000}).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Join the waitlist',exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath('waitlist-mobile.png'),fullPage:true});
});

test('reduced motion keeps the poster still and leaves playback controls available',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/waitlist');
  const video=page.locator('video');await expect(video).toBeVisible();
  await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(true);
  expect(await video.evaluate(v=>v.controls)).toBe(true);
  await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();
});
