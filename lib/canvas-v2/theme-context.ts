import type { CanvasV2ArtifactTheme } from './artifact-theme';

/** Shared by the editable canvas, private renders and model-facing context. */
export const CANVAS_V2_THEME_TOKENS = {
  light: {
    '--northstar-ink': '#151620', '--northstar-muted': '#5d6070',
    '--northstar-violet': '#5f49e8', '--northstar-line': 'rgba(66,54,123,.22)',
    '--northstar-surface': '#ffffff', '--northstar-surface-subtle': '#f6f5fa',
    '--northstar-note-surface': '#fff2a8', '--northstar-note-ink': '#332e1e',
    '--northstar-note-line': '#d8bd51', '--northstar-note-shadow': 'rgba(71,59,10,.12)',
  },
  dark: {
    '--northstar-ink': '#f4f3f8', '--northstar-muted': '#c7c3cf',
    '--northstar-violet': '#9d8cff', '--northstar-line': 'rgba(255,255,255,.12)',
    '--northstar-surface': '#1b1a22', '--northstar-surface-subtle': '#23212b',
    '--northstar-note-surface': '#3a3218', '--northstar-note-ink': '#fff0b8',
    '--northstar-note-line': '#8f7a31', '--northstar-note-shadow': 'rgba(0,0,0,.28)',
  },
} as const;

export function canvasV2ThemeTokenCss(theme: CanvasV2ArtifactTheme): string {
  return Object.entries(CANVAS_V2_THEME_TOKENS[theme]).map(([name, value]) => `${name}:${value};`).join('\n');
}

export function canvasV2ModelThemeContext(theme: CanvasV2ArtifactTheme) {
  return { current: theme, palettes: CANVAS_V2_THEME_TOKENS,
    guidance: 'Author for the current theme and theme switching. Use host variables for neutral text, surfaces and rules; do not redefine them. Use local light/dark variables for accents when needed, selected with :root[data-canvas-v2-theme="dark"]. Keep readable text separate from literal color swatches. Solid-color contrast repair is a fallback, not proof that every palette is compatible. Images, screenshots, gradients, patterns and literal brand swatches are not automatically recolored; use compatible surrounding surfaces and labels. Do not alter evidence pixels to match a theme.' };
}
