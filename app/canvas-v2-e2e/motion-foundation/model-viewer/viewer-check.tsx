'use client';
import { useEffect, useState } from 'react';
import { CanvasV2NativeModelObject } from '@/components/canvas-v2/native-model-object';
import { CanvasV2ScreenAssets, inspectCanvasV2Screen, testCanvasV2ScreenJourney } from '@/components/canvas-v2/interactive-screen';
import { readCanvasV2ScreenModelBytes } from '@/lib/canvas-v2/screen-asset-pixels';
import { canvasV2NativeModelViewerScreen } from '@/lib/canvas-v2/model-object';
import { encodeCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import type { CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';
const model = { version: 1 as const, evidenceId: 'viewer-athlete', label: 'Rigged athlete viewer check' };
const encodedModel = JSON.stringify(model);
const encoded = encodeCanvasV2Screen(canvasV2NativeModelViewerScreen(model));
export default function ModelViewerCheck() {
  const [assets, setAssets] = useState<CanvasV2EvidenceAsset[]>([]);
  const [grouped, setGrouped] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [evidence, setEvidence] = useState('');
  useEffect(() => {
    const aborter = new AbortController();
    readCanvasV2ScreenModelBytes('/canvas-v2-e2e/motion-foundation/asset', aborter.signal).then(url => setAssets([{id: model.evidenceId, label: model.label, mediaType: 'model', mimeType: 'model/gltf-binary', url}])).catch(error => { if (!aborter.signal.aborted) setEvidence(String(error)); });
    return () => aborter.abort();
  }, []);
  useEffect(() => {
    if (!assets.length) return;
    const aborter = new AbortController();
    const started = performance.now();
    void inspectCanvasV2Screen('viewer-original', encoded, {action: 'snapshot'}, aborter.signal).then(result => {
      if (!aborter.signal.aborted) setEvidence(JSON.stringify({ requestedAtMount: true, captureElapsedMs: performance.now() - started, ...result, html: undefined, css: undefined, captureImages: undefined }, null, 2));
    }).catch(error => { if (!aborter.signal.aborted) setEvidence(String(error)); });
    return () => aborter.abort();
  }, [assets]);
  const capture = async () => {
    try {
      const result = await inspectCanvasV2Screen('viewer-original', encoded, {action: 'snapshot'}, new AbortController().signal);
      setEvidence(JSON.stringify({ ...result, html: undefined, css: undefined, captureImages: undefined }, null, 2));
    } catch (error) { setEvidence(String(error)); }
  };
  const captureReduced = async () => {
    try {
      const result = await testCanvasV2ScreenJourney('viewer-original', encoded, assets, [{action:'wait',delayMs:300,expectedVisibleSelector:'#status',expectedText:'Paused'}], 'reduce', new AbortController().signal);
      setEvidence(JSON.stringify({ ...result.state, html: undefined, css: undefined, captureImages: undefined }, null, 2));
    } catch (error) { setEvidence(String(error)); }
  };
  const viewer = <CanvasV2NativeModelObject nodeId="viewer-original" encodedModel={encodedModel} showCaption={false}/>;
  return <main style={{padding:24, color:'#fff', background:'#171b21', minHeight:'100vh', fontFamily:'system-ui'}}>
    <h1>Generic 3D reference viewer checks</h1><p>Actual retained GLB, isolated viewer, and normal state retention. This is a test fixture.</p>
    <button onClick={() => setGrouped(value => !value)}>Reparent viewer</button>{' '}
    <button onClick={() => setDuplicate(value => !value)}>{duplicate ? 'Remove independent copy' : 'Create independent copy'}</button>{' '}
    <button onClick={capture}>Capture viewer evidence</button>{' '}
    <button onClick={captureReduced}>Check reduced-motion initial state</button>
    <CanvasV2ScreenAssets.Provider value={assets}><div style={{display:'flex', gap:24, marginTop:20}}>
      {assets.length > 0 && (grouped ? <section key="group" aria-label="Grouped viewer" style={{width:640,height:480}}>{viewer}</section> : <div key="root" aria-label="Root viewer" style={{width:640,height:480}}>{viewer}</div>)}
      {assets.length > 0 && duplicate && <div aria-label="Independent viewer" style={{width:640,height:480}}><CanvasV2NativeModelObject nodeId="viewer-independent" encodedModel={encodedModel} showCaption={false}/></div>}
    </div></CanvasV2ScreenAssets.Provider>
    <pre aria-label="Viewer evidence" style={{fontSize:11,whiteSpace:'pre-wrap'}}>{evidence}</pre>
  </main>;
}
