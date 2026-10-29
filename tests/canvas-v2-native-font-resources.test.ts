import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {CANVAS_V2_NATIVE_FONT_CSS} from '../lib/canvas-v2/screen-fonts';
import {buildCanvasV2RuntimeDocument} from '../lib/canvas-v2/runtime-document';
import {validateCanvasV2ArtifactDocument} from '../lib/canvas-v2/artifact-safety';
import {CANVAS_V2_ARTIFACT_SCHEMA} from '../lib/canvas-v2/types';

test('native font measurement and visible text share the same fixed first-party resources',()=>{
 const document={html:'<p data-canvas-v2-node-id="type">A little space.</p>',css:'p{font-family:"Instrument Serif",serif}'};
 const runtime=buildCanvasV2RuntimeDocument({schema:CANVAS_V2_ARTIFACT_SCHEMA,id:'font-study',state:'committed',createdAt:'2026-10-29T00:00:00Z',document,evidence:[]});
 assert.ok(runtime.includes(CANVAS_V2_NATIVE_FONT_CSS));
 const visible=readFileSync(new URL('../components/canvas-v2/native-canvas-scene.tsx',import.meta.url),'utf8');assert.ok(visible.includes('<style data-canvas-v2-native-fonts>{CANVAS_V2_NATIVE_FONT_CSS}</style>'));
 assert.ok(CANVAS_V2_NATIVE_FONT_CSS.includes('InstrumentSerif-Italic.ttf'));assert.ok(CANVAS_V2_NATIVE_FONT_CSS.includes('DMSans-Variable.ttf'));assert.ok(!CANVAS_V2_NATIVE_FONT_CSS.includes('https:'));
 assert.deepEqual(validateCanvasV2ArtifactDocument(document),[]);
 assert.ok(validateCanvasV2ArtifactDocument({...document,css:'@font-face{font-family:Injected;src:url(https://untrusted.test/font.ttf)}'}).length,'Authored URL loading remains prohibited');
});
