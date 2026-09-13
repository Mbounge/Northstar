import {
  validateCanvasV2RenderedEvidenceIntegrity,
  validateCanvasV2RenderedTextCollisions,
  validateCanvasV2RenderedDesignRegionContentIntegrity,
  validateCanvasV2RenderedRelationshipGeometry,
} from './evidence-authorship';
import type { CanvasV2ArtifactDocument, CanvasV2CreativeDirection, CanvasV2EvidenceAsset, CanvasV2IslandExecutionContract, CanvasV2RenderObservation } from './types';
import { buildCanvasV2IslandRegistry, canvasV2AllocatedIslandId, validateCanvasV2IslandExecution } from './island-registry';
import { buildCanvasV2SceneObjectInventory, normalizeCanvasV2SceneObjectIdentities } from './scene-transaction';
import { findCanvasV2SourceNodeRange } from './source-patch';
import { object, string } from './managed-agent/protocol';
import type { CanvasV2WorkingContext } from './working-context';

export interface CodexCompositionPlan {
  baseRevisionId: string;
  surface?: 'canvas' | 'standalone';
  direction: CanvasV2CreativeDirection;
  readingOrder: string[];
  execution: CanvasV2IslandExecutionContract;
}
/** The adapter owns the revision token; an actual intervening edit still requires a fresh read. */
export function requireCodexCanvasReadRevision(readRevisionId: string | undefined, currentRevisionId: string): string {
  if (!readRevisionId) throw new Error('Read the canvas before planning or editing.');
  if (readRevisionId !== currentRevisionId) throw new Error('The canvas changed since you read it. Read it again before planning or editing.');
  return currentRevisionId;
}

