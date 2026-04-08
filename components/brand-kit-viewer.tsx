"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface ColorEntry {
  hex: string;
  label: string;
  semantic_role: string;
  confidence?: string;
  used_for?: string;
  apk_token?: string;
  primary_token?: string;
  theme_roles?: string[];
  all_tokens?: string[];
  source?: string;
  bundle_reference_count?: number;
  evidence?: string;
  where_used?: string;
}

export interface BrandKit {
  color_system?: {
    canonical_palette?: ColorEntry[];
    background_system?: Record<string, string>;
    text_system?: Record<string, string>;
    state_colors?: Record<string, string>;
    gamification_colors?: string[];
    color_harmony?: string;
    color_temperature?: string;
    brand_color_personality?: string;
  };
  typography_system?: {
    primary_font?: string;
    secondary_font?: string;
    font_source?: string;
    weight_range?: string;
    type_scale?: Record<string, string | null>;
    type_personality?: string;
    font_pairing_assessment?: string;
  };
  shape_system?: {
    dominant_corner_style?: string;
    corner_radius_primary?: string;
    button_shape_language?: string;
    card_elevation_style?: string;
    shape_personality?: string;
  };
  iconography_system?: {
    icon_style?: string;
    icon_library_guess?: string;
    icon_size_system?: string;
    icon_color_treatment?: string;
  };
  design_language_summary?: string;
  design_system_maturity?: {
    score?: number;
    assessment?: string;
    evidence?: string;
    notable_inconsistencies?: string[];
  };
  competitive_design_notes?: string;
  figma_token_export?: {
    colors?: Record<string, string>;
    typography?: Record<string, string>;
    border_radius?: Record<string, string>;
  };
}

export interface ApkColorEntry {
  hex: string;
  label: string;
  primary_token?: string;
  semantic_role?: string;
  theme_roles?: string[];
  all_tokens?: string[];
  source?: string;
  confidence?: string;
  bundle_reference_count?: number;
  evidence?: string;
  where_used?: string;
}

export interface ApkFontEntry {
  filename: string;
  font_name_clean: string;
  font_name_raw?: string;
  format?: string;
  file_size_kb?: number;
  weight_hint?: string;
  style_hint?: string;
  is_variable_font?: boolean;
  google_font_match?: string | null;
  font_url?: string | null;
}

export interface ApkIntelligence {
  schema_version?: string;
  framework?: string;
  app_metadata?: {
    package?: string;
    version_name?: string;
    version_code?: string;
    app_label?: string;
    theme_reference?: string;
  };
  color_palette?: ApkColorEntry[];
  color_token_map?: Record<string, string>;
  semantic_color_roles?: Record<string, string>;
  rn_bundle_colors?: ApkColorEntry[];
  raw_color_count?: number;
  typography?: {
    embedded_fonts?: ApkFontEntry[];
    font_families_summary?: { family_name: string; variants_found: string[]; variant_count: number }[];
    google_fonts_used?: string[];
    font_extraction_method?: string;
    notes?: string[];
  };
  icons?: {
    icon_found?: boolean;
    icon_path?: string;
    icon_url?: string;
    round_icon_url?: string;
    resolution?: string;
    dominant_colors?: ApkColorEntry[];
    adaptive_icon?: {
      found?: boolean;
      background_color?: string | null;
      foreground_url?: string | null;
    };
  };
  ai_vision_analysis?: {
    ran?: boolean;
    ai_palette?: ApkColorEntry[];
    ai_typography?: {
      primary_font_guess?: string;
      font_personality?: string;
      weight_range_observed?: string;
      font_evidence?: string;
      notable_type_treatments?: string;
    };
    ai_design_language?: {
      overall_feel?: string;
      color_temperature?: string;
      color_harmony?: string;
      corner_radius_character?: string;
      elevation_style?: string;
      iconography_style?: string;
      design_maturity?: string;
      brand_personality?: string;
    };
    ai_icon_analysis?: {
      icon_shape?: string;
      icon_background_color?: string;
      icon_foreground_description?: string;
      icon_style?: string;
    };
    designer_summary?: string;
    confidence_notes?: string;
    images_analyzed?: number;
  };
  extraction_methods_used?: string[];
  extraction_coverage?: {
    colors?: string;
    typography?: string;
    icons?: string;
    strings?: string;
    semantic_roles?: string;
    ai_vision_ran?: boolean;
    notes?: string[];
  };
}

