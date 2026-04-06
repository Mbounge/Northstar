"use client";

import { useState, useEffect, useRef } from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ColorEntry {
  hex: string;
  label: string;
  semantic_role: string;
  confidence?: string;
  used_for?: string;
  apk_token?: string;
}

interface BrandKit {
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

interface BrandKitViewerProps {
  brandKit: BrandKit;
  framework?: string;
  extractionMethods?: string;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function getContrast(hex: string): string {
  if (!hex || hex.length < 7) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "#111111" : "#ffffff";
}

function confidenceDot(confidence?: string): string {
  if (confidence === "exact" || confidence === "high") return "#2ECC71";
  if (confidence === "medium") return "#F39C12";
  return "#888";
}

// ─── COPY HOOK ────────────────────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };
  return { copied, copy };
}

// ─── SECTION LABEL ────────────────────────────────────────────────────────────

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
    }}>
      {icon && <span style={{ color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", width: 14, height: 14 }}>{icon}</span>}
      <span style={{
        fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--color-text-tertiary)",
      }}>
        {children}
      </span>
    </div>
  );
}

// ─── CARD ─────────────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 16,
      padding: "20px 22px",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── COLOR SWATCH (large) ─────────────────────────────────────────────────────

function Swatch({ color }: { color: ColorEntry }) {
  const { copied, copy } = useCopy();
  const key = color.hex;
  const isCopied = copied === key;
  const text = getContrast(color.hex);

  return (
    <div
      onClick={() => copy(color.hex, key)}
      title={color.used_for || color.label}
      style={{
        borderRadius: 14, overflow: "hidden",
        border: "0.5px solid var(--color-border-tertiary)",
        cursor: "pointer",
      }}
    >
      {/* Color block */}
      <div style={{
        height: 88, background: color.hex, padding: "10px 10px 0",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", padding: "2px 7px", borderRadius: 4,
          background: "rgba(255,255,255,0.18)", color: text, display: "inline-block",
        }}>
          {color.semantic_role.replace(/_/g, " ")}
        </span>
      </div>

      {/* Info block */}
      <div style={{
        padding: "9px 10px 10px",
        background: "var(--color-background-primary)",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500,
          color: isCopied ? "var(--color-text-success)" : "var(--color-text-primary)",
        }}>
          {isCopied ? "Copied!" : color.hex}
        </div>
        <div style={{ fontSize: "10px", color: "var(--color-text-tertiary)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {color.label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: confidenceDot(color.confidence), flexShrink: 0 }} />
          <span style={{ fontSize: "9px", color: "var(--color-text-tertiary)" }}>{color.confidence || "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── MINI COLOR ROW ───────────────────────────────────────────────────────────

function MiniRow({ label, hex, round = false }: { label: string; hex: string; round?: boolean }) {
  const { copied, copy } = useCopy();
  const isCopied = copied === hex + label;

  return (
    <div
      onClick={() => copy(hex, hex + label)}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
        borderRadius: 8, background: "var(--color-background-secondary)",
        cursor: "pointer", marginBottom: 6,
      }}
    >
      <div style={{
        width: 26, height: 26, flexShrink: 0,
        background: hex, border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: round ? "50%" : 6,
      }} />
      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flex: 1 }}>
        {label.replace(/_/g, " ")}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "11px",
        color: isCopied ? "var(--color-text-success)" : "var(--color-text-tertiary)",
      }}>
        {isCopied ? "copied" : hex}
      </span>
    </div>
  );
}

// ─── TYPE SCALE ROW ───────────────────────────────────────────────────────────

function TypeRow({ level, spec, fontFamily }: { level: string; spec: string; fontFamily?: string }) {
  const [size, weight] = spec.split(" / ");
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
    }}>
      <span style={{
        fontSize: parseInt(size) > 24 ? 22 : parseInt(size),
        fontWeight: parseInt(weight) || 400,
        color: "var(--color-text-primary)", lineHeight: 1,
        fontFamily: fontFamily || "inherit",
      }}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--color-text-tertiary)" }}>
        {spec}
      </span>
    </div>
  );
}

// ─── TOKEN ROW ────────────────────────────────────────────────────────────────

