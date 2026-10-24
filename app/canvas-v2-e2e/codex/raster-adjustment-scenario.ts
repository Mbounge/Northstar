import type { FixtureCodex } from './fixture';
import { findCanvasV2SourceNodeRange } from '@/lib/canvas-v2/source-patch';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Real browser pixel worker, retention, permissions and source commit; no model. */
export class RasterAdjustmentScenario {
  private step = 0; private assetId = ''; private nodeId = ''; private outputId = ''; private maskId = '';
  constructor(private peer: FixtureCodex, private reuse = false) {}
  start() { this.peer.tool('canvas_read', {}); }
  reply(result: JsonObject) {
    const parts = (result.contentItems as JsonObject[] ?? []).map(object); let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* Report actual failure below. */ }
    if (!result.success || value.committed === false) { this.peer.finish('Raster adjustment fixture failed: ' + string(parts[0]?.text)); return; }
    switch (this.step++) {
      case 0: {
        const tag = string(object(value.document).html).match(/<img\b[^>]*data-canvas-v2-node-id="([^"]+)"[^>]*>/), image = tag?.[1], evidenceId = tag?.[0].match(/data-canvas-v2-evidence-id="([^"]+)"/)?.[1];
        const evidence = value.evidence as JsonObject[] ?? [], asset = evidenceId ? evidence.find(item => item.id === evidenceId) : evidence.find(item => object(item.source).providerId === 'user-canvas');
        if (!asset || !image) { this.peer.finish('Raster adjustment fixture needs an uploaded image.'); return; }
        this.assetId = string(asset.id); this.nodeId = image;
        if (this.reuse) { this.maskId = string(evidence.find(item => string(item.label).endsWith('· reusable mask'))?.id); if (!this.maskId) { this.peer.finish('Raster adjustment fixture has no retained reusable mask.'); return; } }
        this.peer.tool('inspect_asset', { evidenceId: this.assetId, pixelRect: { x: 2, y: 2, width: 12, height: 8 }, sourceSize: { width: 16, height: 12 } }); return;
      }
      case 1:
        this.peer.tool('adjust_image_region', { assetId: this.assetId, cropInspectionId: value.cropInspectionId, sourceSize: value.sourceSize, cropPixels: value.cropPixels, label: this.reuse ? 'Blue panel' : 'Ivory panel', color: this.reuse ? '#496497' : '#c5c1b8', featherPixels: this.reuse ? 0 : 1,
          ...(this.reuse ? { maskAssetId: this.maskId } : { polygons: [[{ x: 3, y: 3 }, { x: 13, y: 3 }, { x: 13, y: 9 }, { x: 3, y: 9 }]], protectedPolygons: [[{ x: 4, y: 5 }, { x: 11, y: 5 }, { x: 11, y: 6 }, { x: 4, y: 6 }]] }) }); return;
      case 2: {
        const receipt = object(value.rasterAdjustment);
        if (receipt.changedOutsideMask !== 0 || receipt.alphaChangedPixels !== 0 || receipt.encodedPngVerified !== true || receipt.semanticBoundaryVerified !== false || !parts.some(part => part.type === 'inputImage')) { this.peer.finish('Raster adjustment fixture lacks encoded-pixel checks or an actual visual review.'); return; }
        this.outputId = string(receipt.outputAssetId); this.peer.tool('canvas_read', {}); return;
      }
      case 3: {
        const html = string(object(value.document).html), range = findCanvasV2SourceNodeRange(html, this.nodeId);
        if (!range) { this.peer.finish('Raster adjustment fixture lost the original node.'); return; }
        let fragment = html.slice(range.start, range.end).replace(/data-canvas-v2-evidence-id="[^"]*"/, `data-canvas-v2-evidence-id="${this.outputId}"`).replace(/src="[^"]*"/, `src="northstar-asset:${this.outputId}"`);
        if (!fragment.includes('data-canvas-v2-evidence-id=')) fragment = fragment.replace('<img', `<img data-canvas-v2-evidence-id="${this.outputId}"`);
        this.peer.tool('canvas_edit', { summary: 'Adjusted the selected image colour and retained its protected seam', selectionPolicy: 'modify', patch: JSON.stringify({ operations: [{ op: 'replace-node', targetNodeId: this.nodeId, html: fragment }] }) }); return;
      }
      case 4: this.peer.tool('canvas_review', { nodeId: this.nodeId }); return;
      default: this.peer.finish(this.reuse ? 'The retained mask was reused for the next colour without changing protected pixels.' : 'The retained image was adjusted in place with its protected seam and alpha preserved.');
    }
  }
}
