import type { CanvasV2TurnTiming } from '../lib/canvas-v2/chat-lifecycle';
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