function TokenRow({ name, value, swatch }: { name: string; value: string; swatch?: boolean }) {
  const { copied, copy } = useCopy();
  return (
    <div
      onClick={() => copy(value, name)}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {swatch && (
          <div style={{
            width: 11, height: 11, borderRadius: 3, background: value,
            border: "0.5px solid var(--color-border-tertiary)", flexShrink: 0,
          }} />
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-text-secondary)" }}>
          {name}
        </span>
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "10px",
        color: copied === name ? "var(--color-text-success)" : "var(--color-text-tertiary)",
        textAlign: "right", maxWidth: "50%",
      }}>
        {copied === name ? "copied!" : value}
      </span>
    </div>
  );
}

// ─── MATURITY BAR ─────────────────────────────────────────────────────────────

function MaturityBar({ score }: { score: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (ref.current) ref.current.style.width = `${(score / 10) * 100}%`;
    }, 200);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div style={{ height: 5, borderRadius: 3, background: "var(--color-border-tertiary)", overflow: "hidden", margin: "8px 0 4px" }}>
      <div
        ref={ref}
        style={{
          height: "100%", borderRadius: 3,
          background: "var(--color-text-secondary)",
          width: "0%", transition: "width 0.7s cubic-bezier(.4,0,.2,1)",
        }}
      />
    </div>
  );
}

// ─── CORNER DEMOS ─────────────────────────────────────────────────────────────

