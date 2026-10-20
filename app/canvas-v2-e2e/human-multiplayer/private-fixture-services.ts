'use client';

import { SupabasePrivateWorkspace } from '@/lib/canvas-v2/sessions/private-workspace-supabase';
import type { PrivateCanvasHistory } from '@/lib/canvas-v2/sessions/private-workspace';
import type { FixturePeer } from './seed';

type FixtureCall = <T = unknown>(action: string, data?: Record<string, unknown>) => Promise<T>;

/** Explicit model-free completed history, displayed by the production chat UI. */
export function privateFixtureHistory(peer: FixturePeer): PrivateCanvasHistory {
  const name = peer[0].toUpperCase() + peer.slice(1);
  return { turns: [{ id: `${peer}-private-history`, message: `${name} private planning history`,
    answer: `${name}'s completed fixture conversation stays private.`, status: 'completed', createdAt: '2026-10-20T00:00:00Z' }],
    draft: `${name} initial private draft`, model: 'gpt-5.6-sol', effort: 'high' };
}

/** Only the account service boundary is replaced. The actual production
 * private transport performs blob preparation, codec work, RPC sequencing,
 * retries, path validation and retained old-blob cleanup. */
export function privateFixtureRemote(room: string, peer: FixturePeer, call: FixtureCall) {
  const error = (cause: unknown) => ({ message: cause instanceof Error ? cause.message : String(cause) });
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      try { return { data: await call('private-rpc', { name, args }), error: null }; }
      catch (cause) { return { data: null, error: error(cause) }; }
    },
    storage: { from: () => ({
      upload: async (path: string, blob: Blob) => {
        try { await call('private-upload', { path, text: await blob.text() }); return { data: { path }, error: null }; }
        catch (cause) { const issue = error(cause); return { data: null, error: { ...issue, statusCode: issue.message.includes('already exists') ? '409' : '400' } }; }
      },
      download: async (path: string) => {
        try { const value = await call<{ text: string }>('private-download', { path }); return { data: new Blob([value.text], { type: 'application/json' }), error: null }; }
        catch (cause) { return { data: null, error: error(cause) }; }
      },
      remove: async (paths: string[]) => {
        try { await call('private-remove', { paths }); return { data: [], error: null }; }
        catch (cause) { return { data: null, error: error(cause) }; }
      },
    }) },
  } as unknown as NonNullable<ConstructorParameters<typeof SupabasePrivateWorkspace>[2]>;
  return new SupabasePrivateWorkspace(room, peer, db);
}
