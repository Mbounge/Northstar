import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function storage(page: Page) {
 const rows:Record<string,any>={}; const blobs=new Map<string,string>();
 await page.route('**/rest/v1/northstar_sessions*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='POST'){
   const body=req.postDataJSON();const row={...body,id:randomUUID(),title:'Untitled canvas',version:0,snapshot_path:null,model:'gpt-5.6-luna',effort:'high',archived:false,updated_at:new Date().toISOString()};rows[row.id]=row;
   await route.fulfill({json:row});return;
  }
  const id=url.searchParams.get('id')?.replace('eq.','');await route.fulfill({json:id?rows[id]:Object.values(rows)});
 });
 await page.route('**/rest/v1/rpc/northstar_session_*',async route=>{
  const action=route.request().url().split('/').pop()!,body=route.request().postDataJSON(),row=rows[body.sid];
  let data:unknown=null;
  if(action==='northstar_session_lease')data=true;
  if(action==='northstar_session_save'){
   if(row.version!==body.expected_version){await route.fulfill({status:409,json:{message:'Conflict'}});return;}
   row.version++;row.snapshot_path=body.path;row.model=body.next_model;row.effort=body.next_effort;data=row.version;
  }
  if(action==='northstar_session_rename')row.title=body.value;
  if(action==='northstar_session_archive')row.archived=body.value;
  await route.fulfill({json:data});
 });
 await page.route('**/storage/v1/object/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  const key=decodeURIComponent(url.pathname.split('northstar-sessions/')[1]||'');
  if(req.method()==='POST'){
   const body=new Response(new Uint8Array(req.postDataBuffer() || []),{headers:req.headers()});
   const type=req.headers()['content-type']||'';
   const text=type.includes('multipart')?await((await body.formData()).get('file') as File).text():await body.text();
   blobs.set(key,text);await route.fulfill({json:{Key:`northstar-sessions/${key}`}});return;
  }
  if(req.method()==='DELETE'){await route.fulfill({json:[]});return;}
  await route.fulfill({status:blobs.has(key)?200:404,contentType:'application/json',body:blobs.get(key)||'{}'});
 });
 await page.route('**/api/canvas-v2/sessions/release',route=>route.fulfill({status:204}));
 return {rows,blobs};
}
const active=(page:Page)=>page.frameLocator('iframe[aria-hidden="false"]');
const send=async(page:Page,text:string)=>{const f=active(page);await f.getByLabel('Message North Star',{exact:true}).fill(text);await f.getByRole('button',{name:'Send message',exact:true}).click();};
const menu=async(page:Page)=>{await active(page).getByRole('button',{name:'Canvas menu',exact:true}).click();};

test('saved sessions autosave chat, native canvas, draft and selected model; temporary sessions reset',async({page})=>{
 test.setTimeout(180_000);const db=await storage(page);
 await page.goto('/canvas?sessionTest=1');
 await expect(active(page).getByLabel('Message North Star',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save session',exact:true})).toHaveCount(0);
 await send(page,'Put it on the canvas');
 const finding=()=>active(page).getByTestId('canvas-v2-native-scene').locator('[data-canvas-v2-node-id="codex-finding"]');
 await expect(finding()).toHaveText('The evidence changes the explanation.');
 await expect(active(page).getByRole('button',{name:'Stop current response'})).toHaveCount(0);
 await active(page).getByRole('button',{name:'Model and thinking: GPT-5.6 Luna, high'}).click();
 await active(page).getByRole('radio',{name:'GPT-6 Astra',exact:true}).click();
 await active(page).getByRole('radio',{name:'medium',exact:true}).click();
 await active(page).getByRole('dialog',{name:'Model and thinking'}).press('Escape');
 await active(page).getByLabel('Message North Star',{exact:true}).fill('My saved draft');
 await expect.poll(()=>Object.values(db.rows).some(row=>row.snapshot_path && JSON.parse(db.blobs.get(row.snapshot_path)!).draft==='My saved draft')).toBe(true);
 const savedId=Object.keys(db.rows)[0];
 await page.reload();
 await expect(active(page).getByLabel('Message North Star',{exact:true})).toHaveValue('My saved draft');
 await expect(finding()).toHaveText('The evidence changes the explanation.');
 await expect(active(page).getByRole('button',{name:'Model and thinking: GPT-6 Astra, medium'})).toBeVisible();
 await menu(page);await page.getByRole('button',{name:'New temporary session',exact:true}).click();
 await expect(active(page).getByLabel('Message North Star',{exact:true})).toHaveValue('');
 await expect(finding()).toHaveCount(0);
 await expect(active(page).getByRole('button',{name:'Model and thinking: GPT-5.6 Luna, high'})).toBeVisible();
 await active(page).getByLabel('Message North Star',{exact:true}).fill('Discard this on refresh');
 await page.reload();await expect(active(page).getByLabel('Message North Star',{exact:true})).toHaveValue('');
 expect(Object.keys(db.rows)).toEqual([savedId]);
});

test('switching sessions keeps a running native loop mounted and isolates another canvas',async({page})=>{
 test.setTimeout(150_000);await storage(page);
 await page.goto('/canvas?sessionTest=1');await send(page,'hold first session');
 await expect(active(page).getByRole('button',{name:'Stop current response'})).toBeVisible();
 await menu(page);await page.getByRole('button',{name:'New session',exact:true}).click();
 await send(page,'Put it on the canvas');
 await expect(active(page).getByTestId('canvas-v2-native-scene').locator('[data-canvas-v2-node-id="codex-finding"]')).toHaveText('The evidence changes the explanation.');
 await menu(page);await page.getByRole('button',{name:'hold first session',exact:true}).click();
 await expect(active(page).getByRole('button',{name:'Stop current response'})).toBeVisible();
 await expect(active(page).getByTestId('canvas-v2-native-scene').locator('[data-canvas-v2-node-id="codex-finding"]')).toHaveCount(0);
 await active(page).getByRole('button',{name:'Stop current response'}).click();
 await expect(active(page).getByRole('button',{name:'Stop current response'})).toHaveCount(0);
 expect(await page.locator('iframe[title^="Canvas:"]').count()).toBe(2);
});