export interface CodexSourceMediaCandidate { url: string; type: 'image' | 'gif' | 'video'; label: string; sourceUrl: string }
/** Keep the source visuals discovered during chat available when the user later asks to compose. */
export function rememberCodexSourceMedia(previous: readonly CodexSourceMediaCandidate[], source: unknown): CodexSourceMediaCandidate[] {
  const page = object(source);
  const candidates = new Map(previous.map(item => [item.url, item]));
  if (Array.isArray(page.media)) for (const raw of page.media) {
    const item = object(raw);
    if (!/^https?:\/\//.test(string(item.url)) || !['image', 'gif', 'video'].includes(string(item.type))) continue;
    candidates.delete(string(item.url));
    candidates.set(string(item.url), { url: string(item.url), type: item.type as CodexSourceMediaCandidate['type'], label: string(item.label), sourceUrl: string(page.url) });
  }
  return [...candidates.values()];
}

const required = (value: unknown, label: string) => {
  const text = string(value).trim();
  if (!text || text.length > 4000) throw new Error(`Provide a concise ${label}.`);
  return text;
};
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) throw new Error(`Invalid ${label}: choose ${choices.join(', ')}.`);
  return value as T;
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Provide ${label} as an array.`);
  return value.map(v => required(v, label));
}
/** The same island execution contract as the original authoring path, owned by Codex's tool loop. */
export function planCodexComposition(raw: unknown, revisionId: string, observation: CanvasV2RenderObservation, evidence: readonly CanvasV2EvidenceAsset[], sequence: number): CodexCompositionPlan {
  const args = object(raw);
  if (args.baseRevisionId !== revisionId) throw new Error('The canvas changed. Read it before planning.');
  const action = choice(args.action, ['create', 'develop', 'enrich', 'repair', 'recompose'] as const, 'island action');
  const registry = buildCanvasV2IslandRegistry({ observation });
  const islandId = action === 'create' ? canvasV2AllocatedIslandId(revisionId, sequence)
    : action === 'recompose' ? '__whole-board__' : required(args.islandId, 'existing island ID');
  if (!['create', 'recompose'].includes(action) && !registry.some(i => i.islandId === islandId)) throw new Error('Read the canvas and target an existing island.');
  const storyRole = action === 'recompose' ? 'whole-board' : choice(args.storyRole, ['title', 'orientation', 'evidence-reading', 'comparison', 'analysis', 'relationship', 'implication', 'synthesis'] as const, 'story role');
  const evidenceIds = strings(args.evidenceIds, 'selected evidence IDs');
  if (evidenceIds.some(id => !evidence.some(asset => asset.id === id))) throw new Error('Inspect or upload the selected media before planning its placement.');
  const direction = object(args.direction);
  const intent = required(direction.designIntent, 'design intent');
  return {
    baseRevisionId: revisionId,
    surface: args.surface === 'standalone' ? 'standalone' : 'canvas',
    direction: {
      designIntent: intent, visualThesis: required(direction.visualThesis, 'visual thesis'),
      compositionStrategy: required(direction.compositionStrategy, 'composition strategy'),
      visualLanguage: required(direction.visualLanguage, 'visual language'),
      evidenceStrategy: required(direction.evidenceStrategy, 'evidence strategy'), currentFocus: intent,
      unresolvedOpportunities: [], nextMoves: strings(args.readingOrder, 'reading order'),
    },
    readingOrder: strings(args.readingOrder, 'reading order'),
    execution: {
      target: { action, islandId, storyRole, resultingMaturity: 'developing', resolutionRationale: '', openRequirements: [] },
      territory: {
        relation: choice(args.relation, ['within', 'above', 'below', 'left', 'right', 'span', 'interleave', 'offset', 'recompose', 'none'] as const, 'territory relation'),
        anchorNodeId: string(args.anchorNodeId), intendedFootprint: required(args.footprint, 'intended footprint'), rationale: intent,
        placementMode: action === 'recompose' ? 'recompose' : 'attached', targetZoneId: 'middle-center',
      }, requiredEvidenceIds: evidenceIds, requiredEvidenceHandles: [], requiredVisualRoles: [],
    },
  };
}
export function validateCodexComposition(plan: CodexCompositionPlan, previous: CanvasV2ArtifactDocument, next: CanvasV2ArtifactDocument, observation: CanvasV2RenderObservation) {
  if (plan.baseRevisionId !== observation.revisionId) throw new Error('The composition plan is stale. Read and plan against the latest canvas.');
  const failures = validateCanvasV2IslandExecution({ enforceHeadingStructure: false, previous, next, target: plan.execution.target,
    existingIslandIds: new Set(buildCanvasV2IslandRegistry({ observation }).map(i => i.islandId)),
    requiredEvidenceIds: plan.execution.requiredEvidenceIds, territoryRelation: plan.execution.territory.relation,
    placementMode: plan.execution.territory.placementMode });
  if (failures.length) throw new Error(failures.join(' '));
}

/** Heading levels are semantic compiler normalization, not another model round trip. */
export function normalizeCodexCompositionHeading(plan: CodexCompositionPlan, document: CanvasV2ArtifactDocument): CanvasV2ArtifactDocument {
  if (plan.execution.target.storyRole === 'title' || plan.execution.target.action !== 'create') return document;
  const range = findCanvasV2SourceNodeRange(document.html, plan.execution.target.islandId);
  if (!range) return document;
  const section = document.html.slice(range.start, range.end);
  const normalized = section.replace(/<(\/?)h1(?=[\s>])/gi, '<$1h2');
  return normalized === section ? document : { ...document, html: document.html.slice(0,range.start) + normalized + document.html.slice(range.end) };
}
export function rejectedCodexEdit(baseRevisionId: string, error: unknown) {
  return { committed: false, baseRevisionId, error: error instanceof Error ? error.message : String(error), next: 'The draft was not committed. The public canvas is unchanged by this attempt. Read the canvas if it changed; otherwise repair using the same plan. canvas_review can show a rejected preview, which is not a committed revision.' };
}

/** New canvas compositions inherit the canvas backdrop, including one-child layout wrappers. */
export function normalizeCodexCompositionSurface(plan: CodexCompositionPlan, document: CanvasV2ArtifactDocument): CanvasV2ArtifactDocument {
  if (plan.execution.target.action !== 'create') return document;
  const targetId = plan.execution.target.islandId;
  const anchor = plan.execution.territory.anchorNodeId;
  const inventory = buildCanvasV2SceneObjectInventory(document);
  const anchorIsland = inventory.find(item => item.nodeId === anchor)?.islandId ?? anchor;
  const anchorRange = anchorIsland ? findCanvasV2SourceNodeRange(document.html, anchorIsland) : undefined;
  const inherited = anchorRange ? /data-canvas-v2-narrative-id=["']([^"']+)/.exec(document.html.slice(anchorRange.start, anchorRange.openEnd))?.[1] : undefined;
  const narrativeId = plan.execution.territory.relation === 'none' ? targetId : inherited ?? 'legacy';
  const range = findCanvasV2SourceNodeRange(document.html, targetId);
  if (range) {
    const opening = document.html.slice(range.start, range.openEnd).replace(/\sdata-canvas-v2-(?:narrative-id|layout-owner)=["'][^"']*["']/g, '').replace(/>$/, ` data-canvas-v2-layout-owner="model" data-canvas-v2-narrative-id="${narrativeId.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`);
    document = {...document,html:document.html.slice(0,range.start)+opening+document.html.slice(range.openEnd)};
  }
  if (plan.surface === 'standalone') return document;
  document = normalizeCanvasV2SceneObjectIdentities(document);
  const objects = buildCanvasV2SceneObjectInventory(document);
  let current = objects.find(item => item.nodeId === plan.execution.target.islandId);
  const ids: string[] = [];
  while (current && ['main', 'section', 'article', 'div'].includes(current.tagName) && !current.userEdited && !current.locked) {
    ids.push(current.nodeId);
    const children = objects.filter(item => item.parentNodeId === current!.nodeId);
    current = children.length === 1 ? children[0] : undefined;
  }
  if (!ids.length) return document;
  const selectors = ids.map(id => `[data-canvas-v2-node-id="${id.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`).join(', ');
  const rule = `${selectors} { background: transparent !important; border-color: transparent !important; box-shadow: none !important; }`;
  if (document.css.includes(rule)) return document;
  return {...document, css: `${document.css}\n/* Northstar canvas backdrop */\n${rule}`};
}

