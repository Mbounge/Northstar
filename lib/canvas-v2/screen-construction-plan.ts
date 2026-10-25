import { assetPixelRect, assetSourceSize, type AssetSourceSize } from './asset-crop';
import { object, string, type JsonObject } from './managed-agent/protocol';
import { screenNavigationPlan, type ScreenNavigationPlan } from './screen-navigation-plan';
import { screenExperiencePlan, type ScreenExperiencePlan } from './experience-plan';
import { screenHTMLCopyChanges } from './screen-change-receipt';
import type { CanvasV2InteractiveScreen } from './interactive-screen';
import { screenInitialRenderFailure } from './screen-probe-outcome';

export interface ScreenDesignDirection {
  rationale: string;
  /** Intended feeling and the concrete choices that convey it, chosen for this
   * product. Existing faithful refinement plans need not invent a new mood. */
  emotionalRegister?: string;
  hierarchy: string;
  layout: string;
  density: string;
  navigation: string;
  typography: string;
  componentGeometry: string;
  motion: string;
}

export interface ScreenTemporalComponent {
  id: string;
  kind: 'clock' | 'progress';
  valueSelector: string;
  numericAttribute: string;
  advanceSelector: string;
  pauseSelector?: string;
  resetSelector?: string;
}

export interface ScreenConstructionPlan {
  id: string;
  intent: 'create' | 'refine';
  nodeId?: string;
  sourceVersion?: string;
  viewport: { width: number; height: number };
  summary: string;
  preserve: string[];
  /** Editor-measured scope; baseline pixels and all normal edit guards remain. */
  preparation?: 'measured-copy-refinement';
  /** Brief-derived direction; faithful refinements may omit it. */
  designDirection?: ScreenDesignDirection;
  /** Core journey and applicable craft/reference decisions for original work. */
  experiencePlan?: ScreenExperiencePlan;
  /** Explicit temporal UI contracts; absent for static/non-temporal screens. */
  temporalComponents?: ScreenTemporalComponent[];
  components: Array<{
    id: string; name: string; parentId?: string;
    kind: 'container' | 'control' | 'text' | 'content-asset';
    basis: 'observed' | 'inferred';
    selector?: string; shape: string; style: string; content: string; behavior: string;
    assetPolicy: 'none' | 'original' | 'replaceable';
    referenceAssetId?: string; sourceSize?: AssetSourceSize;
    referenceRect?: { x: number; y: number; width: number; height: number };
    referenceViewportRect?: { x: number; y: number; width: number; height: number };
    logicalBounds?: { x: number; y: number; width: number; height: number };
    localBounds?: { x: number; y: number; width: number; height: number };
    navigation?: ScreenNavigationPlan;
  }>;
}

/** Only a small literal text-node correction may prepare its own exact plan.
 * No style, behaviour, identity, asset or geometry override is accepted here. */
export function automaticScreenCopyPlan(args: JsonObject, id: string, current?: { nodeId: string; sourceVersion: string; screen: CanvasV2InteractiveScreen }): ScreenConstructionPlan | undefined {
  if (!current || current.screen.simulation || args.nodeId !== current.nodeId || typeof args.html !== 'string'
    || Object.keys(args).some(key => args[key] !== undefined && !['nodeId','html','summary','selectionPolicy'].includes(key))) return undefined;
  const changes = screenHTMLCopyChanges(current.screen.html,args.html);
  if (!changes?.length || changes.length > 8 || changes.some(change => !change.before.trim() || !change.after.trim())
    || changes.reduce((length,change) => length + change.before.length + change.after.length,0) > 1600) return undefined;
  return { id, intent:'refine', preparation:'measured-copy-refinement', nodeId:current.nodeId, sourceVersion:current.sourceVersion,
    viewport:{width:current.screen.width,height:current.screen.height}, summary:`Correct ${changes.length} existing text node${changes.length===1?'':'s'} in place.`,
    preserve:['All tag names and attributes, including IDs, locks and event bindings.','Existing stylesheet, script, dataset, resources and screen identity.','Existing canvas objects and geometry; each person’s live prototype state.'],
    components:changes.map((change,index)=>({id:`copy-${index+1}`,name:`Measured wording change ${index+1}`,kind:'text',basis:'inferred',shape:'Existing text node; no structural changes.',style:'Keep the existing typography and layout; inspect actual wrapping after the change.',content:JSON.stringify(change),behavior:'Keep existing behaviour; verify affected views and interactions.',assetPolicy:'none'})),
  };
}

