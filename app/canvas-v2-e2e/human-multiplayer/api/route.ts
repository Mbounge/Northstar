import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { applySharedChanges, diffSharedCells, cellObjectId, conflictingSharedCells, revisionFromSharedCells, sharedCellsFromRevision, type AcceptedOperation, type SharedCells, type SharedOperation } from '@/lib/canvas-v2/sessions/collaboration-document';
import { parsePeerPresence, type CanvasMember, type PeerPresence } from '@/lib/canvas-v2/sessions/collaboration-client';
import { fixtureMembers, isFixturePeer, multiplayerSeed } from '../seed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Room = {
  seed: ReturnType<typeof multiplayerSeed>;
  cells: SharedCells; version: number; operations: AcceptedOperation[]; members: CanvasMember[];
  presence: Map<string, PeerPresence>; claims: Map<string, { clientId: string; userId: string; until: number }>;
  invites: Set<string>; serial: Promise<void>; stats: { reads: number; commits: number; presencePackets: number; presenceBytes: number };
  rejections?: Array<{ actor: string; keys: string[]; conflicts: string[]; occupied: string[] }>;
  privateAccounts?: Map<string, { version: number; path: string | null; blobs: Map<string, string>; uploads: number; uploadBytes: number; reads: number; saves: number; diagnostics?: number }>;
};
const state = globalThis as typeof globalThis & { northstarHumanMultiplayerFixtureRooms?: Map<string, Room> };
const rooms = state.northstarHumanMultiplayerFixtureRooms ??= new Map();
const seed = multiplayerSeed();
function getRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    if (rooms.size > 50) rooms.delete(rooms.keys().next().value!);
    const roomSeed=id.startsWith('dense-')?multiplayerSeed(true):seed;
    room = { seed:roomSeed,cells: sharedCellsFromRevision(roomSeed), version: 0, operations: [], members: fixtureMembers.map(member => ({ ...member })), presence: new Map(), claims: new Map(), invites: new Set(), serial: Promise.resolve(), stats: { reads: 0, commits: 0, presencePackets: 0, presenceBytes: 0 } };
    rooms.set(id, room);
  }
  return room;
}
function wire(room: Room, role: CanvasMember['role']) { return { version: room.version, cells: [...room.cells], seed:room.seed, ownerId: 'alice', role, members: room.members }; }
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/** Deliberately DEV-only identities and RAM transport. Production client,
 * operation partitioning, CAS and reconstruction run unchanged. This is not
 * evidence of authentication/RLS or real cross-account authorization. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') return response({ error: 'Not found' }, 404);
  try {
    const body = await request.json();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(body.room) || !isFixturePeer(body.peer)) return response({ error: 'Invalid fixture identity' }, 400);
    const room = getRoom(body.room), member = room.members.find(item => item.userId === body.peer);
    if (!member) return response({ error: 'Access denied: fixture membership removed' }, 403);
    const editor = member.role !== 'viewer', owner = member.role === 'owner';
    const clientId = typeof body.clientId === 'string' && body.clientId.startsWith(body.peer + '-') && body.clientId.length <= 80 ? body.clientId : undefined;
    const privateAccounts = room.privateAccounts ??= new Map();
    let privateAccount = privateAccounts.get(body.peer);
    if (!privateAccount) { privateAccount = { version: 0, path: null, blobs: new Map(), uploads: 0, uploadBytes: 0, reads: 0, saves: 0 }; privateAccounts.set(body.peer, privateAccount); }
    const ownPath = (value: unknown): value is string => typeof value === 'string' && value.startsWith(`${body.peer}/${body.room}/private/`) && /\/private\/[\da-f-]{36}\.json$/.test(value);
    switch (body.action) {
      case 'private-rpc': {
        if (body.args?.sid !== body.room) return response({ error: 'Private fixture session mismatch' }, 403);
        if (body.name === 'northstar_canvas_private_read') { privateAccount.reads++; return response(privateAccount.path ? { version: privateAccount.version, path: privateAccount.path } : null); }
        if (body.name !== 'northstar_canvas_private_save' || !ownPath(body.args.path)) return response({ error: 'Private fixture namespace denied' }, 403);
        const path = body.args.path;
        if (!privateAccount.blobs.has(path)) return response({ error: 'Private fixture blob missing' }, 400);
        if (privateAccount.path === path) return response({ ok: true, version: privateAccount.version, path });
        if (body.args.expected_version !== privateAccount.version) return response({ ok: false, version: privateAccount.version, path: privateAccount.path });
        privateAccount.version++; privateAccount.path = path; privateAccount.saves++;
        return response({ ok: true, version: privateAccount.version, path });
      }
      case 'private-upload': {
        if (!ownPath(body.path)) return response({ error: 'Private fixture namespace denied' }, 403);
        if (typeof body.text !== 'string' || body.text.length > 20_000_000) return response({ error: 'Private fixture blob too large' }, 400);
        if (privateAccount.blobs.has(body.path)) return response({ error: 'Private fixture blob already exists' }, 409);
        privateAccount.blobs.set(body.path, body.text); privateAccount.uploads++; privateAccount.uploadBytes += Buffer.byteLength(body.text);
        return response({ ok: true });
      }
      case 'private-download': {
        if (!ownPath(body.path)) return response({ error: 'Private fixture namespace denied' }, 403);
        const text = privateAccount.blobs.get(body.path);
        return text === undefined ? response({ error: 'Private fixture blob not found' }, 404) : response({ text });
      }
      case 'private-remove': {
        if (!Array.isArray(body.paths) || body.paths.length > 20 || !body.paths.every(ownPath)) return response({ error: 'Private fixture namespace denied' }, 403);
        for (const path of body.paths) privateAccount.blobs.delete(path);
        return response({ ok: true });
      }
      case 'private-diagnostics': privateAccount.diagnostics = (privateAccount.diagnostics ?? 0) + 1; return response({ sample: privateAccount.diagnostics, peer: body.peer, version: privateAccount.version, path: privateAccount.path, uploads: privateAccount.uploads, uploadBytes: privateAccount.uploadBytes, metadataReads: privateAccount.reads, acceptedSaves: privateAccount.saves, retainedBlobs: privateAccount.blobs.size });
      case 'read': room.stats.reads++; return response(wire(room, member.role));
      case 'enable': return editor ? response(wire(room, member.role)) : response({ error: 'This canvas is view-only.' }, 403);
      case 'members': return response(room.members);
      case 'since': return response(room.operations.filter(item => item.version > Number(body.version || 0)).slice(0, 100));
      case 'commit': {
        if (!editor) return response({ error: 'This canvas is view-only.' }, 403);
        const op = body.operation as SharedOperation;
        if (!clientId || !op || op.clientId !== clientId || typeof op.id !== 'string' || !Array.isArray(op.changes) || op.changes.length > 1000 || JSON.stringify(op).length > 2_000_000) return response({ error: 'Invalid fixture operation' }, 400);
        let result: { ok: boolean; version: number; conflicts?: string[] } = { ok: false, version: room.version };
        const work = room.serial.then(async () => {
          const old = room.operations.find(item => item.id === op.id);
          if (old) { result = { ok: true, version: old.version }; return; }
          const now = Date.now();
          const occupied = op.changes.map(change => cellObjectId(change.key)).filter(id => !!id && room.claims.has(id) && room.claims.get(id)!.clientId !== clientId && room.claims.get(id)!.until > now);
          const conflicts = await conflictingSharedCells(room.cells, op.changes);
          if (occupied.length || conflicts.length) { (room.rejections ??= []).push({ actor: body.peer, keys: op.changes.map(change => change.key), conflicts, occupied: occupied.map(String) }); result = { ok: false, version: room.version, conflicts: [...conflicts, ...occupied.map(String)] }; return; }
          const next = applySharedChanges(room.cells, op.changes);
          // A malformed parent/reference or raw source never reaches peers.
          revisionFromSharedCells(next, room.seed, 'fixture-validation');
          room.cells = next; room.version++; room.stats.commits++;
          room.operations.push({ ...op, actorId: member.userId, version: room.version });
          result = { ok: true, version: room.version };
        });
        room.serial = work.catch(() => {}); await work; return response(result);
      }
      case 'remount-root': {
        if(!owner||!clientId)return response({error:'Permission denied'},403);
        const openKey='node:multiplayer-root:open',closeKey='node:multiplayer-root:close',open=room.cells.get(openKey),close=room.cells.get(closeKey);
        const tag=open?.match(/^<(main|section)\b/)?.[1],nextTag=tag==='main'?'section':'main';
        if(!open||!close||!tag)return response({error:'The fixture root is not ready'},400);
        const target=new Map(room.cells).set(openKey,open.replace('<'+tag,'<'+nextTag)).set(closeKey,close.replace(tag,nextTag)),changes=await diffSharedCells(room.cells,target);
        const next=applySharedChanges(room.cells,changes);revisionFromSharedCells(next,room.seed,'fixture-remount');
        room.cells=next;room.version++;room.operations.push({id:randomUUID(),clientId:'fixture-layout-rebuild',changes,label:'Fixture rebuild of ancestor layout',actorId:member.userId,version:room.version});
        return response({ok:true});
      }
      case 'claim': {
        if (!clientId) return response({ error: 'Invalid fixture client' }, 400);
        for (const [id, claim] of room.claims) if (claim.clientId === clientId || claim.until <= Date.now()) room.claims.delete(id);
        const ids = Array.isArray(body.objectIds) ? body.objectIds.filter((id: unknown): id is string => typeof id === 'string' && id.length <= 768).slice(0, 24) : [];
        const busy = ids.filter((id: string) => room.claims.has(id));
        if (editor) for (const id of ids) if (!room.claims.has(id)) room.claims.set(id, { clientId, userId: body.peer, until: Date.now() + 10_000 });
        return response({ busy });
      }
      case 'presence': {
        const p = parsePeerPresence(body.value);
        if (!p || !clientId || p.clientId !== clientId || p.userId !== body.peer) return response({ error: 'Invalid fixture presence' }, 400);
        const previous = room.presence.get(clientId);
        if (!previous || p.sequence > previous.sequence) room.presence.set(clientId, { ...p, name: member.name });
        room.stats.presencePackets++; room.stats.presenceBytes += JSON.stringify(p).length;
        return response({ ok: true });
      }
      case 'watch': {
        const now = Date.now();
        for (const [id, p] of room.presence) if (now - p.at > 12_000 || !room.members.some(item => item.userId === p.userId)) room.presence.delete(id);
        return response({ version: room.version, peers: [...room.presence.values()] });
      }
      case 'leave': if (clientId) room.presence.delete(clientId); return response({ ok: true });
      case 'remove-member': {
        if (!owner || !isFixturePeer(body.userId) || body.userId === 'alice') return response({ error: 'Permission denied' }, 403);
        room.members = room.members.filter(item => item.userId !== body.userId);
        for (const [id, p] of room.presence) if (p.userId === body.userId) room.presence.delete(id);
        for (const [id, claim] of room.claims) if (claim.userId === body.userId) room.claims.delete(id);
        return response({ ok: true });
      }
      case 'restore-bob': {
        if (!owner) return response({ error: 'Permission denied' }, 403);
        if (!room.members.some(item => item.userId === 'bob')) room.members.push({...fixtureMembers.find(member=>member.userId==='bob')!});
        return response({ ok: true });
      }
      case 'invite': { if (!owner) return response({ error: 'Permission denied' }, 403); const id = randomUUID(); room.invites.add(id); return response({ id, token: 'fixture-' + randomUUID() }); }
      case 'revoke-invite': { if (!owner) return response({ error: 'Permission denied' }, 403); room.invites.delete(String(body.id)); return response({ ok: true }); }
      case 'diagnostics': return response({ room: body.room, version: room.version, members: room.members, operationCount: room.operations.length, operations: room.operations.map(item => ({ actor: item.actorId, version: item.version, label: item.label, keys: item.changes.map(change => change.key) })), cells: [...room.cells].filter(([key]) => ['node:note-alice:open', 'node:multiplayer-root:open', 'document:css', 'document:javascript'].includes(key)), rejections: room.rejections ?? [], ...room.stats });
      default: return response({ error: 'No model, account, or other API is available in this fixture.' }, 400);
    }
  } catch (error) { return response({ error: error instanceof Error ? error.message : 'Fixture request failed' }, 400); }
}
