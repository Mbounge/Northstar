import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAccountTools, parseAccountQuery, accountResultForModel, AccountToolHandles, readAccountAssetPixels } from '../lib/canvas-v2/account-tools';
import { CANVAS_V2_E2E_APPS } from '../app/canvas-v2-e2e/research-fixture';
import { createCanvasV2AccountEvidenceProvider } from '../lib/canvas-v2/account-evidence-provider';
import { mergeCanvasV2EvidencePackets } from '../lib/canvas-v2/evidence-packets';
import { NORTHSTAR_AGENT_TOOLS } from '../lib/canvas-v2/managed-agent/config';

const catalog = { tenantId: 'account-a', apps: CANVAS_V2_E2E_APPS };
const read = (q: unknown) => readAccountTools(catalog, parseAccountQuery(q));

test('account tool registration includes research, pixel inspection and original canonical insertion', () => {
  const names = NORTHSTAR_AGENT_TOOLS.flatMap(t => 'name' in t ? [t.name] : []);
  for (const name of ['account_read', 'inspect_asset', 'canvas_insert_flow']) assert.ok(names.includes(name));
});
test('lists authorized apps and distinguishes onboarding/browsing and platform', async () => {
  const apps = await read({ operation: 'list-apps', limit: 1 });
  assert.equal(apps.apps.length, 1); assert.equal(apps.pagination.nextOffset, 1); assert.deepEqual(apps.apps[0].flows, []);
  const onboarding = await read({ operation: 'list-flows', appId: 'app:awin', sessionType: 'onboarding', platform: 'mobile' });
  const browsing = await read({ operation: 'list-flows', appId: 'app:awin', sessionType: 'browsing', platform: 'web' });
  assert.equal(onboarding.flows.length, 1); assert.equal(browsing.flows.length, 1);
  assert.notEqual(onboarding.flows[0].id, browsing.flows[0].id);
  assert.deepEqual(onboarding.flows[0].journeySegments?.map(s => s.kind), ['shared-entry', 'branch']);
});
test('full canonical journey is retained while model screenshot reads paginate without losing order', async () => {
  const result = await read({ operation: 'flow-screens', appId: 'app:awin', flowId: 'flow:awin:onboarding', offset: 40, limit: 10 });
  assert.equal(result.flows[0].screens.length, 47);
  assert.equal(result.evidence.filter(a => a.kind === 'screenshot').length, 47);
  const model = accountResultForModel(result, 10);
  assert.deepEqual(model.screens.map(s => s.index), [40, 41, 42, 43, 44, 45, 46]);
  assert.equal(model.pagination.nextOffset, undefined);
  assert.equal(model.flows[0].screenCount, 47);
  assert.equal(model.packets[0].source.permission, 'authorized');
  assert.ok(model.evidence.every(a => a.url.startsWith('northstar-asset:')));
});
test('unknown IDs cannot select another app or cross onboarding/browsing boundaries', async () => {
  assert.equal((await read({ operation: 'flow-screens', appId: 'another-account-app', flowId: 'flow:awin:onboarding' })).evidence.length, 0);
  assert.equal((await read({ operation: 'flow-screens', appId: 'app:awin', flowId: 'flow:awin:onboarding', sessionType: 'browsing' })).evidence.length, 0);
  const search = await read({ operation: 'search', appId: 'app:awin', sessionType: 'browsing', query: 'message' });
  assert.ok(search.flows.length); assert.ok(search.flows.every(f => f.sessionType === 'browsing'));
});
test('rejects malformed paging and filters without taking a caller tenant identity', () => {
  assert.throws(() => parseAccountQuery({ operation: 'business', offset: -1 }));
  assert.throws(() => parseAccountQuery({ operation: 'list-flows', sessionType: 'secret' }));
  assert.equal((parseAccountQuery({ operation: 'list-apps', tenantId: 'other-account' }) as unknown as Record<string, unknown>).tenantId, undefined);
});
test('real account provider feeds marketing and business packets into the same retained composition inventory', async () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://account.example';
  const chain = { select() { return this; }, eq() { return this; }, ilike() { return this; }, order() { return this; }, limit() { return Promise.resolve({ data: [{ snapshot_id: '2026-09-01' }] }); } };
  const provider = createCanvasV2AccountEvidenceProvider({ tenantId: catalog.tenantId, catalog, supabase: { from: () => chain } as unknown as SupabaseClient, fetcher: async input => {
    const url = String(input); assert.ok(url.includes('account-a/')); assert.ok(url.toLowerCase().includes('awin/'));
    if (url.endsWith('master_feed.json')) return Response.json(Array.from({ length: 31 }, (_, i) => ({ post_text: `Campaign ${i}`, screenshot: `post-${i}.png`, platform: 'LinkedIn' })));
    if (url.endsWith('master_manifest.json')) return Response.json({ jobs: Array.from({ length: 25 }, (_, i) => ({ title: `Role ${i}`, screenshots: [`role-${i}.png`] })), pages: [] });
    return Response.json(Array.from({ length: 27 }, (_, i) => ({ name: `Person ${i}`, role: 'Research' })));
  } });
  try {
    let retained = [] as Awaited<ReturnType<typeof readAccountTools>>['packets'];
    for (const operation of ['marketing', 'business'] as const) {
      let offset: number | undefined = 0;
      while (offset !== undefined) {
        const result = await readAccountTools(catalog, parseAccountQuery({ operation, appId: 'app:awin', offset, limit: 10 }), provider);
        assert.equal(result.issues.length, 0);
        retained = mergeCanvasV2EvidencePackets(retained, result.packets);
        offset = result.pagination.nextOffset;
      }
    }
    const marketing = retained.find(p => p.kind === 'marketing-signal')!;
    const business = retained.find(p => p.kind === 'business-record')!;
    assert.equal(marketing.assets.length, 31);
    assert.equal(business.assets.length, 25);
    assert.equal(business.facts.filter(f => f.label === 'Identified person').length, 27);
    assert.equal(business.facts.filter(f => f.label === 'Open role').length, 25);
    assert.equal(marketing.source.capturedAt, '2026-09-01');
    assert.ok(marketing.assets.every(a => a.source?.providerId === 'northstar-account-intelligence'));
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous; }
});


