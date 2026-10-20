import type { FixtureCodex } from '../codex/fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';
import { canvasV2ScreenAssetToken } from '@/lib/canvas-v2/interactive-screen';
import { createDesignerStudioFixture } from './fixture';

/** Drives the ordinary read, construction-plan and committed-screen pipeline. */
export class DesignerStudioScenario {
  private step = 0;
  private source?: JsonObject;
  constructor(private peer: FixtureCodex) {}

  start() { this.peer.tool('canvas_read', {}); }

  reply(result: JsonObject) {
    const parts = (result.contentItems as JsonObject[] ?? []).map(object);
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* Normal failure receipt below. */ }
    if (!result.success || value.committed === false) {
      this.peer.finish('Designer studio fixture failed: ' + string(parts[0]?.text));
      return;
    }
    if (this.step++ === 0) {
      const photo = (value.evidence as JsonObject[] ?? []).find(item => object(item.source).providerId === 'user-canvas' && (!item.mediaType || item.mediaType === 'image'));
      if (!photo) { this.peer.finish('The designer studio fixture needs one uploaded photograph.'); return; }
      const screen = createDesignerStudioFixture(canvasV2ScreenAssetToken(string(photo.id)));
      screen.referenceAssetIds = [string(photo.id)];
      this.source = { ...screen, summary: 'Created the native designer studio specimen' };
      this.peer.tool('canvas_plan_screen', {
        intent: 'create', summary: 'Create a deterministic native designer specimen for interaction and delivery checks',
        viewport: { width: screen.width, height: screen.height }, preserve: [],
        components: [
          { id: 'studio-root', name: 'Designer specimen', kind: 'container', basis: 'inferred', selector: '#studio-root', shape: 'Responsive layout owner', style: 'Retained native typography and spacing', content: 'Three cards, native art and editable text', behavior: 'Native draft field with a live closure counter', assetPolicy: 'none' },
          { id: 'studio-photo', name: 'Retained photograph', kind: 'content-asset', basis: 'inferred', selector: '#studio-photo', shape: 'Independent image slot', style: 'Cover crop', content: 'Uploaded photograph', behavior: 'Non-destructive image treatments', assetPolicy: 'original' },
          { id: 'studio-vector-photo', name: 'Retained SVG image', kind: 'content-asset', basis: 'inferred', selector: '#vector-photo', shape: 'Clipped SVG image slot', style: 'Original rounded clipping path', content: 'Same retained photograph', behavior: 'Preserved native SVG image reference', assetPolicy: 'original' },
        ],
      });
      return;
    }
    if (this.step === 2) {
      if (!value.planId || !this.source) { this.peer.finish('The designer studio fixture did not receive its construction plan.'); return; }
      this.peer.tool('canvas_screen', { ...this.source, planId: value.planId });
      return;
    }
    this.peer.finish('The designer studio fixture is ready.');
  }
}
