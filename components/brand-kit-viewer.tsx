// components/brand-kit-viewer.tsx
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
  appIconUrl?: string; // Newly added to override APK icon
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────

const T = {
  bgCard:    "rgba(255, 255, 255, 0.4)",
  bgMuted:   "rgba(255, 255, 255, 0.5)",
  border:    "rgba(255, 255, 255, 0.5)",
  borderDark: "rgba(0, 0, 0, 0.1)",
  textPri:   "var(--color-foreground, #09090b)",
  textSec:   "var(--color-foreground, #18181b)",
  textMuted: "#666666",
  success:   "#16a34a",
  warning:   "#ca8a04",
  mono:      "ui-monospace,'Cascadia Code','Source Code Pro',monospace",
  sans:      "var(--font-sans, system-ui, sans-serif)",
  radCard:   "24px",
  radMd:     "12px",
  radSm:     "8px",
};

const PALETTE_INITIAL_ROWS = 2;
const PALETTE_COLS = 10;
const PALETTE_INITIAL_COUNT = PALETTE_INITIAL_ROWS * PALETTE_COLS;
const TOKEN_MAP_INITIAL_ROWS = 5;

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
    <div className="bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl" style={{ borderRadius: T.radCard, padding: "24px 28px", ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: T.textMuted, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Pill({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "blue" | "amber" }) {
  const s: Record<string, React.CSSProperties> = {
    default: { background: "rgba(255,255,255,0.6)", border: `1px solid ${T.border}`, color: T.textMuted },
    blue:    { background: "rgba(219, 234, 254, 0.6)", border: "1px solid rgba(147, 197, 253, 0.6)", color: "#1e40af" },
    amber:   { background: "rgba(254, 243, 199, 0.6)", border: "1px solid rgba(252, 211, 77, 0.6)", color: "#92400e" },
  };
  return (
    <span className="dark:bg-white/10 dark:text-zinc-200 dark:border-white/20" style={{ fontSize: 11, padding: "4px 12px", borderRadius: 999, display: "inline-flex", alignItems: "center", backdropFilter: "blur(8px)", ...s[variant] }}>
      {children}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="dark:bg-white/10 dark:text-zinc-300 dark:border-white/20" style={{ display: "inline-flex", padding: "3px 9px", borderRadius: T.radSm, fontSize: 10, fontWeight: 600, background: "rgba(255,255,255,0.5)", color: T.textMuted, border: `1px solid ${T.border}`, margin: "2px" }}>
      {children}
    </span>
  );
}

function Sep() {
  return <div className="bg-black/5 dark:bg-white/10" style={{ height: 1, margin: "14px 0" }} />;
}

function KVRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="border-b border-black/5 dark:border-white/10" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: 13, padding: "6px 0" }}>
      <span className="text-zinc-500 dark:text-zinc-400" style={{ flexShrink: 0 }}>{label}</span>
      <span className="text-zinc-800 dark:text-zinc-200" style={{ fontWeight: 500, textAlign: "right" as const, maxWidth: "62%", marginLeft: 8, fontFamily: mono ? T.mono : "inherit", wordBreak: "break-all" as const }}>
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
      className="bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 border border-white/60 dark:border-white/20 text-zinc-800 dark:text-zinc-200"
      style={{
        marginTop: 16,
        width: "100%",
        padding: "10px 0",
        borderRadius: T.radMd,
        backdropFilter: "blur(8px)",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: T.sans,
        transition: "background 0.2s",
      }}
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
    <div className="bg-black/5 dark:bg-white/10" style={{ height: 6, borderRadius: 3, overflow: "hidden", margin: "8px 0 6px", position: "relative" as const }}>
      <div ref={fillRef} className="bg-zinc-900 dark:bg-white" style={{ position: "absolute" as const, top: 0, left: 0, height: "100%", borderRadius: 3, width: "0%", transition: "width 0.8s cubic-bezier(.4,0,.2,1)" }} />
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
      className="bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 hover:-translate-y-1 hover:shadow-lg"
      style={{ borderRadius: 14, overflow: "hidden", cursor: "pointer", transition: "transform 0.12s ease, box-shadow 0.12s ease", backdropFilter: "blur(12px)" }}
    >
      <div style={{ height: 72, background: hex, padding: "8px 8px 0" }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, padding: "3px 6px", borderRadius: 4, background: "rgba(255,255,255,0.25)", backdropFilter: "blur(4px)", color: textColor, display: "inline-block", lineHeight: 1.5 }}>
          {roleDisplay || "—"}
        </span>
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <div className="text-zinc-900 dark:text-zinc-100" style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: isCopied ? T.success : undefined, marginBottom: 2 }}>
          {isCopied ? "Copied!" : hex}
        </div>
        <div className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 9, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>
          {color.label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: confColor(color.confidence), flexShrink: 0 }} />
          <span className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 9, fontWeight: 500 }}>{color.confidence || "—"}</span>
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
    <div onClick={() => copy(hex, key)} className="bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 hover:bg-white/90 dark:hover:bg-white/10" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, cursor: "pointer", marginBottom: 6, transition: "background 0.2s" }}>
      <div className="border border-black/10 dark:border-white/20 shadow-inner" style={{ width: 24, height: 24, flexShrink: 0, background: hex, borderRadius: round ? "50%" : 6 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-zinc-800 dark:text-zinc-200" style={{ fontSize: 13, fontWeight: 500 }}>{label.replace(/_/g, " ")}</div>
        {sublabel && <div className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 10, fontFamily: T.mono }}>{sublabel}</div>}
      </div>
      <span className="text-zinc-500 dark:text-zinc-400" style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 500, color: isCopied ? T.success : undefined, flexShrink: 0 }}>
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
    <div onClick={() => copy(hex, hex + label)} className="border-b border-black/5 dark:border-white/10" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
      <div className="border border-black/10 dark:border-white/20" style={{ width: 10, height: 10, borderRadius: 3, background: hex, flexShrink: 0 }} />
      <span className="text-zinc-800 dark:text-zinc-200" style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</span>
      <span className="text-zinc-500 dark:text-zinc-400" style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 600, color: isCopied ? T.success : undefined, flexShrink: 0 }}>{isCopied ? "copied!" : hex}</span>
    </div>
  );
}