export function codexEditFocusIsland(document: CanvasV2ArtifactDocument, operations: readonly { targetNodeId?: string }[]): string | undefined {
  const objects = new Map(buildCanvasV2SceneObjectInventory(document).map(item => [item.nodeId, item]));
  const islands = new Set(operations.flatMap(op => {
    const island = op.targetNodeId ? objects.get(op.targetNodeId)?.islandId : undefined;
    return island ? [island] : [];
  }));
  return islands.size === 1 ? [...islands][0] : undefined;
}



export const CODEX_COMPOSITION_FEEDBACK_POLICY = 'Design feedback about scale, hierarchy and visual form is advisory, not a required checklist. Text collisions, clipped content and overlap between independent islands remain integrity checks. Inspect the rendered pixels and improve only material problems. You own the visual form; do not retry just to clear warnings. Source integrity and protection of existing human work are enforced separately.';

/** Report evidence and concrete geometry defects, not legacy font/footprint or narrative templates.
 * The image returned by canvas_review is the basis for editorial judgment. */
export function collectCodexCompositionFeedback(document: CanvasV2ArtifactDocument, observation: CanvasV2RenderObservation): string[] {
  return [...new Set([
    ...validateCanvasV2RenderedEvidenceIntegrity(document, observation),
    ...validateCanvasV2RenderedDesignRegionContentIntegrity(observation),
    ...validateCanvasV2RenderedRelationshipGeometry(observation),
  ])];
}