function CornerDemo() {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
      {[0, 4, 8, 12, 999].map((r) => (
        <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <div style={{
            width: 36, height: 36, borderRadius: r,
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-secondary)",
          }} />
          <span style={{ fontSize: "9px", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {r === 999 ? "pill" : `${r}px`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── PILL TAG ─────────────────────────────────────────────────────────────────

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", padding: "2px 8px", borderRadius: 4,
      fontSize: "10px", fontWeight: 500,
      background: "var(--color-background-secondary)",
      color: "var(--color-text-secondary)",
      border: "0.5px solid var(--color-border-tertiary)", margin: "2px",
    }}>
      {children}
    </span>
  );
}

// ─── INLINE ICONS ─────────────────────────────────────────────────────────────

const Icons = {
  Palette: () => <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><circle cx="5" cy="8" r="3"/><circle cx="11" cy="5" r="3"/><circle cx="11" cy="11" r="3"/></svg>,
  Type: () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="3" rx="1"/><rect x="2" y="9" width="8" height="2" rx="1"/></svg>,
  Shape: () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="3"/></svg>,
  Icon: () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2"/></svg>,
  Token: () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M5 3v10M11 3v10M2 8h12"/></svg>,
  Check: () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,8 6,11 13,4"/></svg>,
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function BrandKitViewer({ brandKit, framework = "Unknown", extractionMethods = "" }: BrandKitViewerProps) {
  if (!brandKit || Object.keys(brandKit).length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-tertiary)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>—</div>
          <p style={{ fontSize: "0.875rem" }}>No brand kit data extracted for this session.</p>
        </div>
      </div>
    );
  }

  const {
    color_system = {},
    typography_system = {},
    shape_system = {},
    iconography_system = {},
    design_language_summary,
    design_system_maturity = {},
    competitive_design_notes,
    figma_token_export = {},
  } = brandKit;

  const palette = color_system.canonical_palette || [];
  const bgSystem = color_system.background_system || {};
  const textSystem = color_system.text_system || {};
  const stateColors = color_system.state_colors || {};
  const gamColors = color_system.gamification_colors || [];
  const typeScale = typography_system.type_scale || {};
  const maturityScore = design_system_maturity.score ?? 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 28px 80px", fontFamily: "var(--font-sans)" }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 999, fontSize: "11px", fontWeight: 500,
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            color: "var(--color-text-secondary)",
          }}>
            <Icons.Check /> {framework}
          </span>
          {extractionMethods && (
            <span style={{
              padding: "3px 10px", borderRadius: 999, fontSize: "11px",
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
              color: "var(--color-text-secondary)",
            }}>
              {extractionMethods}
            </span>
          )}
          {color_system.color_harmony && (
            <span style={{
              padding: "3px 10px", borderRadius: 999, fontSize: "11px",
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
              color: "var(--color-text-secondary)",
            }}>
              {color_system.color_harmony}
            </span>
          )}
          {color_system.color_temperature && (
            <span style={{
              padding: "3px 10px", borderRadius: 999, fontSize: "11px",
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
              color: "var(--color-text-secondary)",
            }}>
              {color_system.color_temperature} temperature
            </span>
          )}
        </div>

        <h1 style={{
          fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 600,
          letterSpacing: "-0.02em", lineHeight: 1.15,
          color: "var(--color-text-primary)", margin: "0 0 10px",
        }}>
          Brand kit
        </h1>

        {design_language_summary && (
          <p style={{
            fontSize: "0.95rem", lineHeight: 1.75,
            color: "var(--color-text-secondary)", maxWidth: 680, margin: 0,
            borderLeft: "2px solid var(--color-border-secondary)", paddingLeft: 14,
          }}>
            {design_language_summary}
          </p>
        )}
      </div>

      {/* ── CANONICAL PALETTE ── */}
      {palette.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <SectionLabel icon={<Icons.Palette />}>Canonical color palette</SectionLabel>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 10,
          }}>
            {palette.map((c, i) => <Swatch key={i} color={c} />)}
          </div>
          {color_system.brand_color_personality && (
            <p style={{
              marginTop: 14, fontSize: "0.8rem", lineHeight: 1.7,
              color: "var(--color-text-tertiary)", maxWidth: 680,
            }}>
              {color_system.brand_color_personality}
            </p>
          )}
        </div>
      )}

      {/* ── COLOR SYSTEMS GRID ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 36 }}>
        <Card>
          <SectionLabel>Backgrounds</SectionLabel>
          {Object.entries(bgSystem).filter(([, v]) => typeof v === "string" && v.startsWith("#")).map(([k, v]) => (
            <MiniRow key={k} label={k} hex={v as string} />
          ))}
        </Card>
        <Card>
          <SectionLabel>Text colors</SectionLabel>
          {Object.entries(textSystem).filter(([, v]) => typeof v === "string" && v.startsWith("#")).map(([k, v]) => (
            <MiniRow key={k} label={k} hex={v as string} />
          ))}
          {gamColors.length > 0 && (
            <>
              <div style={{ height: "0.5px", background: "var(--color-border-tertiary)", margin: "10px 0" }} />
              <div style={{ fontSize: "10px", color: "var(--color-text-tertiary)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Gamification</div>
              {gamColors.map((hex, i) => <MiniRow key={i} label={`gamification ${i + 1}`} hex={hex} />)}
            </>
          )}
        </Card>
        <Card>
          <SectionLabel>State colors</SectionLabel>
          {Object.entries(stateColors).filter(([, v]) => typeof v === "string" && v.startsWith("#")).map(([k, v]) => (
            <MiniRow key={k} label={k} hex={v as string} round />
          ))}
        </Card>
      </div>

      {/* ── TYPOGRAPHY + SHAPE ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 14, marginBottom: 36 }}>

        {/* Typography */}
        <Card>
          <SectionLabel icon={<Icons.Type />}>Typography system</SectionLabel>

          {/* Big Aa specimen */}
          <div style={{
            background: "var(--color-background-secondary)",
            borderRadius: 12, padding: "20px 24px", marginBottom: 16,
            border: "0.5px solid var(--color-border-tertiary)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          }}>
            <div style={{
              fontSize: 64, fontWeight: 700, lineHeight: 1,
              color: "var(--color-text-primary)",
              fontFamily: typography_system.primary_font || "inherit",
            }}>
              Aa
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>
                {typography_system.primary_font || "System Default"}
              </div>
              {typography_system.secondary_font && (
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  + {typography_system.secondary_font}
                </div>
              )}
              <div style={{ fontSize: "10px", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {typography_system.font_source}
              </div>
            </div>
          </div>

          {/* Type scale */}
          {Object.entries(typeScale).filter(([, v]) => v).map(([level, spec]) => (
            <TypeRow
              key={level}
              level={level}
              spec={spec as string}
              fontFamily={typography_system.primary_font}
            />
          ))}

          {/* Tags */}
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap" }}>
            {typography_system.weight_range && <Tag>{typography_system.weight_range}</Tag>}
            {typography_system.font_source && <Tag>{typography_system.font_source}</Tag>}
          </div>

          {typography_system.type_personality && (
            <p style={{ marginTop: 12, fontSize: "11px", lineHeight: 1.65, color: "var(--color-text-tertiary)" }}>
              {typography_system.type_personality}
            </p>
          )}
        </Card>

        {/* Shape + Icons stacked */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card>
            <SectionLabel icon={<Icons.Shape />}>Shape language</SectionLabel>

            {[
              { label: "Primary radius", val: shape_system.corner_radius_primary },
              { label: "Button shape", val: shape_system.button_shape_language },
              { label: "Card elevation", val: shape_system.card_elevation_style },
            ].filter(({ val }) => val).map(({ label, val }) => (
              <div key={label} style={{
                display: "flex", flexDirection: "column", gap: 2,
                padding: "8px 10px", borderRadius: 8,
                background: "var(--color-background-secondary)", marginBottom: 8,
              }}>
                <span style={{ fontSize: "9px", color: "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{val}</span>
              </div>
            ))}

            <CornerDemo />

            {shape_system.shape_personality && (
              <p style={{ marginTop: 12, fontSize: "11px", lineHeight: 1.65, color: "var(--color-text-tertiary)" }}>
                {shape_system.shape_personality}
              </p>
            )}
          </Card>

          <Card>
            <SectionLabel icon={<Icons.Icon />}>Iconography</SectionLabel>
            {[
              { label: "Style", val: iconography_system.icon_style },
              { label: "Library", val: iconography_system.icon_library_guess },
              { label: "Size system", val: iconography_system.icon_size_system },
              { label: "Color treatment", val: iconography_system.icon_color_treatment },
            ].filter(({ val }) => val).map(({ label, val }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                fontSize: "12px", padding: "5px 0",
                borderBottom: "0.5px solid var(--color-border-tertiary)",
              }}>
                <span style={{ color: "var(--color-text-tertiary)" }}>{label}</span>
                <span style={{ color: "var(--color-text-secondary)", textAlign: "right", maxWidth: "55%" }}>{val}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* ── MATURITY + COMPETITIVE ── */}
      <Card style={{ marginBottom: 36 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 28 }}>
          <div>
            <SectionLabel>Design system maturity</SectionLabel>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: "28px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                {maturityScore}
              </span>
              <span style={{ fontSize: "14px", color: "var(--color-text-tertiary)" }}>/10</span>
              {design_system_maturity.assessment && (
                <span style={{
                  fontSize: "11px", padding: "2px 8px", borderRadius: 999,
                  background: "var(--color-background-secondary)",
                  border: "0.5px solid var(--color-border-tertiary)",
                  color: "var(--color-text-secondary)", marginLeft: 4,
                }}>
                  {design_system_maturity.assessment}
                </span>
              )}
            </div>

            <MaturityBar score={maturityScore} />

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              <span>Immature</span><span>Industry-leading</span>
            </div>

            {design_system_maturity.evidence && (
              <p style={{ fontSize: "12px", lineHeight: 1.65, color: "var(--color-text-secondary)" }}>
                {design_system_maturity.evidence}
              </p>
            )}

            {(design_system_maturity.notable_inconsistencies || []).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: "9px", color: "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Notable inconsistencies</div>
                {design_system_maturity.notable_inconsistencies!.map((item, i) => (
                  <div key={i} style={{
                    fontSize: "11px", color: "var(--color-text-secondary)",
                    padding: "4px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
                    display: "flex", gap: 8, alignItems: "flex-start",
                  }}>
                    <span style={{ color: "var(--color-text-tertiary)", marginTop: 1 }}>—</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Competitive design read</SectionLabel>
            {competitive_design_notes && (
              <p style={{ fontSize: "13px", lineHeight: 1.75, color: "var(--color-text-secondary)" }}>
                {competitive_design_notes}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ── FIGMA TOKEN EXPORT ── */}
      {(figma_token_export.colors || figma_token_export.typography || figma_token_export.border_radius) && (
        <Card>
          <SectionLabel icon={<Icons.Token />}>Figma token export</SectionLabel>
          <p style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: 16 }}>
            Click any token to copy its value
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 24 }}>
            {figma_token_export.colors && Object.keys(figma_token_export.colors).length > 0 && (
              <div>
                <div style={{ fontSize: "9px", fontWeight: 600, color: "var(--color-text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Colors
                </div>
                {Object.entries(figma_token_export.colors).map(([k, v]) => (
                  <TokenRow key={k} name={k} value={v} swatch />
                ))}
              </div>
            )}

            {figma_token_export.typography && Object.keys(figma_token_export.typography).length > 0 && (
              <div>
                <div style={{ fontSize: "9px", fontWeight: 600, color: "var(--color-text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Typography
                </div>
                {Object.entries(figma_token_export.typography).map(([k, v]) => (
                  <TokenRow key={k} name={k} value={v} />
                ))}
              </div>
            )}

            {figma_token_export.border_radius && Object.keys(figma_token_export.border_radius).length > 0 && (
              <div>
                <div style={{ fontSize: "9px", fontWeight: 600, color: "var(--color-text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Border radius
                </div>
                {Object.entries(figma_token_export.border_radius).map(([k, v]) => (
                  <TokenRow key={k} name={k} value={v} />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

    </div>
  );
}