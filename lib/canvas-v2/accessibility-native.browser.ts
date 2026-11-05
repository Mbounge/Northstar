'use client';
import {codexWorkerFetch} from './worker/transport';
import {accessibilityDigest,screenAccessibilityEpoch} from './screen-accessibility.browser';
import {canvasV2FeedbackFingerprint} from './screen-feedback';
import {canvasV2ScreenBoundAssets,encodeCanvasV2Screen,type CanvasV2InteractiveScreen} from './interactive-screen';
import {readCanvasV2ScreenAssetPixels} from './screen-asset-pixels';
import {readCanvasV2ScreenFontCss} from './screen-fonts';
import type {CanvasV2EvidenceAsset} from './types';
import type {AccessibilityNativeStep,AccessibilityNativeResult,AccessibilityStaticProbeScenario,AccessibilityStaticProbeResult} from './accessibility-native';
import {sanitizeAccessibilitySnapshot,type AccessibilitySnapshot} from './screen-accessibility.browser';
import {packScreenCaptureImages} from './screen-capture-resources';
const transport=codexWorkerFetch(fetch,Date.now,'accessibility');
export async function verifyNativeAccessibility(nodeId:string,screen:CanvasV2InteractiveScreen,evidence:readonly CanvasV2EvidenceAsset[],steps:AccessibilityNativeStep[],signal:AbortSignal,testTransport?:typeof fetch){
 const encoded=encodeCanvasV2Screen(screen),epoch=screenAccessibilityEpoch(nodeId),assets:Record<string,string>={};
 for(const id of canvasV2ScreenBoundAssets(screen)){const asset=evidence.find(item=>item.id===id);if(!asset||!['image','font'].includes(asset.mediaType??''))throw Error('Native inspection currently requires self-contained retained image/font resources; media needs separate review.');assets[id]=await readCanvasV2ScreenAssetPixels(asset.url,signal);}
 const sourceSha256=await accessibilityDigest(encoded),sourceVersion=canvasV2FeedbackFingerprint(encoded),fontCss=await readCanvasV2ScreenFontCss(screen,signal);
 const response=await (testTransport??transport)('/api/canvas-v2/codex',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodeId,sourceVersion,sourceSha256,screen,assets,fontCss,steps}),signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
 const result=await response.json();if(!response.ok)throw Error(result.error??'Native verification failed.');
 if(result.kind!=='northstar-native-accessibility'||result.nodeId!==nodeId||result.sourceSha256!==sourceSha256||result.sourceVersion!==sourceVersion||screenAccessibilityEpoch(nodeId)!==epoch)throw Error('Native verification is stale or mismatched. Re-check the current page.');
 return result as AccessibilityNativeResult;
}

/** Actual pixels of one current semantic state at a fixed scenario viewport.
 * Neither this transport nor the worker can mutate the live authored preview. */
export async function verifyStaticAccessibilityProbe(nodeId:string,screen:CanvasV2InteractiveScreen,snapshot:AccessibilitySnapshot,scenario:AccessibilityStaticProbeScenario,signal:AbortSignal,testTransport?:typeof fetch){
 const encoded=encodeCanvasV2Screen(screen),epoch=screenAccessibilityEpoch(nodeId),clean=sanitizeAccessibilitySnapshot(snapshot);
 const retained={...packScreenCaptureImages(clean.html,clean.css),width:snapshot.width,height:snapshot.height,language:snapshot.language,direction:snapshot.direction,title:snapshot.title,rootClass:snapshot.rootClass,rootStyle:snapshot.rootStyle};
 // JSON transport removes undefined metadata; hash exactly those serialized bytes.
 const semantic=JSON.parse(JSON.stringify(retained)),snapshotSha256=await accessibilityDigest(JSON.stringify(semantic)),sourceSha256=await accessibilityDigest(encoded),sourceVersion=canvasV2FeedbackFingerprint(encoded);
 const response=await (testTransport??transport)('/api/canvas-v2/codex',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'static-probe',nodeId,sourceVersion,sourceSha256,screen,steps:[],probe:{scenario,snapshot:semantic,snapshotSha256,stateEpoch:epoch}}),signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
 const result=await response.json();if(!response.ok)throw Error(result.error??'Static accessibility probe failed.');
 if(result.kind!=='northstar-static-accessibility-probe'||result.nodeId!==nodeId||result.sourceSha256!==sourceSha256||result.snapshotSha256!==snapshotSha256||result.sourceVersion!==sourceVersion||result.stateEpoch!==epoch||result.scenario!==scenario||screenAccessibilityEpoch(nodeId)!==epoch||!Array.isArray(result.views)||!result.views.length)throw Error('Static probe is stale or mismatched. Re-check the current page.');
 return result as AccessibilityStaticProbeResult;
}