/** The automatic route cannot use missing/broken pixels as a preservation
 * baseline. Rendering repairs must take the explicit planning route. */
export function requireAutomaticCopyBaseline<T extends { state: unknown }>(baseline: T | undefined): T {
  const failure = baseline ? screenInitialRenderFailure(baseline.state) : 'The pre-edit baseline could not be captured.';
  if (failure) throw new Error(`Automatic wording preparation stopped: ${failure} Inspect the screen or use an explicit refinement plan to repair its rendering. No edit was committed.`);
  return baseline!;
}

const boundedText = (value: unknown, name: string, limit = 800) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`Supply a concise ${name}.`);
  return value.trim();
};
const boundedSelector = (value: unknown, name: string, limit = 240) => boundedText(value, name, limit);

/** Numeric geometry is calculated from inspected original pixels. These
 * rectangles are the agent's observations, not automatic semantic detection. */
export function screenConstructionPlan(args: JsonObject, id: string, sources: ReadonlyMap<string, AssetSourceSize>, current?: { nodeId: string; sourceVersion: string; width: number; height: number }, knownReferenceAssetIds: ReadonlySet<string> = new Set(sources.keys())): ScreenConstructionPlan {
  const intent = string(args.intent);
  if (intent !== 'create' && intent !== 'refine') throw new Error('Choose create or refine for the component plan.');
  if (intent === 'refine' && (!current || args.nodeId !== current.nodeId)) throw new Error('Read the existing screen and plan its exact nodeId before refining it.');
  if (intent === 'create' && args.nodeId !== undefined) throw new Error('A creation plan has no existing nodeId.');
  const viewport = object(args.viewport);
  if (![viewport.width, viewport.height].every(n => Number.isFinite(n) && Number(n) >= 120 && Number(n) <= 4096)) throw new Error('Use the actual logical viewport dimensions in the component plan.');
  if (current && (viewport.width !== current.width || viewport.height !== current.height)) throw new Error('A refinement plan must preserve the existing logical viewport.');
  if (!Array.isArray(args.components) || !args.components.length || args.components.length > 48) throw new Error('Plan 1–48 actual UI components, not just the overall design mood.');
  if (!Array.isArray(args.preserve) || args.preserve.length > 24) throw new Error('List the existing components, states and behavior to preserve.');
  const misplacedExperienceFields = ['brief', 'states', 'transitions', 'subjects', 'assetStrategy', 'referenceObservations', 'comparison'].filter(field => args[field] !== undefined);
  if (misplacedExperienceFields.length) throw new Error(`Nest ${misplacedExperienceFields.map(field => `experiencePlan.${field}`).join(', ')} inside experiencePlan, not at the top level of the component plan. Resubmit the plan with that nesting; these fields would otherwise be discarded.`);
  const experiencePlan = args.experiencePlan === undefined ? undefined : screenExperiencePlan(args.experiencePlan, knownReferenceAssetIds);
  const directionInput = args.designDirection === undefined ? undefined : object(args.designDirection);
  const designDirection = directionInput ? {
    rationale: boundedText(directionInput.rationale, 'design direction rationale', 500),
    ...(directionInput.emotionalRegister !== undefined ? { emotionalRegister: boundedText(directionInput.emotionalRegister, 'design direction emotional register', 500) } : {}),
    hierarchy: boundedText(directionInput.hierarchy, 'design direction hierarchy', 500),
    layout: boundedText(directionInput.layout, 'design direction layout', 500),
    density: boundedText(directionInput.density, 'design direction density', 500),
    navigation: boundedText(directionInput.navigation, 'design direction navigation', 500),
    typography: boundedText(directionInput.typography, 'design direction typography', 500),
    componentGeometry: boundedText(directionInput.componentGeometry, 'design direction component geometry', 500),
    motion: boundedText(directionInput.motion, 'design direction motion', 500),
  } : undefined;
  const temporalInput = args.temporalComponents === undefined ? undefined : args.temporalComponents;
  if (temporalInput !== undefined && (!Array.isArray(temporalInput) || temporalInput.length > 8)) throw new Error('Declare at most eight temporal components that are implied by the brief and visible UI.');
  const temporalComponents = temporalInput === undefined ? undefined : temporalInput.map(raw => {
    const temporal = object(raw), id = boundedText(temporal.id, 'temporal component id', 80);
    if (!/^[\w.-]+$/.test(id) || !['clock', 'progress'].includes(string(temporal.kind))) throw new Error('Temporal components need a simple id and kind clock or progress.');
    const result: ScreenTemporalComponent = {
      id,
      kind: string(temporal.kind) as ScreenTemporalComponent['kind'],
      valueSelector: boundedSelector(temporal.valueSelector, 'temporal value selector'),
      numericAttribute: boundedText(temporal.numericAttribute, 'temporal numeric attribute', 120),
      advanceSelector: boundedSelector(temporal.advanceSelector, 'temporal advance selector'),
      ...(temporal.pauseSelector !== undefined ? { pauseSelector: boundedSelector(temporal.pauseSelector, 'temporal pause selector') } : {}),
      ...(temporal.resetSelector !== undefined ? { resetSelector: boundedSelector(temporal.resetSelector, 'temporal reset selector') } : {}),
    };
    if (!/^[A-Za-z_:][\w:.-]*$/.test(result.numericAttribute)) throw new Error('Use a native or data/ARIA numeric attribute for temporal state.');
    return result;
  });
  if (temporalComponents && new Set(temporalComponents.map(component => component.id)).size !== temporalComponents.length) throw new Error('Use distinct temporal component ids.');
  const referenceFrames=new Map<string,string>();
  const components = args.components.map(raw => {
    const c = object(raw), componentId = boundedText(c.id, 'component id', 80);
    if (!/^[\w.-]+$/.test(componentId)) throw new Error('Use simple component ids.');
    if (!['container', 'control', 'text', 'content-asset'].includes(string(c.kind)) || !['observed', 'inferred'].includes(string(c.basis))) throw new Error('Distinguish UI controls/containers/text from content assets, and observed components from inferred ones.');
    if (!['none', 'original', 'replaceable'].includes(string(c.assetPolicy)) || c.kind !== 'content-asset' && c.assetPolicy !== 'none') throw new Error('Only content assets permit original or replaceable image policy. Specify assetPolicy: none for every native UI component; use kind: content-asset for image assets.');
    const result: ScreenConstructionPlan['components'][number] = {
      id: componentId, name: boundedText(c.name, 'component name', 120),
      kind: c.kind as ScreenConstructionPlan['components'][number]['kind'], basis: c.basis as 'observed' | 'inferred',
      shape: boundedText(c.shape, 'component shape', 160), style: boundedText(c.style, 'component styling'),
      content: boundedText(c.content, 'visible content and mock state'), behavior: boundedText(c.behavior, 'component behavior'),
      assetPolicy: c.assetPolicy as 'none' | 'original' | 'replaceable',
      ...(c.parentId !== undefined ? { parentId: boundedText(c.parentId, 'parent component id', 80) } : {}),
      ...(c.selector !== undefined ? { selector: boundedText(c.selector, 'owning component selector', 240) } : {}),
    };
    if (c.navigation !== undefined) {
      if (c.kind !== 'container' || !result.selector) throw new Error('Navigation belongs to a container with an exact rendered selector.');
      result.navigation = screenNavigationPlan(c.navigation, Number(viewport.height));
    }
    if (c.basis === 'observed') {
      const assetId = string(c.referenceAssetId), actual = sources.get(assetId);
      if (!assetId) throw new Error(`Observed component "${componentId}" needs referenceAssetId, sourceSize and referenceRect. Mark an unseen component inferred instead.`);
      if (!actual) throw new Error(`Observed component "${componentId}": Inspect referenceAssetId "${assetId}" before planning its geometry.`);
      const size = assetSourceSize(c.sourceSize);
      if (size.width !== actual.width || size.height !== actual.height) throw new Error('The component plan uses resized coordinates. Use the inspected original sourceSize.');
      const rect = assetPixelRect(c.referenceRect, size);
      const frame = c.referenceViewportRect === undefined ? {x:0,y:0,...size} : assetPixelRect(c.referenceViewportRect,size);
      const frameKey=JSON.stringify(frame), priorFrame=referenceFrames.get(assetId);
      if(priorFrame&&priorFrame!==frameKey)throw new Error('Use one app viewport and logical scale for each reference image.');
      referenceFrames.set(assetId,frameKey);
      if(rect.x<frame.x||rect.y<frame.y||rect.x+rect.width>frame.x+frame.width||rect.y+rect.height>frame.y+frame.height)throw new Error('The observed component must be inside the actual app viewport, excluding capture chrome.');
      const scale = Number(viewport.width) / frame.width, round=(n:number)=>Math.round(n*scale*1000)/1000;
      Object.assign(result, { referenceAssetId: assetId, sourceSize: size, referenceRect: rect,
        ...(c.referenceViewportRect!==undefined?{referenceViewportRect:frame}:{}),
        logicalBounds: {x:round(rect.x-frame.x),y:round(rect.y-frame.y),width:round(rect.width),height:round(rect.height)} });
    } else if (c.referenceAssetId !== undefined || c.referenceRect !== undefined || c.referenceViewportRect !== undefined || c.sourceSize !== undefined) throw new Error('An inferred component is not an observed reference measurement.');
    return result;
  });
  const byId = new Map(components.map(c => [c.id, c]));
  if (byId.size !== components.length) throw new Error('Use distinct component ids.');
  for (const component of components) {
    const seen = new Set([component.id]); let parent = component.parentId;
    while (parent) { if (!byId.has(parent) || seen.has(parent)) throw new Error('Component parents must form a valid tree.'); seen.add(parent); parent = byId.get(parent)!.parentId; }
    const owner=component.parentId?byId.get(component.parentId):undefined;
    if(owner?.logicalBounds&&component.logicalBounds&&owner.referenceAssetId===component.referenceAssetId){const b=component.logicalBounds;component.localBounds={...b,x:Math.round((b.x-owner.logicalBounds.x)*1000)/1000,y:Math.round((b.y-owner.logicalBounds.y)*1000)/1000};}
  }
  if(JSON.stringify({designDirection,temporalComponents,components}).length>28000)throw new Error('Keep the component plan within 28000 characters; retain measurements and concise direction/component decisions.');
  return { id, intent, ...(current ? { nodeId: current.nodeId, sourceVersion: current.sourceVersion } : {}), viewport: { width: Number(viewport.width), height: Number(viewport.height) }, summary: boundedText(args.summary, 'planned change'), preserve: args.preserve.map(p => boundedText(p, 'preserved behavior')), ...(designDirection ? {designDirection} : {}), ...(experiencePlan ? {experiencePlan} : {}), ...(temporalComponents ? {temporalComponents} : {}), components };
}

export function requireScreenConstructionPlan(plans: Iterable<ScreenConstructionPlan>, planId: unknown, target?: { nodeId: string; sourceVersion: string }) {
  const candidates = [...plans].filter(p => planId ? p.id === planId : target && p.nodeId === target.nodeId);
  const plan = candidates.length === 1 ? candidates[0] : undefined;
  if (!plan || (target ? plan.nodeId !== target.nodeId || plan.sourceVersion !== target.sourceVersion : plan.intent !== 'create' || plan.nodeId)) throw new Error('Plan the actual UI components with canvas_plan_screen before writing this screen. If its source changed outside this planned edit, read it and make a fresh refinement plan.');
  return plan;
}
