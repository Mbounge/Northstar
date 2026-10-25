import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCanvasV2Screen } from '../lib/canvas-v2/interactive-screen';
import { requireScreenJourneySourceCurrent } from '../lib/canvas-v2/screen-journey-source';

test('unrelated teammate edits and movement retain valid private checks; target changes, removal and resource replacement invalidate them',()=>{
 const source={version:1 as const,title:'Poster',width:640,height:560,html:'<p>Date</p><img src="northstar-asset:photo">',css:'',javascript:'',referenceAssetIds:['photo']};
 const encoded=encodeCanvasV2Screen(source),html=(value=encoded)=>`<div data-canvas-v2-node-id="poster" style="left:400px" data-canvas-v2-screen="${value}"></div><p>Teammate changed this note</p>`;
 const assets=[{id:'photo',url:'data:image/png;base64,one',label:'Original'},{id:'unrelated',url:'old',label:'Other'}];
 assert.doesNotThrow(()=>requireScreenJourneySourceCurrent('poster',encoded,assets,html(),[assets[0],{...assets[1],url:'new'}]));
 assert.throws(()=>requireScreenJourneySourceCurrent('poster',encoded,assets,html(encodeCanvasV2Screen({...source,html:'<p>New human work</p>'})),assets),/screen changed/);
 assert.throws(()=>requireScreenJourneySourceCurrent('poster',encoded,assets,'<p>Deleted</p>',assets),/screen changed/);
 assert.throws(()=>requireScreenJourneySourceCurrent('poster',encoded,assets,html(),[{...assets[0],url:'data:image/png;base64,two'},assets[1]]),/resource.*changed/);
 assert.throws(()=>requireScreenJourneySourceCurrent('poster',encoded,assets,html(),[assets[1]]),/resource.*changed/);
});
