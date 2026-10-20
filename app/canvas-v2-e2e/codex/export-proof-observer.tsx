'use client';

import { useEffect, useState } from 'react';

type Receipt = { id: number; name: string; mime: string; bytes: number; dataUrl: string; source?: string; checks: Record<string, unknown> };
const readDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Export bytes could not be read.'));
  reader.onerror = () => reject(reader.error ?? new Error('Export bytes could not be read.'));
  reader.readAsDataURL(blob);
});

/** Development fixture only: inspect the actual production-generated Blob.
 * Data URLs and summaries are deliberately visible, never a hidden browser hook. */
export function ExportProofObserver() {
  const [receipts, setReceipts] = useState<Receipt[]>([]), [expanded, setExpanded] = useState(false), [error, setError] = useState(''), [pending, setPending] = useState(0);
  useEffect(() => {
    let serial = 0, mounted = true;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ blob?: unknown; name?: unknown }>).detail;
      if (!(detail?.blob instanceof Blob) || typeof detail.name !== 'string') return;
      const blob = detail.blob, name = detail.name, id = ++serial;
      setPending(count => count + 1); setError('');
      void (async () => {
        if (blob.size > 32_000_000) throw new Error('The actual export exceeds this visible fixture’s 32 MB display limit.');
        const dataUrl = await readDataUrl(blob), checks: Record<string, unknown> = { actualBlob: true };
        let source: string | undefined;
        if (blob.type === 'image/png') {
          const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
          checks.pngSignature = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value);
          const bitmap = await createImageBitmap(blob);
          checks.width = bitmap.width; checks.height = bitmap.height; bitmap.close();
        } else if (/^(?:image\/svg\+xml|text\/html)(?:;|$)/.test(blob.type)) {
          source = await blob.text();
          const svg = blob.type.startsWith('image/svg+xml'), doc = new DOMParser().parseFromString(source, svg ? 'image/svg+xml' : 'text/html');
          const resources = [...doc.querySelectorAll('[src],[poster],image[href],image[xlink\\:href]')].flatMap(element => ['src', 'poster', 'href', 'xlink:href'].flatMap(attribute => { const value = element.getAttribute(attribute); return value ? [value] : []; }));
          checks.validDocument = !doc.querySelector('parsererror');
          checks.nativeSvgCount = doc.querySelectorAll('svg').length;
          checks.defsCount = doc.querySelectorAll('defs').length;
          checks.nativePathCount = doc.querySelectorAll('path').length;
          checks.nativeImageCount = doc.querySelectorAll('image,img').length;
          checks.nativeTextCount = doc.querySelectorAll('text,tspan').length;
          checks.foreignObjectCount = doc.querySelectorAll('foreignObject').length;
          checks.fontFaceCount = (source.match(/@font-face/gi) ?? []).length;
          checks.embeddedFontCount = (source.match(/data:font\//gi) ?? []).length;
          checks.embeddedImageCount = (source.match(/data:image\//gi) ?? []).length;
          checks.unresolvedAssetHandles = (source.match(/northstar-asset:/g) ?? []).length;
          checks.unresolvedResourceUrls = resources.filter(value => !value.startsWith('data:') && !value.startsWith('#'));
          checks.blobUrlCount = (source.match(/blob:/g) ?? []).length;
          if (svg) { checks.viewBox = doc.documentElement.getAttribute('viewBox'); checks.svgNamespace = doc.documentElement.namespaceURI; }
          else { checks.hasCsp = Boolean(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')); checks.scriptCount = doc.querySelectorAll('script').length; checks.hasProductDataBridge = source.includes('northstarProduct'); checks.nativeFormControlCount = doc.querySelectorAll('input,textarea,select,button').length; }
        }
        if (mounted) { setReceipts(current => [...current, { id, name, mime: blob.type, bytes: blob.size, dataUrl, source, checks }].slice(-8)); setExpanded(true); }
      })().catch(failure => { if (mounted) setError(failure instanceof Error ? failure.message : String(failure)); }).finally(() => { if (mounted) setPending(count => count - 1); });
    };
    window.addEventListener('northstar-design-export-complete', receive);
    return () => { mounted = false; window.removeEventListener('northstar-design-export-complete', receive); };
  }, []);
  return <aside aria-label="Development export proof observer" style={{ position: 'fixed', left: 12, bottom: 78, zIndex: 1200, width: expanded ? 'min(560px, calc(100vw - 24px))' : 260, maxHeight: '65vh', overflow: 'auto', background: '#fff', color: '#21182e', border: '1px solid #a99acb', borderRadius: 12, padding: 12, boxShadow: '0 8px 30px #0002', font: '12px/1.4 system-ui' }}>
    <button type="button" aria-label={expanded ? 'Collapse export proof observer' : 'Show export proof observer'} onClick={() => setExpanded(value => !value)} style={{ width: '100%', textAlign: 'left', fontWeight: 700 }}>Export proof observer · {receipts.length} files {expanded ? '▾' : '▸'}</button>
    <p role="status" style={{ margin: '6px 0 0' }}>{pending ? 'Reading actual export bytes…' : error || (receipts.length ? 'Actual production Blob bytes are ready below.' : 'Waiting for an actual generated export.')}</p>
    {expanded && receipts.map(receipt => <section key={receipt.id} aria-label={'Export receipt ' + receipt.name} style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #ddd' }}>
      <strong>{receipt.name}</strong><div>{receipt.mime} · {receipt.bytes} bytes</div>
      <a href={receipt.dataUrl} download={receipt.name} aria-label={'Export proof file ' + receipt.name} style={{ display: 'inline-block', marginTop: 6, color: '#5d469d', textDecoration: 'underline' }}>Export proof file</a>
      <pre aria-label={'Export checks ' + receipt.name} style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(receipt.checks, null, 2)}</pre>
      <label style={{ display: 'block' }}>Exact exported data URL<textarea readOnly aria-label={'Exact exported data URL ' + receipt.name} value={receipt.dataUrl} rows={3} style={{ display: 'block', width: '100%', font: '10px monospace', overflowWrap: 'anywhere' }} /></label>
      {receipt.source !== undefined && <label style={{ display: 'block', marginTop: 6 }}>Exact exported source<textarea readOnly aria-label={'Exact exported source ' + receipt.name} value={receipt.source} rows={3} style={{ display: 'block', width: '100%', font: '10px monospace' }} /></label>}
    </section>)}
  </aside>;
}
