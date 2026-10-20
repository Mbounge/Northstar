'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const PENDING_INVITE = 'northstar.pending-canvas-invitation';
async function redeem(token: string): Promise<string> {
  const { data, error } = await createClient().rpc('northstar_canvas_join', { token });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string' || !/^[0-9a-f-]{36}$/i.test(data)) throw new Error('This invitation could not be opened.');
  return data;
}
export function CanvasInvitation() {
  const [state, setState] = useState<'opening' | 'signin' | 'error'>('opening'), [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    const open = async () => {
      try {
        const token = new URLSearchParams(window.location.hash.slice(1)).get('invite');
        if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error('This invitation is incomplete. Ask your teammate for a new link.');
        // Fragments are not sent to the server or in referrers. Carry this
        // invitation through the normal sign-in flow within the same tab.
        sessionStorage.setItem(PENDING_INVITE, token);
        const { data: { user } } = await createClient().auth.getUser();
        if (!user) { if (!disposed) setState('signin'); return; }
        const id = await redeem(token); sessionStorage.removeItem(PENDING_INVITE);
        if (!disposed) window.location.replace(`/canvas?workspace=${id}`);
      } catch (cause) { if (!disposed) { setError(cause instanceof Error ? cause.message : 'This invitation could not be opened.'); setState('error'); } }
    };
    void open(); return () => { disposed = true; };
  }, []);
  return <main className="grid min-h-screen place-items-center bg-[#101019] p-6 text-[#eee7f5]"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#211d28] p-8"><p className="text-[10px] font-medium uppercase tracking-[.18em] text-[#a994c8]">North Star</p><h1 className="mt-4 text-xl font-medium">A shared space to create.</h1><p role="status" className="mt-3 text-sm leading-6 text-[#a89db4]">{state === 'opening' ? 'Opening your teammate’s canvas…' : state === 'signin' ? 'Sign in to join the canvas your teammate shared with you.' : error}</p>{state === 'signin' && <Link href="/" className="mt-6 block rounded-lg bg-[#8066df] px-4 py-3 text-center text-sm font-medium text-white">Sign in to join</Link>}{state === 'error' && <Link href="/canvas" className="mt-6 block text-xs text-[#c4b4f7]">Return to your canvases</Link>}</div></main>;
}

/** Resume only an explicit invitation retained by the join page before login. */
export function PendingCanvasInvitation() {
  useEffect(() => {
    const token = sessionStorage.getItem(PENDING_INVITE); if (!token) return;
    let disposed = false;
    void redeem(token).then(id => { sessionStorage.removeItem(PENDING_INVITE); if (!disposed) window.location.replace(`/canvas?workspace=${id}`); }).catch(() => { if (!disposed) window.location.replace(`/canvas/join#invite=${encodeURIComponent(token)}`); });
    return () => { disposed = true; };
  }, []);
  return null;
}
