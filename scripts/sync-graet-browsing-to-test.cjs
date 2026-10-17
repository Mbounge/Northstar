#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Promote the already-published GRAET browsing capture from the Graet tenant
// into Test. The source of truth is the tenant's storage and session row.
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const app = 'GRAET';
const lane = 'browsing';
const sourceTenant = '89fdc79c-a783-4dd3-8761-d1ac25a35551';
const destinationTenant = '108d13ff-4919-40bc-a8a6-6ebe7081e9c0';
const sourcePrefix = `${sourceTenant}/${app}/${lane}`;
const destinationPrefix = `${destinationTenant}/${app}/${lane}`;
const envFile = path.join(__dirname, '..', '.env.local');
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n')
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => {
    const at = line.indexOf('=');
    return [line.slice(0, at), line.slice(at + 1)];
  }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Northstar tenant storage credentials are unavailable');
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const storage = db.storage.from('reviews');

async function filesUnder(prefix) {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const key = `${prefix}/${item.name}`;
      if (item.id === null) files.push(...await filesUnder(key));
      else files.push({ key, size: item.metadata?.size || 0 });
    }
    if (data.length < 1000) break;
  }
  return files;
}

function rebase(value) {
  return JSON.parse(JSON.stringify(value).replaceAll(sourceTenant, destinationTenant));
}

async function session(tenantId) {
  const { data, error } = await db.from('app_sessions')
    .select('tenant_id,app_name,platform,session_type,ux_grade,total_screens,manifest_path,session_intel,flows_data,steps_data')
    .eq('tenant_id', tenantId).eq('app_name', app)
    .eq('platform', 'mobile').eq('session_type', lane).single();
  if (error) throw error;
  return data;
}

async function main() {
  const [source, destination, sourceFiles, destinationFiles] = await Promise.all([
    session(sourceTenant), session(destinationTenant),
    filesUnder(sourcePrefix), filesUnder(destinationPrefix),
  ]);
  const catalog = source.flows_data?.screen_catalog;
  if (source.total_screens !== 95 || catalog?.length !== 95 || source.steps_data?.length !== 95) {
    throw new Error('Graet tenant is not the reviewed 95-screen browsing release');
  }
  if (sourceFiles.filter((file) => file.key.includes('/screenshots/')).length !== 95) {
    throw new Error('Graet tenant screenshot storage does not match its session');
  }
  const existing = new Set(destinationFiles.map((file) => file.key));
  const copy = sourceFiles.map(({ key, size }) => ({
    from: key,
    to: key.replace(sourcePrefix, destinationPrefix),
    size,
  }));
  const alreadySynced = destination.total_screens === 95 &&
    JSON.stringify(destination.flows_data) === JSON.stringify(rebase(source.flows_data)) &&
    JSON.stringify(destination.steps_data) === JSON.stringify(rebase(source.steps_data)) &&
    copy.every((file) => destinationFiles.some((stored) => stored.key === file.to && stored.size === file.size));
  if (destination.total_screens !== 136 && !alreadySynced) {
    throw new Error('Test browsing session changed; refusing to overwrite it');
  }
  console.log(`Graet source: ${source.total_screens} screens, ${sourceFiles.length} files`);
  console.log(`Test current: ${destination.total_screens} screens, ${destinationFiles.length} files`);
  if (alreadySynced) { console.log('Test is already on the reviewed Graet browsing release'); return; }
  console.log(`To copy: ${copy.filter((file) => !existing.has(file.to)).length}; to replace: ${copy.filter((file) => existing.has(file.to)).length}`);
  if (!process.argv.includes('--apply')) return;

  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < copy.length) {
      const file = copy[cursor++];
      if (existing.has(file.to)) {
        const { data, error: downloadError } = await storage.download(file.from);
        if (downloadError) throw downloadError;
        const { error } = await storage.upload(file.to, data, {
          upsert: true,
          contentType: file.to.endsWith('.json') ? 'application/json' : file.to.endsWith('.png') ? 'image/png' : file.to.endsWith('.jpg') || file.to.endsWith('.jpeg') ? 'image/jpeg' : 'text/html',
          cacheControl: '300',
        });
        if (error) throw error;
      } else {
        const { error } = await storage.copy(file.from, file.to);
        if (error) throw error;
      }
    }
  });
  await Promise.all(workers);

  const uploaded = new Map((await filesUnder(destinationPrefix)).map((file) => [file.key, file.size]));
  for (const file of copy) {
    if (uploaded.get(file.to) !== file.size) throw new Error(`Storage verification failed: ${file.to}`);
  }
  const fields = {
    ux_grade: source.ux_grade,
    total_screens: source.total_screens,
    manifest_path: rebase(source.manifest_path),
    session_intel: rebase(source.session_intel),
    flows_data: rebase(source.flows_data),
    steps_data: rebase(source.steps_data),
  };
  const { error: updateError } = await db.from('app_sessions').update(fields)
    .eq('tenant_id', destinationTenant).eq('app_name', app)
    .eq('platform', 'mobile').eq('session_type', lane);
  if (updateError) throw updateError;
  const verified = await session(destinationTenant);
  if (verified.total_screens !== 95 || verified.flows_data?.screen_catalog?.length !== 95 ||
      verified.steps_data?.length !== 95 ||
      verified.flows_data.screen_catalog.some((entry) => JSON.stringify(entry).includes(sourceTenant))) {
    throw new Error('Test tenant session verification failed');
  }
  console.log(`Test GRAET browsing now has ${verified.total_screens} tenant screenshots and ${uploaded.size} stored files`);
}

main().catch((error) => {
  console.error(`GRAET browsing sync failed: ${error.message}`);
  process.exitCode = 1;
});
