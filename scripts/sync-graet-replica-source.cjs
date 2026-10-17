#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Keep the simulator's reference frames tied to the current GRAET tenant release.
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const tenantId = '89fdc79c-a783-4dd3-8761-d1ac25a35551';
const root = path.join(__dirname, '..');
const output = path.join(root, 'public/graet-replica/tenant-source');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Northstar tenant storage credentials are unavailable');
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const sessions = await Promise.all(['onboarding', 'browsing'].map(async (lane) => {
    const { data, error } = await db.from('app_sessions').select('total_screens,flows_data')
      .eq('tenant_id', tenantId).eq('app_name', 'GRAET').eq('platform', 'mobile')
      .eq('session_type', lane).single();
    if (error) throw error;
    const expected = lane === 'onboarding' ? 20 : 95;
    if (data.total_screens !== expected || data.flows_data?.screen_catalog?.length !== expected) {
      throw new Error(`${lane} is no longer the reviewed ${expected}-screen release`);
    }
    return { lane, catalog: data.flows_data.screen_catalog };
  }));
  fs.mkdirSync(output, { recursive: true });
  const manifest = [];
  for (const { lane, catalog } of sessions) {
    for (const entry of catalog) {
      const source = new URL(entry.screenshot_file);
      const marker = '/storage/v1/object/public/reviews/';
      if (!source.pathname.includes(marker)) throw new Error(`Unexpected screenshot URL for step ${entry.timeline_step}`);
      const objectKey = decodeURIComponent(source.pathname.split(marker)[1]);
      if (!objectKey.startsWith(`${tenantId}/GRAET/${lane}/screenshots/`)) {
        throw new Error(`Screenshot for step ${entry.timeline_step} is outside the GRAET ${lane} release`);
      }
      const filename = path.basename(objectKey);
      const file = path.join(output, filename);
      const { data, error } = await db.storage.from('reviews').download(objectKey);
      if (error) throw error;
      const bytes = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(file, bytes);
      manifest.push({ step: entry.timeline_step, lane, label: entry.display_label, file: filename, bytes: bytes.length });
    }
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Synced ${manifest.length} screenshots from the current GRAET tenant release`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
