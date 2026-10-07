import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Deterministic peer exercises the real tools, not a model's visual judgement. */
export class CreativeScreenScenario {
  private step = 0;
  private nodeId = '';
  constructor(private peer: FixtureCodex, private feedback: boolean) {}
  start() { this.peer.tool('canvas_read', {}); }
  reply(result: JsonObject) {
    const parts = Array.isArray(result.contentItems) ? result.contentItems.map(object) : [];
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* fail below */ }
    if (!result.success || value.committed === false) { this.peer.finish('Creative screen failed: ' + (string(parts[0]?.text) || JSON.stringify(value))); return; }
    if (this.feedback) {
      if (this.step++ === 0) {
        this.nodeId = string(object(value.screenFeedback).nodeId);
        if (!this.nodeId || !Array.isArray(value.productIdentities) || !value.productIdentities.length) { this.peer.finish('Creative screen failed: precise target or saved identity missing'); return; }
        this.peer.tool('canvas_screen_element', { nodeId: this.nodeId, text: 'Your next chapter.', styles: { 'font-size': '32px' }, summary: 'Refined the selected headline', selectionPolicy: 'modify' });
      } else if (this.step === 2) this.peer.tool('canvas_review', { nodeId: this.nodeId });
      else this.peer.finish('Refined only the selected headline; the saved product identity and interaction state were retained.');
      return;
    }
    switch (this.step++) {
      case 0: this.peer.tool('canvas_product_identity', { identity: { id: 'graet-test', name: 'GRAET', platform: 'mobile', visualLanguage: 'Blue accents, quiet neutral surfaces, generous spacing.', typography: 'System sans, bold headlines.', components: 'Rounded cards and fixed mobile navigation.', motion: 'Gentle 320ms transitions; reduced-motion alternative.', tokens: { '--product-accent': '#073dfa', '--product-ink': '#0b1430', '--motion-duration': '320ms' }, referenceAssetIds: [] } }); break;
      case 1: this.peer.tool('canvas_screen', { productIdentityId: 'graet-test', title: 'GRAET · creative review', summary: 'Created a screen for precise feedback and motion review', html: '<main><header>GRAET</header><h1 id="headline">Your next season.</h1><p>Real teams. A new place to play.</p><div class="motion-stage"><div class="orb" aria-label="Moving highlight"></div></div><section><h2>Minnesota Blue Ox</h2><button id="save">Save team</button><label>Your goal<input id="goal" value="Score 10 goals"></label><p id="status">Ready to play</p></section><footer>Teams · Applied · Saved · Me</footer></main>', css: 'body{background:#f3f5fa;color:var(--product-ink)}main{padding:28px}header{font-size:24px;font-weight:900;font-style:italic}h1{font-size:36px;letter-spacing:-1.2px;margin-top:36px}p{color:#667088}.motion-stage{position:relative;height:120px;border-radius:22px;background:#e5ebff;overflow:hidden}.orb{width:48px;height:48px;background:var(--product-accent);border-radius:50%;position:absolute;left:20px;top:36px;animation:drift 3s infinite alternate ease-in-out}@keyframes drift{from{transform:translateX(0);opacity:.5}to{transform:translateX(220px);opacity:1}}@media(prefers-reduced-motion:reduce){.orb{animation:none}}section{padding:24px;background:white;border-radius:22px;margin-top:26px}button{background:var(--product-accent);color:white;border:0;border-radius:20px;padding:14px 22px;font-weight:700}label{display:block;margin-top:24px}input{display:block;width:100%;margin-top:10px;border:1px solid #d5dbea;border-radius:10px;padding:12px;font:inherit}footer{position:fixed;bottom:0;left:0;right:0;background:white;padding:24px;text-align:center}', javascript: "document.querySelector('#save').addEventListener('click',e=>{e.target.textContent=e.target.textContent==='Saved'?'Save team':'Saved'});document.querySelector('#goal').addEventListener('input',e=>document.querySelector('#status').textContent=e.target.value)", referenceAssetIds: [] }); break;
      case 2: this.nodeId = string(value.nodeId); this.peer.tool('canvas_screen_motion_review', { nodeId: this.nodeId }); break;
      case 3:
        if (parts.filter(part => part.type === 'inputImage').length !== 3 || new Set(parts.filter(part => part.type === 'inputImage').map(part => part.imageUrl)).size !== 3) { this.peer.finish('Creative screen failed: distinct motion frames missing'); return; }
        this.peer.tool('canvas_review', { nodeId: this.nodeId }); break;
      default: this.peer.finish('Created the screen with a saved product identity and reviewed three distinct motion frames.');
    }
  }
}
