import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** A deterministic tool peer. The browser supplies the concurrent human edit. */
export class ConcurrentScreenScenario {
  private step = 0;
  private nodeId = '';
  constructor(private peer: FixtureCodex) {}
  start() { this.peer.tool('canvas_read', {}); }
  reply(result: JsonObject) {
    const parts = (Array.isArray(result.contentItems) ? result.contentItems : []).map(object);
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* Report the actual tool failure below. */ }
    if (!result.success || value.committed === false) {
      this.peer.finish('Concurrent action failed: ' + string(parts[0]?.text));
      return;
    }
    switch (this.step++) {
      case 0:
        this.peer.tool('canvas_screen', {
          title: 'Shared studio draft', width: 540, height: 480,
          html: '<main><p>STUDIO / 01</p><h1>Make something together.</h1><label>Your draft<input id="draft" value="Human draft"></label><button id="save">Save draft</button><output id="count">Saved 0</output></main>',
          css: 'body{background:#eee8db;color:#232032}main{padding:36px}h1{font:42px/1.06 Georgia,serif}label,input,output{display:block}input{margin:12px 0 24px;padding:12px;font:inherit}button{background:#58417b;color:white;border:0;border-radius:6px;padding:14px 24px;font:inherit}output{margin-top:16px}',
          javascript: "const data=northstarProduct.data;data.saves??=0;const count=document.querySelector('#count');const sync=()=>count.textContent='Saved '+data.saves;document.querySelector('#save').addEventListener('click',()=>{data.saves++;sync()});sync();",
          referenceAssetIds: [], summary: 'Create a shared draft for a concurrent action check',
        });
        break;
      case 1:
        this.nodeId = string(value.nodeId);
        this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, live: true, action: 'click', selector: '#save' });
        break;
      case 2:
        if (!string(value.text).includes('Saved 1')) {
          this.peer.finish('Concurrent action failed: save result missing');
          return;
        }
        // A later mutation must still read the new canvas, even though this
        // already-completed preview action remains valid.
        this.peer.tool('canvas_read', {});
        break;
      default:
        this.peer.finish('Saved once while unrelated human work changed. The draft and new canvas object remain intact.');
    }
  }
}
