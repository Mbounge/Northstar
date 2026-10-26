import { encodeCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from '@/lib/canvas-v2/types';
import { normalizeCanvasV2NativeGeometryDocument } from '@/lib/canvas-v2/native-geometry-document';

export const fixtureMembers = [
  { userId: 'alice', name: 'Alice', role: 'owner' as const, joinedAt:'2026-10-20T00:00:00Z' },
  { userId: 'bob', name: 'Bob', role: 'editor' as const, joinedAt:'2026-10-20T00:00:01Z' },
  { userId: 'quinn', name: 'Quinn', role: 'viewer' as const, joinedAt:'2026-10-20T00:00:02Z' },
  { userId:'dana', name:'Dana', role:'editor' as const, joinedAt:'2026-10-20T00:00:03Z' },
  { userId:'eli', name:'Eli', role:'editor' as const, joinedAt:'2026-10-20T00:00:04Z' },
  { userId:'frankie', name:'Frankie', role:'editor' as const, joinedAt:'2026-10-20T00:00:05Z' },
  { userId:'gabi', name:'Gabi', role:'editor' as const, joinedAt:'2026-10-20T00:00:06Z' },
  { userId:'harper', name:'Harper', role:'editor' as const, joinedAt:'2026-10-20T00:00:07Z' },
  { userId:'ira', name:'Ira', role:'editor' as const, joinedAt:'2026-10-20T00:00:08Z' },
  { userId:'jules', name:'Jules', role:'editor' as const, joinedAt:'2026-10-20T00:00:09Z' },
] as const;
export type FixturePeer = typeof fixtureMembers[number]['userId'];
export const isFixturePeer = (value: unknown): value is FixturePeer => fixtureMembers.some(member => member.userId === value);

function screen(title: string) {
  return encodeCanvasV2Screen({ version: 1, device: 'none', title, width: 600, height: 420, referenceAssetIds: [],
    html: '<main><p>FIELDNOTES</p><h1 id="heading">A shared human idea.</h1><p id="description">Keep the useful details together.</p><label>Your draft<input id="draft" value="A private runtime draft"></label><button id="save">Save draft</button><p id="status">Saved 0</p></main>',
    css: 'body{margin:0;background:#f8f1e5;color:#302638;font:17px Arial,sans-serif}main{padding:30px}h1{font:38px Georgia,serif;line-height:1.1}label{display:block;font-size:14px}input,button{font:inherit;padding:10px;margin-top:10px}input{display:block;width:90%;border:1px solid #b9abbd}button{background:#6e4d83;color:white;border:0;border-radius:6px}#status{font-size:14px}',
    javascript: 'let saves=0;document.querySelector("#save").addEventListener("click",()=>{document.querySelector("#status").textContent="Saved "+(++saves)+" · "+document.querySelector("#draft").value;});',
  });
}

/** One authored seed used by every fixture peer; no model/account/storage API. */
export function multiplayerSeed(dense=false): CanvasV2ArtifactRevision {
  const first = screen('Shared journal A'), second = screen('Shared journal B');
  const extra=dense?Array.from({length:50},(_,i)=>`<div data-canvas-v2-node-id="dense-${i}" data-canvas-v2-screen="${screen('Proof object '+i)}" style="position:absolute;left:${i%8*680}px;top:${900+Math.floor(i/8)*500}px;width:600px;height:420px"></div>`).join(''):'';
  return { schema: CANVAS_V2_ARTIFACT_SCHEMA, id: 'human-multiplayer-seed', state: 'committed', createdAt: '2026-10-20T00:00:00Z', evidence: [],
    document: normalizeCanvasV2NativeGeometryDocument({ html: `<main data-canvas-v2-node-id="multiplayer-root" style="position:relative;width:${dense?6000:1400}px;height:${dense?5000:720}px">
      <p data-canvas-v2-node-id="note-alice" data-canvas-v2-writable="true" data-canvas-v2-origin="user" style="position:absolute;left:0px;top:0px;width:550px;height:120px;margin:0;padding:22px;background:#eee5ff;color:#352044;font:28px Arial,sans-serif;border:2px solid #a994ff;border-radius:14px">Alice's planning note</p>
      <p data-canvas-v2-node-id="note-bob" data-canvas-v2-writable="true" data-canvas-v2-origin="user" style="position:absolute;left:660px;top:0px;width:550px;height:120px;margin:0;padding:22px;background:#def5ff;color:#203844;font:28px Arial,sans-serif;border:2px solid #55c8e9;border-radius:14px">Bob's planning note</p>
      <div data-canvas-v2-node-id="journal-a" data-canvas-v2-screen="${first}" style="position:absolute;left:0px;top:190px;width:600px;height:420px"></div>
      <div data-canvas-v2-node-id="journal-b" data-canvas-v2-screen="${second}" style="position:absolute;left:660px;top:190px;width:600px;height:420px"></div>
    ${extra}</main>`, css: '', javascript: '' }) };
}
