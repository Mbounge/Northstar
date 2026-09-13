import { AppsScenario } from './apps-scenario';
import { findCanvasV2SourceNodeRange } from '@/lib/canvas-v2/source-patch';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CodexTransport } from '@/lib/canvas-v2/codex-app-server/rpc.server';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Deterministic App Server protocol peer. No provider or model is called. */
export class FixtureCodex implements CodexTransport {
  private appsScenario?: AppsScenario;
  calls: { method: string; params: JsonObject }[] = [];
  replies: { id: string | number; result: JsonObject }[] = [];
  turn = ''; count = 0; toolSequence = 0; private mediaParity = false; private sourcePhoto = false; private mediaStep = 0; private parity = false; private oversized = false; private overlapParity = false; private selectionEdit = false; private followupRepair = false; private chapter = 0; private canvas: JsonObject = {}; private plan: JsonObject = {}; private repair = false; private rejected = false; receive: (message: JsonObject) => void = () => {}; closed = false;
  private ended: (error: Error) => void = () => {}; private timers: ReturnType<typeof setTimeout>[] = [];
  constructor(readonly cwd: string, readonly origin = 'http://127.0.0.1:3123') {}
  onMessage(handler: (message: JsonObject) => void) { this.receive = handler; }
  onClose(handler: (error: Error) => void) { this.ended = handler; }
  notify(method: string, params: unknown) { this.calls.push({ method, params: object(params) }); }
  emit(method: string, params: JsonObject) { if (!this.closed) this.receive({ method, params: { threadId: 'thread-fixture', ...params } }); }
  finish(text: string) {
    this.emit('item/completed', { turnId: this.turn, item: { id: `answer-${this.turn}`, type: 'agentMessage', text, phase: 'final_answer' } });
    this.emit('turn/completed', { turn: { id: this.turn, status: 'completed' } });
  }
  tool(name: string, args: unknown) {
    this.receive({ id: `${this.turn}:${++this.toolSequence}:${name}`, method: 'item/tool/call', params: { threadId: 'thread-fixture', turnId: this.turn, callId: `${this.turn}:${this.toolSequence}:${name}`, tool: name, arguments: args } });
  }
  async request(method: string, raw: unknown): Promise<JsonObject> {
    const params = object(raw); this.calls.push({ method, params });
    if (method === 'initialize') return { userAgent: 'codex/0.153.4' };
    if (method === 'model/list') return { data: [{ model: 'gpt-5.6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'high' }], inputModalities: ['text', 'image'] }] };
    if (method === 'thread/start') return { thread: { id: 'thread-fixture' } };
    if (method === 'turn/start') {
      this.turn = `turn-${++this.count}`;
      const input = Array.isArray(params.input) ? params.input : []; const message = string(object(input[0]).text);
      this.emit('turn/started', { turn: { id: this.turn, status: 'inProgress' } });
      this.emit('item/agentMessage/delta', { turnId: this.turn, itemId: `progress-${this.turn}`, delta: 'I’m checking which differences change the explanation.' });
      this.emit('item/completed', { turnId: this.turn, item: { id: `progress-${this.turn}`, type: 'agentMessage', text: 'I’m checking which differences change the explanation.', phase: 'commentary' } });
      this.emit('item/completed', { turnId: this.turn, item: { id: `search-${this.turn}`, type: 'webSearch', query: 'Compare the evidence', action: { type: 'search', query: 'Compare the evidence' }, results: [{ title: 'Example evidence', url: 'https://example.com/evidence' }] } });
      this.followupRepair = /repair parity/i.test(message); this.sourcePhoto = /research photo parity/i.test(message); this.mediaParity = /media parity/i.test(message) || this.sourcePhoto; this.mediaStep = 0; this.selectionEdit = /selection parity/i.test(message); this.oversized = /oversize parity/i.test(message); this.overlapParity = /overlap parity/i.test(message); this.parity = /composition parity|oversize parity|overlap parity/i.test(message); this.chapter = 0; this.repair = false; this.rejected = false;
      this.appsScenario = /apps parity|apps followup|account pixel smoke/i.test(message) ? new AppsScenario(this, /apps followup/i.test(message), /account pixel smoke/i.test(message)) : undefined;
      if (/three-step plan/i.test(message)) { this.finish('1. Map the journeys.\n\n2. Compare the experience.\n\n3. Recommend changes.'); return { turn: { id: this.turn } }; }
      if (this.appsScenario) { this.appsScenario.start(); return { turn: { id: this.turn } }; }
      if (this.mediaParity) this.tool('read_source', {url: this.sourcePhoto ? 'https://www.abrielle.ca/menus' : this.origin + '/canvas-v2-e2e/codex/media/article', focus: this.sourcePhoto ? 'breakfast restaurant' : 'reference'});
      else if (/canvas|composition parity|oversize parity|overlap parity|selection parity|repair parity/i.test(message)) this.tool('canvas_read', {});
      else if (!/hold/i.test(message)) this.timers.push(setTimeout(() => this.finish(`**A useful distinction.**\n\n| Evidence | Meaning |\n| --- | --- |\n| Observed result | An explanation to test |\n\nThis conversation has received ${this.count} turns. [Source](https://example.com/evidence).`), 100));
      return { turn: { id: this.turn, status: 'inProgress' } };
    }
    if (method === 'turn/steer') { this.finish(`**Updated with your feedback:** ${string(object((params.input as unknown[])[0]).text)}`); return { turnId: this.turn }; }
    if (method === 'turn/interrupt') { this.timers.forEach(clearTimeout); this.emit('turn/completed', { turn: { id: this.turn, status: 'interrupted' } }); }
    return {};
  }
  reply(id: string | number, result: unknown) {
    const r = object(result); this.replies.push({ id, result: r });
    if (this.appsScenario) { this.appsScenario.reply(r); return; }
    if (this.mediaParity) { this.mediaReply(String(id), r); return; }
    if (this.followupRepair) {
      const parts = Array.isArray(r.contentItems) ? r.contentItems.map(object) : [];
      let value: JsonObject = {};
      try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* report failure below */ }
      if (String(id).endsWith(':canvas_read')) {
        this.tool('canvas_edit', {summary:'Corrected the supporting explanation', patch:JSON.stringify({operations:[{op:'replace-node',targetNodeId:'parity-intro',html:'<p data-canvas-v2-node-id="parity-intro" style="font-size:4px;line-height:1.4;margin:0">The corrected explanation stays with its original composition.</p>'},{op:'upsert-css',layerId:'followup-type-override',css:'[data-canvas-v2-node-id="parity-intro"] { font-size:4px !important; }'}]})});
      } else if (String(id).endsWith(':canvas_edit')) {
        if (value.committed === true) this.tool('canvas_review',{});
        else this.finish('Follow-up repair failed: ' + JSON.stringify(value));
      } else if (String(id).endsWith(':canvas_review')) this.finish('The follow-up committed in one edit without prescribed typography changes; authored typography was preserved.');
      return;
    }
    if (this.selectionEdit) {
      if (String(id).endsWith(':canvas_read')) {
        const part = object((r.contentItems as unknown[])[0]); const canvas = object(JSON.parse(string(part.text)));
        const selected = string((canvas.selectedNodeIds as unknown[])?.[0]);
        const html = string(object(canvas.document).html); const range = findCanvasV2SourceNodeRange(html, selected);
        if (!range) { this.finish('Select an existing text object first.'); return; }
        const source = html.slice(range.start, range.end).replace(/>[^]*<\/h1>$/, '>Revised by the selected-object test</h1>');
        this.tool('canvas_edit', { baseRevisionId: canvas.baseRevisionId, selectionPolicy: 'modify', summary: 'Revised only the selected title', patch: JSON.stringify({ operations: [{ op: 'replace-node', targetNodeId: selected, html: source }] }) });
      } else if (String(id).endsWith(':canvas_edit')) this.finish(r.success ? 'Updated only the selected title, preserving its styling and neighboring content.' : 'Selected edit failed: ' + string(object((r.contentItems as unknown[])[0]).text));
      return;
    }
    if (this.parity) { this.parityReply(String(id), r); return; }
    if (String(id).endsWith(':canvas_read')) {
      const part = object((r.contentItems as unknown[])[0]); const canvas = object(JSON.parse(string(part.text)));
      const target = /data-canvas-v2-node-id="([^"]+)"/.exec(string(object(canvas.document).html))?.[1];
      this.tool('canvas_edit', { baseRevisionId: canvas.baseRevisionId, summary: 'Created a native comparison', patch: JSON.stringify({ operations: [{ op: 'append-html', targetNodeId: target, html: '<section data-canvas-v2-node-id="codex-comparison" style="width:720px;padding:32px;background:#fff;color:#171721"><h2 data-canvas-v2-node-id="codex-title" style="color:#173247">A useful comparison</h2><p data-canvas-v2-node-id="codex-finding">The evidence changes the explanation.</p></section>' }] }) });
    } else if (String(id).endsWith(':canvas_edit')) this.finish(r.success ? 'Created the comparison on the canvas. Each part is editable.' : 'The edit could not be committed.');
  }
  private mediaReply(id: string, r: JsonObject) {
    const parts = Array.isArray(r.contentItems) ? r.contentItems.map(object) : [];
    let value: JsonObject = {}; try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* failure */ }
    if (!r.success) { this.finish('Media fixture failed: ' + string(parts[0]?.text)); return; }
    if (id.endsWith(':read_source')) {
      const candidate = this.sourcePhoto && Array.isArray(value.media) ? value.media.map(object).find(item=>item.type==='image' && /\.jpe?g(?:[?]|$)/i.test(string(item.url))) : undefined;
      if(this.sourcePhoto && !candidate) {this.finish('The real source returned no usable image candidates.');return;}
      this.tool('inspect_image',{url: candidate?.url ?? this.origin + '/canvas-v2-e2e/codex/media/reference.png'}); return;
    }
    if (id.endsWith(':inspect_image')) {
      if (!this.sourcePhoto && this.mediaStep++ === 0) this.tool('inspect_image',{url: this.origin + '/canvas-v2-e2e/codex/media/motion.gif'});
      else this.tool('canvas_read',{}); return;
    }
    if (id.endsWith(':canvas_read')) {
      this.canvas = value;
      this.tool('canvas_plan',{baseRevisionId:value.baseRevisionId,action:'create',storyRole:'analysis',relation:'none',footprint:'1100 units wide, natural height',evidenceIds:(value.evidence as JsonObject[]).filter(a=>['image','gif','video'].includes(string(a.mediaType))).map(a=>a.id),readingOrder:['Still reference','Motion'],direction:{designIntent:'Verify researched media end to end',visualThesis:'Images and motion remain source linked',compositionStrategy:'Reference image followed by two playable examples',visualLanguage:'Readable labels and unframed media',evidenceStrategy:'Use inspected still/GIF and linked video from the retrieved page'}}); return;
    }
    if (id.endsWith(':canvas_plan')) {
      const plan = object(value.plan), execution = object(plan.execution), target = object(execution.target), island = string(target.islandId);
      const evidence = this.canvas.evidence as JsonObject[];
      const still = evidence.find(a=>a.mediaType==='image')!, gif = evidence.find(a=>a.mediaType==='gif')!, video = evidence.find(a=>a.mediaType==='video')!;
      if(this.sourcePhoto) {
        const root = /data-canvas-v2-node-id="([^"]+)"/.exec(string(object(this.canvas.document).html))?.[1];
        this.tool('canvas_edit',{summary:'Placed a real source photo',patch:JSON.stringify({operations:[{op:'append-html',targetNodeId:root,html:`<section data-canvas-v2-node-id="${island}" data-canvas-v2-island-id="${island}" data-canvas-v2-design-region data-canvas-v2-story-role="analysis" data-canvas-v2-territory-relation="none" style="width:1500px;padding:24px;display:flex;flex-direction:column;gap:24px;color:var(--northstar-ink)"><h2 data-canvas-v2-node-id="real-source-title" style="font-size:80px;margin:0">A photo from the source</h2><img data-canvas-v2-node-id="real-source-photo" data-canvas-v2-evidence-id="${still.id}" data-canvas-v2-evidence-role="analysis-copy" src="${still.url}" alt="Photo retrieved from the restaurant website; representative context" style="width:1000px;height:auto;object-fit:contain"><a data-canvas-v2-node-id="real-source-link" href="https://www.abrielle.ca/menus" style="font-size:52px">Abrielle website · representative context</a></section>`}]})});return;
      }
      const player = (asset: JsonObject, type: string) => `<div data-canvas-v2-node-id="fixture-${type}" data-canvas-v2-evidence-id="${asset.id}" data-canvas-v2-media="${JSON.stringify({version:1,type,src:asset.playbackUrl,evidenceId:asset.id,description:type === 'gif' ? 'Animated source reference' : 'Source demonstration video'}).replaceAll('"','&quot;')}" style="width:480px;height:270px"></div>`;
      const root = /data-canvas-v2-node-id="([^"]+)"/.exec(string(object(this.canvas.document).html))?.[1];
      this.tool('canvas_edit',{baseRevisionId:this.canvas.baseRevisionId,summary:'Placed source media',patch:JSON.stringify({operations:[{op:'append-html',targetNodeId:root,html:`<section data-canvas-v2-node-id="${island}" data-canvas-v2-island-id="${island}" data-canvas-v2-design-region data-canvas-v2-story-role="analysis" data-canvas-v2-territory-relation="none" style="width:1100px;padding:32px;display:flex;flex-direction:column;gap:24px;color:var(--canvas-ink)"><h1 data-canvas-v2-node-id="media-title" style="font-size:48px">Source media, together</h1><p data-canvas-v2-node-id="media-copy" style="font-size:28px">An inspected image and GIF, alongside a linked video. Motion is available for you to play.</p><img data-canvas-v2-node-id="fixture-reference" data-canvas-v2-evidence-id="${still.id}" data-canvas-v2-evidence-role="analysis-copy" src="${still.url}" alt="Researched reference diagram" style="width:480px;height:270px;object-fit:contain"><div data-canvas-v2-node-id="media-pair" style="display:flex;gap:32px">${player(gif,'gif')}${player(video,'video')}</div><a data-canvas-v2-node-id="media-source" href="${this.origin}/canvas-v2-e2e/codex/media/article" style="font-size:24px">Source page</a></section>`}]})}); return;
    }
    if (id.endsWith(':canvas_edit')) { this.tool('canvas_review',{}); return; }
    if (id.endsWith(':canvas_review')) this.finish(this.sourcePhoto ? 'Retrieved a real restaurant website image, inspected its pixels and placed it as a source-linked editable image. This checks transport and placement, not autonomous model choice.' : 'Placed and reviewed the source image, GIF and linked video. Each is independently editable; playback needs a browser check.');
  }
  private parityReply(id: string, r: JsonObject) {
    const parts = Array.isArray(r.contentItems) ? r.contentItems.map(object) : [];
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* failure text */ }
    if (id.endsWith(':canvas_read')) {
      this.canvas = value;
      this.tool('canvas_plan', { action: 'create', storyRole: this.chapter === 0 ? 'title' : 'analysis',
        direction: { designIntent: 'Verify two editable compositions', visualThesis: 'A clear introduction followed by evidence', compositionStrategy: 'Two consecutive islands', visualLanguage: 'Large neutral typography and a fine rule', evidenceStrategy: 'Retain the uploaded original as inspectable evidence' },
        readingOrder: ['Introduction', 'Evidence'], evidenceIds: this.chapter === 1 ? (Array.isArray(value.evidence) ? value.evidence.map(object).slice(0, 1).map(a => a.id) : []) : [],
        relation: this.chapter === 0 ? 'none' : 'below', anchorNodeId: this.chapter === 0 ? '' : string(object(object(this.plan.execution).target).islandId), footprint: '1000 units wide, natural content height' });
    } else if (id.endsWith(':canvas_plan')) {
      if (!r.success) { this.finish('Plan failed: ' + string(parts[0]?.text)); return; }
      this.plan = object(value.plan); this.parityEdit();
    } else if (id.endsWith(':canvas_edit')) {
      if (!r.success || value.committed !== true) {
        if (this.repair) { this.finish('Repair failed: ' + string(parts[0]?.text)); return; }
        this.rejected = true; this.tool('canvas_review', {}); return;
      }
      this.tool('canvas_review', {});
    } else if (id.endsWith(':canvas_review')) {
      if (this.rejected) {
        if (!value.rejected || !parts.some(p => p.type === 'inputImage')) { this.finish('Rejected render was not inspectable.'); return; }
        this.repair = true; this.rejected = false; this.parityEdit(); return;
      }
      if (!parts.some(p => p.type === 'inputImage')) { this.finish('Rendered pixels missing.'); return; }
      if (++this.chapter < 2) this.tool('canvas_read', {});
      else if (this.overlapParity) this.finish(this.repair ? 'Verified: overflowing text was rejected privately, the corrected draft committed, and two independent islands rendered.' : 'Overlap was not rejected.');
      else this.finish('Verified two independently editable islands, retained media, and pixel review. Deliberately small typography committed unchanged without a font-floor checklist.');
    }
  }
  private parityEdit() {
    const execution = object(this.plan.execution), target = object(execution.target);
    const island = string(target.islandId);
    const root = /data-canvas-v2-node-id="([^"]+)"/.exec(string(object(this.canvas.document).html))?.[1];
    const asset = object((Array.isArray(this.canvas.evidence) ? this.canvas.evidence : [])[0]);
    const body = this.chapter === 0
      ? `<h1 data-canvas-v2-node-id="parity-title" style="font-size:56px;line-height:1.15;margin:0">A clear visual argument</h1><p data-canvas-v2-node-id="parity-intro" style="font-size:${this.repair ? 28 : 4}px;line-height:1.4;margin:0">Start with the explanation, then inspect the evidence.</p>`
      : `<h2 data-canvas-v2-node-id="parity-evidence-title" style="font-size:40px;margin:0">Evidence you can inspect</h2>${asset.id ? `<img data-canvas-v2-node-id="parity-image" data-canvas-v2-evidence-id="${asset.id}" data-canvas-v2-evidence-role="analysis-copy" src="${asset.url}" style="width:400px;height:auto;object-fit:contain" alt="Uploaded source" />` : ''}<p data-canvas-v2-node-id="parity-evidence-copy" style="font-size:28px;line-height:1.4;margin:0">The source stays connected to this independently editable explanation.</p>`;
    this.tool('canvas_edit', { baseRevisionId: this.canvas.baseRevisionId, summary: this.chapter === 0 ? 'Created the introduction' : 'Added the evidence composition', patch: JSON.stringify({ operations: [
      { op: 'append-html', targetNodeId: root, html: `<section data-canvas-v2-node-id="${island}" data-canvas-v2-island-id="${island}" data-canvas-v2-design-region data-canvas-v2-story-role="${target.storyRole}" data-canvas-v2-territory-relation="${object(execution.territory).relation}" data-canvas-v2-territory-anchor="${object(execution.territory).anchorNodeId}" style="width:${this.oversized ? 9200 : 1000}px;display:flex;flex-direction:column;gap:24px;padding:32px;color:var(--canvas-ink);background:transparent">${body}${this.overlapParity && !this.repair && this.chapter === 0 ? `<div data-canvas-v2-node-id="collision-card" style="height:24px;background:#333"><p data-canvas-v2-node-id="collision-copy" style="font-size:40px;line-height:1.4;margin:0">This paragraph overflows its card and must be repaired.</p></div>` : ""}</section>` },
    ] }) });
  }
  reject(id: string | number, message: string) { this.replies.push({ id, result: { error: message } }); }
  close() { this.closed = true; this.timers.forEach(clearTimeout); void rm(this.cwd, { recursive: true, force: true }); }
  crash() { this.ended(new Error('fixture process exit')); }
}
export async function fixtureCodex(origin?: string) { return new FixtureCodex(await mkdtemp(join(tmpdir(), 'northstar-codex-fixture-')), origin); }
