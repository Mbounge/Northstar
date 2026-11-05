import assert from 'node:assert/strict';
import test from 'node:test';
import {stfxSubagentOriginals} from '../app/canvas-v2-e2e/accessibility/subagent/fixture';
import {readCanvasV2Screens} from '../lib/canvas-v2/interactive-screen';
import {decodeSnapshot} from '../lib/canvas-v2/sessions/snapshot';
import examples from '../lib/canvas-v2/stfx-accessibility-examples.json';
test('subagent accessibility canvas contains originals and untouched copies, never pre-authored repairs',()=>{
 const snapshot=stfxSubagentOriginals();assert.doesNotThrow(()=>decodeSnapshot(snapshot));
 const screens=readCanvasV2Screens(snapshot.revision.document.html);assert.equal(screens.length,10);
 for(const example of examples){const original=screens.find(s=>s.nodeId===`stfx-${example.id}-original`)!,working=screens.find(s=>s.nodeId===`stfx-${example.id}-working`)!;
  for(const screen of [original.screen,working.screen]){assert.equal(screen.html,example.beforeHtml);assert.equal(screen.css,example.beforeCss);assert.equal(screen.javascript,'');assert.equal(screen.language,undefined);}
  assert.ok(snapshot.revision.document.html.includes(`data-canvas-v2-node-id="${original.nodeId}" data-canvas-v2-locked="true"`));
 }
 assert.equal(snapshot.turns.length,0);assert.equal(snapshot.model,'gpt-5.6-luna');assert.equal(snapshot.effort,'high');
});

test('future seeded opening camera sees the real world-space first pair and captions clear the shared preview chrome',async()=>{
 const {CANVAS_V2_WORKSPACE,canvasV2WorkspaceToScreen}=await import('../lib/canvas-v2/workspace-coordinate-space');const snapshot=stfxSubagentOriginals();const v=snapshot.viewport!;
 const first=canvasV2WorkspaceToScreen({x:CANVAS_V2_WORKSPACE.aiAuthoringOriginX,y:CANVAS_V2_WORKSPACE.aiAuthoringOriginY+240+275},v);
 assert.ok(first.x>=350&&first.x<1440);assert.ok(first.y>=100&&first.y<900);
 assert.ok(275-56>155+30,'caption bottom must clear the automatic preview title and action row');
 assert.match(snapshot.revision.document.html,/stfx-statistics-working-label[^>]*height:30px/);
});
