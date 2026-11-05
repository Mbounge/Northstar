'use client';
import {codexWorkerFetch} from './worker/transport';
import {accessibilityDigest,screenAccessibilityEpoch} from './screen-accessibility.browser';
import {canvasV2FeedbackFingerprint} from './screen-feedback';
import {canvasV2ScreenBoundAssets,encodeCanvasV2Screen,type CanvasV2InteractiveScreen} from './interactive-screen';
import {readCanvasV2ScreenAssetPixels} from './screen-asset-pixels';
import {readCanvasV2ScreenFontCss} from './screen-fonts';
import type {CanvasV2EvidenceAsset} from './types';
import type {AccessibilityNativeStep,AccessibilityNativeResult} from './accessibility-native';
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
