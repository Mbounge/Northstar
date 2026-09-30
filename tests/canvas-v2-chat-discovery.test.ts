import type { CanvasV2TurnTiming } from '../lib/canvas-v2/chat-lifecycle';
import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasV2RouteUsesDiscovery, canvasV2RouteMutatesCanvas, parseCanvasV2InteractionDecision } from '../lib/canvas-v2/interaction-router';
import { recoverCanvasV2LoopFromCommittedTruth, createCanvasV2Loop, canvasV2NewTurnContinuation } from '../lib/canvas-v2/design-loop';
import type { CanvasV2EvidencePacket } from '../lib/canvas-v2/types';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CanvasV2MarkdownMessage } from '../components/canvas-v2/canvas-v2-markdown-message';
import { AccountToolHandles } from '../lib/canvas-v2/account-tools';
import { citedChatEvidence } from '../lib/canvas-v2/chat-evidence';
import type { AppDataApp, AppDataFlow } from '../lib/app-data/canvas-v2-catalog';
import type { CanvasV2EvidenceAsset } from '../lib/canvas-v2/types';

test('analytical chat uses discovery but has no canvas mutation authority', () => {
  const routed = parseCanvasV2InteractionDecision({route:'research-conversation',summary:'I’ll investigate the question.',researchMode:'synthesis'}, 'Explain this using web search');
  assert.equal(canvasV2RouteUsesDiscovery(routed.route), true);
  assert.equal(canvasV2RouteMutatesCanvas(routed.route), false);
  assert.equal(routed.inquiry?.sourceCategories.includes('external'), true);
  assert.equal(routed.canvasInstruction, 'Explain this using web search');
});
test('chat evidence and read history survive discussion and an explicit visual follow-up without inheriting its output mode', () => {
  const read = { question:'How is coordination affected?', sourceIds:['recording'], issues:[] };
  const packet = { id:'recording' } as CanvasV2EvidencePacket;
  const previous = {...createCanvasV2Loop({id:'chat-1',instruction:'Explain coordination',deliveryMode:'chat'}), retainedReadPackets:[packet],readReceipts:[read]};
  const continuation = canvasV2NewTurnContinuation(previous)!;
  const visual = createCanvasV2Loop({id:'visual-1',instruction:'Put that on the canvas',deliveryMode:'canvas',continuation});
  assert.equal(visual.deliveryMode, 'canvas');
  assert.deepEqual(visual.retainedReadPackets,[packet]);
  assert.deepEqual(visual.readReceipts,[read]);
  assert.equal(visual.historyTransactionId,'visual-1');
});
test('chat Markdown renders structure and safe source links while escaping hostile HTML', () => {
  const html = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage,{content:'## Finding\n\n**Timing matters.** [Source](https://example.com/source)\n\n| Choice | Effect |\n| --- | --- |\n| Async | Flexible |\n\n> A short quote\n\n```js\nalert("example")\n```\n\n<img src=x onerror=alert(1)> [unsafe](javascript:alert(1))'}));
  for (const marker of ['<h3','<strong','<table','<blockquote','<pre','href="https://example.com/source"']) assert.ok(html.includes(marker),marker);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
});

test('account flow citations become readable names and compact, saved screen evidence in comparison tables', () => {
  const app = { id: 'app:graet', name: 'GRAET', flows: [], totalScreens: 2 } as AppDataApp;
  const flow = { id: 'flow:graet:players', name: 'Finding Players', appName: app.name, screens: [{ id: 'player-one' }, { id: 'player-two' }] } as AppDataFlow;
  const evidence = [
    { id: 'screen:player-one', label: 'Player directory', url: 'https://example.com/players.png', kind: 'screenshot' },
    { id: 'screen:player-two', label: 'Player profile', url: 'https://example.com/profile.png', kind: 'screenshot' },
  ] as CanvasV2EvidenceAsset[];
  const handles = new AccountToolHandles();
  handles.remember({ apps: [app], flows: [flow], evidence });
  const flowHandle = handles.encode(flow.id);
  const firstHandle = handles.encode(evidence[0].id);
  const secondHandle = handles.encode(evidence[1].id);
  const answer = '| Dimension | GRAET |\n| --- | --- |\n| Discovery | [Finding Players](' + flowHandle + '), ' + firstHandle + ', ' + secondHandle + ' |';
  const references = citedChatEvidence({ answer, resolve: handle => handles.resolve(handle), assets: new Map(evidence.map(asset => [asset.id, asset])), flows: new Map([[flow.id, { app, flow }]]) });
  const savedReferences = JSON.parse(JSON.stringify(references));
  const html = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage, { content: answer, evidenceReferences: savedReferences }));
  assert.ok(html.includes('Finding Players'));
  assert.ok(!html.includes('View flow'));
  assert.ok(html.includes('Player directory'));
  assert.ok(html.includes('1 of 2'));
  assert.ok(html.includes('src="https://example.com/players.png"'));
  assert.equal((html.match(/data-testid="canvas-v2-inline-screen"/g) ?? []).length, 1);
  assert.ok(!html.includes('ns-flow-'));
  assert.ok(!html.includes('ns-asset-'));
  assert.deepEqual(new AccountToolHandles(handles.entries()).decode(firstHandle), evidence[0].id);
});

