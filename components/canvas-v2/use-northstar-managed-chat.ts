'use client';
import { useEffect, useRef, useState } from 'react';
import type { useCanvasV2Chat, CanvasV2ChatTurn } from './use-canvas-v2-chat';
import type { useCanvasV2DesignLoop } from './use-canvas-v2-design-loop';
import { codexWorkerFetch } from '@/lib/canvas-v2/worker/transport';
import { ManagedAgentClient } from '@/lib/canvas-v2/managed-agent/client';
import { object, string, type AgentView } from '@/lib/canvas-v2/managed-agent/protocol';
import { applyCanvasV2SourcePatch, parseCanvasV2AssetSourcePatch, findCanvasV2SourceNodeRange } from '@/lib/canvas-v2/source-patch';
import type { CanvasV2GatewayHandoff } from '@/lib/canvas-v2/gateway-handoff';
import { codexCompositionViewport, codexMediaInventory, rememberCodexSourcePages, CODEX_COMPOSITION_FEEDBACK_POLICY, codexEditFocusIsland, requireCodexCanvasReadRevision, rememberCodexSourceMedia, type CodexSourceMediaCandidate, planCodexComposition, validateCodexComposition, normalizeCodexCompositionSurface, rejectedCodexEdit, type CodexCompositionPlan } from '@/lib/canvas-v2/codex-composition';
import { CODEX_NATIVE_CANVAS_GRAMMAR } from '@/lib/canvas-v2/northstar-canvas-grammar';
import { buildCanvasV2IslandRegistry } from '@/lib/canvas-v2/island-registry';
import { canvasV2MeasuredConnectorDirectory } from '@/lib/canvas-v2/model-context';
import { compactCanvasV2WorkingContextForModel, type CanvasV2WorkingContext, type CanvasV2SelectionPolicy } from '@/lib/canvas-v2/working-context';
import { parseAccountQuery, accountResultForModel, AccountToolHandles, readAccountAssetPixels, type AccountResult } from '@/lib/canvas-v2/account-tools';
import { mergeCanvasV2EvidencePackets } from '@/lib/canvas-v2/evidence-packets';
import { insertCanvasV2CanonicalFlow } from '@/lib/canvas-v2/flow-insertion';
import type { AppDataApp, AppDataFlow } from '@/lib/app-data/canvas-v2-catalog';
import type { CanvasV2EvidencePacket, CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';

export function useNorthstarManagedChat(input: { enabled: boolean; endpoint?: string; accountEndpoint?: string; gatewayHandoff?: CanvasV2GatewayHandoff; selectedNodeIds?: string[]; getWorkingContext?: (policy: CanvasV2SelectionPolicy) => CanvasV2WorkingContext | undefined; base: ReturnType<typeof useCanvasV2Chat>; engine: ReturnType<typeof useCanvasV2DesignLoop> }) {
  const [turns, setTurns] = useState<CanvasV2ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const current = useRef(input); current.current = input;
  const client = useRef<ManagedAgentClient | undefined>(undefined);
  const rootId = useRef<string | undefined>(undefined);
  const assets = useRef(new Map<string, CanvasV2EvidenceAsset>());
  const accountHandles = useRef(new AccountToolHandles());
  const inspectedPixels = useRef(new Map<string, string>());
  const accountPackets = useRef<CanvasV2EvidencePacket[]>([]);
  const accountFlows = useRef(new Map<string, { app: AppDataApp; flow: AppDataFlow }>());
  const readRevision = useRef<string | undefined>(undefined);
  const sourceMedia = useRef<CodexSourceMediaCandidate[]>([]);
  const sourcePages = useRef<string[]>([]);
  const compositionPlan = useRef<CodexCompositionPlan | undefined>(undefined);
  const compositionHistory = useRef<CodexCompositionPlan[]>([]);
  const compositionSequence = useRef(0);
  const editActive = useRef(false);
  const busyRef = useRef(false);
  const stopping = useRef<Promise<void> | undefined>(undefined);
  const waitingToSubmit = useRef(false);
  const publish = (view: AgentView) => {
    busyRef.current = view.status === 'running'; setBusy(busyRef.current);
    const final = view.status === 'completed' ? view.texts.findLast(t => t.phase === 'final_answer') ?? view.texts.at(-1) : undefined;
    if (final?.text) sourcePages.current = rememberCodexSourcePages(sourcePages.current, final.text);
    setTurns(all => all.map(turn => turn.id === rootId.current ? { ...turn,
      status: view.status === 'completed' ? 'responded' : view.status === 'idle' ? 'running' : view.status,
      activity: view.activity.filter(a => a.id !== `message:${final?.id}`), answer: final?.text, error: view.error,
    } : turn));
  };
  const getClient = () => {
    if (client.current) return client.current;
    const runtime = new ManagedAgentClient({ fetcher: input.endpoint === '/api/canvas-v2/codex' ? codexWorkerFetch() : undefined, endpoint: input.endpoint ?? '/api/canvas-v2/agent', closeOnDispose: input.endpoint?.includes('/codex'), onView: publish, execute: async (action, signal) => {
      const output = await (async () => {
      const args = object(accountHandles.current.decode(action.arguments)); const engine = current.current.engine;
      if (action.name === 'account_read') {
        const query = parseAccountQuery(args);
        const response = await fetch(current.current.accountEndpoint ?? '/api/canvas-v2/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query), signal });
        if (response.redirected) throw new Error('Sign in to access your account apps.');
        const body = object(await response.json());
        if (!response.ok || !body.result) throw new Error(string(body.error) || 'Account evidence could not be loaded.');
        const result = body.result as AccountResult;
        accountHandles.current.remember(result);
        for (const asset of result.evidence) assets.current.set(asset.id, asset);
        accountPackets.current = mergeCanvasV2EvidencePackets(accountPackets.current, result.packets);
        // Only a complete flow read authorizes canonical insertion; search subsets cannot masquerade as journeys.
        if (result.operation === 'flow-screens') for (const flow of result.flows) {
          const app = result.apps.find(a => a.name === flow.appName);
          if (app) accountFlows.current.set(flow.id, { app, flow });
        }
        return accountResultForModel(result, query.limit);
      }
      if (action.name === 'inspect_asset') {
        const asset = assets.current.get(string(args.evidenceId)) ?? engine.readCommittedRevision().evidence.find(a => a.id === args.evidenceId);
        if (!asset || asset.source?.permission === 'unavailable') throw new Error('Read that account source or canvas asset before inspecting it.');
        if (asset.mediaType === 'video') throw new Error('This is linked video evidence. Place it with native playback; it is not a still image.');
        const pixels = inspectedPixels.current.get(asset.id) ?? await readAccountAssetPixels(asset.url, signal);
        inspectedPixels.current.set(asset.id, pixels);
        return [{ type: 'input_text', text: JSON.stringify({ evidenceId: asset.id, label: asset.label, source: asset.source, app: asset.app, flow: asset.flow, sequenceIndex: asset.sequenceIndex }) }, { type: 'input_image', image_url: pixels }];
      }
      if (action.name === 'read_source' || action.name === 'inspect_image') {
        const value = object(await (await runtime.request({ op: 'read', callId: action.call_id, turnId: action.turn_id }, signal)).json());
        sourceMedia.current = rememberCodexSourceMedia(sourceMedia.current, value);
        if (Array.isArray(value.assets)) for (const asset of value.assets as CanvasV2EvidenceAsset[]) assets.current.set(asset.id, asset);
        if (value.asset) {
          const inspected = value.asset as CanvasV2EvidenceAsset;
          const candidate = sourceMedia.current.find(item => item.url === inspected.originalUrl || item.url === args.url);
          const asset = candidate ? { ...inspected, label: candidate.label || inspected.label,
            source: inspected.source ? { ...inspected.source, sourceUrl: candidate.sourceUrl, label: candidate.label || candidate.sourceUrl } : inspected.source } : inspected;
          assets.current.set(asset.id, asset);
          return [{ type: 'input_text', text: JSON.stringify({ assetId: asset.id, url: asset.originalUrl, source: asset.source, note: 'Use the opaque image URL from canvas_read for an image. For native GIF playback use playbackUrl with this evidenceId. Keep source provenance.' }) }, { type: 'input_image', image_url: asset.url }];
        }
        return value;
      }
      if (action.name === 'canvas_plan') {
        const revision = engine.readCommittedRevision();
        const observation = engine.displayedObservation;
        if (!observation || observation.revisionId !== revision.id) throw new Error('The current canvas is still rendering. Read it again shortly.');
        const baseRevisionId = requireCodexCanvasReadRevision(readRevision.current, revision.id);
        const plan = planCodexComposition({ ...args, baseRevisionId }, revision.id, observation, [...revision.evidence, ...assets.current.values()], ++compositionSequence.current);
        compositionPlan.current = plan;
        return { accountEvidence: accountPackets.current.map(({ assets: media, ...packet }) => ({ ...packet, assetIds: media.map(a => a.id) })), plan, islandSelector: `[data-canvas-v2-node-id="${plan.execution.target.islandId}"]`,
          media: codexMediaInventory([...revision.evidence, ...assets.current.values()], sourceMedia.current, sourcePages.current),
          sourceMedia: sourceMedia.current, viewport: codexCompositionViewport(current.current.getWorkingContext?.("reference")), islands: buildCanvasV2IslandRegistry({ observation }), collaboration: compactCanvasV2WorkingContextForModel(current.current.getWorkingContext?.("reference")), previousDirections: compositionHistory.current.map(p => ({ islandId: p.execution.target.islandId, direction: p.direction })), grammar: CODEX_NATIVE_CANVAS_GRAMMAR,
          authoring: 'Use the returned target islandId as both data-canvas-v2-node-id and data-canvas-v2-island-id on a transparent section with data-canvas-v2-design-region, data-canvas-v2-story-role and data-canvas-v2-territory-relation matching the contract. Keep full-composition child wrappers transparent too: the Northstar canvas supplies the backdrop, so do not enclose the composition in a grey sheet, panel, border or shadow. Use local fills only where they help individual objects communicate; honor explicit requests for a standalone page or poster. Keep child objects independently identified. For researched compositions, include inspected source multimedia alongside the ideas it enriches. If retained research assets are empty, read relevant source pages and inspect candidates before composing; try another source if one fails. Representative imagery can enrich the story without proving an exact claim; label it accordingly. Choose typography, dimensions, spacing and hierarchy for the visual story and intended reading scale. Use natural heights and inspect the rendered result for readability. Size and typography suggestions are advisory. Fix text spilling outside cards, clipped content, readable-text collisions and overlaps between independent islands; backgrounds and intentional layers within an object may overlap. These are authoring units, not a command to change the user camera. Place new independent islands near the visible workspace; use an explicit existing anchor only when the narrative needs adjacency. Preserve the strongest insights from the conversation when choosing the visual form. Choose heading structure to suit the composition; a separate title island is optional. Commit one island transaction at a time; choose any number of islands. Use canvas_review to inspect the committed render before developing the next section.' };
      }
      if (action.name === 'canvas_review') {
        const revision = engine.readCommittedRevision();
        const observation = engine.displayedObservation;
        if (!observation || observation.revisionId !== revision.id) throw new Error('The current canvas is still rendering.');
        const rejected = engine.readRejectedComposition();
        const target = args.nodeId ? observation.designDetails?.find(d => d.nodeId === args.nodeId) : undefined;
        if (args.nodeId && !target) throw new Error('That composition has no detail capture. Review the overview or read the object instead.');
        return [
          { type: 'input_text', text: JSON.stringify({ revisionId: revision.id, layoutFeedback: engine.readCompositionFeedback(), feedbackPolicy: CODEX_COMPOSITION_FEEDBACK_POLICY, islands: buildCanvasV2IslandRegistry({ observation }), spatial: observation.spatial, plan: compositionPlan.current,
            rejected: rejected ? { revisionId: rejected.observation.revisionId, failures: rejected.failures, note: 'Rejected draft only; public canvas unchanged.' } : undefined }) },
          { type: 'input_image', image_url: target?.screenshotDataUrl ?? observation.screenshotDataUrl },
          ...(rejected ? [{ type: 'input_text', text: 'Most recent rejected draft:' }, { type: 'input_image', image_url: rejected.observation.screenshotDataUrl }] : []),
        ];
      }
      if (action.name === 'canvas_read') {
        const revision = engine.readCommittedRevision();
        let html = revision.document.html;
        const registered = [...new Map([...revision.evidence, ...assets.current.values()].map(a => [a.id, a])).values()];
        accountHandles.current.remember({ apps: [], flows: [], evidence: registered });
        for (const asset of registered) html = html.replaceAll(asset.url, `northstar-asset:${asset.id}`);
        const range = args.nodeId ? findCanvasV2SourceNodeRange(html, string(args.nodeId)) : undefined;
        if (args.nodeId && !range) throw new Error('This canvas object no longer exists. Read the current canvas.');
        readRevision.current = revision.id;
        return { baseRevisionId: revision.id, media: codexMediaInventory(registered, sourceMedia.current, sourcePages.current), sourceMedia: sourceMedia.current, compositionPlan: compositionPlan.current, compositionHistory: compositionHistory.current, workingContext: compactCanvasV2WorkingContextForModel(current.current.getWorkingContext?.("reference")), islands: engine.displayedObservation ? buildCanvasV2IslandRegistry({ observation: engine.displayedObservation }) : [], selectedNodeIds: current.current.selectedNodeIds ?? [], document: { html: (range ? html.slice(range.start, range.end) : html).slice(0, 48_000), css: revision.document.css.slice(0, 24_000) },
          truncated: !range && html.length > 48_000,
          accountEvidence: mergeCanvasV2EvidencePackets(revision.evidencePackets, accountPackets.current).map(({ assets: media, ...packet }) => ({ ...packet, assetIds: media.map(a => a.id) })),
          evidence: registered.map(({ id, url, originalUrl, label, mediaType, mimeType, source }) => ({ id, mediaType, mimeType, source, url: `northstar-asset:${id}`, originalUrl: originalUrl ?? (url.startsWith("data:") ? undefined : url), playbackUrl: mediaType === "gif" ? originalUrl : mediaType === "video" ? url : undefined, label })),
          observation: { nodes: engine.displayedObservation?.spatial.nodes.slice(0, 80), connectors: engine.displayedObservation ? canvasV2MeasuredConnectorDirectory(engine.displayedObservation.spatial.nodes) : undefined },
        };
      }
      if (action.name === 'canvas_edit' || action.name === 'canvas_insert_flow') {
        try {
        if (signal.aborted) throw new Error('This action was stopped.');
        if (editActive.current) throw new Error('Another canvas edit is still committing. Read the canvas after it finishes.');
        const revision = engine.readCommittedRevision();
        requireCodexCanvasReadRevision(readRevision.current, revision.id);
        const evidence = [...new Map([...revision.evidence, ...assets.current.values()].map(a => [a.id, a])).values()];
        const workingContext = current.current.getWorkingContext?.(args.selectionPolicy === 'modify' ? 'modify' : 'none');
        const canonical = action.name === 'canvas_insert_flow' ? accountFlows.current.get(string(args.flowId)) : undefined;
        if (action.name === 'canvas_insert_flow' && !canonical) throw new Error('Read the complete flow with account_read flow-screens before inserting it.');
        const insertion = canonical ? insertCanvasV2CanonicalFlow({ document: revision.document, currentEvidence: evidence, ...canonical, evidence, packet: accountPackets.current.find(p => p.source.sourceId === canonical.flow.id) }) : undefined;
        const operations = insertion ? [] : parseCanvasV2AssetSourcePatch(string(args.patch), evidence);
        const plan = insertion || args.selectionPolicy === 'modify' ? undefined : compositionPlan.current;
        if (operations.some(op => 'html' in op && /data-canvas-v2-design-region/.test(op.html)) && !plan) throw new Error('Plan the composition with canvas_plan before authoring its islands.');
        const authored = insertion?.document ?? applyCanvasV2SourcePatch({ previous: revision.document, operations, evidence, workingContext });
        const document = plan ? normalizeCodexCompositionSurface(plan, authored) : authored;
        if (plan) validateCodexComposition(plan, revision.document, document, engine.displayedObservation!);
        let expectedRevision = "";
        editActive.current = true;
        try {
          if (!engine.applyManualDocument(document, string(args.summary) || 'Updated the canvas', evidence, undefined, { origin: 'northstar', evidencePackets: mergeCanvasV2EvidencePackets(revision.evidencePackets, accountPackets.current), workingContext, focusIslandId: codexEditFocusIsland(revision.document, operations.filter(op => 'targetNodeId' in op)), execution: plan?.execution, selectionNodeIds: current.current.selectedNodeIds, onPrepared: id => { expectedRevision = id; } })) throw new Error(engine.readManualFailure() || 'Canvas is busy. Read it again before retrying.');
          const started = Date.now();
          while (Date.now() - started < 30_000) {
            if (signal.aborted) { current.current.engine.stop(); throw new Error('The uncommitted canvas edit was stopped.'); }
            const latest = current.current.engine.readCommittedRevision();
            if (latest.id !== revision.id) {
              if (latest.id !== expectedRevision) throw new Error(`The canvas changed during this edit. Inspect revision ${latest.id}.`);
              if (plan) compositionHistory.current = [...compositionHistory.current.filter(p => p.execution.target.islandId !== plan.execution.target.islandId), plan];
              readRevision.current = latest.id;
              compositionPlan.current = undefined;
              return { committed: true, revisionId: latest.id, summary: string(args.summary), layoutFeedback: current.current.engine.readCompositionFeedback(), feedbackPolicy: CODEX_COMPOSITION_FEEDBACK_POLICY, next: 'Inspect the rendered result with canvas_review. Plan the next island or a repair only if needed.' };
            }
            const failure = current.current.engine.readManualFailure(); if (failure) throw new Error(failure);
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          current.current.engine.stop(); throw new Error('Canvas validation did not finish. The draft was cancelled; inspect the canvas before retrying.');
        } finally { editActive.current = false; }
        } catch (error) { return rejectedCodexEdit(current.current.engine.readCommittedRevision().id, error); }
      }
      throw new Error('This tool is not available.');
      })();
      return accountHandles.current.encode(output);
    } });
    client.current = runtime; return runtime;
  };
  useEffect(() => {
    const dispose = () => { client.current?.dispose(); };
    window.addEventListener('pagehide', dispose);
    return () => { window.removeEventListener('pagehide', dispose); dispose(); };
  }, []);
  const submit = async (override?: string) => {
    if (stopping.current) {
      if (waitingToSubmit.current) return;
      waitingToSubmit.current = true;
      try { await stopping.current; } finally { waitingToSubmit.current = false; }
    }
    const base = current.current.base;
    const message = (typeof override === 'string' ? override : base.draft).trim() || (base.attachments.length ? 'Review the attached material.' : '');
    if (!message) return;
    const id = crypto.randomUUID();
    const feedback = busyRef.current;
    if (!feedback) rootId.current = id;
    const attachments = [...base.attachments];
    for (const a of attachments) if (a.kind === 'image') assets.current.set(a.id, { id: a.id, url: a.dataUrl, label: a.name, authority: 'supplied', mimeType: a.mimeType, source: { providerId: 'user-upload', providerLabel: 'Uploaded material', sourceId: a.id, sourceType: 'uploaded', label: a.name, retrievedAt: new Date().toISOString(), permission: 'authorized' } });
    setTurns(all => [...all, { id, message, attachments, createdAt: new Date().toISOString(), status: feedback ? 'responded' : 'running', ...(feedback ? { feedbackFor: rootId.current, feedbackState: 'queued' as const } : {}) }]);
    busyRef.current = true; setBusy(true); base.setDraft(''); for (const a of attachments) base.removeAttachment(a.id);
    try {
      await getClient().send(message, attachments, base.modelSelection, id);
      if (feedback) setTurns(all => all.map(turn => turn.id === id ? { ...turn, feedbackState: 'accepted' } : turn));
    }
    catch {
      // The runtime publishes the failure on the active turn; do not leave feedback queued.
      if (feedback) setTurns(all => all.map(turn => turn.id === id ? { ...turn, feedbackState: 'cancelled' } : turn));
    }
  };
  const gatewaySent = useRef<string | undefined>(undefined);
  const submitRef = useRef(submit); submitRef.current = submit;
  useEffect(() => {
    const handoff = input.gatewayHandoff;
    if (!input.enabled || !handoff?.autoSubmit || !input.engine.ready || busy || gatewaySent.current === handoff.id) return;
    gatewaySent.current = handoff.id;
    void submitRef.current(handoff.prompt);
  }, [input.enabled, input.gatewayHandoff, input.engine.ready, busy]);
  const stop = () => {
    if (stopping.current) return;
    if (editActive.current) current.current.engine.stop();
    stopping.current = (client.current?.cancel() ?? Promise.resolve()).catch(() => undefined).finally(() => { stopping.current = undefined; });
  };
  return { ...input.base, runtime: input.endpoint?.includes('/codex') ? 'codex' as const : 'agents' as const, turns, busy, routing: false, submit, stop, continueTurn: () => undefined };
}
