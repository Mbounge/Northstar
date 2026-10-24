import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberConversationEditTargets, currentConversationEditTargets, advanceConversationEditTargets, authorizeConversationEdit, parseConversationEditTargets } from '../lib/canvas-v2/screen-edit-authorization';
import { applyCanvasV2SourcePatch } from '../lib/canvas-v2/source-patch';
import type { CanvasV2WorkingContext } from '../lib/canvas-v2/working-context';

const document = { html: '<main data-canvas-v2-node-id="canvas" data-canvas-v2-workspace-root="true"><h1 data-canvas-v2-node-id="title" data-canvas-v2-user-edited="text">A shared idea</h1><p data-canvas-v2-node-id="peer" data-canvas-v2-user-edited="text">Teammate work</p></main>', css: '' };
const context = (): CanvasV2WorkingContext => ({ schema:'canvas-v2.working-context.v1', scope:'viewport', selectionPolicy:'none', selectedNodeIds:[], visibleBounds:{x:0,y:0,width:1000,height:1000}, viewportScale:1, visibleNodeIds:['title','peer'], nearbyNodeIds:[], editableNodeIds:[], protectedNodeIds:['title','peer'], relationships:[], objects:['title','peer'].map(nodeId => ({ nodeId,kind:'text',origin:'user',userEdited:true,editVersion:1,locked:false,hidden:false,canonicalEvidence:false,bounds:{x:0,y:0,width:400,height:50} })) });
const change = (id: string, text: string) => ({ op:'replace-node' as const, targetNodeId:id, html:`<h1 data-canvas-v2-node-id="${id}" data-canvas-v2-user-edited="text">${text}</h1>` });

test('a private remembered selection supports an exact follow-up after deselection and snapshot reload', () => {
  const c = context();
  const remembered = rememberConversationEditTargets(document,c,['title']);
  const restored = parseConversationEditTargets(JSON.parse(JSON.stringify(remembered)));
  const focus = currentConversationEditTargets(document,c,restored);
  assert.equal(focus.length,1);
  const authorized = authorizeConversationEdit(c,focus);
  assert.deepEqual(c.selectedNodeIds,[], 'authorization must not change the visible selection');
  assert.deepEqual(authorized?.editableNodeIds,['title']);
  const next = applyCanvasV2SourcePatch({previous:document,operations:[change('title','Ideas, made real.')],evidence:[],workingContext:authorized});
  assert.match(next.html,/Ideas, made real/);
  assert.match(next.html,/<p data-canvas-v2-node-id="peer" data-canvas-v2-user-edited="text">Teammate work<\/p>/);
  assert.throws(()=>applyCanvasV2SourcePatch({previous:document,operations:[change('peer','Clobbered')],evidence:[],workingContext:authorized}),/unselected|protected/);
  assert.equal(currentConversationEditTargets(next,c,restored).length,0,'source changes cannot inherit old permission');
  const advanced = advanceConversationEditTargets(next,focus);
  assert.equal(currentConversationEditTargets(next,c,advanced).length,1,'an accepted own commit advances its exact edit context');
});

test('peer edits invalidate only their affected remembered target and never authorize new work', () => {
  const c = context(), targets = rememberConversationEditTargets(document,c,['title','peer']);
  const peerEdit = {...document,html:document.html.replace('Teammate work','A peer changed this')};
  assert.deepEqual(currentConversationEditTargets(peerEdit,c,targets).map(target=>target.nodeId),['title']);
  const otherSelection = {...c,selectedNodeIds:['peer'],editableNodeIds:['peer']};
  assert.equal(authorizeConversationEdit(otherSelection,targets.filter(target=>target.nodeId==='title')),otherSelection);
  for(const protection of ['locked','hidden','canonicalEvidence']) {
    const protectedContext={...c,objects:c.objects.map(item=>item.nodeId==='title'?{...item,[protection]:true}:item)};
    assert.equal(rememberConversationEditTargets(document,protectedContext,['title']).length,0);
    assert.equal(currentConversationEditTargets(document,protectedContext,targets).some(target=>target.nodeId==='title'),false);
  }
  const removed={...document,html:document.html.replace(/<h1[^]*?<\/h1>/,'')};
  assert.equal(currentConversationEditTargets(removed,c,targets).some(target=>target.nodeId==='title'),false);
});

test('remembered target imports are bounded, deduplicated and cannot import source code or arbitrary fields', () => {
  const target={nodeId:'title',fingerprint:'0123abcd'};
  assert.deepEqual(parseConversationEditTargets([target,target,{nodeId:'bad id',fingerprint:'0123abcd'},null,{nodeId:'title-2',fingerprint:'bad'}]),[target]);
  assert.deepEqual(parseConversationEditTargets([{...target,html:'do not retain artwork in private authorization'}]),[target]);
  assert.equal(parseConversationEditTargets(Array.from({length:30},(_,i)=>({...target,nodeId:'node-'+i}))).length,24);
  assert.deepEqual(parseConversationEditTargets({nodeId:'title'}),[]);
});