test('unknown or unsafe account handles do not become image URLs or raw internal IDs in chat', () => {
  const answer = 'Unknown ns-asset-5 and [Missing flow](ns-flow-6).';
  const html = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage, { content: answer }));
  assert.ok(html.includes('Screen unavailable'));
  assert.ok(html.includes('Missing flow'));
  assert.ok(!html.includes('ns-asset-5'));
  assert.ok(!html.includes('ns-flow-6'));
  const handles = new AccountToolHandles([['screen:unsafe', 'ns-asset-5']]);
  const references = citedChatEvidence({ answer, resolve: handle => handles.resolve(handle), assets: new Map([['screen:unsafe', { id: 'screen:unsafe', label: 'Unsafe', url: 'javascript:alert(1)' } as CanvasV2EvidenceAsset]]), flows: new Map() });
  assert.deepEqual(references, {});
});

test('an adjacent screenshot range becomes one carousel without leaving a raw screen number', () => {
  const evidence = [
    { id: 'screen:one', label: 'Player filters', url: 'https://example.com/filters.png', kind: 'screenshot' },
    { id: 'screen:two', label: 'Player results', url: 'https://example.com/results.png', kind: 'screenshot' },
  ] as CanvasV2EvidenceAsset[];
  const handles = new AccountToolHandles();
  handles.remember({ apps: [], flows: [], evidence });
  const first = handles.encode(evidence[0].id);
  const second = handles.encode(evidence[1].id);
  const suffix = second.split('-').at(-1);
  const answer = 'Filters ' + first + '–' + suffix + ' show the player count.';
  const references = citedChatEvidence({ answer, resolve: handle => handles.resolve(handle), assets: new Map(evidence.map(asset => [asset.id, asset])), flows: new Map() });
  const html = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage, { content: answer, evidenceReferences: references }));
  assert.ok(html.includes('1 of 2'));
  assert.ok(!html.includes('ns-asset-'));
  assert.ok(!html.includes('–' + suffix));
});

test('chat does not repeat a flow name solely to display its citation', () => {
  for (const content of ['Explore → Finding Players ([Finding Players](ns-flow-1)) has 10 screens.', 'GRAET’s **Finding Players** (`ns-flow-1`) has 10 screens.']) {
    const html = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage, {
      content,
      evidenceReferences: { 'ns-flow-1': { kind: 'flow', handle: 'ns-flow-1', id: 'flow:players', label: 'Finding Players', appId: 'app:graet', appName: 'GRAET', screenCount: 10 } },
    }));
    assert.equal((html.match(/Finding Players/g) ?? []).length, 1);
    assert.ok(!html.includes('View flow'));
    assert.ok(!html.includes('ns-flow-1'));
  }
});

test('a chat contract failure retains research without creating a canvas repair or retry loop', () => {
  const packet = { id:'retained-source' } as CanvasV2EvidencePacket;
  const loop = { ...createCanvasV2Loop({id:'chat-failure',instruction:'Explain this',deliveryMode:'chat'}), retainedReadPackets:[packet], readReceipts:[{question:'What happened?',sourceIds:['retained-source'],issues:[]}] };
  const recovered = recoverCanvasV2LoopFromCommittedTruth({loop,kind:'phase-contract',failures:['Unexpected execution failure']});
  assert.equal(recovered.status,'paused');
  assert.equal(recovered.privateRecovery,undefined);
  assert.equal(recovered.renderRepair,undefined);
  assert.deepEqual(recovered.retainedReadPackets,loop.retainedReadPackets);
  assert.deepEqual(recovered.readReceipts,loop.readReceipts);
  assert.ok(!recovered.pauseReason?.includes('canvas'));
});


