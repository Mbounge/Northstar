import { createClient } from '@/lib/supabase/client';
import { decodeSnapshot, encodeSnapshot } from './snapshot';
import type { NorthstarSession, NorthstarSnapshot } from './types';
const bucket = 'northstar-sessions';
const db = () => createClient();
function checked<T>(result: {data: T; error: {message:string} | null}): T {
  if (result.error) throw new Error(result.error.message); return result.data;
}
export async function listSessions() {
  return checked(await db().from('northstar_sessions').select('*').order('updated_at', { ascending: false })) as NorthstarSession[];
}
export async function createSession(owner: string) {
  return checked(await db().from('northstar_sessions').insert({owner_id: owner}).select('*').single()) as NorthstarSession;
}
export async function getSession(id: string) {
  return checked(await db().from('northstar_sessions').select('*').eq('id',id).single()) as NorthstarSession;
}
export async function loadSnapshot(session: NorthstarSession): Promise<NorthstarSnapshot | undefined> {
  // A concurrent autosave can replace and remove the path we just read.
  // Retry against fresh metadata instead of treating that race as data loss.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!session.snapshot_path) return undefined;
    const result = await db().storage.from(bucket).download(session.snapshot_path);
    if (!result.error && result.data) return decodeSnapshot(JSON.parse(await result.data.text()));
    const fresh = await getSession(session.id);
    if (fresh.snapshot_path === session.snapshot_path) throw new Error(result.error?.message || 'The saved snapshot could not be loaded.');
    Object.assign(session, fresh);
  }
  throw new Error('This canvas is still saving. Reopen it in a moment.');
}
export async function leaseSession(id: string, writer: string, takeover = false) {
  return checked(await db().rpc('northstar_session_lease', {sid:id,writer,takeover})) === true;
}
export async function archiveSession(id: string, archived: boolean) {
  checked(await db().rpc('northstar_session_archive',{sid:id,value:archived}));
}
export async function renameSession(id: string, title: string) {
  checked(await db().rpc('northstar_session_rename',{sid:id,value:title.trim().slice(0,120) || 'Untitled canvas'}));
}
type PendingSave = {session:NorthstarSession; path:string; snapshot:NorthstarSnapshot};
const pendingSaves = new Map<string,PendingSave>();
async function commitSnapshot(pending:PendingSave,writer:string) {
  const {session,path,snapshot}=pending;
  const version=checked(await db().rpc('northstar_session_save',{sid:session.id,writer,expected_version:session.version,
    path,next_model:snapshot.model,next_effort:snapshot.effort}));
  // Only a confirmed CAS permits removing the previous blob.
  if(session.snapshot_path) void db().storage.from(bucket).remove([session.snapshot_path]);
  return {...session,version,snapshot_path:path,model:snapshot.model,effort:snapshot.effort,updated_at:new Date().toISOString()};
}
export async function saveSnapshot(session: NorthstarSession, writer: string, snapshot: NorthstarSnapshot): Promise<NorthstarSession> {
  const key=`${writer}:${session.id}`;
  const pending=pendingSaves.get(key);
  if(pending) {
    session=await commitSnapshot(pending,writer);pendingSaves.delete(key);
    if(pending.snapshot===snapshot)return session;
  }
  const blob = await encodeSnapshot(snapshot);
  const path = `${session.owner_id}/${session.id}/${crypto.randomUUID()}.json`;
  checked(await db().storage.from(bucket).upload(path,blob,{contentType:'application/json',upsert:false}));
  // Retain the exact operation until acknowledged, including across newer edits.
  const next={session,path,snapshot};pendingSaves.set(key,next);
  const saved=await commitSnapshot(next,writer);pendingSaves.delete(key);return saved;
}