export interface BrandKitViewerProps {
  brandKit: BrandKit;
  apkIntelligence?: ApkIntelligence;
  framework?: string;
  extractionMethods?: string;
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────

const T = {
  bgCard:    "var(--color-card, #ffffff)",
  bgMuted:   "var(--color-muted, #f4f4f5)",
  border:    "var(--color-border, #e4e4e7)",
  textPri:   "var(--color-card-foreground, #09090b)",
  textSec:   "var(--color-secondary-foreground, #18181b)",
  textMuted: "var(--color-muted-foreground, #71717a)",
  success:   "#16a34a",
  warning:   "#ca8a04",
  mono:      "ui-monospace,'Cascadia Code','Source Code Pro',monospace",
  sans:      "var(--font-sans, system-ui, sans-serif)",
  radCard:   "calc(var(--radius, 0.5rem) + 4px)",
  radMd:     "var(--radius, 0.5rem)",
  radSm:     "calc(var(--radius, 0.5rem) - 2px)",
};

// Swatch grid: how many swatches fit in ~2 rows at minmax(96px)
// We show 2 rows worth initially then let "show more" reveal the rest
const PALETTE_INITIAL_ROWS = 2;
const PALETTE_COLS = 10; // approximate columns at full width
const PALETTE_INITIAL_COUNT = PALETTE_INITIAL_ROWS * PALETTE_COLS;
const TOKEN_MAP_INITIAL_ROWS = 5; // rows visible in token map before "show more"

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function getContrast(hex: string): string {
  if (!hex || hex.length < 7) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "#111" : "#fff";
}

function confColor(c?: string): string {
  if (c === "exact" || c === "high") return "#22c55e";
  if (c === "medium") return "#f59e0b";
  return "#71717a";
}

function isHex(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("#") && v.length >= 4;
}

// ─── COPY HOOK ────────────────────────────────────────────────────────────────

function useCopy(timeout = 1500) {
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => setCopied(null), timeout);
  }, [timeout]);
  useEffect(() => () => { if (ref.current) clearTimeout(ref.current); }, []);
  return { copied, copy };
}

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radCard, padding: "16px 18px", ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: T.textMuted, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Pill({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "blue" | "amber" }) {
  const s: Record<string, React.CSSProperties> = {
    default: { background: T.bgMuted, border: `1px solid ${T.border}`, color: T.textMuted },
    blue:    { background: "#dbeafe", border: "1px solid #93c5fd",      color: "#1e40af" },
    amber:   { background: "#fef3c7", border: "1px solid #fcd34d",      color: "#92400e" },
  };
  return (
    <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, display: "inline-flex", alignItems: "center", ...s[variant] }}>
      {children}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", padding: "2px 7px", borderRadius: T.radSm, fontSize: 10, fontWeight: 500, background: T.bgMuted, color: T.textMuted, border: `1px solid ${T.border}`, margin: "2px" }}>
      {children}
    </span>
  );
}

function Sep() {
  return <div style={{ height: 1, background: T.border, margin: "10px 0" }} />;
}

function KVRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ color: T.textMuted, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.textSec, textAlign: "right" as const, maxWidth: "62%", marginLeft: 8, fontFamily: mono ? T.mono : "inherit", wordBreak: "break-all" as const }}>
        {value}
      </span>
    </div>
  );
}

// ─── SHOW MORE BUTTON ─────────────────────────────────────────────────────────

