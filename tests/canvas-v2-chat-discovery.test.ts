import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasV2RouteUsesDiscovery, canvasV2RouteMutatesCanvas, parseCanvasV2InteractionDecision } from '../lib/canvas-v2/interaction-router';
import { recoverCanvasV2LoopFromCommittedTruth, createCanvasV2Loop, canvasV2NewTurnContinuation } from '../lib/canvas-v2/design-loop';
import type { CanvasV2EvidencePacket } from '../lib/canvas-v2/types';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CanvasV2MarkdownMessage } from '../components/canvas-v2/canvas-v2-markdown-message';

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