test('loose ordered lists retain one sequence and independent lists retain their starting number', () => {
  const html = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage, { content: '1. Map the journeys\n\n2. Compare the experience\n\n3. Recommend changes\n\nA separate sequence:\n\n5. Fifth step\n6. Sixth step' }));
  assert.equal((html.match(/<ol /g) ?? []).length, 2);
  for (const n of [1, 2, 3, 5, 6]) assert.ok(html.includes(`>${n}.</span>`));
  assert.ok(html.includes('<ol start="5"'));
});

test('native URL citations render exact safe links, including multiple references and URL punctuation', () => {
  const html = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage, { content: 'Claim. citehttps://www.example.com/a_(b)?x=1&y=2https://source.test/report' }));
  assert.ok(html.includes('href="https://www.example.com/a_(b)?x=1&amp;y=2"'));
  assert.ok(html.includes('href="https://source.test/report"'));
  assert.ok(html.includes('>example.com</a>'));
  assert.ok(!html.includes('cite'));
});

test('unresolved or unsafe citations do not invent links and incomplete streamed tokens do not leak', () => {
  const html = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage, { content: 'Claim. citeturn0search1javascript:alert(1)https://user:secret@example.com/\n\nStreaming citehttps://example.com/part' }));
  assert.ok(!html.includes('href='));
  assert.equal((html.match(/\[Source unavailable\]/g) ?? []).length, 3);
  assert.ok(!html.includes('cite'));
  assert.ok(!html.includes('secret'));
  assert.ok(html.includes('Streaming'));
  const literal = renderToStaticMarkup(createElement(CanvasV2MarkdownMessage, { content: '`citeturn0search1`\n\n```text\nciteturn0search1\n```' }));
  assert.equal((literal.match(/cite/g) ?? []).length, 2);
});


test('turn timing includes repeated running updates, freezes at completion, and excludes pauses on resume', async () => {
  const { canvasV2StampTurnTiming: stamp, canvasV2ElapsedLabel: label } = await import('../lib/canvas-v2/chat-lifecycle');
  const initial = { id: 'turn', createdAt: new Date(1000).toISOString(), status: 'routing' as const };
  let turns = stamp<CanvasV2TurnTiming>([], [initial], 1000);
  turns = stamp(turns, [{ ...turns[0], status: 'running' }], 4000);
  turns = stamp(turns, [{ ...turns[0], status: 'stopped' }], 6500);
  assert.equal(turns[0].elapsedMs, 5500);
  turns = stamp(turns, [...turns], 9000);
  assert.equal(turns[0].elapsedMs, 5500);
  turns = stamp(turns, [{ ...turns[0], status: 'running' }], 15000);
  turns = stamp(turns, [{ ...turns[0], status: 'responded' }], 18000);
  assert.equal(turns[0].elapsedMs, 8500);
  assert.equal(turns[0].activeSince, undefined);
  assert.equal(label(101000), '1m 41s');
  assert.equal(label(7260000), '2h 1m');
  assert.equal(label(-1), '0s');
  const feedback = stamp<CanvasV2TurnTiming>([], [{ ...initial, feedbackFor: 'parent', status: 'responded' as const }], 20000);
  assert.equal(feedback[0].elapsedMs, undefined);
});

test('export links, including angle-wrapped sandbox URLs, use retained download actions', () => {
  const artifact:import('../lib/canvas-v2/creative/types').NorthstarArtifact={id:'file1',name:'numbers.csv',label:'Numbers',mimeType:'text/csv',dataUrl:'data:text/csv;base64,MTg=',bytes:2,origin:'computed',createdAt:'2026-09-20',inputAssetIds:[],workspacePath:'/mnt/data/northstar/numbers.csv'};
  for(const url of ['artifact:file1','<artifact:file1>','/mnt/data/northstar/numbers.csv','</mnt/data/northstar/numbers.csv>','sandbox:/mnt/data/northstar/numbers.csv']){
    const html=renderToStaticMarkup(createElement(CanvasV2MarkdownMessage,{content:`[Download numbers](${url})`,artifacts:[artifact]}));
    assert.match(html,/<button/);assert.match(html,/Download numbers/);assert.doesNotMatch(html,/file not exported|href=|data:text/);
  }
  const missing=renderToStaticMarkup(createElement(CanvasV2MarkdownMessage,{content:'[Missing](/mnt/data/not-exported.csv)',artifacts:[artifact]}));
  assert.match(missing,/file not exported/);assert.doesNotMatch(missing,/<button|href=/);
});