// ─── TYPE SCALE ROW ───────────────────────────────────────────────────────────

function TypeRow({ level, spec }: { level: string; spec: string }) {
  const parts = spec.split(" / ");
  const size = Math.min(parseInt(parts[0]) || 15, 26);
  const weight = parseInt(parts[1]) || 400;
  return (
    <div className="border-b border-black/5 dark:border-white/10" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "8px 0" }}>
      <span className="text-zinc-900 dark:text-zinc-100" style={{ fontSize: size, fontWeight: weight, lineHeight: 1 }}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </span>
      <span className="text-zinc-500 dark:text-zinc-400" style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>{spec}</span>
    </div>
  );
}

// ─── CORNER DEMO ─────────────────────────────────────────────────────────────

function CornerDemo() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginTop: 16, flexWrap: "wrap" as const }}>
      {[0, 4, 8, 12, 999].map(r => (
        <div key={r} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6 }}>
          <div className="bg-white/60 dark:bg-white/10 border border-white/60 dark:border-white/20 shadow-sm" style={{ width: 36, height: 36, borderRadius: r === 999 ? 999 : r }} />
          <span className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 10, fontWeight: 500, fontFamily: T.mono }}>{r === 999 ? "pill" : `${r}px`}</span>
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
        <div className="border border-white/60 dark:border-white/20 shadow-lg" style={{ width: 88, height: 88, borderRadius: 20, overflow: "hidden", flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
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
      className="border border-white/60 dark:border-white/20 shadow-lg"
      style={{ width: 88, height: 88, borderRadius: 20, objectFit: "cover", flexShrink: 0 }}
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
      className="bg-white/50 dark:bg-white/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-300 dark:hover:border-emerald-700 border border-white/60 dark:border-white/20 text-zinc-800 dark:text-zinc-200"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: T.radSm,
        backdropFilter: "blur(4px)",
        textDecoration: "none",
        flexShrink: 0,
        transition: "background 0.2s, color 0.2s",
      }}
    >
      ↓ .{font.format || "ttf"}
    </a>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function BrandKitViewer({ brandKit, apkIntelligence, framework, appIconUrl }: BrandKitViewerProps) {
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
  
  // Prioritize the high-res appIconUrl over the APK extracted icon
  const iconUrl  = appIconUrl || apkIcons?.icon_url;
  
  const hasApk   = !!apkIntelligence;

  if (!brandKit && !apkIntelligence) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }} className="text-zinc-500 dark:text-zinc-400">
        <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>No brand kit data available.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 0 80px", fontFamily: T.sans }} className="text-zinc-900 dark:text-zinc-100">

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 20 }}>

          {(iconUrl || iconColors.length >= 4) && (
            <AppIcon url={iconUrl} appName={appName} dominantColors={iconColors} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 16 }}>
              {fwLabel                && <Pill variant="blue">{fwLabel}</Pill>}
              {cs.color_harmony       && <Pill>{cs.color_harmony}</Pill>}
              {cs.color_temperature   && <Pill>{cs.color_temperature} temperature</Pill>}
              {palette.length > 0     && <Pill variant="amber">{palette.length} colors extracted</Pill>}
            </div>

            <h1 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 12px" }}>
              Brand kit
            </h1>

            {(brandKit?.design_language_summary || apkAi?.designer_summary) && (
              <p className="border-black/10 dark:border-white/20 text-zinc-700 dark:text-zinc-300" style={{ fontSize: "1rem", lineHeight: 1.75, maxWidth: 720, margin: 0, paddingLeft: 16, borderLeftWidth: `3px`, borderLeftStyle: 'solid' }}>
                {brandKit?.design_language_summary || apkAi?.designer_summary}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── CANONICAL PALETTE ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel>
          Color palette{palette.length > 0 ? ` — ${palette.length} colors` : ""}
        </SectionLabel>
        {palette.length > 0 ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px,1fr))", gap: 10 }}>
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
          <p className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 13 }}>No palette data extracted.</p>
        )}
        {cs.brand_color_personality && (
          <p className="text-zinc-700 dark:text-zinc-300" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7, maxWidth: 680 }}>
            {cs.brand_color_personality}
          </p>
        )}
      </div>

      {/* ── INTELLIGENCE 3-COL ── */}
      {hasApk && (semanticEntries.length > 0 || aiPalette.length > 0 || iconColors.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, marginBottom: 32 }}>

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
              <SectionLabel>AI color read</SectionLabel>
              {aiPalette.map((c, i) => (
                <div key={i}>
                  <MiniRow label={c.semantic_role || c.label} hex={c.hex} />
                  {c.evidence && (
                    <div className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 11, paddingLeft: 38, marginTop: -4, marginBottom: 8, lineHeight: 1.5 }}>
                      {c.evidence}
                    </div>
                  )}
                </div>
              ))}
              {apkAi?.ai_design_language?.overall_feel && (
                <>
                  <Sep />
                  <p className="text-zinc-700 dark:text-zinc-300" style={{ fontSize: 12, lineHeight: 1.6, fontStyle: "italic", fontWeight: 500 }}>
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
                <div style={{ marginBottom: 14 }}>
                  <img
                    src={iconUrl}
                    alt="App icon"
                    className="border border-black/10 dark:border-white/20 shadow-md"
                    style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}

              {iconColors.length > 0 && (
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" as const }}>
                    {iconColors.map((c, i) => (
                      <div key={i} className="border border-black/10 dark:border-white/20 shadow-inner" style={{ width: 28, height: 28, borderRadius: 6, background: c.hex }} title={`${c.hex} · ${c.label}`} />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, marginBottom: 32 }}>
          <Card>
            <SectionLabel>Backgrounds</SectionLabel>
            {bgEntries.length > 0
              ? bgEntries.map(([k, v]) => <MiniRow key={k} label={k} hex={v as string} />)
              : <p className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 13 }}>No data extracted.</p>}
          </Card>
          <Card>
            <SectionLabel>Text colors</SectionLabel>
            {textEntries.length > 0
              ? textEntries.map(([k, v]) => <MiniRow key={k} label={k} hex={v as string} />)
              : <p className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 13 }}>No data extracted.</p>}
            {gamColors.length > 0 && (
              <>
                <Sep />
                <div className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 8 }}>Gamification</div>
                {gamColors.map((hex, i) => <MiniRow key={i} label={`gamification ${i + 1}`} hex={hex} />)}
              </>
            )}
          </Card>
          <Card>
            <SectionLabel>State colors</SectionLabel>
            {stateEntries.length > 0
              ? stateEntries.map(([k, v]) => <MiniRow key={k} label={k} hex={v as string} round />)
              : <p className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 13 }}>No data extracted.</p>}
          </Card>
        </div>
      )}

      {/* ── RN BUNDLE COLORS ── */}
      {apkRnColors.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <Card>
            <SectionLabel>Bundle color frequencies</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px,1fr))", gap: 10 }}>
              {apkRnColors.map((c, i) => <Swatch key={i} color={c} />)}
            </div>
          </Card>
        </div>
      )}

      {/* ── DESIGN SYSTEM MATURITY ── */}
      {(matScore > 0 || brandKit?.competitive_design_notes) && (
        <Card style={{ marginBottom: 32 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 32 }}>
            <div>
              <SectionLabel>Design system maturity</SectionLabel>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <span className="text-zinc-900 dark:text-zinc-100" style={{ fontSize: 32, fontWeight: 700 }}>{matScore}</span>
                <span className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 16, fontWeight: 500 }}>/10</span>
                {mat.assessment && (
                  <span className="bg-white/60 dark:bg-white/10 border border-black/5 dark:border-white/20 text-zinc-800 dark:text-zinc-200" style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, marginLeft: 6 }}>
                    {mat.assessment}
                  </span>
                )}
              </div>
              <MaturityBar score={matScore} />
              <div className="text-zinc-500 dark:text-zinc-400" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 500, marginBottom: 12 }}>
                <span>Immature</span><span>Industry-leading</span>
              </div>
              {mat.evidence && <p className="text-zinc-800 dark:text-zinc-200" style={{ fontSize: 13, lineHeight: 1.7 }}>{mat.evidence}</p>}
              {inconsistencies.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 8 }}>Notable inconsistencies</div>
                  {inconsistencies.map((item, i) => (
                    <div key={i} className="text-zinc-800 dark:text-zinc-200 border-b border-black/5 dark:border-white/10" style={{ fontSize: 12, padding: "6px 0", display: "flex", gap: 10 }}>
                      <span className="text-zinc-500 dark:text-zinc-400" style={{ flexShrink: 0 }}>—</span>
                      <span style={{ lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <SectionLabel>Competitive design read</SectionLabel>
              {brandKit?.competitive_design_notes && (
                <p className="text-zinc-800 dark:text-zinc-200" style={{ fontSize: 14, lineHeight: 1.8 }}>{brandKit.competitive_design_notes}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── TYPOGRAPHY + SHAPE ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 16, marginBottom: 32 }}>
        <Card>
          <SectionLabel>Typography</SectionLabel>

          {/* Aa specimen */}
          <div className="bg-white/50 dark:bg-white/5 border border-white/60 dark:border-white/10" style={{ borderRadius: 16, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div className="text-zinc-900 dark:text-zinc-100" style={{ fontSize: 64, fontWeight: 700, lineHeight: 1 }}>Aa</div>
            <div style={{ textAlign: "right" as const }}>
              <div className="text-zinc-900 dark:text-zinc-100" style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {ts.primary_font || apkAi?.ai_typography?.primary_font_guess || fontFamilies[0]?.family_name || "System Default"}
              </div>
              {(ts.secondary_font || fontFamilies[1]?.family_name) && (
                <div className="text-zinc-800 dark:text-zinc-200" style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  + {ts.secondary_font || fontFamilies[1]?.family_name}
                </div>
              )}
              {ts.font_source && (
                <div className="text-zinc-500 dark:text-zinc-400" style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500 }}>{ts.font_source}</div>
              )}
            </div>
          </div>

          {/* Type scale */}
          {typeScale.map(([level, spec]) => <TypeRow key={level} level={level} spec={spec} />)}

          {/* Embedded font files */}
          {embeddedFonts.length > 0 && (
            <>
              <Sep />
              <div className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 8 }}>Font files</div>
              {embeddedFonts.map((f, i) => (
                <div key={i} className="border-b border-black/5 dark:border-white/10" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "6px 0", gap: 10 }}>
                  <span className="text-zinc-800 dark:text-zinc-200" style={{ fontFamily: T.mono, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.font_name_clean}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    {f.weight_hint   && <span className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 10, fontWeight: 500 }}>{f.weight_hint}w</span>}
                    {f.file_size_kb  && <span className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 10, fontWeight: 500 }}>{f.file_size_kb}kb</span>}
                    {f.google_font_match && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#d1fae5", color: "#065f46" }}>
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
              <p className="text-zinc-800 dark:text-zinc-200" style={{ fontSize: 12, lineHeight: 1.6 }}>{apkAi.ai_typography.font_evidence}</p>
            </>
          )}

          {/* Tags */}
          {(ts.weight_range || ts.font_source || googleFonts.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 14 }}>
              {ts.weight_range && <Tag>{ts.weight_range}</Tag>}
              {ts.font_source  && <Tag>{ts.font_source}</Tag>}
              {googleFonts.map(f => <Tag key={f}>{f}</Tag>)}
            </div>
          )}

          {ts.type_personality && (
            <p className="text-zinc-800 dark:text-zinc-200" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>{ts.type_personality}</p>
          )}
        </Card>

        {/* Shape + Iconography */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
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
              <div key={label} className="bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10" style={{ borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                <div className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
                <div className="text-zinc-800 dark:text-zinc-200" style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{val}</div>
              </div>
            ))}
            <CornerDemo />
            {ss.shape_personality && (
              <p className="text-zinc-800 dark:text-zinc-200" style={{ marginTop: 14, fontSize: 12, lineHeight: 1.7 }}>{ss.shape_personality}</p>
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
              <div key={label} className={i < arr.length - 1 ? "border-b border-black/5 dark:border-white/10" : ""} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: 13, padding: "6px 0" }}>
                <span className="text-zinc-500 dark:text-zinc-400" style={{ flexShrink: 0 }}>{label}</span>
                <span className="text-zinc-800 dark:text-zinc-200" style={{ fontWeight: 500, textAlign: "right" as const, maxWidth: "55%", marginLeft: 8 }}>{val}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* ── FULL COLOR TOKEN MAP ── */}
      {tokenEntries.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <Card>
            <SectionLabel>
              Full color token map — {tokenEntries.length} tokens
            </SectionLabel>
            <p className="text-zinc-500 dark:text-zinc-400" style={{ fontSize: 12, fontWeight: 500, marginBottom: 16 }}>
              Every color token. Click any row to copy.
            </p>
            <div style={{ columns: "2 auto", columnGap: 32 }}>
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