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

export interface BrandKitViewerProps {
  brandKit: BrandKit;
  framework?: string;
  extractionMethods?: string;
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// Maps directly to the CSS variables defined in globals.css.
// Light fallbacks are the zinc-light values so SSR renders correctly.
// Dark mode works automatically — .dark on <html> swaps all vars.

const T = {
  bgCard:        "var(--color-card, #ffffff)",
  bgMuted:       "var(--color-muted, #f4f4f5)",
  border:        "var(--color-border, #e4e4e7)",
  textPrimary:   "var(--color-card-foreground, #09090b)",
  textSecondary: "var(--color-secondary-foreground, #18181b)",
  textMuted:     "var(--color-muted-foreground, #71717a)",
  textSuccess:   "#16a34a",
  fontMono:      "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
  fontSans:      "var(--font-sans, system-ui, sans-serif)",
  radius:        "calc(var(--radius, 0.5rem) + 4px)",
  radiusMd:      "var(--radius, 0.5rem)",
  radiusSm:      "calc(var(--radius, 0.5rem) - 2px)",
};

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function getContrast(hex: string): string {
  if (!hex || hex.length < 7) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "#111111" : "#ffffff";
}

function confidenceColor(c?: string): string {
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), timeout);
  }, [timeout]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { copied, copy };
}

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius,
      padding: "18px 20px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      textTransform: "uppercase" as const, color: T.textMuted, marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, padding: "3px 10px", borderRadius: 999,
      background: T.bgMuted, border: `1px solid ${T.border}`,
      color: T.textMuted, display: "inline-flex", alignItems: "center",
    }}>
      {children}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", padding: "2px 8px", borderRadius: T.radiusSm,
      fontSize: 10, fontWeight: 500, background: T.bgMuted,
      color: T.textMuted, border: `1px solid ${T.border}`, margin: "2px",
    }}>
      {children}
    </span>
  );
}

function TokenColLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: T.textMuted,
      letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

// ─── SWATCH ───────────────────────────────────────────────────────────────────

function Swatch({ color }: { color: ColorEntry }) {
  const { copied, copy } = useCopy();
  const isCopied = copied === color.hex;
  const roleDisplay = (color.semantic_role || "").replace(/_/g, " ").toUpperCase();
  return (
    <div
      onClick={() => copy(color.hex, color.hex)}
      title={color.used_for || color.label}
      style={{
        borderRadius: 10, overflow: "hidden",
        border: `1px solid ${T.border}`, cursor: "pointer",
        transition: "transform 0.12s ease",
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <div style={{
        height: 80, background: color.hex,
        padding: "8px 8px 0", display: "flex",
        flexDirection: "column", justifyContent: "flex-start",
      }}>
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase" as const, padding: "2px 6px", borderRadius: 3,
          background: "rgba(255,255,255,0.18)", color: getContrast(color.hex),
          display: "inline-block", lineHeight: 1.5,
        }}>
          {roleDisplay}
        </span>
      </div>
      <div style={{ padding: "8px 10px 10px", background: T.bgCard }}>
        <div style={{
          fontFamily: T.fontMono, fontSize: 11, fontWeight: 500, marginBottom: 2,
          color: isCopied ? T.textSuccess : T.textPrimary,
        }}>
          {isCopied ? "Copied!" : color.hex}
        </div>
        <div style={{
          fontSize: 9, color: T.textMuted,
          whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {color.label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: confidenceColor(color.confidence),
          }} />
          <span style={{ fontSize: 9, color: T.textMuted }}>{color.confidence || "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── MINI COLOR ROW ───────────────────────────────────────────────────────────

function MiniRow({ label, hex, round = false }: { label: string; hex: string; round?: boolean }) {
  const { copied, copy } = useCopy();
  const key = hex + label;
  const isCopied = copied === key;
  return (
    <div
      onClick={() => copy(hex, key)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 8px", borderRadius: T.radiusSm,
        background: T.bgMuted, cursor: "pointer", marginBottom: 5,
      }}
    >
      <div style={{
        width: 24, height: 24, flexShrink: 0, background: hex,
        border: `1px solid ${T.border}`, borderRadius: round ? "50%" : 4,
      }} />
      <span style={{ fontSize: 12, color: T.textSecondary, flex: 1 }}>
        {label.replace(/_/g, " ")}
      </span>
      <span style={{
        fontFamily: T.fontMono, fontSize: 11, flexShrink: 0,
        color: isCopied ? T.textSuccess : T.textMuted,
      }}>
        {isCopied ? "copied" : hex}
      </span>
    </div>
  );
}

// ─── TYPE SCALE ROW ───────────────────────────────────────────────────────────

function TypeRow({ level, spec }: { level: string; spec: string }) {
  const parts = spec.split(" / ");
  const size = Math.min(parseInt(parts[0]) || 15, 26);
  const weight = parseInt(parts[1]) || 400;
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: "6px 0", borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: size, fontWeight: weight, color: T.textPrimary, lineHeight: 1 }}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </span>
      <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textMuted, flexShrink: 0, marginLeft: 8 }}>
        {spec}
      </span>
    </div>
  );
}

