import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';
import { findCanvasV2SourceNodeRange } from '@/lib/canvas-v2/source-patch';

/** Deterministic tool contract exercise; never claims to measure model reasoning. */
export class AppsScenario {
  private step = 0; private flowId = ''; private whopFlowId = ''; private browsingId = ''; private canvas: JsonObject = {}; private appId = '';
  constructor(private peer: { tool(name: string, args: unknown): void; finish(text: string): void }, private followup = false, private pixelSmoke = false) {}
  start() { this.peer.tool(this.followup ? 'canvas_read' : 'account_read', this.followup ? {} : { operation: 'list-apps' }); }
  reply(raw: JsonObject) {
    const parts = Array.isArray(raw.contentItems) ? raw.contentItems.map(object) : [];
    let value: JsonObject = {}; try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* Surface original failure below. */ }
    if (!raw.success || value.committed === false) { this.peer.finish('Apps fixture failed: ' + JSON.stringify(parts)); return; }
    if (this.pixelSmoke) {
      switch (this.step++) {
        case 0: {
          const app = (value.apps as JsonObject[]).find(a => a.name === 'Awin');
          if (!app) { this.peer.finish('Pixel check failed: Awin is unavailable.'); return; }
          this.appId = string(app.id);
          this.peer.tool('account_read', { operation: 'list-flows', appId: this.appId, sessionType: 'onboarding', limit: 1 }); break;
        }
        case 1: this.peer.tool('account_read', { operation: 'flow-screens', appId: this.appId, flowId: string((value.flows as JsonObject[])[0]?.id) }); break;
        case 2: this.peer.tool('inspect_asset', { evidenceId: string((value.evidence as JsonObject[]).find(a => a.kind === 'screenshot')?.id) }); break;
        default: {
          const image = parts.find(p => p.type === 'inputImage');
          this.peer.finish(/^data:image\/(png|jpeg|webp);base64,/.test(string(image?.imageUrl)) ? 'Verified: the authorized account screenshot was fetched as actual image pixels. No live model was called.' : 'Pixel check failed: expected image bytes.');
        }
      }
      return;
    }
    if (this.followup) {
      if (this.step++ === 0) {
        const html = string(object(value.document).html); const range = findCanvasV2SourceNodeRange(html, 'apps-evidence-title');
        if (!range) { this.peer.finish('Apps fixture failed: prior composition was not retained.'); return; }
        this.peer.tool('canvas_edit', { summary: 'Changed only the account comparison heading', patch: JSON.stringify({ operations: [{ op: 'replace-node', targetNodeId: 'apps-evidence-title', html: '<h2 data-canvas-v2-node-id="apps-evidence-title" style="font-size:48px;margin:0">Product experience and company signals</h2>' }] }) });
      } else if (this.step === 2) this.peer.tool('canvas_review', {});
      else this.peer.finish('Updated the heading; retained the onboarding rail, browsing evidence, marketing and business sources.');
      return;
    }
    switch (this.step++) {
      case 0: this.peer.tool('account_read', { operation: 'list-flows', appId: 'app:awin', sessionType: 'onboarding', platform: 'mobile' }); break;
      case 1: this.flowId = string(object((value.flows as unknown[])[0]).id); this.peer.tool('account_read', { operation: 'flow-screens', appId: 'app:awin', flowId: this.flowId }); break;
      case 2: this.peer.tool('inspect_asset', { evidenceId: string((value.evidence as JsonObject[]).find(a => a.kind === 'screenshot')?.id) }); break;
      case 3:
        if (!parts.some(p => p.type === 'inputImage')) { this.peer.finish('Apps fixture failed: screenshot pixels missing.'); return; }
        this.peer.tool('account_read', { operation: 'list-flows', appId: 'app:awin', sessionType: 'browsing', platform: 'web' }); break;
      case 4: this.browsingId = string(object((value.flows as unknown[])[0]).id); this.peer.tool('account_read', { operation: 'flow-screens', appId: 'app:awin', flowId: this.browsingId }); break;
      case 5: this.peer.tool('account_read', { operation: 'marketing', appId: 'app:awin' }); break;
      case 6: this.peer.tool('account_read', { operation: 'business', appId: 'app:awin' }); break;
      case 7: this.peer.tool('canvas_read', {}); break;
      case 8: this.peer.tool('canvas_insert_flow', { flowId: this.flowId, summary: 'Placed the full onboarding journey with its shared entry and branch' }); break;
      case 9: this.peer.tool('canvas_review', {}); break;
      case 10: this.peer.tool('account_read', { operation: 'list-flows', appId: 'app:whop', sessionType: 'onboarding' }); break;
      case 11: this.whopFlowId = string((value.flows as JsonObject[])[0]?.id); this.peer.tool('account_read', { operation: 'flow-screens', appId: 'app:whop', flowId: this.whopFlowId }); break;
      case 12: this.peer.tool('canvas_read', {}); break;
      case 13: this.peer.tool('canvas_insert_flow', { flowId: this.whopFlowId, summary: 'Placed Whop alongside Awin without changing the first source rail' }); break;
      case 14: this.peer.tool('canvas_review', {}); break;
      case 15: this.peer.tool('canvas_read', {}); break;
      case 16:
        this.canvas = value;
        this.peer.tool('canvas_plan', { action: 'create', storyRole: 'comparison', relation: 'none', footprint: '1600 units wide', evidenceIds: [...new Set((value.evidence as JsonObject[]).filter(a => string(a.label).includes('Campaign message') || ['marketing-feed', 'business-manifest'].includes(string(object(a.source).sourceType))).map(a => a.id))], readingOrder: ['Browsing', 'Marketing', 'Business'], direction: { designIntent: 'Compare three authorized account sources', visualThesis: 'Product, marketing and business are distinct signals', compositionStrategy: 'Three readable source images with concise source-linked labels', visualLanguage: 'Transparent, spacious canvas with clear headings', evidenceStrategy: 'Original captured screenshots and retained account packets' } }); break;
      case 17: {
        const island = string(object(object(object(value.plan).execution).target).islandId);
        const root = /data-canvas-v2-node-id="([^"]+)"/.exec(string(object(this.canvas.document).html))?.[1];
        const evidence = this.canvas.evidence as JsonObject[];
        const browsing = evidence.find(a => string(a.label).includes('Campaign message'));
        const marketing = evidence.find(a => object(a.source).sourceType === 'marketing-feed');
        const business = evidence.find(a => object(a.source).sourceType === 'business-manifest');
        if (!browsing || !marketing || !business) { this.peer.finish('Apps fixture failed: one evidence domain is missing.'); return; }
        const panels = [browsing, marketing, business].map((a, i) => `<section data-canvas-v2-node-id="apps-panel-${i}" style="display:flex;flex-direction:column;gap:18px"><h3 data-canvas-v2-node-id="apps-label-${i}" style="font-size:30px;margin:0">${['Browsing experience', 'Marketing capture', 'Business capture'][i]}</h3><img data-canvas-v2-node-id="apps-image-${i}" data-canvas-v2-evidence-id="${a.id}" data-canvas-v2-evidence-role="analysis-copy" src="${a.url}" alt="${['Browsing', 'Marketing', 'Business'][i]} account evidence" style="height:420px;width:430px;object-fit:contain"><p data-canvas-v2-node-id="apps-source-${i}" style="font-size:22px;margin:0">Authorized account capture · ${object(a.source).capturedAt ?? 'date unknown'}</p></section>`).join('');
        this.peer.tool('canvas_edit', { summary: 'Composed browsing, marketing and business evidence alongside the complete onboarding journey', patch: JSON.stringify({ operations: [{ op: 'append-html', targetNodeId: root, html: `<section data-canvas-v2-node-id="${island}" data-canvas-v2-island-id="${island}" data-canvas-v2-design-region data-canvas-v2-story-role="comparison" data-canvas-v2-territory-relation="none" style="width:1600px;padding:32px;display:flex;flex-direction:column;gap:32px;color:var(--northstar-ink)"><h2 data-canvas-v2-node-id="apps-evidence-title" style="font-size:48px;margin:0">Awin across three sources</h2><div data-canvas-v2-node-id="apps-evidence-columns" style="display:grid;grid-template-columns:repeat(3,1fr);gap:32px">${panels}</div><p data-canvas-v2-node-id="apps-qualification" style="font-size:24px;margin:0">Captured messages and hiring records provide context; they do not establish conversion or company intent.</p></section>` }] }) }); break;
      }
      case 18: this.peer.tool('canvas_review', {}); break;
      default: this.peer.finish('Placed the complete 47-screen Awin journey, the Whop onboarding journey, and a separate composition using browsing, marketing and business captures. Source packets remain available for follow-up edits.');
    }
  }
}
