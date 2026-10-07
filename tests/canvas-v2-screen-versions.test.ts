import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCanvasV2ScreenVersions } from '../lib/canvas-v2/screen-versions';
import { encodeCanvasV2Screen } from '../lib/canvas-v2/interactive-screen';
import { canvasV2FeedbackFingerprint } from '../lib/canvas-v2/screen-feedback';
import type { CanvasV2ArtifactRevision } from '../lib/canvas-v2/types';
const screen = (text: string) => encodeCanvasV2Screen({ version:1, title:'Career home', width:390,height:844,html:`<h1>${text}</h1>`,css:'',javascript:'',referenceAssetIds:[] });
const revision = (id: string, text: string, extra = ''): CanvasV2ArtifactRevision => ({ schema:'canvas-v2.artifact.v1',id,state:'committed',createdAt:'2026-10-07T20:00:00Z',evidence:[],document:{html:`<div data-canvas-v2-node-id="screen" data-canvas-v2-screen="${screen(text)}"></div>${extra}`,css:''} });
test('versions record source changes with readable authorship and ignore placement or unrelated edits', () => {
  let history = recordCanvasV2ScreenVersions([],revision('one','First'));
  assert.equal(history.length,1); assert.equal(history[0].label,'Starting version');
  const originalHistory = history;
  history=recordCanvasV2ScreenVersions(history,revision('move','First','<p>Unrelated human work</p>'));
  assert.equal(history.length,1); assert.equal(history, originalHistory);
  history=recordCanvasV2ScreenVersions(history,{...revision('two','Second'),summary:'Refined the greeting',updatedBy:'northstar'});
  assert.equal(history.length,2); assert.equal(history[1].label,'Refined the greeting'); assert.equal(history[1].author,'northstar');
  history=recordCanvasV2ScreenVersions(history,{...revision('restore','First'),summary:'Restored an earlier version',updatedBy:'user'});
  assert.equal(history.length,3); assert.equal(history[2].author,'you');
  const saved=JSON.parse(JSON.stringify(history));
  assert.deepEqual(recordCanvasV2ScreenVersions(saved,revision('reload','First')),history);
  const changed=recordCanvasV2ScreenVersions(saved,revision('three','Third'));
  assert.equal(changed.length,4); assert.notEqual(changed[0].encoded,changed.at(-1)!.encoded);
});
test('version history stays bounded without rewriting retained source', () => {
  let history=recordCanvasV2ScreenVersions([],revision('first','First'));
  for(let i=0;i<100;i++)history=recordCanvasV2ScreenVersions(history,revision(`edit-${i}`,`Version ${i}`));
  assert.equal(history.length,20); assert.equal(history.at(-1)!.id,'edit-99:screen');
  assert.ok(history.reduce((size,version)=>size+version.encoded.length,0)<=4_000_000);
});
test('canvas feedback source guards distinguish content revisions without sending source into chat', () => {
  assert.equal(canvasV2FeedbackFingerprint('<p>First</p>'),canvasV2FeedbackFingerprint('<p>First</p>'));
  assert.notEqual(canvasV2FeedbackFingerprint('<p>First</p>'),canvasV2FeedbackFingerprint('<p>Second</p>'));
  assert.match(canvasV2FeedbackFingerprint('<img src="private-source">'),/^[a-f0-9]{8}$/);
});
