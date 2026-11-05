/** Criterion IDs/titles/levels derived from W3C WCAG 2.1 and 2.2 Recommendations.
 * W3C copyright 2020–2025; https://www.w3.org/copyright/document-license/.
 * Operational review guidance is Northstar-authored; normative exceptions stay at W3C. */
export type WcagTarget = '2.1' | '2.2';
export interface WcagCriterion {id:string;title:string;level:'A'|'AA';anchor:string;versions:WcagTarget[]}
export const WCAG_CRITERIA:readonly WcagCriterion[] = [
  {
    "id": "1.1.1",
    "title": "Non-text Content",
    "level": "A",
    "anchor": "non-text-content",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.2.1",
    "title": "Audio-only and Video-only (Prerecorded)",
    "level": "A",
    "anchor": "audio-only-and-video-only-prerecorded",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.2.2",
    "title": "Captions (Prerecorded)",
    "level": "A",
    "anchor": "captions-prerecorded",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.2.3",
    "title": "Audio Description or Media Alternative (Prerecorded)",
    "level": "A",
    "anchor": "audio-description-or-media-alternative-prerecorded",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.2.4",
    "title": "Captions (Live)",
    "level": "AA",
    "anchor": "captions-live",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.2.5",
    "title": "Audio Description (Prerecorded)",
    "level": "AA",
    "anchor": "audio-description-prerecorded",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.3.1",
    "title": "Info and Relationships",
    "level": "A",
    "anchor": "info-and-relationships",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.3.2",
    "title": "Meaningful Sequence",
    "level": "A",
    "anchor": "meaningful-sequence",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.3.3",
    "title": "Sensory Characteristics",
    "level": "A",
    "anchor": "sensory-characteristics",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.3.4",
    "title": "Orientation",
    "level": "AA",
    "anchor": "orientation",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.3.5",
    "title": "Identify Input Purpose",
    "level": "AA",
    "anchor": "identify-input-purpose",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.1",
    "title": "Use of Color",
    "level": "A",
    "anchor": "use-of-color",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.2",
    "title": "Audio Control",
    "level": "A",
    "anchor": "audio-control",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.3",
    "title": "Contrast (Minimum)",
    "level": "AA",
    "anchor": "contrast-minimum",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.4",
    "title": "Resize Text",
    "level": "AA",
    "anchor": "resize-text",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.5",
    "title": "Images of Text",
    "level": "AA",
    "anchor": "images-of-text",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.10",
    "title": "Reflow",
    "level": "AA",
    "anchor": "reflow",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.11",
    "title": "Non-text Contrast",
    "level": "AA",
    "anchor": "non-text-contrast",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.12",
    "title": "Text Spacing",
    "level": "AA",
    "anchor": "text-spacing",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "1.4.13",
    "title": "Content on Hover or Focus",
    "level": "AA",
    "anchor": "content-on-hover-or-focus",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.1.1",
    "title": "Keyboard",
    "level": "A",
    "anchor": "keyboard",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.1.2",
    "title": "No Keyboard Trap",
    "level": "A",
    "anchor": "no-keyboard-trap",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.1.4",
    "title": "Character Key Shortcuts",
    "level": "A",
    "anchor": "character-key-shortcuts",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.2.1",
    "title": "Timing Adjustable",
    "level": "A",
    "anchor": "timing-adjustable",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.2.2",
    "title": "Pause, Stop, Hide",
    "level": "A",
    "anchor": "pause-stop-hide",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.3.1",
    "title": "Three Flashes or Below Threshold",
    "level": "A",
    "anchor": "three-flashes-or-below-threshold",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.4.1",
    "title": "Bypass Blocks",
    "level": "A",
    "anchor": "bypass-blocks",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.4.2",
    "title": "Page Titled",
    "level": "A",
    "anchor": "page-titled",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.4.3",
    "title": "Focus Order",
    "level": "A",
    "anchor": "focus-order",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.4.4",
    "title": "Link Purpose (In Context)",
    "level": "A",
    "anchor": "link-purpose-in-context",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.4.5",
    "title": "Multiple Ways",
    "level": "AA",
    "anchor": "multiple-ways",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.4.6",
    "title": "Headings and Labels",
    "level": "AA",
    "anchor": "headings-and-labels",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.4.7",
    "title": "Focus Visible",
    "level": "AA",
    "anchor": "focus-visible",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.5.1",
    "title": "Pointer Gestures",
    "level": "A",
    "anchor": "pointer-gestures",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.5.2",
    "title": "Pointer Cancellation",
    "level": "A",
    "anchor": "pointer-cancellation",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.5.3",
    "title": "Label in Name",
    "level": "A",
    "anchor": "label-in-name",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.5.4",
    "title": "Motion Actuation",
    "level": "A",
    "anchor": "motion-actuation",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.1.1",
    "title": "Language of Page",
    "level": "A",
    "anchor": "language-of-page",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.1.2",
    "title": "Language of Parts",
    "level": "AA",
    "anchor": "language-of-parts",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.2.1",
    "title": "On Focus",
    "level": "A",
    "anchor": "on-focus",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.2.2",
    "title": "On Input",
    "level": "A",
    "anchor": "on-input",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.2.3",
    "title": "Consistent Navigation",
    "level": "AA",
    "anchor": "consistent-navigation",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.2.4",
    "title": "Consistent Identification",
    "level": "AA",
    "anchor": "consistent-identification",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.3.1",
    "title": "Error Identification",
    "level": "A",
    "anchor": "error-identification",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.3.2",
    "title": "Labels or Instructions",
    "level": "A",
    "anchor": "labels-or-instructions",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.3.3",
    "title": "Error Suggestion",
    "level": "AA",
    "anchor": "error-suggestion",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "3.3.4",
    "title": "Error Prevention (Legal, Financial, Data)",
    "level": "AA",
    "anchor": "error-prevention-legal-financial-data",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "4.1.1",
    "title": "Parsing",
    "level": "A",
    "anchor": "parsing",
    "versions": [
      "2.1"
    ]
  },
  {
    "id": "4.1.2",
    "title": "Name, Role, Value",
    "level": "A",
    "anchor": "name-role-value",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "4.1.3",
    "title": "Status Messages",
    "level": "AA",
    "anchor": "status-messages",
    "versions": [
      "2.1",
      "2.2"
    ]
  },
  {
    "id": "2.4.11",
    "title": "Focus Not Obscured (Minimum)",
    "level": "AA",
    "anchor": "focus-not-obscured-minimum",
    "versions": [
      "2.2"
    ]
  },
  {
    "id": "2.5.7",
    "title": "Dragging Movements",
    "level": "AA",
    "anchor": "dragging-movements",
    "versions": [
      "2.2"
    ]
  },
  {
    "id": "2.5.8",
    "title": "Target Size (Minimum)",
    "level": "AA",
    "anchor": "target-size-minimum",
    "versions": [
      "2.2"
    ]
  },
  {
    "id": "3.2.6",
    "title": "Consistent Help",
    "level": "A",
    "anchor": "consistent-help",
    "versions": [
      "2.2"
    ]
  },
  {
    "id": "3.3.7",
    "title": "Redundant Entry",
    "level": "A",
    "anchor": "redundant-entry",
    "versions": [
      "2.2"
    ]
  },
  {
    "id": "3.3.8",
    "title": "Accessible Authentication (Minimum)",
    "level": "AA",
    "anchor": "accessible-authentication-minimum",
    "versions": [
      "2.2"
    ]
  }
];
export function wcagCriteria(target:WcagTarget='2.2'){return WCAG_CRITERIA.filter(item=>item.versions.includes(target)).sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));}
export function wcagCriterionUrl(criterion:WcagCriterion,target:WcagTarget){return `https://www.w3.org/TR/WCAG${target.replace('.','')}/#${criterion.anchor}`;}