// ─── TOKEN ROW ────────────────────────────────────────────────────────────────

function TokenRow({ name, value, swatch }: { name: string; value: string; swatch?: boolean }) {
  const { copied, copy } = useCopy();
  const isCopied = copied === name;
  return (
    <div
      onClick={() => copy(value, name)}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "5px 0", borderBottom: `1px solid ${T.border}`, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {swatch && (
          <div style={{
            width: 10, height: 10, borderRadius: 3, background: value,
            border: `1px solid ${T.border}`, flexShrink: 0,
          }} />
        )}
        <span style={{
          fontFamily: T.fontMono, fontSize: 11, color: T.textSecondary,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        }}>
          {name}
        </span>
      </div>
      <span style={{
        fontFamily: T.fontMono, fontSize: 10, flexShrink: 0, marginLeft: 8,
        color: isCopied ? T.textSuccess : T.textMuted,
      }}>
        {isCopied ? "copied!" : value}
      </span>
    </div>
  );
}

// ─── MATURITY BAR ─────────────────────────────────────────────────────────────

function MaturityBar({ score }: { score: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      if (fillRef.current) fillRef.current.style.width = `${(score / 10) * 100}%`;
    }, 300);
    return () => clearTimeout(id);
  }, [score]);
  return (
    <div style={{
      height: 4, borderRadius: 2, background: T.border, overflow: "hidden",
      margin: "8px 0 4px", position: "relative" as const,
    }}>
      <div ref={fillRef} style={{
        position: "absolute" as const, top: 0, left: 0, height: "100%",
        borderRadius: 2, background: T.textSecondary,
        width: "0%", transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

// ─── CORNER DEMO ─────────────────────────────────────────────────────────────

function CornerDemo() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginTop: 14, flexWrap: "wrap" as const }}>
      {[0, 4, 8, 12, 999].map(r => (
        <div key={r} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 5 }}>
          <div style={{
            width: 34, height: 34, borderRadius: r === 999 ? 999 : r,
            background: T.bgMuted, border: `1px solid ${T.border}`,
          }} />
          <span style={{ fontSize: 9, color: T.textMuted, fontFamily: T.fontMono }}>
            {r === 999 ? "pill" : `${r}px`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── SHAPE ATTR ───────────────────────────────────────────────────────────────

function ShapeAttr({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: T.bgMuted, borderRadius: T.radiusMd, padding: "8px 10px", marginBottom: 7 }}>
      <div style={{
        fontSize: 9, color: T.textMuted, letterSpacing: "0.08em",
        textTransform: "uppercase" as const, marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function BrandKitViewer({ brandKit, framework, extractionMethods }: BrandKitViewerProps) {
  if (!brandKit || Object.keys(brandKit).length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320, color: T.textMuted }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>—</div>
          <p style={{ fontSize: "0.875rem" }}>No brand kit data available.</p>
        </div>
      </div>
    );
  }

  const cs  = brandKit.color_system          ?? {};
  const ts  = brandKit.typography_system     ?? {};
  const ss  = brandKit.shape_system          ?? {};
  const ico = brandKit.iconography_system    ?? {};
  const mat = brandKit.design_system_maturity ?? {};
  const fe  = brandKit.figma_token_export    ?? {};

  const palette          = cs.canonical_palette ?? [];
  const bgEntries        = Object.entries(cs.background_system ?? {}).filter(([, v]) => isHex(v));
  const textEntries      = Object.entries(cs.text_system       ?? {}).filter(([, v]) => isHex(v));
  const stateEntries     = Object.entries(cs.state_colors      ?? {}).filter(([, v]) => isHex(v));
  const gamColors        = (cs.gamification_colors ?? []).filter(isHex);
  const typeScaleEntries = Object.entries(ts.type_scale ?? {}).filter(([, v]) => v != null) as [string, string][];
  const matScore         = mat.score ?? 0;
  const inconsistencies  = mat.notable_inconsistencies ?? [];
  const feColors         = fe.colors        && Object.keys(fe.colors).length        > 0 ? fe.colors        : null;
  const feTypo           = fe.typography    && Object.keys(fe.typography).length    > 0 ? fe.typography    : null;
  const feRadius         = fe.border_radius && Object.keys(fe.border_radius).length > 0 ? fe.border_radius : null;
  const hasTokens        = !!(feColors || feTypo || feRadius);

  const shapeAttrs: [string, string | undefined][] = [
    ["Primary radius", ss.corner_radius_primary],
    ["Button shape",   ss.button_shape_language],
    ["Card elevation", ss.card_elevation_style],
  ];
  const iconRows: [string, string | undefined][] = [
    ["Style",           ico.icon_style],
    ["Library",         ico.icon_library_guess],
    ["Size system",     ico.icon_size_system],
    ["Color treatment", ico.icon_color_treatment],
  ];

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 80px", fontFamily: T.fontSans, color: T.textPrimary }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 14 }}>
          {framework            && <Pill>{framework}</Pill>}
          {extractionMethods    && <Pill>{extractionMethods}</Pill>}
          {cs.color_harmony     && <Pill>{cs.color_harmony}</Pill>}
          {cs.color_temperature && <Pill>{cs.color_temperature} temperature</Pill>}
          {palette.length > 0   && <Pill>{palette.length} semantic roles extracted</Pill>}
        </div>
        <h1 style={{
          fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 600,
          letterSpacing: "-0.02em", lineHeight: 1.15,
          color: T.textPrimary, margin: "0 0 10px",
        }}>
          Brand kit
        </h1>
        {brandKit.design_language_summary && (
          <p style={{
            fontSize: "0.9rem", lineHeight: 1.75, color: T.textMuted,
            maxWidth: 640, margin: 0,
            borderLeft: `2px solid ${T.border}`, paddingLeft: 14,
          }}>
            {brandKit.design_language_summary}
          </p>
        )}
      </div>

      {/* ── CANONICAL PALETTE ── */}
      {palette.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Canonical color palette</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            {palette.map((c, i) => <Swatch key={`${c.hex}-${i}`} color={c} />)}
          </div>
          {cs.brand_color_personality && (
            <p style={{ marginTop: 12, fontSize: 12, lineHeight: 1.7, color: T.textMuted, maxWidth: 680 }}>
              {cs.brand_color_personality}
            </p>
          )}
        </div>
      )}

      {/* ── COLOR SYSTEM 3-COL ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 28 }}>
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
              <div style={{ height: 1, background: T.border, margin: "8px 0" }} />
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>
                Gamification
              </div>
              {gamColors.map((hex, i) => <MiniRow key={`gam-${i}`} label={`gamification ${i + 1}`} hex={hex} />)}
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

      {/* ── TYPOGRAPHY + SHAPE/ICONS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 14, marginBottom: 28 }}>
        <Card>
          <SectionLabel>Typography system</SectionLabel>
          <div style={{
            background: T.bgMuted, borderRadius: 10, padding: "18px 20px",
            marginBottom: 14, border: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, color: T.textPrimary }}>Aa</div>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: T.textPrimary, marginBottom: 3 }}>
                {ts.primary_font || "System Default"}
              </div>
              {ts.secondary_font && (
                <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 3 }}>+ {ts.secondary_font}</div>
              )}
              {ts.font_source && (
                <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textMuted }}>{ts.font_source}</div>
              )}
            </div>
          </div>
          {typeScaleEntries.map(([level, spec]) => <TypeRow key={level} level={level} spec={spec} />)}
          {(ts.weight_range || ts.font_source) && (
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, marginTop: 12 }}>
              {ts.weight_range && <Tag>{ts.weight_range}</Tag>}
              {ts.font_source  && <Tag>{ts.font_source}</Tag>}
            </div>
          )}
          {ts.type_personality && (
            <p style={{ marginTop: 12, fontSize: 11, lineHeight: 1.65, color: T.textMuted }}>{ts.type_personality}</p>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
          <Card>
            <SectionLabel>Shape language</SectionLabel>
            {shapeAttrs.filter(([, v]) => !!v).map(([label, val]) => (
              <ShapeAttr key={label} label={label} value={val!} />
            ))}
            <CornerDemo />
            {ss.shape_personality && (
              <p style={{ marginTop: 10, fontSize: 11, lineHeight: 1.65, color: T.textMuted }}>{ss.shape_personality}</p>
            )}
          </Card>
          <Card>
            <SectionLabel>Iconography</SectionLabel>
            {iconRows.filter(([, v]) => !!v).map(([label, val], i, arr) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                fontSize: 12, padding: "5px 0",
                borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none",
              }}>
                <span style={{ color: T.textMuted, flexShrink: 0 }}>{label}</span>
                <span style={{ color: T.textSecondary, textAlign: "right" as const, maxWidth: "55%", marginLeft: 8 }}>{val}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* ── MATURITY + COMPETITIVE ── */}
      <Card style={{ marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 28 }}>
          <div>
            <SectionLabel>Design system maturity</SectionLabel>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: T.textPrimary }}>{matScore}</span>
              <span style={{ fontSize: 14, color: T.textMuted }}>/10</span>
              {mat.assessment && (
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 999,
                  background: T.bgMuted, border: `1px solid ${T.border}`,
                  color: T.textMuted, marginLeft: 4,
                }}>
                  {mat.assessment}
                </span>
              )}
            </div>
            <MaturityBar score={matScore} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.textMuted, marginBottom: 10 }}>
              <span>Immature</span><span>Industry-leading</span>
            </div>
            {mat.evidence && (
              <p style={{ fontSize: 12, lineHeight: 1.65, color: T.textSecondary }}>{mat.evidence}</p>
            )}
            {inconsistencies.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>
                  Notable inconsistencies
                </div>
                {inconsistencies.map((item, i) => (
                  <div key={i} style={{
                    fontSize: 11, color: T.textSecondary, padding: "4px 0",
                    borderBottom: `1px solid ${T.border}`,
                    display: "flex", gap: 8, alignItems: "flex-start",
                  }}>
                    <span style={{ color: T.textMuted, marginTop: 1, flexShrink: 0 }}>—</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <SectionLabel>Competitive design read</SectionLabel>
            {brandKit.competitive_design_notes && (
              <p style={{ fontSize: 13, lineHeight: 1.75, color: T.textSecondary }}>{brandKit.competitive_design_notes}</p>
            )}
          </div>
        </div>
      </Card>

      {/* ── FIGMA TOKEN EXPORT ── */}
      {hasTokens && (
        <Card>
          <SectionLabel>Figma token export</SectionLabel>
          <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 14 }}>Click any token to copy its value</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 24 }}>
            {feColors && (
              <div>
                <TokenColLabel>Colors</TokenColLabel>
                {Object.entries(feColors).map(([k, v]) => <TokenRow key={k} name={k} value={v} swatch />)}
              </div>
            )}
            {feTypo && (
              <div>
                <TokenColLabel>Typography</TokenColLabel>
                {Object.entries(feTypo).map(([k, v]) => <TokenRow key={k} name={k} value={v} />)}
              </div>
            )}
            {feRadius && (
              <div>
                <TokenColLabel>Spacing & radius</TokenColLabel>
                {Object.entries(feRadius).map(([k, v]) => <TokenRow key={k} name={k} value={v} />)}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}