/** Protect readable content without imposing an editorial template or type scale. */
export function validateCodexCompositionContent(observation: CanvasV2RenderObservation): string[] {
  const failures = validateCanvasV2RenderedTextCollisions(observation);
  const nodes = observation.spatial.nodes ?? [];
  const byId = new Map(nodes.map(node => [node.nodeId, node]));
  const surfaces = new Set(nodes.flatMap(node => node.surfaceOwnerNodeId ? [node.surfaceOwnerNodeId] : []));
  const regions = new Set((observation.spatial.designRegions ?? []).map(region => region.nodeId));
  for (const node of nodes) {
    if (!node.textPaintRects?.length) continue;
    let parent = node.parentNodeId ? byId.get(node.parentNodeId) : undefined;
    const seen = new Set<string>();
    while (parent && !seen.has(parent.nodeId)) {
      seen.add(parent.nodeId);
      if (surfaces.has(parent.nodeId) || regions.has(parent.nodeId)
        || [parent.layout.overflowX, parent.layout.overflowY].some(value => value === "hidden" || value === "clip")) {
        const box = parent.bounds;
        if (node.textPaintRects.some(rect => rect.x < box.x - 2 || rect.y < box.y - 2
          || rect.x + rect.width > box.x + box.width + 2 || rect.y + rect.height > box.y + box.height + 2)) {
          failures.push(`Readable text ${node.nodeId} spills outside its containing object ${parent.nodeId}. Grow or reflow that object so its text fits; preserve the content and neighboring objects.`);
        }
        break;
      }
      parent = parent.parentNodeId ? byId.get(parent.parentNodeId) : undefined;
    }
  }
  return [...new Set(failures)];
}


/** Plan in the person's currently visible territory, rather than a fixed legacy artboard. */
export function codexCompositionViewport(context: CanvasV2WorkingContext | undefined) {
  if (!context) return { available: false, note: 'Read the canvas to obtain the current visible working area.' };
  const scale = context.viewportScale;
  const padding = 24 / Math.max(0.01, scale);
  const visible = context.visibleBounds;
  return { available: true, viewportScale: scale,
    visibleBounds: visible,
    suggestedOrigin: {x:visible.x+padding,y:visible.y+padding},
    visibleScreenSize: {width:Math.round(visible.width*scale),height:Math.round(visible.height*scale)},
    note: 'This is available placement territory, not an island size or a reading-scale target. Place new work near the suggested origin. Choose each island width from its content and keep screenshot, typography, and spacing scales consistent with neighboring work. Neither a zoomed-out viewport nor a long source rail determines the island width. Choose the narrative and number of islands freely; large work may extend beyond the viewport. Review details at the intended reading scale.' };
}

/** Keep cited pages available for a later visual turn without fetching every search result. */
export function rememberCodexSourcePages(previous: readonly string[], answer: string): string[] {
  const pages = new Set(previous);
  for (const match of answer.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)) {
    try { const url = new URL(match[1]); if (url.username || url.password) continue; pages.add(url.href); } catch { /* malformed citation */ }
  }
  return [...pages];
}
export function codexMediaInventory(evidence: readonly CanvasV2EvidenceAsset[], candidates: readonly CodexSourceMediaCandidate[], sourcePages: readonly string[]) {
  const supplied = evidence.filter(asset => asset.authority === 'supplied' || asset.source?.sourceType === 'uploaded');
  const researched = evidence.filter(asset => !supplied.includes(asset));
  return { suppliedAssetIds: supplied.map(asset=>asset.id), researchedAssetIds: researched.map(asset=>asset.id), candidates, sourcePages,
    next: researched.length ? 'Include relevant retained research media in the composition using asset handles from canvas_read; inspect additional candidates as needed.'
      : 'No research media has been collected yet. Researched compositions must include relevant source multimedia. Call read_source on a relevant cited page with a subject focus, then inspect_image on useful candidates and place the retained assets. If a candidate fails, try another candidate or source. A user upload is not a researched asset.' };
}
