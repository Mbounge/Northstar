export type CanvasV2ArtifactTheme = "light" | "dark";

interface StoredStyle {
  value: string;
  priority: string;
  appliedValue: string;
  backgroundShorthand?: string;
  backgroundPriority?: string;
}

interface CanvasV2Color {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface CanvasV2ArtifactThemeState {
  originals: Map<Element, Map<string, StoredStyle>>;
}

// Backgrounds are themed before foregrounds so the contrast compiler always
// evaluates ink, rules, and vectors against the surface that will actually be
// visible. Opacity is the final readability floor after every authored color.
const THEMED_PROPERTIES = [
  "background-color",
  "color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "fill",
  "stroke",
  "opacity",
] as const;

const MEDIA_TAGS = new Set(["IMG", "VIDEO", "CANVAS", "PICTURE", "SOURCE"]);
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HOST_BACKGROUND: Record<CanvasV2ArtifactTheme, CanvasV2Color> = {
  light: { red: 250, green: 251, blue: 255, alpha: 1 },
  dark: { red: 13, green: 14, blue: 22, alpha: 1 },
};
const HOST_INK: Record<CanvasV2ArtifactTheme, CanvasV2Color> = {
  light: { red: 21, green: 22, blue: 32, alpha: 1 },
  dark: { red: 244, green: 243, blue: 248, alpha: 1 },
};

export function createCanvasV2ArtifactThemeState(): CanvasV2ArtifactThemeState {
  return { originals: new Map() };
}

function restoreTheme(state: CanvasV2ArtifactThemeState): void {
  state.originals.forEach((properties, element) => {
    const style = (element as HTMLElement | SVGElement).style;
    properties.forEach((stored, property) => {
      // The public native scene is reconciled by React between theme passes.
      // If React has already committed a new authored value, restoring the
      // previous pass's original here would overwrite that fresh canvas edit
      // (for example, a solid fill becoming a translucent tinted fill).
      // Only unwind an override while the exact override we installed still
      // owns the live property.
      if (style.getPropertyValue(property).trim() !== stored.appliedValue.trim()) return;
      if (stored.value) style.setProperty(property, stored.value, stored.priority);
      else if (property === "background-color" && stored.backgroundShorthand) style.setProperty("background", stored.backgroundShorthand, stored.backgroundPriority);
      else style.removeProperty(property);
    });
  });
  state.originals.clear();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function channel(value: string): number {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return value.trim().endsWith("%") ? clamp(numeric * 2.55, 0, 255) : clamp(numeric, 0, 255);
}

function alphaChannel(value: string | undefined): number {
  if (value === undefined) return 1;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return value.trim().endsWith("%") ? clamp(numeric / 100, 0, 1) : clamp(numeric, 0, 1);
}

function parseHexColor(value: string): CanvasV2Color | undefined {
  const match = value.trim().match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!match) return undefined;
  const hex = match[1];
  const expanded = hex.length <= 4 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
  return {
    red: Number.parseInt(expanded.slice(0, 2), 16),
    green: Number.parseInt(expanded.slice(2, 4), 16),
    blue: Number.parseInt(expanded.slice(4, 6), 16),
    alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbColor(value: string): CanvasV2Color | undefined {
  const match = value.trim().match(/^rgba?\(\s*([^,\s/]+)(?:\s*,\s*|\s+)([^,\s/]+)(?:\s*,\s*|\s+)([^,\s/]+)(?:\s*(?:,|\/)\s*([^\s)]+))?\s*\)$/i);
  if (!match) return undefined;
  const parsed = {
    red: channel(match[1]),
    green: channel(match[2]),
    blue: channel(match[3]),
    alpha: alphaChannel(match[4]),
  };
  return Object.values(parsed).every(Number.isFinite) ? parsed : undefined;
}

function parseColor(value: string): CanvasV2Color | undefined {
  if (!value || value.trim().toLowerCase() === "transparent") return undefined;
  return parseHexColor(value) ?? parseRgbColor(value);
}

function serializeColor(color: CanvasV2Color): string {
  const red = Math.round(clamp(color.red, 0, 255));
  const green = Math.round(clamp(color.green, 0, 255));
  const blue = Math.round(clamp(color.blue, 0, 255));
  const alpha = clamp(color.alpha, 0, 1);
  return alpha >= 0.999
    ? `rgb(${red} ${green} ${blue})`
    : `rgba(${red},${green},${blue},${Number(alpha.toFixed(3))})`;
}

function composite(foreground: CanvasV2Color, background: CanvasV2Color): CanvasV2Color {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha <= 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
  return {
    red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
    green: (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
    blue: (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
    alpha,
  };
}

function mixColor(from: CanvasV2Color, to: CanvasV2Color, amount: number): CanvasV2Color {
  const weight = clamp(amount, 0, 1);
  return {
    red: from.red * (1 - weight) + to.red * weight,
    green: from.green * (1 - weight) + to.green * weight,
    blue: from.blue * (1 - weight) + to.blue * weight,
    alpha: from.alpha * (1 - weight) + to.alpha * weight,
  };
}

function linearChannel(value: number): number {
  const normalized = clamp(value, 0, 255) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: CanvasV2Color): number {
  return linearChannel(color.red) * 0.2126 + linearChannel(color.green) * 0.7152 + linearChannel(color.blue) * 0.0722;
}

export function canvasV2ContrastRatio(foreground: string, background: string): number | undefined {
  const parsedForeground = parseColor(foreground);
  const parsedBackground = parseColor(background);
  if (!parsedForeground || !parsedBackground) return undefined;
  const visibleForeground = composite(parsedForeground, { ...parsedBackground, alpha: 1 });
  const foregroundLuminance = luminance(visibleForeground);
  const backgroundLuminance = luminance(parsedBackground);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
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

function ensureContrast(value: string, background: string, minimumRatio: number, theme: CanvasV2ArtifactTheme): string | undefined {
  const foreground = parseColor(value);
  const parsedBackground = parseColor(background);
  if (!foreground || !parsedBackground || foreground.alpha === 0) return undefined;
  const currentRatio = canvasV2ContrastRatio(value, background);
  if (currentRatio !== undefined && currentRatio >= minimumRatio) return undefined;

  const target = HOST_INK[theme];
  for (let step = 1; step <= 24; step += 1) {
    const candidate = { ...mixColor({ ...foreground, alpha: 1 }, target, step / 24), alpha: 1 };
    const serialized = serializeColor(candidate);
    if ((canvasV2ContrastRatio(serialized, background) ?? 0) >= minimumRatio) return serialized;
  }
  return serializeColor(target);
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

export function canvasV2ThemeForegroundColor(
  value: string,
  background: string,
  theme: CanvasV2ArtifactTheme,
  minimumRatio = 4.5,
): string | undefined {
  const semanticNeutral = canvasV2ThemeTextColor(value, theme);
  const candidate = semanticNeutral ?? value;
  return ensureContrast(candidate, background, minimumRatio, theme) ?? semanticNeutral;
}

export function canvasV2ThemeRuleColor(
  value: string,
  background: string,
  theme: CanvasV2ArtifactTheme,
  minimumRatio = 1.5,
): string | undefined {
  const semanticRule = theme === "dark" ? darkRule(value) : lightRule(value);
  const candidate = semanticRule ?? value;
  return ensureContrast(candidate, background, minimumRatio, theme) ?? semanticRule;
}

export function canvasV2ThemeSurfaceColor(
  value: string,
  theme: CanvasV2ArtifactTheme,
  directCanvasSurface = false,
  earnedSurface = false,
): string | undefined {
  const color = colorFacts(value);
  if (!color || color.alpha === 0) return undefined;
  if (directCanvasSurface && !earnedSurface && color.neutral && (color.brightness <= 115 || color.brightness >= 175)) return "transparent";

  // Translucent washes are spatial accents rather than solid surfaces. Their
  // visible result is already evaluated when descendant foregrounds are
  // compiled, and promoting one to an opaque counterpart would manufacture a
  // card the author never asked for. Only solid/near-solid surfaces cross the
  // surface-remapping boundary.
  if (color.alpha < 0.72) return undefined;

  const semanticSurface = theme === "dark" ? darkSurface(value) : lightSurface(value);
  const candidate = semanticSurface ?? value;
  const background = serializeColor(HOST_BACKGROUND[theme]);
  return ensureContrast(candidate, background, 1.12, theme) ?? semanticSurface;
}

function hasDirectText(element: Element): boolean {
  return Array.from(element.childNodes).some((node) => node.nodeType === 3 && Boolean(node.textContent?.trim()));
}

function themedValue(
  element: Element,
  property: string,
  value: string,
  theme: CanvasV2ArtifactTheme,
  background: string,
): string | undefined {
  if (!value || value === "none" || value === "currentcolor" || value === "transparent" || value === "rgba(0, 0, 0, 0)") return undefined;
  if (property === "opacity") return canvasV2ReadableThemeTextOpacity(value, hasDirectText(element));
  if (property === "background-color") {
    const directSurfaceRegion = element.hasAttribute("data-canvas-v2-design-region")
      || element.getAttribute("data-canvas-v2-evidence-region") === "canonical"
      || element.getAttribute("data-canvas-v2-node-id") === "canvas"
      || element.tagName === "HTML"
      || element.tagName === "BODY";
    const earnedSurface = element.getAttribute("data-canvas-v2-surface-treatment") === "earned-card";
    return canvasV2ThemeSurfaceColor(value, theme, directSurfaceRegion, earnedSurface);
  }

  if (property === "color") return canvasV2ThemeForegroundColor(value, background, theme);
  if (property === "fill" || property === "stroke") {
    if (element.namespaceURI !== SVG_NAMESPACE) return undefined;
    // Connector-label strokes are a background halo, not a foreground rule.
    // Applying text contrast to the halo paints over the readable glyphs.
    if (property === "stroke" && element.getAttribute("data-canvas-v2-connector-part") === "label" && element.getAttribute("data-canvas-v2-label-background") !== "true") return serializeColor(HOST_BACKGROUND[theme]);
    const textVector = element.tagName === "text" || element.tagName === "tspan";
    const semanticVector = theme === "dark" ? darkVector(value) : lightVector(value);
    const candidate = semanticVector ?? value;
    return ensureContrast(candidate, background, textVector ? 4.5 : 1.8, theme) ?? semanticVector;
  }
  if (property === "caret-color" || property === "outline-color") {
    return canvasV2ThemeForegroundColor(value, background, theme, 3);
  }
  return canvasV2ThemeRuleColor(value, background, theme);
}

function themeElements(
  elements: Element[],
  view: Window,
  theme: CanvasV2ArtifactTheme,
  state: CanvasV2ArtifactThemeState,
): void {
  restoreTheme(state);
  const visibleBackgrounds = new Map<Element, CanvasV2Color>();

  elements.forEach((element) => {
    // Preservation is deliberately leaf-local. A malformed container marker
    // must never exempt an island's readable descendants from the host theme.
    if (MEDIA_TAGS.has(element.tagName) || element.getAttribute("data-canvas-v2-theme-preserve") === "true") return;
    const computed = view.getComputedStyle(element);
    const authoredValues = new Map(THEMED_PROPERTIES.map((property) => [property, computed.getPropertyValue(property).trim()]));
    const original = new Map<string, StoredStyle>();
    const style = (element as HTMLElement | SVGElement).style;
    const applyProperty = (property: string, next: string | undefined) => {
      if (!next) return;
      original.set(property, { value: style.getPropertyValue(property), priority: style.getPropertyPriority(property), appliedValue: next, ...(property === "background-color" ? { backgroundShorthand: style.getPropertyValue("background"), backgroundPriority: style.getPropertyPriority("background") } : {}) });
      // Authored compositions may contain stylesheet declarations marked
      // !important. Theme and contrast are host invariants, so this final
      // scoped override intentionally outranks authored presentation CSS.
      style.setProperty(property, next, "important");
    };

    const authoredBackground = authoredValues.get("background-color") ?? "";
    applyProperty("background-color", themedValue(element, "background-color", authoredBackground, theme, serializeColor(HOST_BACKGROUND[theme])));

    const inheritedBackground = visibleBackgrounds.get(element.parentElement ?? element) ?? HOST_BACKGROUND[theme];
    const ownBackground = parseColor(view.getComputedStyle(element).backgroundColor);
    const visibleBackground = ownBackground && ownBackground.alpha > 0
      ? composite(ownBackground, inheritedBackground)
      : inheritedBackground;
    visibleBackgrounds.set(element, visibleBackground);
    const serializedBackground = serializeColor({ ...visibleBackground, alpha: 1 });

    THEMED_PROPERTIES.slice(1).forEach((property) => {
      applyProperty(property, themedValue(element, property, authoredValues.get(property) ?? "", theme, serializedBackground));
    });
    if (original.size) state.originals.set(element, original);
  });
}

/**
 * Applies the host theme to an authored artifact without rewriting its source.
 * Every solid authored color is evaluated against its actual visible surface.
 * Compatible colors remain literal; incompatible neutrals, accents, rules,
 * vectors, and surfaces receive a reversible theme-local counterpart.
 */
export function applyCanvasV2ArtifactTheme(
  frameDocument: Document,
  theme: CanvasV2ArtifactTheme,
  state: CanvasV2ArtifactThemeState,
): void {
  restoreTheme(state);
  frameDocument.documentElement.dataset.canvasV2Theme = theme;
  // The iframe is a transparent layer of the host workspace, not a nested
  // document/page. A dark browser color-scheme gives transparent pixels an
  // opaque black backing in WebKit and Chromium, so compositing stays light.
  frameDocument.documentElement.style.colorScheme = "light";
  const view = frameDocument.defaultView;
  if (!view) return;
  const elements = [frameDocument.documentElement, frameDocument.body, ...Array.from(frameDocument.body.querySelectorAll<Element>("*"))];
  themeElements(elements, view, theme, state);
}

/** Applies the same invariant to the public editable native scene. */
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