test('short account handles round-trip encoded branch IDs through inspection, plans and source patches', async () => {
  const result = await read({ operation: 'flow-screens', appId: 'app:awin', flowId: 'flow:awin:onboarding' });
  result.evidence[1].id = 'screen:tenant:awin:mobile:onboarding:journey%3A1:creator%252Fsocial:screen:17';
  const handles = new AccountToolHandles(); handles.remember(result);
  const canonical = result.evidence[1].id;
  const alias = handles.encode(canonical);
  assert.match(alias, /^ns-asset-\d+$/); assert.ok(alias.length < 20);
  const patch = { patch: JSON.stringify({ operations: [{ op: 'append-html', html: `<img data-canvas-v2-evidence-id="${canonical}" src="northstar-asset:${canonical}">` }] }), evidenceIds: result.evidence.map(a => a.id) };
  assert.deepEqual(handles.decode(handles.encode(patch)), patch);
  const original = handles.encode(result.evidence.map(a => a.id));
  handles.remember(result); assert.deepEqual(handles.encode(result.evidence.map(a => a.id)), original);
  assert.equal(handles.encode('https://example.com/' + canonical), 'https://example.com/' + canonical);
  assert.equal(handles.decode('ns-asset-999999'), 'ns-asset-999999');
});

test('account image inspection sends fetched pixels rather than a remote image URL', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1kAAAAASUVORK5CYII=', 'base64');
  const pixels = await readAccountAssetPixels('https://account.example/screen.png', new AbortController().signal, async (_url, init) => {
    assert.equal(init?.credentials, 'omit');
    return new Response(bytes, { headers: { 'content-type': 'image/png' } });
  });
  assert.equal(pixels, `data:image/png;base64,${bytes.toString('base64')}`);
  await assert.rejects(readAccountAssetPixels('https://account.example/missing.png', new AbortController().signal, async () => new Response('', { status: 404 })), /could not be loaded/);
});
