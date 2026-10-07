'use client';
import { artifactMetadata, isCreativeTool, type NorthstarArtifact } from '@/lib/canvas-v2/creative/types';
import { creativeInputContext, runCreativeJob, creativeResultForModel } from '@/lib/canvas-v2/creative/bridge';
import { useTimedChatTurns } from "./use-timed-chat-turns";
import { useEffect, useRef, useState } from 'react';
import type { useCanvasV2Chat } from './use-canvas-v2-chat';
import type { useCanvasV2DesignLoop } from './use-canvas-v2-design-loop';
import { codexWorkerFetch } from '@/lib/canvas-v2/worker/transport';
import { canvasV2ModelThemeContext } from '@/lib/canvas-v2/theme-context';
import type { CanvasV2ArtifactTheme } from '@/lib/canvas-v2/artifact-theme';
import { ManagedAgentClient } from '@/lib/canvas-v2/managed-agent/client';
import { captureSteeringBoundary, chronologicalManagedTurns } from '@/lib/canvas-v2/managed-agent/chat-timeline';
import { object, string, type AgentView } from '@/lib/canvas-v2/managed-agent/protocol';
import { applyCanvasV2SourcePatch, findCanvasV2SourceNodeRange } from '@/lib/canvas-v2/source-patch';
import type { CanvasV2GatewayHandoff } from '@/lib/canvas-v2/gateway-handoff';
import { parseCodexCanvasPatch, codexCompositionViewport, codexMediaInventory, rememberCodexSourcePages, CODEX_COMPOSITION_FEEDBACK_POLICY, codexEditFocusIsland, requireCodexCanvasReadRevision, rememberCodexSourceMedia, type CodexSourceMediaCandidate, planCodexComposition, validateCodexComposition, normalizeCodexCompositionSurface, rejectedCodexEdit, type CodexCompositionPlan } from '@/lib/canvas-v2/codex-composition';
import { CODEX_NATIVE_CANVAS_GRAMMAR } from '@/lib/canvas-v2/northstar-canvas-grammar';
import { buildCanvasV2IslandRegistry } from '@/lib/canvas-v2/island-registry';
import { canvasV2MeasuredConnectorDirectory } from '@/lib/canvas-v2/model-context';
import { compactCanvasV2WorkingContextForModel, type CanvasV2WorkingContext, type CanvasV2SelectionPolicy } from '@/lib/canvas-v2/working-context';
import { parseAccountQuery, accountResultForModel, AccountToolHandles, readAccountAssetPixels, type AccountResult } from '@/lib/canvas-v2/account-tools';
import { mergeCanvasV2EvidencePackets } from '@/lib/canvas-v2/evidence-packets';
import { insertCanvasV2CanonicalFlow } from '@/lib/canvas-v2/flow-insertion';
import type { AppDataApp, AppDataFlow } from '@/lib/app-data/canvas-v2-catalog';
import type { CanvasV2EvidencePacket, CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';
import { simulatorForApp } from '@/lib/preview/simulator-registry';
import { isGraetPreviewSection } from '@/lib/preview/graet-navigation';
import { readCanvasV2Screens, canvasV2ScreenReviewAssets, canvasV2ScreenBoundAssets } from '@/lib/canvas-v2/interactive-screen';
import { arrangeCanvasV2Screens, reviseCanvasV2NativeScreen, canvasV2ScreenPatch } from '@/lib/canvas-v2/interactive-screen-patch';
import { inspectCanvasV2Screen, captureCanvasV2Screen, captureCanvasV2ScreenMotion } from './interactive-screen';
import { CANVAS_V2_SCREEN_FEEDBACK, canvasV2ScreenFeedbackContext, parseCanvasV2ScreenFeedbackTarget, patchCanvasV2ScreenElement, type CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';
import { validateCanvasV2ProductIdentity, type CanvasV2ProductIdentity } from '@/lib/canvas-v2/product-identity';
import type { ScreenAction } from '@/lib/canvas-v2/interactive-screen-runtime';
import { findCanvasV2OpenPlacement } from '@/lib/canvas-v2/multiplayer-placement';
import { serializeCanvasV2NativeScene, canvasV2NativeSceneAbsoluteBounds } from '@/lib/canvas-v2/native-scene';
import { CANVAS_V2_WORKSPACE } from '@/lib/canvas-v2/workspace-coordinate-space';
import { citedChatEvidence } from '@/lib/canvas-v2/chat-evidence';

export function useNorthstarManagedChat(input: { theme?: CanvasV2ArtifactTheme; initial?: import("@/lib/canvas-v2/sessions/types").NorthstarSnapshot; enabled: boolean; endpoint?: string; accountEndpoint?: string; gatewayHandoff?: CanvasV2GatewayHandoff; selectedNodeIds?: string[]; getWorkingContext?: (policy: CanvasV2SelectionPolicy) => CanvasV2WorkingContext | undefined; base: ReturnType<typeof useCanvasV2Chat>; engine: ReturnType<typeof useCanvasV2DesignLoop> }) {
  const [turns, setTurns] = useTimedChatTurns((input.initial?.turns ?? []).map(t => t.status === "running" ? { ...t, status: "stopped", activeSince: undefined, error: "The page closed during this run. Send a follow-up to continue from saved work." } : t));
  const [busy, setBusy] = useState(false);
  const current = useRef(input); current.current = input;
  const client = useRef<ManagedAgentClient | undefined>(undefined);
  const rootId = useRef<string | undefined>(undefined);
  const assets = useRef(new Map<string, CanvasV2EvidenceAsset>((input.initial?.memory?.assets ?? []).map(a => [a.id, a])));
  const artifacts = useRef(new Map<string, NorthstarArtifact>((input.initial?.memory?.artifacts ?? []).map(a => [a.id, a])));
  const accountHandles = useRef(new AccountToolHandles(input.initial?.memory?.accountHandles));
  const inspectedPixels = useRef(new Map<string, string>());
  const accountPackets = useRef<CanvasV2EvidencePacket[]>(input.initial?.memory?.accountPackets ?? []);
  const accountFlows = useRef(new Map<string, { app: AppDataApp; flow: AppDataFlow }>(input.initial?.memory?.accountFlows ?? []));
  const steerFlowBaseline = useRef<Set<string> | undefined>(undefined);
  const [steeredFlowReads, setSteeredFlowReads] = useState<Array<{ app: AppDataApp; flow: AppDataFlow }>>([]);
  const accountFlowSummaries = useRef(new Map<string, { app: AppDataApp; flow: AppDataFlow }>(input.initial?.memory?.accountFlowSummaries ?? input.initial?.memory?.accountFlows ?? []));
  const productIdentities = useRef<CanvasV2ProductIdentity[]>(input.initial?.memory?.productIdentities ?? []);
  const [screenFeedback, setScreenFeedback] = useState<{ target: CanvasV2ScreenFeedbackTarget; encoded: string }>();
  const activeScreenFeedback = useRef<typeof screenFeedback>(undefined);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const item = readCanvasV2Screens(current.current.engine.readCommittedRevision().document.html).find(item => item.nodeId === detail?.target?.nodeId);
      if (item && item.encoded === detail.encoded && !item.screen.simulation) setScreenFeedback(detail);
    };
    window.addEventListener(CANVAS_V2_SCREEN_FEEDBACK, receive);
    return () => window.removeEventListener(CANVAS_V2_SCREEN_FEEDBACK, receive);
  }, []);
  useEffect(() => {
    if (screenFeedback && !readCanvasV2Screens(input.engine.committed.document.html).some(item => item.nodeId === screenFeedback.target.nodeId && item.encoded === screenFeedback.encoded)) setScreenFeedback(undefined);
  }, [input.engine.committed, screenFeedback]);
  const readRevision = useRef<string | undefined>(undefined);
  const sourceMedia = useRef<CodexSourceMediaCandidate[]>(input.initial?.memory?.sourceMedia ?? []);
  const sourcePages = useRef<string[]>(input.initial?.memory?.sourcePages ?? []);
  const compositionPlan = useRef<CodexCompositionPlan | undefined>(undefined);
  const compositionHistory = useRef<CodexCompositionPlan[]>(input.initial?.memory?.compositionHistory ?? []);
  const compositionSequence = useRef(input.initial?.memory?.compositionSequence ?? 0);
  const editActive = useRef(false);
  const busyRef = useRef(false);
  const stopping = useRef<Promise<void> | undefined>(undefined);
  const waitingToSubmit = useRef(false);
  const publish = (view: AgentView) => {
    busyRef.current = view.status === 'running'; setBusy(busyRef.current);
    const final = view.status === 'completed' ? view.texts.findLast(t => t.phase === 'final_answer') ?? view.texts.at(-1) : undefined;
    if (final?.text) sourcePages.current = rememberCodexSourcePages(sourcePages.current, final.text);
    const evidenceReferences = final?.text ? citedChatEvidence({ answer: final.text, resolve: handle => accountHandles.current.resolve?.(handle), assets: assets.current, flows: accountFlowSummaries.current }) : undefined;
    setTurns(all => all.map(turn => turn.id === rootId.current ? { ...turn,
      status: view.status === 'completed' ? 'responded' : view.status === 'idle' ? 'running' : view.status,
      activity: view.activity.filter(a => a.id !== `message:${final?.id}`), answer: final?.text, evidenceReferences, error: view.error,
    } : turn));
  };
  const getClient = () => {
    if (client.current) return client.current;
    const runtime = new ManagedAgentClient({ fetcher: input.endpoint === '/api/canvas-v2/codex' ? codexWorkerFetch() : undefined, endpoint: input.endpoint ?? '/api/canvas-v2/agent', closeOnDispose: input.endpoint?.includes('/codex'), onView: publish, execute: async (action, signal) => {
      const output = await (async () => {
      const args = object(accountHandles.current.decode(action.arguments)); const engine = current.current.engine;
      const themeContext = canvasV2ModelThemeContext(current.current.theme ?? "light");
      if (isCreativeTool(action.name)) {
        const requestedMeasurement = action.name === 'workspace_run' ? await engine.ensureObservation(signal) : undefined;
        const turnId = rootId.current;
        const revision = engine.readCommittedRevision();
        if (requestedMeasurement && requestedMeasurement.revisionId !== revision.id) throw new Error('The canvas changed during this action. Read it again.');
        const registered = [...new Map([...revision.evidence, ...assets.current.values()].map(a=>[a.id,a])).values()];
        let html = revision.document.html;
        for (const asset of registered) html = html.replaceAll(asset.url, `northstar-asset:${asset.id}`);
        const measurement = requestedMeasurement?.revisionId === revision.id ? requestedMeasurement : undefined;
        const context = await creativeInputContext(object(action.arguments), args, registered, [...artifacts.current.values()], action.name === 'workspace_run' ? {
          theme: themeContext, revisionId: revision.id, document: {html, css: revision.document.css}, nodes: measurement?.spatial.nodes ?? [], measurementRevisionId: measurement?.revisionId,
          connectors: measurement ? canvasV2MeasuredConnectorDirectory(measurement.spatial.nodes) : undefined,
          viewport: compactCanvasV2WorkingContextForModel(current.current.getWorkingContext?.('reference')),
        } : undefined, signal);
        const result = await runCreativeJob((body, s)=>runtime.request(body, s), action, context, signal);
        signal.throwIfAborted();
        for (const asset of result.assets) assets.current.set(asset.id, asset);
        for (const artifact of result.artifacts) artifacts.current.set(artifact.id, artifact);
        accountHandles.current.remember({apps:[], flows:[], evidence:result.assets});
        setTurns(all=>all.map(turn=>turn.id===turnId?{...turn, artifacts:[...new Map([...(turn.artifacts??[]),...result.artifacts].map(a=>[a.id,a])).values()]}:turn));
        return creativeResultForModel(result);
      }
      if (action.name === 'account_read') {
        const query = parseAccountQuery(args);
        const response = await fetch(current.current.accountEndpoint ?? '/api/canvas-v2/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query), signal });
        if (response.redirected) throw new Error('Sign in to access your account apps.');
        const body = object(await response.json());
        if (!response.ok || !body.result) throw new Error(string(body.error) || 'Account evidence could not be loaded.');
        const result = body.result as AccountResult;
        accountHandles.current.remember(result);
        for (const flow of result.flows) {
          const app = result.apps.find(a => a.name === flow.appName);
          if (app) accountFlowSummaries.current.set(flow.id, { app, flow: { ...flow, sourceScreenCount: flow.screens.length || flow.sourceScreenCount, screens: [] } });
        }
        for (const asset of result.evidence) assets.current.set(asset.id, asset);
        accountPackets.current = mergeCanvasV2EvidencePackets(accountPackets.current, result.packets);
        // Only a complete flow read authorizes canonical insertion; search subsets cannot masquerade as journeys.
        if (result.operation === 'flow-screens') for (const flow of result.flows) {
          const app = result.apps.find(a => a.name === flow.appName);
          if (app) {
            accountFlows.current.set(flow.id, { app, flow });
            if (steerFlowBaseline.current && !steerFlowBaseline.current.has(flow.id)) {
              setSteeredFlowReads((current) => current.some((item) => item.flow.id === flow.id) ? current : [...current, { app, flow }]);
            }
          }
        }
        return { ...accountResultForModel(result, query.limit), simulations: result.apps.filter(app => simulatorForApp(app.name)).map(app => ({ appName: app.name, sections: ['onboarding', 'home', 'explore', 'ai', 'chat', 'profile'] })) };
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
        const observation = await engine.ensureObservation(signal);
        const revision = engine.readCommittedRevision();
        if (!observation || observation.revisionId !== revision.id) throw new Error('The current canvas is still rendering. Read it again shortly.');
        const baseRevisionId = requireCodexCanvasReadRevision(readRevision.current, revision.id);
        const plan = planCodexComposition({ ...args, baseRevisionId }, revision.id, observation, [...revision.evidence, ...assets.current.values()], ++compositionSequence.current);
        compositionPlan.current = plan;
        return { theme: themeContext, accountEvidence: accountPackets.current.map(({ assets: media, ...packet }) => ({ ...packet, assetIds: media.map(a => a.id) })), plan, islandSelector: `[data-canvas-v2-node-id="${plan.execution.target.islandId}"]`,
          media: codexMediaInventory([...revision.evidence, ...assets.current.values()], sourceMedia.current, sourcePages.current),
          sourceMedia: sourceMedia.current, viewport: codexCompositionViewport(current.current.getWorkingContext?.("reference")), islands: buildCanvasV2IslandRegistry({ observation }), collaboration: compactCanvasV2WorkingContextForModel(current.current.getWorkingContext?.("reference")), previousDirections: compositionHistory.current.map(p => ({ islandId: p.execution.target.islandId, direction: p.direction })), grammar: CODEX_NATIVE_CANVAS_GRAMMAR,
          authoring: 'Use the returned target islandId as both data-canvas-v2-node-id and data-canvas-v2-island-id on a transparent section with data-canvas-v2-design-region, data-canvas-v2-story-role and data-canvas-v2-territory-relation matching the contract. Keep full-composition child wrappers transparent too: the Northstar canvas supplies the backdrop, so do not enclose the composition in a grey sheet, panel, border or shadow. Use local fills only where they help individual objects communicate; honor explicit requests for a standalone page or poster. Keep child objects independently identified. For researched compositions, include inspected source multimedia alongside the ideas it enriches. If retained research assets are empty, read relevant source pages and inspect candidates before composing; try another source if one fails. Representative imagery can enrich the story without proving an exact claim; label it accordingly. Choose typography, dimensions, spacing and hierarchy for the visual story and intended reading scale. Use natural heights and inspect the rendered result for readability. Size and typography suggestions are advisory. Fix text spilling outside cards, clipped content, readable-text collisions and overlaps between independent islands; backgrounds and intentional layers within an object may overlap. These are authoring units, not a command to change the user camera. Place new independent islands near the visible workspace; use an explicit existing anchor only when the narrative needs adjacency. Preserve the strongest insights from the conversation when choosing the visual form. Choose heading structure to suit the composition; a separate title island is optional. Commit one island transaction at a time; choose any number of islands. Use canvas_review to inspect the committed render before developing the next section.' };
      }
      if (action.name === 'canvas_product_identity') {
        const revision = engine.readCommittedRevision();
        requireCodexCanvasReadRevision(readRevision.current, revision.id);
        const registered = [...new Map([...revision.evidence, ...assets.current.values()].map(a => [a.id, a])).values()];
        const identity = validateCanvasV2ProductIdentity(args.identity, registered);
        const identities = productIdentities.current.filter(item => item.id !== identity.id);
        if (identities.length >= 20) throw new Error('This canvas already has 20 product identities. Reuse the relevant product.');
        productIdentities.current = [...identities, identity];
        setTurns(turns => [...turns]);
        return { saved: true, identity, note: 'Saved with this canvas for future turns and reloads. New screens receive its tokens and reference lineage. Existing screen source and geometry are unchanged; make requested revisions individually.' };
      }
      if (action.name === 'canvas_screen_motion_review') {
        const revision = engine.readCommittedRevision();
        requireCodexCanvasReadRevision(readRevision.current, revision.id);
        const item = readCanvasV2Screens(revision.document.html).find(item => item.nodeId === args.nodeId);
        if (!item || item.screen.simulation) throw new Error('Choose a current authored screen to review its animation timeline.');
        const frames = await captureCanvasV2ScreenMotion(item.nodeId, item.encoded, signal, typeof args.triggerSelector === 'string' ? args.triggerSelector : undefined);
        if (engine.readCommittedRevision().id !== revision.id) throw new Error('The canvas changed during motion review. Read it again.');
        if (frames.reduce((size, frame) => size + frame.image.length, 0) > 8_000_000) throw new Error('Motion captures exceed the transport budget. Review a smaller viewport.');
        return frames.flatMap(frame => [{ type: 'input_text', text: JSON.stringify({ nodeId: item.nodeId, revisionId: revision.id, viewport: { width: item.screen.width, height: item.screen.height }, motionFrame: frame.progress, state: frame.state, referenceAssetIds: item.screen.referenceAssetIds, note: 'Actual Web Animations timeline sample. Inspect position, opacity, clipping and continuity across all three frames. Playback restored. JavaScript loops, GIF/video, input interruption, reduced-motion behavior and frame rate are not established by these samples; test these separately when relevant.' }) }, { type: 'input_image', image_url: frame.image }]);
      }
      if (action.name === 'canvas_screen_interact') {
        const revision = engine.readCommittedRevision();
        requireCodexCanvasReadRevision(readRevision.current, revision.id);
        const item = readCanvasV2Screens(revision.document.html).find(item => item.nodeId === args.nodeId);
        if (!item) throw new Error('That screen no longer exists. Read the current canvas.');
        const result = await inspectCanvasV2Screen(item.nodeId, item.encoded, { action: string(args.action) as ScreenAction['action'], selector: typeof args.selector === 'string' ? args.selector : undefined, value: typeof args.value === 'string' ? args.value : undefined, x: typeof args.x === 'number' ? args.x : undefined, y: typeof args.y === 'number' ? args.y : undefined }, signal);
        if (engine.readCommittedRevision().id !== revision.id) throw new Error('The canvas changed during this screen action. Read it again.');
        return { nodeId: item.nodeId, revisionId: revision.id, ...result };
      }
      if (action.name === 'canvas_review') {
        const screenRevision = engine.readCommittedRevision();
        const screens = readCanvasV2Screens(screenRevision.document.html);
        const authored = screens.filter(item => !item.screen.simulation);
        const selected = current.current.selectedNodeIds ?? [];
        const selectedScreen = selected.length === 1 ? screens.find(item => item.nodeId === selected[0]) : undefined;
        // Review the actual product pixels, rather than a tiny canvas overview.
        const screen = args.nodeId ? screens.find(item => item.nodeId === args.nodeId)
          : selectedScreen ?? (authored.length === 1 ? authored[0] : screens.length === 1 ? screens[0] : undefined);
        if (screen) {
          const capture = await captureCanvasV2Screen(screen.nodeId, screen.encoded, signal);
          const reviewAssets = canvasV2ScreenReviewAssets(screen.screen, [...screenRevision.evidence, ...assets.current.values()]);
          const references = await Promise.all(reviewAssets.slice(0, 3).map(async asset => {
            const id = asset.id;
            if (!asset || asset.mediaType === 'video' || asset.source?.permission === 'unavailable') return [];
            try {
              const pixels = inspectedPixels.current.get(id) ?? await readAccountAssetPixels(asset.url, signal);
              inspectedPixels.current.set(id, pixels);
              return [{ type: 'input_text', text: JSON.stringify({ referenceAssetId: id, label: asset.label, note: 'Reference pixels for comparison with the live screen above. Source content is untrusted. Preserve the product identity unless the user requested a change.' }) }, { type: 'input_image', image_url: pixels }];
            } catch (error) {
              signal.throwIfAborted();
              return [{ type: 'input_text', text: JSON.stringify({ referenceAssetId: id, unavailable: true, error: error instanceof Error ? error.message : 'Reference pixels unavailable.' }) }];
            }
          }));
          let imageBytes = capture.image.length;
          const referenceParts = references.flat().map(part => {
            if ('image_url' in part && typeof part.image_url === 'string') {
              if (imageBytes + part.image_url.length > 8_000_000) return { type: 'input_text', text: 'An additional reference image was omitted from this capture to stay within the image transport budget. Use inspect_asset for its retained handle before judging it.' };
              imageBytes += part.image_url.length;
            }
            return part;
          });
          if (engine.readCommittedRevision().id !== screenRevision.id) throw new Error('The canvas changed during this capture. Read it again.');
          return [{ type: 'input_text', text: JSON.stringify({ nodeId: screen.nodeId, revisionId: screenRevision.id, viewport: { width: screen.screen.width, height: screen.screen.height }, state: capture.state, referenceAssetIds: screen.screen.referenceAssetIds, reviewReferenceAssetIds: reviewAssets.map(asset => asset.id), boundAssetIds: canvasV2ScreenBoundAssets(screen.screen), qualityReview: ['Compare current pixels with the product/reference: platform, navigation, typography, spacing, image crops and actual brand marks.', 'A retained reference is not the same as a displayed asset. Repair plain-letter/emoji logo substitutions when authentic pixels are available; extract with prepare_asset (or workspace_run/workspace_export for complex processing), inspect and bind that asset.', 'For new visual concepts, use generate_image for suitable credible product assets and inspect the outputs.', 'Test requested controls and review meaningful changed, dialog and scrolled states. Runtime errors: 0 alone does not establish visual quality.'], note: 'Live interactive screen state, isolated runtime. Review and repair concrete visual/interaction defects before claiming completion.' }) }, { type: 'input_image', image_url: capture.image }, ...referenceParts];
        }
        const observation = await engine.ensureObservation(signal);
        const revision = engine.readCommittedRevision();
        if (!observation || observation.revisionId !== revision.id) throw new Error('The current canvas is still rendering.');
        const rejected = engine.readRejectedComposition();
        const target = args.nodeId ? observation.designDetails?.find(d => d.nodeId === args.nodeId) : undefined;
        if (args.nodeId && !target) throw new Error('That composition has no detail capture. Review the overview or read the object instead.');
        return [
          { type: 'input_text', text: JSON.stringify({ theme: themeContext, renderedTheme: observation.theme ?? "unknown", revisionId: revision.id, layoutFeedback: engine.readCompositionFeedback(), feedbackPolicy: CODEX_COMPOSITION_FEEDBACK_POLICY, islands: buildCanvasV2IslandRegistry({ observation }), spatial: observation.spatial, plan: compositionPlan.current,
            rejected: rejected ? { revisionId: rejected.observation.revisionId, failures: rejected.failures, note: 'Rejected draft only; public canvas unchanged.' } : undefined }) },
          { type: 'input_image', image_url: target?.screenshotDataUrl ?? observation.screenshotDataUrl },
          ...(rejected ? [{ type: 'input_text', text: 'Most recent rejected draft:' }, { type: 'input_image', image_url: rejected.observation.screenshotDataUrl }] : []),
        ];
      }
      if (action.name === 'canvas_read') {
        const before = engine.readCommittedRevision();
        const feedback = activeScreenFeedback.current;
        const requestedNodeId = string(args.nodeId) || (feedback && readCanvasV2Screens(before.document.html).some(item => item.nodeId === feedback.target.nodeId && item.encoded === feedback.encoded) ? feedback.target.nodeId : '');
        const native = engine.readNativeScene();
        const nativeScreenRead = native?.revisionId === before.id && readCanvasV2Screens(before.document.html).some(item => item.nodeId === requestedNodeId);
        const observation = nativeScreenRead ? undefined : await engine.ensureObservation(signal);
        const revision = engine.readCommittedRevision();
        if (revision.id !== before.id || (observation && observation.revisionId !== revision.id)) throw new Error('The canvas changed during this read. Read it again.');
        let html = revision.document.html;
        const registered = [...new Map([...revision.evidence, ...assets.current.values()].map(a => [a.id, a])).values()];
        accountHandles.current.remember({ apps: [], flows: [], evidence: registered });
        for (const asset of registered) html = html.replaceAll(asset.url, `northstar-asset:${asset.id}`);
        html = html.replace(/(data-canvas-v2-screen\s*=\s*["'])[^"']*/gi, '$1[Use canvas_read(nodeId) for decoded screen source]');
        const range = requestedNodeId ? findCanvasV2SourceNodeRange(html, requestedNodeId) : undefined;
        if (requestedNodeId && !range) throw new Error('This canvas object no longer exists. Read the current canvas.');
        readRevision.current = revision.id;
        const screens = readCanvasV2Screens(revision.document.html).map(({ nodeId, screen }) => ({ nodeId, title: screen.title, width: screen.width, height: screen.height, referenceAssetIds: screen.referenceAssetIds, productIdentityId: screen.productIdentityId, simulation: screen.simulation, ...(requestedNodeId === nodeId ? { source: screen } : {}) }));
        return { screens, productIdentities: productIdentities.current, screenFeedback: activeScreenFeedback.current && readCanvasV2Screens(revision.document.html).some(item => item.nodeId === activeScreenFeedback.current?.target.nodeId && item.encoded === activeScreenFeedback.current?.encoded) ? activeScreenFeedback.current.target : undefined, theme: themeContext, baseRevisionId: revision.id, artifacts: [...artifacts.current.values()].map(artifactMetadata), media: codexMediaInventory(registered, sourceMedia.current, sourcePages.current), sourceMedia: sourceMedia.current, compositionPlan: compositionPlan.current, compositionHistory: compositionHistory.current, workingContext: compactCanvasV2WorkingContextForModel(current.current.getWorkingContext?.("reference")), islands: observation ? buildCanvasV2IslandRegistry({ observation }) : [], nativeScreenBounds: nativeScreenRead && native ? canvasV2NativeSceneAbsoluteBounds(native, requestedNodeId) : undefined, selectedNodeIds: current.current.selectedNodeIds ?? [], document: { html: (range ? html.slice(range.start, range.end) : html).slice(0, 48_000), css: revision.document.css.slice(0, 24_000) },
          truncated: !range && html.length > 48_000,
          accountEvidence: mergeCanvasV2EvidencePackets(revision.evidencePackets, accountPackets.current).map(({ assets: media, ...packet }) => ({ ...packet, assetIds: media.map(a => a.id) })),
          evidence: registered.map(({ id, url, originalUrl, label, mediaType, mimeType, source }) => ({ id, mediaType, mimeType, source, url: `northstar-asset:${id}`, originalUrl: originalUrl ?? (url.startsWith("data:") ? undefined : url), playbackUrl: mediaType === "gif" ? originalUrl : mediaType === "video" ? url : undefined, label })),
          observation: observation ? { nodes: observation.spatial.nodes.slice(0, 80), connectors: canvasV2MeasuredConnectorDirectory(observation.spatial.nodes) } : { note: 'Native screen source and geometry read. Use canvas_review for current rendered pixels; this read does not claim visual inspection.' },
        };
      }
      if (action.name === 'canvas_arrange_screens') {
        try {
          signal.throwIfAborted();
          const revision = engine.readCommittedRevision();
          requireCodexCanvasReadRevision(readRevision.current, revision.id);
          const scene = engine.readNativeScene();
          if (editActive.current || !scene || scene.revisionId !== revision.id) throw new Error('Read the latest canvas after its current edit finishes.');
          const authorized = args.selectionPolicy === 'modify' ? current.current.selectedNodeIds ?? [] : [];
          const next = arrangeCanvasV2Screens(scene, args, authorized);
          if (!engine.applyManualDocument(serializeCanvasV2NativeScene(next), string(args.summary) || 'Arranged screens', undefined, next, { origin: 'northstar', workingContext: current.current.getWorkingContext?.(args.selectionPolicy === 'modify' ? 'modify' : 'none'), selectionNodeIds: current.current.selectedNodeIds })) throw new Error(engine.readManualFailure() || 'The canvas changed. Read it again.');
          readRevision.current = engine.readCommittedRevision().id;
          return { committed: true, revisionId: readRevision.current, nodeIds: args.nodeIds, next: 'The screen source, sizes, mock state and camera are unchanged. Review the presentation at a useful reading scale.' };
        } catch (error) { return rejectedCodexEdit(engine.readCommittedRevision().id, error); }
      }
      if (action.name === 'canvas_edit' || action.name === 'canvas_insert_flow' || action.name === 'canvas_screen' || action.name === 'canvas_screen_element' || action.name === 'canvas_insert_simulation') {
        try {
        if (signal.aborted) throw new Error('This action was stopped.');
        if (editActive.current) throw new Error('Another canvas edit is still committing. Read the canvas after it finishes.');
        const revision = engine.readCommittedRevision();
        requireCodexCanvasReadRevision(readRevision.current, revision.id);
        const evidence = [...new Map([...revision.evidence, ...assets.current.values()].map(a => [a.id, a])).values()];
        let workingContext = current.current.getWorkingContext?.(args.selectionPolicy === 'modify' ? 'modify' : 'none');
        const canonical = action.name === 'canvas_insert_flow' ? accountFlows.current.get(string(args.flowId)) : undefined;
        if (action.name === 'canvas_insert_flow' && !canonical) throw new Error('Read the complete flow with account_read flow-screens before inserting it.');
        const insertion = canonical ? insertCanvasV2CanonicalFlow({ document: revision.document, currentEvidence: evidence, ...canonical, evidence, packet: accountPackets.current.find(p => p.source.sourceId === canonical.flow.id) }) : undefined;
        if (insertion?.alreadyInserted) return { committed: true, unchanged: true, revisionId: revision.id, laneNodeId: insertion.laneNodeId, next: 'This complete ordered source journey is already on the canvas. Reuse its existing rail and continue the requested work.' };
        const isSimulation = action.name === 'canvas_insert_simulation';
        if (isSimulation) {
          if (!simulatorForApp(string(args.appName))) throw new Error('There is no registered simulation for this app. You can build a requested screen from its references with canvas_screen.');
          const response = await fetch(current.current.accountEndpoint ?? '/api/canvas-v2/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'list-apps', query: string(args.appName), limit: 60 }), signal });
          if (response.redirected) throw new Error('Sign in to access this simulation.');
          const body = object(await response.json());
          if (!response.ok || !(body.result as AccountResult | undefined)?.apps.some(app => app.name.toLowerCase() === string(args.appName).toLowerCase())) throw new Error('This app is not available in your account.');
          if (engine.readCommittedRevision().id !== revision.id) throw new Error('The canvas changed during this action. Read it again.');
          const section = args.section ?? 'onboarding';
          if (!isGraetPreviewSection(section)) throw new Error('Choose an available simulation section.');
          Object.assign(args, { title: 'GRAET · interactive simulation', width: 383, height: 820, html: '<div></div>', css: '', javascript: '', referenceAssetIds: [], simulation: { appName: 'GRAET', section } });
        }
        const isScreen = action.name === 'canvas_screen' || action.name === 'canvas_screen_element' || isSimulation;
        if (action.name === 'canvas_screen_element') {
          const feedback = activeScreenFeedback.current;
          const screen = readCanvasV2Screens(revision.document.html).find(item => item.nodeId === args.nodeId);
          if (!feedback || !screen || feedback.target.nodeId !== screen.nodeId || feedback.encoded !== screen.encoded) throw new Error('This precise feedback target changed or was removed. Ask the user to select it again; do not expand the edit.');
          if (workingContext) {
            const object = workingContext.objects.find(object => object.nodeId === screen.nodeId);
            if (!object || object.locked || object.hidden || object.canonicalEvidence) throw new Error('The selected screen is protected or no longer available.');
            workingContext = { ...workingContext, scope: 'selection', selectionPolicy: 'modify', selectedNodeIds: [screen.nodeId], editableNodeIds: [screen.nodeId], selectedBounds: object.bounds, protectedNodeIds: workingContext.protectedNodeIds.filter(id => id !== screen.nodeId) };
          }
          args.html = patchCanvasV2ScreenElement(screen.screen.html, feedback.target.selector, { text: args.text, styles: args.styles }, new DOMParser());
          delete args.css; delete args.javascript;
        }
        const placementContext = current.current.getWorkingContext?.('reference');
        const placementObservation = isScreen && !args.nodeId ? await engine.ensureObservation(signal) : undefined;
        if (placementObservation && placementObservation.revisionId !== revision.id) throw new Error('The canvas changed during screen placement. Read it again.');
        const placement = isScreen && !args.nodeId ? findCanvasV2OpenPlacement({
          preferred: { x: (placementContext?.visibleBounds.x ?? CANVAS_V2_WORKSPACE.aiAuthoringOriginX) + 80, y: (placementContext?.visibleBounds.y ?? CANVAS_V2_WORKSPACE.aiAuthoringOriginY) + 100 },
          bounds: { x: 0, y: 0, width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height },
          footprint: { width: typeof args.width === 'number' ? args.width : 390, height: typeof args.height === 'number' ? args.height + 48 : 892 },
          obstacles: placementObservation?.spatial.authoredSurface?.placementOccupants?.map(node => node.bounds) ?? [], gap: 96,
        }) : { x: 0, y: 0 };
        if (!placement) throw new Error('There is no available space for this screen.');
        const screenPatch = isScreen ? canvasV2ScreenPatch(revision.document, args, evidence, placement, productIdentities.current) : undefined;
        const operations = screenPatch?.operations ?? (insertion ? [] : parseCodexCanvasPatch(string(args.patch), evidence));
        const plan = isScreen || insertion || args.selectionPolicy === 'modify' ? undefined : compositionPlan.current;
        const planObservation = plan ? await engine.ensureObservation(signal) : undefined;
        if (operations.some(op => 'html' in op && /data-canvas-v2-design-region/.test(op.html)) && !plan) throw new Error('Plan the composition with canvas_plan before authoring its islands.');
        const authored = insertion?.document ?? applyCanvasV2SourcePatch({ previous: revision.document, operations, evidence, workingContext });
        let document = plan ? normalizeCodexCompositionSurface(plan, authored) : authored;
        if (plan && planObservation?.revisionId === revision.id) validateCodexComposition(plan, revision.document, document, planObservation);
        else if (plan) throw new Error('The canvas changed during composition. Read it again.');
        let sourceScene: ReturnType<typeof engine.readNativeScene>;
        if (isScreen && args.nodeId && screenPatch) {
          const scene = engine.readNativeScene();
          const updated = readCanvasV2Screens(document.html).find(item => item.nodeId === screenPatch.nodeId);
          if (!scene || scene.revisionId !== revision.id || !updated) throw new Error('Read the current native screen before revising it.');
          sourceScene = reviseCanvasV2NativeScreen(scene, screenPatch.nodeId, updated.encoded);
          document = serializeCanvasV2NativeScene(sourceScene);
        }
        if (document.html === revision.document.html && document.css === revision.document.css) return { committed: true, unchanged: true, ...(screenPatch ? { nodeId: screenPatch.nodeId } : {}), revisionId: revision.id, next: 'The requested source already matches. Review the current rendered state; do not rebuild the screen.' };
        let expectedRevision = "";
        editActive.current = true;
        try {
          if (!engine.applyManualDocument(document, string(args.summary) || 'Updated the canvas', evidence, sourceScene, { origin: 'northstar', evidencePackets: mergeCanvasV2EvidencePackets(revision.evidencePackets, accountPackets.current), workingContext, focusIslandId: codexEditFocusIsland(revision.document, operations.filter(op => 'targetNodeId' in op)), execution: plan?.execution, selectionNodeIds: current.current.selectedNodeIds, onPrepared: id => { expectedRevision = id; } })) throw new Error(engine.readManualFailure() || 'Canvas is busy. Read it again before retrying.');
          const started = Date.now();
          while (Date.now() - started < 30_000) {
            if (signal.aborted) { current.current.engine.stop(); throw new Error('The uncommitted canvas edit was stopped.'); }
            const latest = current.current.engine.readCommittedRevision();
            if (latest.id !== revision.id) {
              if (latest.id !== expectedRevision) throw new Error(`The canvas changed during this edit. Inspect revision ${latest.id}.`);
              if (plan) compositionHistory.current = [...compositionHistory.current.filter(p => p.execution.target.islandId !== plan.execution.target.islandId), plan];
              if (action.name === 'canvas_screen_element' && activeScreenFeedback.current && screenPatch) {
                const updated = readCanvasV2Screens(latest.document.html).find(item => item.nodeId === screenPatch.nodeId);
                if (updated) activeScreenFeedback.current = { ...activeScreenFeedback.current, encoded: updated.encoded };
              }
              readRevision.current = latest.id;
              compositionPlan.current = undefined;
              return { committed: true, ...(screenPatch ? { nodeId: screenPatch.nodeId } : {}), revisionId: latest.id, summary: string(args.summary), layoutFeedback: current.current.engine.readCompositionFeedback(), feedbackPolicy: CODEX_COMPOSITION_FEEDBACK_POLICY, next: screenPatch ? 'First use canvas_review(nodeId) on the initial rendered state and compare its actual brand marks and imagery with the returned reference pixels. Retained IDs alone are not asset use. Repair substitutions with prepare_asset/workspace_run and bind the inspected outputs. Then test controls with canvas_screen_interact and review meaningful changed/scrolled states. Preserve the approved design; revise only actual defects.' : 'Inspect the rendered result with canvas_review. Plan the next island or a repair only if needed.' };
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
  const submit = async (override?: string, supplied?: Extract<import('@/lib/canvas-v2/sessions/types').SessionCommand,{kind:'submit'}>) => {
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
    if (!feedback) { rootId.current = id; steerFlowBaseline.current = undefined; setSteeredFlowReads([]); }
    else if (!steerFlowBaseline.current) steerFlowBaseline.current = new Set(accountFlows.current.keys());
    const attachments = [...(supplied?.attachments ?? base.attachments)];
    let target = supplied?.screenFeedback ?? screenFeedback;
    if (target) {
      try { target = { encoded: target.encoded, target: parseCanvasV2ScreenFeedbackTarget(target.target, target.target.nodeId, target.target.title) }; }
      catch { base.setAttachmentError('This feedback target is invalid. Select the element again.'); return; }
    }
    if (target && !readCanvasV2Screens(current.current.engine.readCommittedRevision().document.html).some(item => item.nodeId === target.target.nodeId && item.encoded === target.encoded)) { base.setAttachmentError('This feedback target changed. Select the element again before sending.'); return; }
    activeScreenFeedback.current = target;
    const modelMessage = message + (target ? canvasV2ScreenFeedbackContext(target.target) : '');
    for (const a of attachments) if (a.kind === 'image') assets.current.set(a.id, { id: a.id, url: a.dataUrl, label: a.name, authority: 'supplied', mimeType: a.mimeType, source: { providerId: 'user-upload', providerLabel: 'Uploaded material', sourceId: a.id, sourceType: 'uploaded', label: a.name, retrievedAt: new Date().toISOString(), permission: 'authorized' } });
    const steeringBoundary = feedback ? captureSteeringBoundary(client.current?.view.activity ?? []) : undefined;
    setTurns(all => [...all, { id, message, attachments, ...(target ? { screenFeedback: target.target } : {}), createdAt: new Date().toISOString(), status: feedback ? 'responded' : 'running', ...(feedback ? { feedbackFor: rootId.current, feedbackState: 'queued' as const, steeringBoundary } : {}) }]);
    busyRef.current = true; setBusy(true); base.setDraft(''); setScreenFeedback(undefined); for (const a of attachments) base.removeAttachment(a.id);
    try {
      const runtime = getClient();
      const restored = !runtime.token && turns.length ? JSON.stringify(chronologicalManagedTurns(turns).map(t => ({ user: t.message, answer: t.answer, status: t.status, activity: t.activity }))) : undefined;
      await runtime.send(modelMessage, attachments, supplied?.model ?? base.modelSelection, id, supplied?.effort ?? base.reasoningEffort, restored, current.current.theme);
      if (feedback) setTurns(all => all.map(turn => turn.id === id ? { ...turn, feedbackState: 'accepted' } : turn));
    }
    catch (error) {
      // The runtime publishes the failure on the active turn; do not leave feedback queued.
      if (feedback) setTurns(all => all.map(turn => turn.id === id ? { ...turn, feedbackState: 'cancelled', error: error instanceof Error ? error.message : 'The agent could not accept this message.' } : turn));
    }
  };
  const gatewaySent = useRef<string | undefined>(undefined);
  const submitRef = useRef(submit); submitRef.current = submit;
  useEffect(() => {
    const handoff = input.gatewayHandoff;
    if (!input.enabled || !handoff?.autoSubmit || !input.engine.interactionReady || busy || gatewaySent.current === handoff.id) return;
    gatewaySent.current = handoff.id;
    void submitRef.current(handoff.prompt);
  }, [input.enabled, input.gatewayHandoff, input.engine.interactionReady, busy]);
  const stop = () => {
    if (stopping.current) return;
    if (editActive.current) current.current.engine.stop();
    stopping.current = (client.current?.cancel() ?? Promise.resolve()).catch(() => undefined).finally(() => { stopping.current = undefined; });
  };
  const memory = () => ({ productIdentities: productIdentities.current, artifacts: [...artifacts.current.values()], assets: [...assets.current.values()], accountPackets: accountPackets.current, accountHandles: accountHandles.current.entries?.() ?? [],
    accountFlows: [...accountFlows.current.entries()], accountFlowSummaries: [...accountFlowSummaries.current.entries()], sourceMedia: sourceMedia.current, sourcePages: sourcePages.current,
    compositionHistory: compositionHistory.current, compositionSequence: compositionSequence.current });
  return { ...input.base, productIdentities: productIdentities.current, screenFeedback: screenFeedback?.target, clearScreenFeedback: () => setScreenFeedback(undefined), memory, steeredFlowReads, modelEndpoint: input.endpoint, runtime: input.endpoint?.includes('/codex') ? 'codex' as const : 'agents' as const, turns, busy, routing: false, submit, stop, continueTurn: () => undefined };
}
