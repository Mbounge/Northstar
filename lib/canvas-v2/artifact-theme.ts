export type CanvasV2ArtifactTheme = "light" | "dark";

interface StoredStyle {
  value: string;
  priority: string;
}

export interface CanvasV2ArtifactThemeState {
  originals: Map<Element, Map<string, StoredStyle>>;
}

const THEMED_PROPERTIES = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "fill",
  "stroke",
  "opacity",
] as const;

const MEDIA_TAGS = new Set(["IMG", "VIDEO", "CANVAS", "PICTURE", "SOURCE"]);

export function createCanvasV2ArtifactThemeState(): CanvasV2ArtifactThemeState {
  return { originals: new Map() };
}

function restoreTheme(state: CanvasV2ArtifactThemeState): void {
  state.originals.forEach((properties, element) => {
    const style = (element as HTMLElement | SVGElement).style;
    properties.forEach((stored, property) => {
      if (stored.value) style.setProperty(property, stored.value, stored.priority);
      else style.removeProperty(property);
    });
  });
  state.originals.clear();
}

function themeElements(
  elements: Element[],
  view: Window,
  theme: CanvasV2ArtifactTheme,
  state: CanvasV2ArtifactThemeState,
): void {
  restoreTheme(state);

  elements.forEach((element) => {
    if (MEDIA_TAGS.has(element.tagName) || element.getAttribute("data-canvas-v2-theme-preserve") === "true") return;
    const computed = view.getComputedStyle(element);
    const original = new Map<string, StoredStyle>();
    const style = (element as HTMLElement | SVGElement).style;
    THEMED_PROPERTIES.forEach((property) => {
      const next = themedValue(element, property, computed, theme);
      if (!next) return;
      original.set(property, { value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) });
      // Authored compositions may contain stylesheet declarations marked
      // !important. The visible native scene must still obey the workspace
      // theme, so the final scoped override is intentionally inline-important.
      style.setProperty(property, next, "important");
    });
    if (original.size) state.originals.set(element, original);
  });
}