function ShowMoreBtn({ expanded, count, onClick }: { expanded: boolean; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 12,
        width: "100%",
        padding: "8px 0",
        borderRadius: T.radMd,
        border: `1px solid ${T.border}`,
        background: T.bgMuted,
        color: T.textMuted,
        fontSize: 12,
        cursor: "pointer",
        fontFamily: T.sans,
        transition: "background 0.1s",
      }}
      onMouseEnter={e => ((e.target as HTMLButtonElement).style.background = T.border)}
      onMouseLeave={e => ((e.target as HTMLButtonElement).style.background = T.bgMuted)}
    >
      {expanded ? "Show less" : `Show all ${count} →`}
    </button>
  );
}

// ─── MATURITY BAR ─────────────────────────────────────────────────────────────

function MaturityBar({ score }: { score: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (fillRef.current) fillRef.current.style.width = `${(score / 10) * 100}%`;
    }, 300);
    return () => clearTimeout(t);
  }, [score]);
  return (
    <div style={{ height: 4, borderRadius: 2, background: T.border, overflow: "hidden", margin: "8px 0 4px", position: "relative" as const }}>
      <div ref={fillRef} style={{ position: "absolute" as const, top: 0, left: 0, height: "100%", borderRadius: 2, background: T.textSec, width: "0%", transition: "width 0.8s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}

// ─── COLOR SWATCH ─────────────────────────────────────────────────────────────

function Swatch({ color }: { color: ApkColorEntry | ColorEntry }) {
  const { copied, copy } = useCopy();
  const hex = color.hex || "";
  const isCopied = copied === hex;
  const textColor = getContrast(hex);
  const roleDisplay = (color.semantic_role || "").replace(/_/g, " ").toUpperCase();

  return (
    <div
      onClick={() => copy(hex, hex)}
      title={(color as ColorEntry).used_for || color.label}
      style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, cursor: "pointer", transition: "transform 0.12s ease" }}
      onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <div style={{ height: 64, background: hex, padding: "7px 7px 0" }}>
        <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, padding: "2px 5px", borderRadius: 3, background: "rgba(255,255,255,0.18)", color: textColor, display: "inline-block", lineHeight: 1.5 }}>
          {roleDisplay || "—"}
        </span>
      </div>
      <div style={{ padding: "6px 8px 8px", background: T.bgCard }}>
        <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 500, color: isCopied ? T.success : T.textPri, marginBottom: 1 }}>
          {isCopied ? "Copied!" : hex}
        </div>
        <div style={{ fontSize: 8, color: T.textMuted, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
          {color.label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: confColor(color.confidence), flexShrink: 0 }} />
          <span style={{ fontSize: 8, color: T.textMuted }}>{color.confidence || "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── MINI COLOR ROW ───────────────────────────────────────────────────────────

function MiniRow({ label, hex, round = false, sublabel }: { label: string; hex: string; round?: boolean; sublabel?: string }) {
  const { copied, copy } = useCopy();
  const key = hex + label;
  const isCopied = copied === key;
  return (
    <div onClick={() => copy(hex, key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 7px", borderRadius: 6, background: T.bgMuted, cursor: "pointer", marginBottom: 4 }}>
      <div style={{ width: 22, height: 22, flexShrink: 0, background: hex, border: `1px solid ${T.border}`, borderRadius: round ? "50%" : 4 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.textSec }}>{label.replace(/_/g, " ")}</div>
        {sublabel && <div style={{ fontSize: 9, color: T.textMuted, fontFamily: T.mono }}>{sublabel}</div>}
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 11, color: isCopied ? T.success : T.textMuted, flexShrink: 0 }}>
        {isCopied ? "copied" : hex}
      </span>
    </div>
  );
}

// ─── DOT ROW (token map) ─────────────────────────────────────────────────────

function DotRow({ hex, label }: { hex: string; label: string }) {
  const { copied, copy } = useCopy();
  const isCopied = copied === hex + label;
  return (
    <div onClick={() => copy(hex, hex + label)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}>
      <div style={{ width: 9, height: 9, borderRadius: 2, background: hex, border: `1px solid ${T.border}`, flexShrink: 0 }} />
      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSec, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: 9, color: isCopied ? T.success : T.textMuted, flexShrink: 0 }}>{isCopied ? "copied!" : hex}</span>
    </div>
  );
}

