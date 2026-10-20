import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCodexCompositionPlacement } from '../lib/canvas-v2/codex-composition-placement';
import type { CodexCompositionPlan } from '../lib/canvas-v2/codex-composition';
import { applyCanvasV2NativeSceneMutation, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import { compileCanvasV2SceneTransaction } from '../lib/canvas-v2/scene-transaction';
import { findCanvasV2SourceNodeRange } from '../lib/canvas-v2/source-patch';

const base = 'current';
const target = 'campaign-brief';
const anchor = 'campaign-anchor';
function reference(rooted = false): CanvasV2NativeSceneDocument {
  const empty: CanvasV2NativeSceneDocument = { schema:'canvas-v2.native-scene.v1', revisionId:base, width:12000, height:8000, css:'', nodes:[], rootIds:[] };
  const scene = applyCanvasV2NativeSceneMutation(empty, {kind:'create',primitive:'shape',nodeId:anchor,x:6000,y:4000,width:390,height:844});
  scene.nodes[0].locked = true;
  if (rooted) {
    const parent = structuredClone(scene.nodes[0]);
    parent.id = 'workspace'; parent.sourceNodeId = 'workspace'; parent.kind = 'root'; parent.childIds = [anchor]; parent.geometry = {x:0,y:0,width:12000,height:8000,rotation:0,zIndex:0};
    scene.nodes[0].parentId = parent.id;
    scene.nodes.unshift(parent); scene.rootIds = [parent.id];
  }
  return scene;
}
function plan(action: CodexCompositionPlan['execution']['target']['action'] = 'repair', relation: CodexCompositionPlan['execution']['territory']['relation'] = 'above', anchorNodeId = anchor): CodexCompositionPlan {
  return { baseRevisionId:base, surface:'standalone', direction:{} as CodexCompositionPlan['direction'], readingOrder:[], execution:{target:{action,islandId:target,storyRole:'analysis',resultingMaturity:'developing',resolutionRationale:'',openRequirements:[]},territory:{relation,anchorNodeId,intendedFootprint:'Compact brief above the campaign',rationale:'Use the selected campaign anchor',placementMode:'attached',targetZoneId:'middle-center'},requiredEvidenceIds:[],requiredEvidenceHandles:[],requiredVisualRoles:[]} };
}
function document(rooted = false) {
  const html = `<svg hidden="" data-canvas-v2-node-id="hidden-reference" viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg><section data-canvas-v2-node-id="unrelated" data-canvas-v2-locked="true"><h2>Keep exactly</h2></section><section data-canvas-v2-node-id="${target}" data-canvas-v2-island-id="${target}" data-canvas-v2-design-region data-canvas-v2-origin="northstar" data-canvas-v2-territory-relation="below"><p data-canvas-v2-node-id="brief-copy">Same content</p></section><div data-canvas-v2-node-id="${anchor}" data-canvas-v2-locked="true" data-canvas-v2-user-edited="create">Read-only campaign</div>`;
  return {html:rooted ? `<main data-canvas-v2-node-id="workspace" data-canvas-v2-workspace-root="true">${html}</main>` : html, css:'.unchanged { color: red; }'};
}
function slice(html:string,id:string) { const r=findCanvasV2SourceNodeRange(html,id)!; return html.slice(r.start,r.end); }

test('active create and cardinal repair materialize the planned anchor only on their exact island root', () => {
  for (const action of ['create','repair'] as const) for (const relation of ['above','below','left','right'] as const) for (const rooted of [false,true]) {
    const before = document(rooted), scene = reference(rooted);
    const next = normalizeCodexCompositionPlacement(plan(action,relation),before,scene);
    const r=findCanvasV2SourceNodeRange(next.html,target)!;
    assert.match(next.html.slice(r.start,r.openEnd),new RegExp(`territory-relation="${relation}"`));
    assert.match(next.html.slice(r.start,r.openEnd),/territory-anchor="campaign-anchor"/);
    for (const id of ['hidden-reference','unrelated',anchor,'brief-copy']) assert.equal(slice(next.html,id),slice(before.html,id),id);
    assert.equal(next.css,before.css);
    assert.doesNotThrow(()=>compileCanvasV2SceneTransaction({origin:'northstar',baseRevisionId:base,previous:before,next}));
  }
});

test('independent plans clear stale anchors without requiring an anchor scene', () => {
  for (const action of ['create','repair'] as const) {
    const before=document(); before.html=before.html.replace('territory-relation="below"','territory-relation="below" data-canvas-v2-territory-anchor="deleted"');
    const next=normalizeCodexCompositionPlacement(plan(action,'none','deleted'),before);
    const r=findCanvasV2SourceNodeRange(next.html,target)!;
    assert.match(next.html.slice(r.start,r.openEnd),/territory-relation="none"/);
    assert.doesNotMatch(next.html.slice(r.start,r.openEnd),/territory-anchor/);
  }
});

test('active explicit attachment rejects unavailable, stale, hidden, nested, or reparented anchors before compilation', () => {
  const before=document(), scene=reference();
  assert.throws(()=>normalizeCodexCompositionPlacement(plan(),before),/current standalone/);
  for (const invalid of ['missing',target]) assert.throws(()=>normalizeCodexCompositionPlacement(plan('repair','above',invalid),before,scene),/current standalone/);
  const stale=structuredClone(scene);stale.revisionId='stale';
  assert.throws(()=>normalizeCodexCompositionPlacement(plan(),before,stale),/current standalone/);
  const hidden=structuredClone(scene);hidden.nodes[0].hidden=true;
  assert.throws(()=>normalizeCodexCompositionPlacement(plan(),before,hidden),/current standalone/);
  const nested=structuredClone(scene);nested.nodes[0].parentId='not-a-workspace';
  assert.throws(()=>normalizeCodexCompositionPlacement(plan(),before,nested),/current standalone/);
  const missing={...before,html:before.html.replace(slice(before.html,anchor),'')};
  assert.throws(()=>normalizeCodexCompositionPlacement(plan(),missing,scene),/current standalone/);
  const reparented={...before,html:before.html.replace(slice(before.html,anchor),`<section data-canvas-v2-node-id="new-group">${slice(before.html,anchor)}</section>`)};
  assert.throws(()=>normalizeCodexCompositionPlacement(plan(),reparented,scene),/current standalone/);
});

test('ordinary content edits and unanchored existing relations retain their existing contract', () => {
  const before=document();
  for (const action of ['develop','enrich','recompose'] as const) assert.strictEqual(normalizeCodexCompositionPlacement(plan(action),before),before);
  for (const relation of ['within','span','interleave','offset','recompose'] as const) {
    const next=normalizeCodexCompositionPlacement(plan('create',relation,''),before);
    assert.match(next.html,new RegExp(`territory-relation="${relation}"`));
  }
});

test('anonymous native workspace parents match the nearest identified source-parent convention', () => {
  const scene=reference(true),parent=scene.nodes[0];
  delete parent.sourceNodeId;parent.id='render-only-workspace';scene.rootIds=[parent.id];scene.nodes[1].parentId=parent.id;
  const before=document(true);before.html=before.html.replace(' data-canvas-v2-node-id="workspace"','');
  assert.doesNotThrow(()=>normalizeCodexCompositionPlacement(plan(),before,scene));
});

test('unquoted stale territory attributes cannot win ahead of the approved plan', () => {
  const before=document();before.html=before.html.replace('territory-relation="below"','territory-relation=left data-canvas-v2-territory-anchor=unrelated');
  const next=normalizeCodexCompositionPlacement(plan(),before,reference());
  const r=findCanvasV2SourceNodeRange(next.html,target)!,opening=next.html.slice(r.start,r.openEnd);
  assert.equal((opening.match(/data-canvas-v2-territory-relation=/g)??[]).length,1);
  assert.equal((opening.match(/data-canvas-v2-territory-anchor=/g)??[]).length,1);
  assert.match(opening,/territory-relation="above"/);
  assert.match(opening,/territory-anchor="campaign-anchor"/);
});