function parseColor(value: string): { red: number; green: number; blue: number; alpha: number } | undefined {
  const match = value.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (!match) return undefined;
  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function colorFacts(value: string) {
  const parsed = parseColor(value);
  if (!parsed || parsed.alpha === 0) return undefined;
  const channels = [parsed.red, parsed.green, parsed.blue];
  return {
    ...parsed,
    brightness: parsed.red * 0.2126 + parsed.green * 0.7152 + parsed.blue * 0.0722,
    neutral: Math.max(...channels) - Math.min(...channels) <= 28,
  };
}

function darkText(value: string): string | undefined {
  const color = colorFacts(value);
  if (!color || !color.neutral || color.brightness >= 205) return undefined;
  if (color.brightness < 70) return "#f4f3f8";
  if (color.brightness < 150) return "#dedbe5";
  return "#c7c3cf";
}

function darkSurface(value: string): string | undefined {
  const color = colorFacts(value);
  if (!color || color.brightness < 175) return undefined;
  if (color.neutral) {
    if (color.brightness >= 246) return "#1b1a22";
    if (color.brightness >= 226) return "#211f28";
    return "#292731";
  }
  const base = { red: 24, green: 23, blue: 31 };
  const tint = 0.13;
  return `rgb(${Math.round(base.red * (1 - tint) + color.red * tint)} ${Math.round(base.green * (1 - tint) + color.green * tint)} ${Math.round(base.blue * (1 - tint) + color.blue * tint)})`;
}

function darkRule(value: string): string | undefined {
  const color = colorFacts(value);
  if (!color || color.brightness < 135) return undefined;
  return color.neutral ? "rgba(255,255,255,.12)" : darkSurface(value);
}

function darkVector(value: string): string | undefined {
  const color = colorFacts(value);
  if (!color || !color.neutral || color.brightness >= 205) return undefined;
  return color.brightness < 120 ? "#f0eef5" : "#aaa6b4";
}

function lightText(value: string): string | undefined {
  const color = colorFacts(value);
  if (!color || !color.neutral || color.brightness <= 155) return undefined;
  if (color.brightness > 226) return "#151620";
  if (color.brightness > 195) return "#555968";
  return "#737686";
}

function lightSurface(value: string): string | undefined {
  const color = colorFacts(value);
  if (!color || color.brightness > 115) return undefined;
  if (color.neutral) {
    if (color.brightness < 35) return "#ffffff";
    if (color.brightness < 72) return "#f7f6fa";
    return "#efedf4";
  }
  const base = { red: 250, green: 250, blue: 253 };
  const tint = 0.12;
  return `rgb(${Math.round(base.red * (1 - tint) + color.red * tint)} ${Math.round(base.green * (1 - tint) + color.green * tint)} ${Math.round(base.blue * (1 - tint) + color.blue * tint)})`;
}

function lightRule(value: string): string | undefined {
  const color = colorFacts(value);
  if (!color || color.brightness > 155) return undefined;
  return color.neutral ? "rgba(21,22,32,.16)" : lightSurface(value);
}

function lightVector(value: string): string | undefined {
  const color = colorFacts(value);
  if (!color || !color.neutral || color.brightness <= 155) return undefined;
  return color.brightness > 215 ? "#151620" : "#555968";
}

export function canvasV2ReadableDarkTextOpacity(value: string, hasText: boolean): string | undefined {
  const opacity = Number(value);
  return hasText && Number.isFinite(opacity) && opacity < 0.72 ? "0.72" : undefined;
}

export function canvasV2ReadableThemeTextOpacity(value: string, hasText: boolean): string | undefined {
  return canvasV2ReadableDarkTextOpacity(value, hasText);
}

export function canvasV2ThemeTextColor(value: string, theme: CanvasV2ArtifactTheme): string | undefined {
  return theme === "dark" ? darkText(value) : lightText(value);
}

function themedValue(element: Element, property: string, computed: CSSStyleDeclaration, theme: CanvasV2ArtifactTheme): string | undefined {
  const value = computed.getPropertyValue(property).trim();
  if (!value || value === "none" || value === "currentcolor") return undefined;
  if (property === "opacity") {
    // Editorial compositions commonly use low opacity to create hierarchy on
    // white. The same value compounds with muted ink on the dark workspace and
    // can make captions effectively disappear. Preserve hierarchy, but enforce
    // a readable floor for any authored region that carries text.
    return canvasV2ReadableThemeTextOpacity(value, Boolean(element.textContent?.trim()));
  }
  if (property === "color") return canvasV2ThemeTextColor(value, theme);
  if (property === "background-color") {
    const color = colorFacts(value);
    const directSurfaceRegion = element.hasAttribute("data-canvas-v2-design-region")
      || element.getAttribute("data-canvas-v2-evidence-region") === "canonical"
      || element.getAttribute("data-canvas-v2-node-id") === "canvas"
      || element.tagName === "HTML"
      || element.tagName === "BODY";
    if (theme === "dark") {
      if (directSurfaceRegion && color?.neutral && color.brightness >= 226) return "transparent";
      return darkSurface(value);
    }
    if (directSurfaceRegion && color?.neutral && color.brightness <= 115) return "transparent";
    return lightSurface(value);
  }
  if (property === "fill" || property === "stroke") return theme === "dark" ? darkVector(value) : lightVector(value);
  return theme === "dark" ? darkRule(value) : lightRule(value);
}

/**
 * Applies the host theme to an authored artifact without rewriting its source.
 * Saturated product and accent colors remain intact; only neutral ink, surfaces,
 * rules, and vector marks receive an accessible counterpart for the active host
 * theme. This is bidirectional because a composition may have been authored
 * while either theme was active and must remain readable after switching.
 */
export function applyCanvasV2ArtifactTheme(
  frameDocument: Document,
  theme: CanvasV2ArtifactTheme,
  state: CanvasV2ArtifactThemeState,
): void {
  restoreTheme(state);
  frameDocument.documentElement.dataset.canvasV2Theme = theme;
  // The iframe is a transparent layer of the host workspace, not a nested
  // document/page. Keep its browser compositing surface light/transparent and
  // theme only authored elements and North Star tokens below. Switching the
  // iframe itself to a dark color-scheme gives transparent pixels an opaque
  // black backing in WebKit and Chromium.
  frameDocument.documentElement.style.colorScheme = "light";
  const view = frameDocument.defaultView;
  if (!view) return;
  const elements = [frameDocument.documentElement, frameDocument.body, ...Array.from(frameDocument.body.querySelectorAll<Element>("*"))];
  themeElements(elements, view, theme, state);
}

/**
 * Applies the artifact theme to the public native scene only. This second pass
 * is required because authored stylesheet rules are re-mounted beside the
 * native nodes and can otherwise override the compiler's themed inline style.
 */
export function applyCanvasV2ArtifactThemeToElement(
  root: Element,
  theme: CanvasV2ArtifactTheme,
  state: CanvasV2ArtifactThemeState,
): void {
  root.setAttribute("data-canvas-v2-theme", theme);
  const view = root.ownerDocument.defaultView;
  if (!view) {
    restoreTheme(state);
    return;
  }
  themeElements([root, ...Array.from(root.querySelectorAll<Element>("*"))], view, theme, state);
}
