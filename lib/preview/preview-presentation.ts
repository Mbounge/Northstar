import { graetPreviewSections, GRAET_PREVIEW_NAVIGATE, GRAET_PREVIEW_SECTION } from './graet-navigation';
import { meditoSimulationSections } from './medito-simulation';

export type PreviewSectionIcon = 'compass' | 'home' | 'search' | 'sparkles' | 'chat' | 'profile' | 'mail' | 'sliders' | 'bell' | 'timer' | 'heart';
export type AppPreviewPresentation = {
  sections: Array<{ id: string; label: string; icon: PreviewSectionIcon }>;
  initialSection: string;
  navigateMessage: string;
  sectionMessage: string;
  navigationHint: string;
  scope?: string;
  rawViewport?: { width: number; height: number; scale: number };
};

const graetIcons = ['compass', 'home', 'search', 'sparkles', 'chat', 'profile'] as const;
const meditoIcons = ['compass', 'mail', 'sliders', 'bell', 'timer', 'heart', 'home'] as const;
const presentations: Record<string, AppPreviewPresentation> = {
  graet: {
    sections: graetPreviewSections.map((section, index) => ({ id: section.id, label: section.label, icon: graetIcons[index] })),
    initialSection: 'onboarding', navigateMessage: GRAET_PREVIEW_NAVIGATE, sectionMessage: GRAET_PREVIEW_SECTION,
    navigationHint: 'Jump to any part of GRAET',
  },
  medito: {
    sections: meditoSimulationSections.map((section, index) => ({ id: section.screen, label: section.label, icon: meditoIcons[index] })),
    initialSection: 'welcome', navigateMessage: 'northstar:medito-preview-navigate', sectionMessage: 'northstar:medito-preview-section',
    navigationHint: 'Explore the captured Medito journey', scope: 'Captured onboarding and Home only.',
    rawViewport: { width: 360, height: 800, scale: 0.75 },
  },
};

/** App configuration supplies content and protocol; the company-page layout is shared. */
export function previewPresentationForApp(appName: string): AppPreviewPresentation | null {
  return presentations[appName.trim().toLocaleLowerCase('en-US')] ?? null;
}
