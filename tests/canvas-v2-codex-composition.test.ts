import test from 'node:test';
import assert from 'node:assert/strict';
import { planCodexComposition, validateCodexComposition } from '../lib/canvas-v2/codex-composition';
import type { CanvasV2ArtifactDocument, CanvasV2RenderObservation } from '../lib/canvas-v2/types';
const observation = { revisionId: 'r1', spatial: { designRegions: [], evidence: [] } } as unknown as CanvasV2RenderObservation;
const args = { baseRevisionId: 'r1', action: 'create', storyRole: 'analysis', relation: 'below', footprint: 'A readable comparison', evidenceIds: [], readingOrder: ['Context', 'Comparison', 'Implications'], direction: {
  designIntent: 'Explain the important difference', visualThesis: 'Two linked systems', compositionStrategy: 'Compare, then connect', visualLanguage: 'Clear type and quiet rules', evidenceStrategy: 'Put each source next to its claim',
} };
const previous = { html: '<main data-canvas-v2-node-id="root"></main>', css: '' } as CanvasV2ArtifactDocument;
function materialize(id: string, media = ''): CanvasV2ArtifactDocument { return { ...previous, html: `<main data-canvas-v2-node-id="root"><section data-canvas-v2-node-id="${id}" data-canvas-v2-island-id="${id}" data-canvas-v2-design-region data-canvas-v2-story-role="analysis" data-canvas-v2-territory-relation="below"><h2 data-canvas-v2-node-id="heading">The explanation</h2>${media}</section></main>` }; }
test('Codex plans use existing island validation and preserve model-owned narrative choices', () => {
  const plan = planCodexComposition(args, 'r1', observation, [], 1);
  assert.deepEqual(plan.readingOrder, args.readingOrder);
  assert.doesNotThrow(() => validateCodexComposition(plan, previous, materialize(plan.execution.target.islandId), observation));
  assert.throws(() => validateCodexComposition(plan, previous, previous, observation), /materialize/);
  assert.throws(() => validateCodexComposition(plan, previous, materialize(plan.execution.target.islandId), { ...observation, revisionId: 'r2' }), /stale/);
  const another = planCodexComposition(args, 'r1', observation, [], 2);
  assert.notEqual(another.execution.target.islandId, plan.execution.target.islandId);
});
test('planned media must be registered and materially placed in its intended island', () => {
  assert.throws(() => planCodexComposition({ ...args, evidenceIds: ['image'] }, 'r1', observation, [], 1), /Inspect or upload/);
  const plan = planCodexComposition({ ...args, evidenceIds: ['image'] }, 'r1', observation, [{ id: 'image', url: 'https://example.com/photo.png', label: 'Photo' }], 1);
  assert.throws(() => validateCodexComposition(plan, previous, materialize(plan.execution.target.islandId), observation), /materially contain/);
  assert.doesNotThrow(() => validateCodexComposition(plan, previous, materialize(plan.execution.target.islandId, '<img data-canvas-v2-node-id="photo" data-canvas-v2-evidence-id="image" src="https://example.com/photo.png">'), observation));
});
test('stale plans and unknown islands cannot silently replace existing work', () => {
  assert.throws(() => planCodexComposition(args, 'r2', observation, [], 1), /changed/);
  assert.throws(() => planCodexComposition({ ...args, action: 'repair', islandId: 'missing' }, 'r1', observation, [], 1), /existing island/);
  assert.throws(() => planCodexComposition({ ...args, action: 'invented' }, 'r1', observation, [], 1), /Invalid/);
});