// ─── TYPE SCALE ROW ───────────────────────────────────────────────────────────

function TypeRow({ level, spec }: { level: string; spec: string }) {
  const parts = spec.split(" / ");
  const size = Math.min(parseInt(parts[0]) || 15, 26);
  const weight = parseInt(parts[1]) || 400;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: size, fontWeight: weight, color: T.textPri, lineHeight: 1 }}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textMuted, flexShrink: 0, marginLeft: 8 }}>{spec}</span>
    </div>
  );
}

// ─── CORNER DEMO ─────────────────────────────────────────────────────────────

function CornerDemo() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 12, flexWrap: "wrap" as const }}>
      {[0, 4, 8, 12, 999].map(r => (
        <div key={r} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4 }}>
          <div style={{ width: 30, height: 30, borderRadius: r === 999 ? 999 : r, background: T.bgMuted, border: `1px solid ${T.border}` }} />
          <span style={{ fontSize: 8, color: T.textMuted, fontFamily: T.mono }}>{r === 999 ? "pill" : `${r}px`}</span>
        </div>
      ))}
    </div>
  );
}

// ─── APP ICON ─────────────────────────────────────────────────────────────────

function AppIcon({ url, appName, dominantColors }: { url?: string; appName?: string; dominantColors?: ApkColorEntry[] }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    if (dominantColors && dominantColors.length >= 4) {
      return (
        <div style={{ width: 72, height: 72, borderRadius: 16, overflow: "hidden", border: `1px solid ${T.border}`, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
          {dominantColors.slice(0, 4).map((c, i) => <div key={i} style={{ background: c.hex }} />)}
        </div>
      );
    }
    return null;
  }

  return (
    <img
      src={url}
      alt={appName ? `${appName} icon` : "App icon"}
      onError={() => setFailed(true)}
      style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", border: `1px solid ${T.border}`, flexShrink: 0 }}
    />
  );
}

// ─── FONT DOWNLOAD BUTTON ─────────────────────────────────────────────────────

function FontDownloadBtn({ font }: { font: ApkFontEntry }) {
  if (!font.font_url) return null;

  return (
    <a
      href={font.font_url}
      download={font.filename}
      onClick={e => e.stopPropagation()}
      title={`Download ${font.filename}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        padding: "2px 7px",
        borderRadius: T.radSm,
        border: `1px solid ${T.border}`,
        background: T.bgMuted,
        color: T.textMuted,
        textDecoration: "none",
        flexShrink: 0,
        transition: "background 0.1s, color 0.1s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLAnchorElement).style.background = "#d1fae5";
        (e.currentTarget as HTMLAnchorElement).style.color = "#065f46";
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "#6ee7b7";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLAnchorElement).style.background = T.bgMuted;
        (e.currentTarget as HTMLAnchorElement).style.color = T.textMuted;
        (e.currentTarget as HTMLAnchorElement).style.borderColor = T.border;
      }}
    >
      ↓ .{font.format || "ttf"}
    </a>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function BrandKitViewer({ brandKit, apkIntelligence, framework }: BrandKitViewerProps) {
  const [paletteExpanded,  setPaletteExpanded]  = useState(false);
  const [tokenMapExpanded, setTokenMapExpanded] = useState(false);

  const cs  = brandKit?.color_system          ?? {};
  const ts  = brandKit?.typography_system     ?? {};
  const ss  = brandKit?.shape_system          ?? {};
  const ico = brandKit?.iconography_system    ?? {};
  const mat = brandKit?.design_system_maturity ?? {};

  const apkMeta     = apkIntelligence?.app_metadata      ?? {};
  const apkPalette  = apkIntelligence?.color_palette     ?? [];
  const apkSemantic = apkIntelligence?.semantic_color_roles ?? {};
  const apkRnColors = apkIntelligence?.rn_bundle_colors  ?? [];
  const apkTypo     = apkIntelligence?.typography        ?? {};
  const apkIcons    = apkIntelligence?.icons             ?? {};
  const apkAi       = apkIntelligence?.ai_vision_analysis ?? {};

  // Primary palette: full extracted palette if available, else brand_kit palette
  const palette = apkPalette.length > 0 ? apkPalette : (cs.canonical_palette ?? []);
  const paletteVisible = paletteExpanded ? palette : palette.slice(0, PALETTE_INITIAL_COUNT);

  const semanticEntries = Object.entries(apkSemantic).filter(([, v]) => isHex(v));
  const aiPalette       = apkAi?.ai_palette ?? [];
  const iconColors      = apkIcons?.dominant_colors ?? [];
  const embeddedFonts   = apkTypo?.embedded_fonts ?? [];
  const fontFamilies    = apkTypo?.font_families_summary ?? [];
  const googleFonts     = apkTypo?.google_fonts_used ?? [];

  const bgEntries    = Object.entries(cs.background_system ?? {}).filter(([, v]) => isHex(v));
  const textEntries  = Object.entries(cs.text_system       ?? {}).filter(([, v]) => isHex(v));
  const stateEntries = Object.entries(cs.state_colors      ?? {}).filter(([, v]) => isHex(v));
  const gamColors    = (cs.gamification_colors ?? []).filter(isHex);
  const typeScale    = Object.entries(ts.type_scale ?? {}).filter(([, v]) => v != null) as [string, string][];
  const matScore     = mat.score ?? 0;
  const inconsistencies = mat.notable_inconsistencies ?? [];

  const tokenMap     = apkIntelligence?.color_token_map ?? {};
  const tokenEntries = Object.entries(tokenMap);
  const tokenVisible = tokenMapExpanded ? tokenEntries : tokenEntries.slice(0, TOKEN_MAP_INITIAL_ROWS * 2);

  const fwLabel = apkIntelligence?.framework
    ? ({ react_native: "React Native", flutter: "Flutter", unity: "Unity", cordova: "Cordova", xamarin: "Xamarin", native_android: "Native Android" } as Record<string, string>)[apkIntelligence.framework] ?? apkIntelligence.framework
    : framework;

  const appName  = apkMeta.app_label || apkMeta.package?.split(".").pop() || "";
  const iconUrl  = apkIcons?.icon_url;
  const hasApk   = !!apkIntelligence;

  if (!brandKit && !apkIntelligence) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320, color: T.textMuted }}>
        <p style={{ fontSize: "0.875rem" }}>No brand kit data available.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px", fontFamily: T.sans, color: T.textPri }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 18 }}>

          {(iconUrl || iconColors.length >= 4) && (
            <AppIcon url={iconUrl} appName={appName} dominantColors={iconColors} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Only show meaningful pills — framework + harmony + temperature */}
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginBottom: 12 }}>
              {fwLabel                && <Pill variant="blue">{fwLabel}</Pill>}
              {cs.color_harmony       && <Pill>{cs.color_harmony}</Pill>}
              {cs.color_temperature   && <Pill>{cs.color_temperature} temperature</Pill>}
              {palette.length > 0     && <Pill variant="amber">{palette.length} colors extracted</Pill>}
            </div>

            <h1 style={{ fontSize: "clamp(1.4rem,3vw,2rem)", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 10px" }}>
              Brand kit
            </h1>

            {(brandKit?.design_language_summary || apkAi?.designer_summary) && (
              <p style={{ fontSize: "0.875rem", lineHeight: 1.75, color: T.textMuted, maxWidth: 640, margin: 0, borderLeft: `2px solid ${T.border}`, paddingLeft: 14 }}>
                {brandKit?.design_language_summary || apkAi?.designer_summary}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── CANONICAL PALETTE (collapsible) ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel>
          Color palette{palette.length > 0 ? ` — ${palette.length} colors` : ""}
        </SectionLabel>
        {palette.length > 0 ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px,1fr))", gap: 7 }}>
              {paletteVisible.map((c, i) => <Swatch key={`${c.hex}-${i}`} color={c} />)}
            </div>
            {palette.length > PALETTE_INITIAL_COUNT && (
              <ShowMoreBtn
                expanded={paletteExpanded}
                count={palette.length}
                onClick={() => setPaletteExpanded(p => !p)}
              />
            )}
          </>
        ) : (
          <p style={{ fontSize: 12, color: T.textMuted }}>No palette data extracted.</p>
        )}
        {cs.brand_color_personality && (
          <p style={{ marginTop: 10, fontSize: 12, lineHeight: 1.7, color: T.textMuted, maxWidth: 680 }}>
            {cs.brand_color_personality}
          </p>
        )}
      </div>

      {/* ── INTELLIGENCE 3-COL: Semantic / AI / Icon ── */}
      {hasApk && (semanticEntries.length > 0 || aiPalette.length > 0 || iconColors.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, marginBottom: 28 }}>

          {semanticEntries.length > 0 && (
            <Card>
              <SectionLabel>Theme colors</SectionLabel>
              {semanticEntries.map(([role, hex]) => (
                <MiniRow
                  key={role}
                  label={role}
                  hex={hex}
                  sublabel={palette.find(p => p.hex === hex)?.primary_token}
                />
              ))}
            </Card>
          )}

          {aiPalette.length > 0 && (
            <Card>
              <SectionLabel>AI color read — from icon</SectionLabel>
              {aiPalette.map((c, i) => (
                <div key={i}>
                  <MiniRow label={c.semantic_role || c.label} hex={c.hex} />
                  {c.evidence && (
                    <div style={{ fontSize: 9, color: T.textMuted, paddingLeft: 30, marginTop: -2, marginBottom: 4, lineHeight: 1.4 }}>
                      {c.evidence}
                    </div>
                  )}
                </div>
              ))}
              {apkAi?.ai_design_language?.overall_feel && (
                <>
                  <Sep />
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: T.textMuted, fontStyle: "italic" }}>
                    "{apkAi.ai_design_language.overall_feel}"
                  </p>
                </>
              )}
            </Card>
          )}

          {(iconColors.length > 0 || apkIcons.icon_found) && (
            <Card>
              <SectionLabel>App icon</SectionLabel>

              {iconUrl && (
                <div style={{ marginBottom: 10 }}>
                  <img
                    src={iconUrl}
                    alt="App icon"
                    style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", border: `1px solid ${T.border}` }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}

              {iconColors.length > 0 && (
                <>
                  <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" as const }}>
                    {iconColors.map((c, i) => (
                      <div key={i} style={{ width: 24, height: 24, borderRadius: 5, background: c.hex, border: `1px solid ${T.border}` }} title={`${c.hex} · ${c.label}`} />
                    ))}
                  </div>
                  {iconColors.map((c, i) => <MiniRow key={i} label={c.label} hex={c.hex} />)}
                </>
              )}

              {apkIcons.icon_found && (
                <>
                  <Sep />
                  {apkIcons.resolution && <KVRow label="Resolution" value={apkIcons.resolution} />}
                  {apkAi?.ai_icon_analysis && (
                    <>
                      {apkAi.ai_icon_analysis.icon_style       && <KVRow label="Style"      value={apkAi.ai_icon_analysis.icon_style} />}
                      {apkAi.ai_icon_analysis.icon_shape        && <KVRow label="Shape"      value={apkAi.ai_icon_analysis.icon_shape} />}
                      {apkAi.ai_icon_analysis.icon_foreground_description && (
                        <KVRow label="Foreground" value={apkAi.ai_icon_analysis.icon_foreground_description} />
                      )}
                    </>
                  )}
                </>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── COLOR SYSTEM 3-COL ── */}
      {(bgEntries.length > 0 || textEntries.length > 0 || stateEntries.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, marginBottom: 28 }}>
          <Card>
            <SectionLabel>Backgrounds</SectionLabel>
            {bgEntries.length > 0
              ? bgEntries.map(([k, v]) => <MiniRow key={k} label={k} hex={v as string} />)
              : <p style={{ fontSize: 12, color: T.textMuted }}>No data extracted.</p>}
          </Card>
          <Card>
            <SectionLabel>Text colors</SectionLabel>
            {textEntries.length > 0
              ? textEntries.map(([k, v]) => <MiniRow key={k} label={k} hex={v as string} />)
              : <p style={{ fontSize: 12, color: T.textMuted }}>No data extracted.</p>}
            {gamColors.length > 0 && (
              <>
                <Sep />
                <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Gamification</div>
                {gamColors.map((hex, i) => <MiniRow key={i} label={`gamification ${i + 1}`} hex={hex} />)}
              </>
            )}
          </Card>
          <Card>
            <SectionLabel>State colors</SectionLabel>
            {stateEntries.length > 0
              ? stateEntries.map(([k, v]) => <MiniRow key={k} label={k} hex={v as string} round />)
              : <p style={{ fontSize: 12, color: T.textMuted }}>No data extracted.</p>}
          </Card>
        </div>
      )}

      {/* ── RN BUNDLE COLORS ── */}
      {apkRnColors.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Card>
            <SectionLabel>Bundle color frequencies</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px,1fr))", gap: 7 }}>
              {apkRnColors.map((c, i) => <Swatch key={i} color={c} />)}
            </div>
          </Card>
        </div>
      )}

      {/* ── DESIGN SYSTEM MATURITY ── (moved above typography) */}
      {(matScore > 0 || brandKit?.competitive_design_notes) && (
        <Card style={{ marginBottom: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 28 }}>
            <div>
              <SectionLabel>Design system maturity</SectionLabel>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 600, color: T.textPri }}>{matScore}</span>
                <span style={{ fontSize: 14, color: T.textMuted }}>/10</span>
                {mat.assessment && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: T.bgMuted, border: `1px solid ${T.border}`, color: T.textMuted, marginLeft: 4 }}>
                    {mat.assessment}
                  </span>
                )}
              </div>
              <MaturityBar score={matScore} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.textMuted, marginBottom: 10 }}>
                <span>Immature</span><span>Industry-leading</span>
              </div>
              {mat.evidence && <p style={{ fontSize: 12, lineHeight: 1.65, color: T.textSec }}>{mat.evidence}</p>}
              {inconsistencies.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Notable inconsistencies</div>
                  {inconsistencies.map((item, i) => (
                    <div key={i} style={{ fontSize: 11, color: T.textSec, padding: "4px 0", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
                      <span style={{ color: T.textMuted, flexShrink: 0 }}>—</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <SectionLabel>Competitive design read</SectionLabel>
              {brandKit?.competitive_design_notes && (
                <p style={{ fontSize: 13, lineHeight: 1.75, color: T.textSec }}>{brandKit.competitive_design_notes}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── TYPOGRAPHY + SHAPE ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 12, marginBottom: 28 }}>
        <Card>
          <SectionLabel>Typography</SectionLabel>

          {/* Aa specimen */}
          <div style={{ background: T.bgMuted, borderRadius: 10, padding: "16px 18px", marginBottom: 12, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, color: T.textPri }}>Aa</div>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.textPri, marginBottom: 2 }}>
                {ts.primary_font || apkAi?.ai_typography?.primary_font_guess || fontFamilies[0]?.family_name || "System Default"}
              </div>
              {(ts.secondary_font || fontFamilies[1]?.family_name) && (
                <div style={{ fontSize: 11, color: T.textSec, marginBottom: 2 }}>
                  + {ts.secondary_font || fontFamilies[1]?.family_name}
                </div>
              )}
              {ts.font_source && (
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textMuted }}>{ts.font_source}</div>
              )}
            </div>
          </div>

          {/* Type scale */}
          {typeScale.map(([level, spec]) => <TypeRow key={level} level={level} spec={spec} />)}

          {/* Embedded font files with download buttons */}
          {embeddedFonts.length > 0 && (
            <>
              <Sep />
              <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>Font files</div>
              {embeddedFonts.map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "5px 0", borderBottom: `1px solid ${T.border}`, gap: 8 }}>
                  <span style={{ fontFamily: T.mono, color: T.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.font_name_clean}</span>
                  <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                    {f.weight_hint   && <span style={{ fontSize: 9, color: T.textMuted }}>{f.weight_hint}w</span>}
                    {f.file_size_kb  && <span style={{ fontSize: 9, color: T.textMuted }}>{f.file_size_kb}kb</span>}
                    {f.google_font_match && (
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#d1fae5", color: "#065f46" }}>
                        Google Font
                      </span>
                    )}
                    <FontDownloadBtn font={f} />
                  </div>
                </div>
              ))}
            </>
          )}

          {/* AI font evidence */}
          {apkAi?.ai_typography?.font_evidence && (
            <>
              <Sep />
              <p style={{ fontSize: 11, lineHeight: 1.6, color: T.textMuted }}>{apkAi.ai_typography.font_evidence}</p>
            </>
          )}

          {/* Tags */}
          {(ts.weight_range || ts.font_source || googleFonts.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, marginTop: 10 }}>
              {ts.weight_range && <Tag>{ts.weight_range}</Tag>}
              {ts.font_source  && <Tag>{ts.font_source}</Tag>}
              {googleFonts.map(f => <Tag key={f}>{f}</Tag>)}
            </div>
          )}

          {ts.type_personality && (
            <p style={{ marginTop: 10, fontSize: 11, lineHeight: 1.65, color: T.textMuted }}>{ts.type_personality}</p>
          )}
        </Card>

        {/* Shape + Iconography */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
          <Card>
            <SectionLabel>Shape language</SectionLabel>
            {[
              ["Primary radius", ss.corner_radius_primary],
              ["Button shape",   ss.button_shape_language],
              ["Card elevation", ss.card_elevation_style],
              ...(apkAi?.ai_design_language?.corner_radius_character
                ? [["AI corner read", apkAi.ai_design_language.corner_radius_character]] as [string, string][]
                : [])
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label} style={{ background: T.bgMuted, borderRadius: 6, padding: "7px 9px", marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.4 }}>{val}</div>
              </div>
            ))}
            <CornerDemo />
            {ss.shape_personality && (
              <p style={{ marginTop: 10, fontSize: 11, lineHeight: 1.65, color: T.textMuted }}>{ss.shape_personality}</p>
            )}
          </Card>

          <Card>
            <SectionLabel>Iconography</SectionLabel>
            {[
              ["Style",           ico.icon_style],
              ["Library",         ico.icon_library_guess],
              ["Size system",     ico.icon_size_system],
              ["Color treatment", ico.icon_color_treatment],
            ].filter(([, v]) => v).map(([label, val], i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: 12, padding: "4px 0", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ color: T.textMuted, flexShrink: 0 }}>{label}</span>
                <span style={{ color: T.textSec, textAlign: "right" as const, maxWidth: "55%", marginLeft: 8 }}>{val}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* ── FULL COLOR TOKEN MAP (collapsible) ── */}
      {tokenEntries.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Card>
            <SectionLabel>
              Full color token map — {tokenEntries.length} tokens
            </SectionLabel>
            <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 12 }}>
              Every color token. Click any row to copy.
            </p>
            <div style={{ columns: "2 auto", columnGap: 24 }}>
              {tokenVisible.map(([k, v]) => (
                <div key={k} style={{ breakInside: "avoid" }}>
                  <DotRow hex={v} label={k} />
                </div>
              ))}
            </div>
            {tokenEntries.length > TOKEN_MAP_INITIAL_ROWS * 2 && (
              <ShowMoreBtn
                expanded={tokenMapExpanded}
                count={tokenEntries.length}
                onClick={() => setTokenMapExpanded(p => !p)}
              />
            )}
          </Card>
        </div>
      )}

    </div>
  );
}