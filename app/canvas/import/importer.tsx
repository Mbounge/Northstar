'use client';

import { useRef, useState } from 'react';
import { decodeSnapshotBlob } from '@/lib/canvas-v2/sessions/snapshot';
import { createSession, leaseSession, renameSession, saveSnapshot } from '@/lib/canvas-v2/sessions/store';
import type { NorthstarSession } from '@/lib/canvas-v2/sessions/types';

export function CanvasArchiveImport({ owner }: { owner: string }) {
  const [file, setFile] = useState<File>();
  const [title, setTitle] = useState('Imported canvas');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState('');
  const pending = useRef<{ session: NorthstarSession; writer: string } | undefined>(undefined);

  async function importCanvas() {
    if (!file || busy || saved) return;
    setBusy(true);
    setStatus('Reading canvas…');
    try {
      // Decode and validate before creating anything in the account. This is
      // the same bounded, lossless archive format used by ordinary sessions.
      const snapshot = await decodeSnapshotBlob(file);
      setStatus('Saving to your canvases…');
      if (!pending.current) pending.current = { session: await createSession(owner), writer: crypto.randomUUID() };
      const item = pending.current;
      if (!await leaseSession(item.session.id, item.writer)) throw Error('Could not obtain the canvas save lease. Please try again.');
      item.session = await saveSnapshot(item.session, item.writer, snapshot);
      await renameSession(item.session.id, title);
      const released = await fetch('/api/canvas-v2/sessions/release', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.session.id, writer: item.writer }),
      });
      if (!released.ok) throw Error('Your canvas is saved, but its editing lock could not be released. Please try again.');
      setSaved('/canvas?workspace=' + item.session.id + '&embedded=1');
      setStatus('Your canvas is saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The canvas could not be imported.');
    } finally { setBusy(false); }
  }

  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'radial-gradient(ellipse at top,#27204b,#101019 65%)', color: '#f6f3ff', fontFamily: 'Arial,sans-serif' }}>
    <section style={{ width: 'min(100%,460px)' }}>
      <p style={{ color: '#b7a7dd', fontSize: 12, letterSpacing: '.14em' }}>NORTH STAR</p>
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: '26px 0 12px' }}>Bring your canvas with you.</h1>
      <p style={{ color: '#bbb4c9', lineHeight: 1.6 }}>Open a saved Northstar canvas in your account, including its pages and review evidence.</p>
      <label style={{ display: 'block', marginTop: 28 }}>Canvas name<input className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4bfff]" aria-label="Canvas name" value={title} maxLength={120} disabled={busy || !!saved} onChange={event => setTitle(event.target.value)} style={fieldStyle} /></label>
      <label style={{ display: 'block', marginTop: 18 }}>Canvas file<input className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4bfff]" aria-label="Canvas file" type="file" accept="application/json,.json" disabled={busy || !!saved} onChange={event => { setFile(event.target.files?.[0]); setStatus(''); }} style={fieldStyle} /></label>
      <button className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4bfff]" disabled={!file || busy || !!saved} onClick={() => void importCanvas()} style={{ ...fieldStyle, marginTop: 24, borderColor: '#a68ce0', background: '#bca4f4', color: '#171020', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: !file || busy || saved ? .55 : 1 }}>{busy ? 'Opening…' : 'Save canvas'}</button>
      <p role="status" style={{ minHeight: 24, color: '#d7c9ef', fontSize: 14, lineHeight: 1.5 }}>{status}</p>
      {saved && <a href={saved} style={{ display: 'inline-block', color: '#d4bfff', padding: '12px 0', textUnderlineOffset: 4 }}>Open saved canvas ↗</a>}
    </section>
  </main>;
}

const fieldStyle = { display: 'block', width: '100%', border: '1px solid #8b7e9a', borderRadius: 8, background: '#211c2c', color: '#f6f3ff', padding: '13px 14px', fontSize: 14, marginTop: 8 } as const;