test('source pages expose linked native video without downloading it', async () => {
  const { readNorthstarSource } = await import('../lib/canvas-v2/agent-source.server');
  const reads: string[] = [];
  const response = await readNorthstarSource({ name: 'read_source', arguments: { url: 'https://example.com/article' } }, new AbortController().signal, async url => {
    reads.push(url); return { url, mimeType: 'text/html', bytes: Buffer.from('<p>A demonstration</p><video src="https://example.com/demo.mp4" title="Demonstration"></video><img src="https://example.com/photo.png" alt="Relevant photo">') };
  });
  const result = await response.json();
  assert.deepEqual(reads, ['https://example.com/article']);
  assert.equal(result.assets[0].mediaType, 'video'); assert.equal(result.assets[0].source.sourceUrl, 'https://example.com/article');
  assert.match(result.assets[0].limitations[0], /not been inspected/);
  assert.equal(result.images.length, 1);
});
test('opaque asset handles resolve inside native video metadata without consuming HTML budget', async () => {
  const { parseCanvasV2AssetSourcePatch } = await import('../lib/canvas-v2/source-patch');
  const parsed = parseCanvasV2AssetSourcePatch(JSON.stringify({ operations: [{ op: 'append-html', targetNodeId: 'root', html: '<div data-canvas-v2-node-id="clip" data-canvas-v2-media="{&quot;version&quot;:1,&quot;type&quot;:&quot;video&quot;,&quot;src&quot;:&quot;northstar-asset:clip&quot;,&quot;evidenceId&quot;:&quot;clip&quot;}"></div>' }] }), [{ id: 'clip', url: 'https://example.com/demo.mp4', label: 'Demo', mediaType: 'video' }]);
  assert.ok('html' in parsed[0]); assert.match(parsed[0].html, /https:\/\/example.com\/demo.mp4&quot;/);
});

test('chapter heading normalization preserves neighboring content and durable IDs', async () => {
  const { normalizeCodexCompositionHeading, rejectedCodexEdit } = await import('../lib/canvas-v2/codex-composition');
  const plan = planCodexComposition(args, 'r1', observation, [], 1);
  const doc = materialize(plan.execution.target.islandId);
  doc.html = doc.html.replace('<h2 ', '<h1 ').replace('</h2>', '</h1>').replace('</main>', '<h1 data-canvas-v2-node-id="human-title">Human title</h1></main>');
  const next = normalizeCodexCompositionHeading(plan, doc);
  assert.match(next.html, /<h2 data-canvas-v2-node-id="heading">/);
  assert.match(next.html, /<h1 data-canvas-v2-node-id="human-title">Human title<\/h1>/);
  assert.doesNotThrow(() => validateCodexComposition(plan, previous, next, observation));
  assert.deepEqual(normalizeCodexCompositionHeading({ ...plan, execution: { ...plan.execution, target: { ...plan.execution.target, action: 'develop' } } }, doc), doc);
  const rejection = rejectedCodexEdit('current', new Error('Too small'));
  assert.equal(rejection.committed, false); assert.equal(rejection.baseRevisionId, 'current'); assert.equal(rejection.error, 'Too small');
});

test('inspected GIF playback binds only its own registered original URL', async () => {
  const { validateCanvasV2EvidenceBindings } = await import('../lib/canvas-v2/artifact-safety');
  const asset = { id:'gif',url:'data:image/gif;base64,R0lGODlh',originalUrl:'https://source.example/a.gif',label:'Motion',mediaType:'gif' as const,mimeType:'image/gif' };
  const html = (src:string) => `<div data-canvas-v2-node-id="motion" data-canvas-v2-media='${JSON.stringify({version:1,type:'gif',src,evidenceId:'gif',description:'Source motion'})}'></div>`;
  assert.deepEqual(validateCanvasV2EvidenceBindings({...previous,html:html(asset.originalUrl)},[asset]),[]);
  assert.match(validateCanvasV2EvidenceBindings({...previous,html:html('https://unrelated.example/a.gif')},[asset]).join(' '),/not approved/);
  const plan = planCodexComposition({...args,evidenceIds:['gif']},'r1',observation,[asset],1);
  assert.doesNotThrow(()=>validateCodexComposition(plan,previous,materialize(plan.execution.target.islandId,html(asset.originalUrl)),observation));
});


