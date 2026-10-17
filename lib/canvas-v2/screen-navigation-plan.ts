import { object, string } from './managed-agent/protocol';

export interface ScreenNavigationPlan {
  position: 'fixed' | 'sticky' | 'flow';
  scrollRegionSelector: string;
  contentInsetBottom: number;
  activeTabId: string;
  tabs: Array<{ id: string; label: string; destination: string; basis: 'observed' | 'inferred'; controlSelector: string; viewSelector: string; expectedText: string }>;
}

export const screenNavigationPlanSchema = {
  type: 'object', additionalProperties: false,
  description: 'Required when planning a bottom navigation container. Choose its actual anchoring and scroll owner; reserve space for the bar plus safe-area/gap. Map every tab to a distinct view or an explicitly scoped mock destination. A static capture cannot establish behavior; identify inferred destinations.',
  properties: {
    position: { type: 'string', enum: ['fixed', 'sticky', 'flow'] },
    scrollRegionSelector: { type: 'string' },
    contentInsetBottom: { type: 'number', minimum: 0, description: 'Logical pixels reserved after scrolling content, including bar height and bottom gap/safe area for overlay navigation.' },
    activeTabId: { type: 'string' },
    tabs: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, label: { type: 'string' }, destination: { type: 'string' }, basis: { type: 'string', enum: ['observed', 'inferred'] },
      controlSelector: { type: 'string', description: 'Exact tab button selector for a journey click.' }, viewSelector: { type: 'string', description: 'A heading/content selector outside navigation that proves this destination is visible.' }, expectedText: { type: 'string', description: 'Destination text in that heading/content; a permanent nav label cannot prove navigation.' },
    }, required: ['id', 'label', 'destination', 'basis', 'controlSelector', 'viewSelector', 'expectedText'] } },
  }, required: ['position', 'scrollRegionSelector', 'contentInsetBottom', 'activeTabId', 'tabs'],
};

/** Records explicit navigation decisions; it does not infer function from pixels. */
export function screenNavigationPlan(value: unknown, viewportHeight: number): ScreenNavigationPlan {
  const raw = object(value);
  const text = (value: unknown, field: string, max = 240) => {
    const result = string(value).trim();
    if (!result || result.length > max) throw new Error(`Navigation requires a concise ${field}.`);
    return result;
  };
  if (!['fixed', 'sticky', 'flow'].includes(string(raw.position))) throw new Error('Plan whether navigation is fixed, sticky or in page flow.');
  const inset = Number(raw.contentInsetBottom);
  if (typeof raw.contentInsetBottom !== 'number' || !Number.isFinite(inset) || inset < 0 || inset > viewportHeight) throw new Error('Plan a valid logical bottom content inset.');
  if (!Array.isArray(raw.tabs) || !raw.tabs.length || raw.tabs.length > 12) throw new Error('Map every navigation tab to its destination.');
  const tabs = raw.tabs.map(value => {
    const tab = object(value);
    if (!['observed', 'inferred'].includes(string(tab.basis))) throw new Error('Distinguish observed navigation destinations from inferred ones.');
    const controlSelector = text(tab.controlSelector, 'tab control selector'), viewSelector = text(tab.viewSelector, 'destination view selector');
    if (controlSelector === viewSelector) throw new Error('A tab label is not its destination view.');
    return { id: text(tab.id, 'tab id', 80), label: text(tab.label, 'visible tab label', 120), destination: text(tab.destination, 'tab destination'), basis: tab.basis as 'observed' | 'inferred', controlSelector, viewSelector, expectedText: text(tab.expectedText, 'destination text', 400) };
  });
  if (new Set(tabs.map(tab => tab.id)).size !== tabs.length) throw new Error('Use distinct navigation tab ids.');
  const activeTabId = text(raw.activeTabId, 'active tab id', 80);
  if (!tabs.some(tab => tab.id === activeTabId)) throw new Error('The active navigation tab must exist in the tab map.');
  return { position: raw.position as ScreenNavigationPlan['position'], scrollRegionSelector: text(raw.scrollRegionSelector, 'actual scrolling region selector'), contentInsetBottom: inset, activeTabId, tabs };
}
