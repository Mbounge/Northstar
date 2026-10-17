'use client';
import { useState } from 'react';
import { inspectAssetCropPixels } from '@/lib/canvas-v2/asset-crop-inspection';
import { verifyAssetCropSelection } from '@/lib/canvas-v2/asset-crop';

/** Local-only check of the actual browser crop inspector, without model work. */
export default function CropInspectionCheck() {
  const [result, setResult] = useState('Not run'), [images, setImages] = useState<string[]>([]);
  const run = async () => {
    try {
      const source = document.createElement('canvas'); source.width = 128; source.height = 96;
      const drawing = source.getContext('2d')!, data = drawing.createImageData(128, 96);
      for (let y = 0; y < 96; y++) for (let x = 0; x < 128; x++) { const i = (y * 128 + x) * 4; data.data.set([x, y, (x + y) % 256, 255], i); }
      drawing.putImageData(data, 0, 0);
      const sourceSize = { width: 128, height: 96 }, rect = { x: 11, y: 17, width: 32, height: 32 }, signal = new AbortController().signal;
      const pixels = source.toDataURL('image/png'), inspection = await inspectAssetCropPixels(pixels, rect, sourceSize, signal);
      if (!inspection.rect || !inspection.contextPixels) throw new Error('Crop preview missing.');
      const extracted = new Image(); extracted.src = inspection.pixels; await extracted.decode();
      const exact = document.createElement('canvas'); exact.width = 32; exact.height = 32;
      const exactDrawing = exact.getContext('2d')!; exactDrawing.drawImage(extracted, 0, 0);
      const output = exactDrawing.getImageData(0, 0, 32, 32).data;
      let equal = extracted.naturalWidth === 32 && extracted.naturalHeight === 32;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) for (let c = 0; c < 4; c++) if (output[(y * 32 + x) * 4 + c] !== data.data[((y + 17) * 128 + x + 11) * 4 + c]) equal = false;
      let wrongSizeRejected = false, changedRectRejected = false;
      try { await inspectAssetCropPixels(pixels, rect, { width: 64, height: 48 }, signal); } catch { wrongSizeRejected = true; }
      try { verifyAssetCropSelection({ sourceSize, cropPixels: { ...rect, x: 12 } }, { sourceSize, rect }); } catch { changedRectRejected = true; }
      setImages([inspection.contextPixels, inspection.pixels]);
      setResult(JSON.stringify({ sourceSize: inspection.sourceSize, selectedPixels: inspection.rect, exactPixelMatch: equal, wrongSizeRejected, changedRectRejected, pass: equal && wrongSizeRejected && changedRectRejected }, null, 2));
    } catch (error) { setResult(error instanceof Error ? error.message : String(error)); }
  };
  return <main style={{ padding: 32, color: '#222', background: '#fff', minHeight: '100vh' }}>
    <h1>Original-pixel crop inspection check</h1>
    <p>This local test checks selection coordinates and extracted pixels, not recognition of the intended subject.</p>
    <button onClick={run}>Run crop check</button>
    <pre role="status">{result}</pre>
    <div style={{ display: 'flex', gap: 32, alignItems: 'start' }}>{images.map((src, i) => (
      // Raw inspector pixels must not go through image optimization/resampling.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={i} src={src} alt={i === 0 ? 'Selection outlined in source context' : 'Exact unmasked source crop'} style={{ imageRendering: 'pixelated', width: i === 0 ? undefined : 160 }} />
    ))}</div>
  </main>;
}