test('adapter revision tracking requires a read and rejects real concurrent edits', async () => {
  const { requireCodexCanvasReadRevision } = await import('../lib/canvas-v2/codex-composition');
  assert.throws(() => requireCodexCanvasReadRevision(undefined, 'r1'), /Read the canvas/);
  assert.equal(requireCodexCanvasReadRevision('r1', 'r1'), 'r1');
  assert.throws(() => requireCodexCanvasReadRevision('r1', 'human-edit'), /changed since you read/);
  assert.equal(requireCodexCanvasReadRevision('human-edit', 'human-edit'), 'human-edit');
});

test('source media survives the chat-to-composition transition without silently discarding earlier candidates', async () => {
  const { rememberCodexSourceMedia } = await import('../lib/canvas-v2/codex-composition');
  const first = rememberCodexSourceMedia([], {url:'https://example.com/article', media:[{url:'https://example.com/image.png', type:'image',label:'Source diagram'}]});
  assert.deepEqual(rememberCodexSourceMedia(first, { asset: { id:'inspected' } }), first);
  const updated = rememberCodexSourceMedia(first, {url:'https://example.com/second',media:[{url:first[0].url,type:'image',label:'Same image, new context'}, {url:'javascript:alert(1)',type:'image'}]});
  assert.equal(updated.length, 1); assert.equal(updated[0].sourceUrl, 'https://example.com/second');
  const bounded = rememberCodexSourceMedia(updated, {url:'https://example.com/gallery',media:Array.from({length:50},(_,i)=>({url:`https://example.com/${i}.gif`,type:'gif',label:`Frame ${i}`}))});
  assert.equal(bounded.length,51); assert.equal(bounded[0].url, first[0].url); assert.equal(bounded.at(-1)?.label,'Frame 49');
});

test('source media focus prioritizes relevant visuals rather than only the first page images', async () => {
  const { readNorthstarSource } = await import('../lib/canvas-v2/agent-source.server');
  const html = Array.from({length:9},(_,i)=>`<img src="https://example.com/${i}.png" alt="General photo">`).join('') + '<img src="https://example.com/diagram.png" alt="Battery charging diagram">';
  const response = await readNorthstarSource({name:'read_source',arguments:{url:'https://example.com/article',focus:'battery charging'}},new AbortController().signal,async url=>({url,mimeType:'text/html',bytes:Buffer.from(html)}));
  const result = await response.json(); assert.equal(result.media[0].url,'https://example.com/diagram.png');
});


