import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Exercise asset retention through the real host and isolated screen runtime. */
export class CreativeAssetScenario {
  private stage = 'asset';
  private assetId = '';
  private nodeId = '';
  constructor(private peer: FixtureCodex, private gif: boolean, private video=false) {}
  start() {
    if (this.gif) { this.stage = 'read'; this.peer.tool('inspect_image', { url: this.peer.origin + '/canvas-v2-e2e/codex/media/motion.gif' }); }
    else this.peer.tool('canvas_read', {});
  }
  reply(result: JsonObject) {
    const parts = Array.isArray(result.contentItems) ? result.contentItems.map(object) : [];
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* Report below. */ }
    if (!result.success || value.committed === false) { this.peer.finish('Asset check failed: ' + string(parts[0]?.text)); return; }
    if (this.stage === 'read') { this.stage = 'asset'; this.peer.tool('canvas_read', {}); return; }
    if (this.stage === 'asset') {
      const asset = (value.evidence as JsonObject[] ?? []).find(asset => this.video ? asset.mediaType==='video' : this.gif ? asset.mediaType === 'gif' : object(asset.source).providerId === 'user-canvas');
      if (!asset) { this.peer.finish('Asset check failed: reusable canvas material missing'); return; }
      this.assetId = string(asset.id);
      this.stage = this.gif ? 'create' : 'inspect';
      if (!this.gif) { this.peer.tool('inspect_asset', { evidenceId: this.assetId }); return; }
    }
    if (this.stage === 'inspect') { if(this.video&&(parts.filter(part=>part.type==='inputImage').length!==5||new Set(parts.filter(part=>part.type==='inputImage').map(part=>part.imageUrl)).size<2)){this.peer.finish('Asset check failed: timestamped reference frames missing');return;} this.stage = 'create'; this.peer.tool('canvas_read', {}); return; }
    if (this.stage === 'create') {
      this.stage = 'runtime';
      this.peer.tool('canvas_screen', { title: this.video?'Retained video playback':this.gif ? 'Retained GIF playback' : 'Retained canvas image', width: 390, height: 844, html: `<main><h1>Retained material</h1>${this.video?`<video id="material" src="northstar-asset:${this.assetId}" aria-label="Chosen canvas clip" muted playsinline loop></video><button id="play">Play clip</button>`:`<img id="material" src="northstar-asset:${this.assetId}" alt="Chosen canvas material">`}<button id="save">Save direction</button></main>`, css: 'main{padding:28px}img,video{width:100%;height:220px;object-fit:contain}button{border:0;border-radius:24px;background:#7255e8;color:white;padding:16px;margin-top:28px}', javascript: (this.video?"document.querySelector('#play').addEventListener('click',()=>document.querySelector('video').play()) ;":"")+"document.querySelector('#save').addEventListener('click',e=>e.target.textContent='Direction saved')", referenceAssetIds: [this.assetId], summary: 'Retain and bind the chosen material' }); return;
    }
    if (this.stage === 'runtime') { this.nodeId = string(value.nodeId); this.stage = 'finish'; this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'inspect' }); return; }
    if (this.stage === 'finish') {
      if (!this.video && !(value.images as JsonObject[] ?? []).some(image => image.loaded && Number(image.width) > 0) || (value.errors as unknown[] ?? []).length) { this.peer.finish('Asset check failed: retained pixels did not reach the screen'); return; }
      this.stage = 'review'; this.peer.tool('canvas_review', { nodeId: this.nodeId }); return;
    }
    if(this.stage==='play'){if((value.videos as JsonObject[]??[]).some(video=>video.loaded&&video.paused===false))this.peer.finish('The uploaded video is retained, inspected, rendered and playing inside the interactive screen.');else this.peer.finish('Asset check failed: video did not play');return;}
    if(this.video){if(!parts.some(part=>part.type==='inputImage')||!(object(value.state).videos as JsonObject[]??[]).some(video=>video.loaded)){this.peer.finish('Asset check failed: video frame missing');return;}this.stage='play';this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'click',selector:'#play'});return;}
    if (parts.some(part => part.type === 'inputImage')) this.peer.finish(this.gif ? 'The retained GIF is loaded inside the interactive screen.' : 'The native canvas image is retained, inspected and loaded inside the interactive screen.');
    else this.peer.finish('Asset check failed: live review pixels missing');
  }
}