test('canvas backdrop reaches full-composition wrappers but preserves local callout fills', async () => {
  const { normalizeCodexCompositionSurface } = await import('../lib/canvas-v2/codex-composition');
  const plan = planCodexComposition(args, 'r1', observation, [], 1);
  const doc = materialize(plan.execution.target.islandId);
  doc.html = doc.html.replace('<h2 ', '<div data-canvas-v2-node-id="sheet" style="background:grey"><h2 ').replace('</h2>', '</h2><aside data-canvas-v2-node-id="callout" style="background:blue">One focused point</aside></div>');
  const fixed = normalizeCodexCompositionSurface(plan, doc);
  assert.match(fixed.css, /node-id="sheet"/); assert.doesNotMatch(fixed.css, /node-id="callout"/);
  assert.match(fixed.html, /callout" style="background:blue"/);
  assert.equal(normalizeCodexCompositionSurface({...plan,surface:'standalone'},doc).css,doc.css);
  assert.equal(normalizeCodexCompositionSurface({...plan,execution:{...plan.execution,target:{...plan.execution.target,action:'develop'}}},doc),doc);
});


test('a small edit retains its explicit island focus without a new composition plan', async () => {
  const { codexEditFocusIsland } = await import('../lib/canvas-v2/codex-composition');
  const { compileCanvasV2SceneTransaction } = await import('../lib/canvas-v2/scene-transaction');
  const doc = materialize('first');
  const focus = codexEditFocusIsland(doc,[{targetNodeId:'heading'}]);
  assert.equal(focus,'first'); assert.equal(codexEditFocusIsland(doc,[{targetNodeId:'root'}]),undefined);
  const tx = compileCanvasV2SceneTransaction({origin:'northstar',baseRevisionId:'r1',previous:doc,next:{...doc,html:doc.html.replace('The explanation','Corrected explanation')},focusIslandId:focus});
  assert.equal(tx.targetIslandId,'first');
});


test('attached islands inherit narrative identity while a new independent composition starts its own', async () => {
  const { normalizeCodexCompositionSurface } = await import('../lib/canvas-v2/codex-composition');
  const first = planCodexComposition({...args,relation:'none'},'r1',observation,[],1);
  const doc = normalizeCodexCompositionSurface(first,materialize(first.execution.target.islandId));
  assert.match(doc.html, new RegExp(`data-canvas-v2-narrative-id="${first.execution.target.islandId}"`));
  const next = planCodexComposition({...args,anchorNodeId:'heading'},'r1',observation,[],2);
  const combined = {...doc,html:doc.html.replace('</main>',materialize(next.execution.target.islandId).html.replace(/<main[^>]*>|<\/main>/g,'')+'</main>')};
  const normalized = normalizeCodexCompositionSurface(next,combined);
  assert.equal(normalized.html.split(`data-canvas-v2-narrative-id="${first.execution.target.islandId}"`).length,3);
});


test('Codex composition semantics do not require a separate title island or a subtitle', () => {
  const plan = planCodexComposition(args, 'r1', observation, [], 1);
  const next = materialize(plan.execution.target.islandId);
  next.html = next.html.replace('<h2 ', '<h1 ').replace('</h2>', '</h1>');
  assert.doesNotThrow(() => validateCodexComposition(plan, previous, next, observation));
  const titlePlan = planCodexComposition({...args, storyRole:'title'}, 'r1', observation, [], 1);
  const titleOnly = { ...next, html:next.html.replace('story-role="analysis"','story-role="title"') };
  assert.doesNotThrow(() => validateCodexComposition(titlePlan, previous, titleOnly, observation));
});


test('content integrity blocks painted text collisions and card overflow without rejecting small type or decorative layers', async () => {
  const { validateCodexCompositionContent } = await import('../lib/canvas-v2/codex-composition');
  const node = (nodeId: string, parentNodeId: string | undefined, bounds: {x:number;y:number;width:number;height:number}, extra = {}) => ({ nodeId, parentNodeId, bounds, tagName: 'div', contentBox: {clientWidth:bounds.width,clientHeight:bounds.height,scrollWidth:bounds.width,scrollHeight:bounds.height}, layout:{display:'block',position:'static',zIndex:'auto',overflowX:'visible',overflowY:'visible',fontSize:'4px'}, ...extra });
  const island = node('island', undefined, {x:0,y:0,width:9200,height:400});
  const card = node('card', 'island', {x:0,y:0,width:200,height:80});
  const background = node('background','card',card.bounds,{surfaceOwnerNodeId:'card'});
  const text = node('text','card',{x:5,y:5,width:180,height:40},{tagName:'p',textPreview:'Readable content',textPaintRects:[{x:5,y:5,width:180,height:40}]});
  const observed = (items: unknown[], collisions: unknown[] = []) => ({...observation,spatial:{nodes:items,designRegions:[{nodeId:'island',bounds:island.bounds}],textCollisions:collisions}} as unknown as CanvasV2RenderObservation);
  assert.deepEqual(validateCodexCompositionContent(observed([island,card,background,text])), []);
  const overflowing = {...text,textPaintRects:[{x:5,y:60,width:180,height:40}]};
  assert.match(validateCodexCompositionContent(observed([island,card,background,overflowing])).join(' '), /text spills outside.*card/);
  const neighbor = {...text,nodeId:'neighbor'};
  assert.match(validateCodexCompositionContent(observed([island,card,background,text,neighbor],[{firstNodeId:'text',secondNodeId:'neighbor',intersection:{x:5,y:5,width:180,height:40}}])).join(' '), /overlapping readable text/);
});


test('Codex feedback does not turn small type or a large island into a typography repair checklist', async () => {
  const { collectCodexCompositionFeedback } = await import('../lib/canvas-v2/codex-composition');
  const observed = { ...observation, missingEvidenceIds: [], spatial: {
    nodes: [{nodeId:'copy',parentNodeId:'wide',tagName:'p',textPreview:'A readable test paragraph',bounds:{x:0,y:0,width:200,height:8},layout:{fontSize:'4px',lineHeight:'6px'}}],
    evidence: [], designRegions: [{nodeId:'wide',bounds:{x:0,y:0,width:9200,height:400},descendantNodeIds:['copy'],contentOverflowX:0,contentOverflowY:0}], authoredRelationships: [],
  } } as unknown as CanvasV2RenderObservation;
  const feedback = collectCodexCompositionFeedback(previous, observed);
  assert.doesNotMatch(feedback.join(' '), /floor|ceiling|Repair all|40px|28px|24px/);
});


test('composition planning follows the actual panned viewport and retains source pages for later media inspection', async () => {
  const { codexCompositionViewport, rememberCodexSourcePages, codexMediaInventory } = await import('../lib/canvas-v2/codex-composition');
  const context = {visibleBounds:{x:64000,y:62000,width:2400,height:2000},viewportScale:0.25} as import('../lib/canvas-v2/working-context').CanvasV2WorkingContext;
  const view = codexCompositionViewport(context);
  assert.deepEqual(view.suggestedOrigin,{x:64096,y:62096});
  assert.equal(view.suggestedWidth,2208);
  assert.deepEqual(view.visibleScreenSize,{width:600,height:500});
  assert.equal(codexCompositionViewport({...context,visibleBounds:{...context.visibleBounds,x:90000}}).suggestedOrigin?.x,90096);
  const pages=rememberCodexSourcePages([], '[One](https://source.example/article) [Two](https://second.example/page) [Private](https://user:secret@example.com/)');
  assert.deepEqual(pages,['https://source.example/article','https://second.example/page']);
  assert.deepEqual(rememberCodexSourcePages(pages,'[One](https://source.example/article)'),pages);
  const upload={id:'upload',url:'data:image/png;base64,AAA',label:'User image',authority:'supplied' as const};
  const empty=codexMediaInventory([upload],[],pages);
  assert.deepEqual(empty.researchedAssetIds,[]);assert.match(empty.next,/No research media/);
  const candidate={url:'https://source.example/image.png',type:'image' as const,label:'Relevant scene',sourceUrl:pages[0]};
  const found=codexMediaInventory([upload,{id:'photo',url:'data:image/png;base64,BBB',label:'Inspected photo',authority:'observed'}],[candidate],pages);
  assert.deepEqual(found.researchedAssetIds,['photo']);assert.equal(found.candidates[0].sourceUrl,pages[0]);
});

test('source media pagination exposes every portrait without treating small avatars as tracking images', async () => {
  const { readNorthstarSource } = await import('../lib/canvas-v2/agent-source.server');
  const html = Array.from({length:47},(_,i)=>`<img src="/avatar-${i}.jpg" width="80" alt="Person ${i}">`).join('') + '<img src="/tracking.gif" width="1">';
  const read = async (url:string) => ({url,bytes:Buffer.from(html),mimeType:'text/html'});
  const seen:string[]=[];
  let mediaOffset:number|null=0;
  while(mediaOffset!==null){
    const response=await readNorthstarSource({name:'read_source',arguments:{url:'https://company.example/team',focus:'people',mediaOffset}},new AbortController().signal,read);
    const result=await response.json();
    assert.equal(result.totalMedia,47);
    seen.push(...result.media.map((m:{url:string})=>m.url));
    mediaOffset=result.nextMediaOffset;
  }
  assert.equal(seen.length,47);assert.equal(new Set(seen).size,47);
  assert.ok(seen.includes('https://company.example/avatar-46.jpg'));
});
