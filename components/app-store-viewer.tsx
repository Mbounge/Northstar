"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Review {
  title?: string;
  date?: string;
  username?: string;
  body?: string;
}

interface AppStoreViewerProps {
  appStoreData: {
    raw_data?: {
      hero?: { title?: string; subtitle?: string };
      description?: string;
      app_info?: Record<string, string | string[]>;
      in_app_purchases?: string;
      version_history?: { full_text?: string };
      raw_reviews?: (Review | string)[];
    };
    intelligence?: {
      executive_summary?: string;
      positioning_and_messaging?: string;
      monetization_strategy?: string;
      release_velocity?: string;
      user_sentiment?: {
        strengths?: string[];
        complaints_and_missing_features?: string[];
      };
      technical_profile?: {
        app_size?: string;
        min_ios?: string;
        platform_support?: string;
        languages?: string;
        age_rating?: string;
      };
      developer_ecosystem?: string;
    };
    screenshots?: Record<string, string>;
  };
  framework?: string;
}

// ─── ICONS (inline SVG, no emoji, no external deps) ───────────────────────────
const Icon = {
  Star: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  Zap: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  DollarSign: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Layers: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Target: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
  Activity: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  ChevronUp: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  Code: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  AlertCircle: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Globe: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

// ─── EXPAND/COLLAPSE TEXT ─────────────────────────────────────────────────────
function ExpandableText({ text, lines = 4 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return (
    <div>
      <p
        style={{
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: expanded ? "none" : lines,
          fontSize: "0.875rem",
          lineHeight: "1.75",
          color: "var(--color-text-secondary)",
          whiteSpace: "pre-wrap",
          margin: 0,
        }}
      >
        {text}
      </p>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          background: "none",
          border: "none",
          padding: "6px 0 0",
          cursor: "pointer",
          fontSize: "0.75rem",
          fontWeight: 500,
          color: "var(--color-text-info)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {expanded ? (
          <>Less <Icon.ChevronUp /></>
        ) : (
          <>Show more <Icon.ChevronDown /></>
        )}
      </button>
    </div>
  );
}

// ─── SECTION LABEL ────────────────────────────────────────────────────────────
function Label({ icon, children, color = "#888" }: { icon?: React.ReactNode; children: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
      {icon && (
        <span style={{ color, display: "flex", alignItems: "center" }}>{icon}</span>
      )}
      <span style={{
        fontSize: "0.625rem",
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color,
      }}>
        {children}
      </span>
    </div>
  );
}

// ─── CARD WRAPPER ──────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 16,
      padding: "20px 24px",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── PILL BADGE ───────────────────────────────────────────────────────────────
function Pill({ children, color = "var(--color-background-secondary)" }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 10px",
      borderRadius: 999,
      fontSize: "0.7rem",
      fontWeight: 500,
      background: color,
      color: "var(--color-text-secondary)",
      border: "0.5px solid var(--color-border-tertiary)",
    }}>
      {children}
    </span>
  );
}

// ─── DIVIDER ─────────────────────────────────────────────────────────────────
const Divider = () => (
  <div style={{ height: "0.5px", background: "var(--color-border-tertiary)", margin: "24px 0" }} />
);

// ─── SCREENSHOT PANEL ─────────────────────────────────────────────────────────
function ScreenshotPanel({ screenshots }: { screenshots: Record<string, string> }) {
  const entries = Object.entries(screenshots || {});
  const [activeKey, setActiveKey] = useState(entries[0]?.[0] || "");

  if (!entries.length) return null;
  const activeUrl = screenshots[activeKey];
  const label = (k: string) =>
    k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div style={{
      position: "sticky",
      top: 0,
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      padding: "24px 16px 20px 24px",
      gap: 14,
      borderRight: "0.5px solid var(--color-border-tertiary)",
      background: "var(--color-background-secondary)",
    }}>
      {/* Header */}
      <div style={{
        fontSize: "0.6rem",
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--color-text-tertiary)",
        flexShrink: 0,
      }}>
        App store capture
      </div>

      {/* Phone mockup — takes all remaining height */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        {activeUrl ? (
          // Outer bezel — height drives size, width follows aspect ratio
          <div style={{
            height: "100%",
            maxHeight: "calc(100vh - 140px)",
            aspectRatio: "9 / 19.5",
            borderRadius: 44,
            border: "8px solid #222",
            outline: "1px solid rgba(255,255,255,0.08)",
            background: "#111",
            boxSizing: "border-box",
            flexShrink: 0,
            overflow: "hidden",
            position: "relative",
          }}>
            {/* Notch bar */}
            <div style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 90,
              height: 26,
              background: "#111",
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 16,
              zIndex: 2,
            }} />
            {/* Scrollable screen */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: 36,
              overflowY: "auto",
              overflowX: "hidden",
              scrollbarWidth: "none",
            }}>
              <img
                src={activeUrl}
                alt={activeKey}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.8rem", textAlign: "center" }}>
            No screenshot
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {entries.length > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, flexShrink: 0 }}>
          {entries.map(([key, url]) => (
            <button
              key={key}
              title={label(key)}
              onClick={() => setActiveKey(key)}
              style={{
                flex: "0 0 auto",
                width: 40,
                height: 80,
                borderRadius: 10,
                overflow: "hidden",
                border: `2px solid ${activeKey === key ? "var(--color-border-info)" : "transparent"}`,
                opacity: activeKey === key ? 1 : 0.4,
                cursor: "pointer",
                padding: 0,
                background: "#111",
                transition: "opacity 0.15s, border-color 0.15s",
                position: "relative",
              }}
            >
              <Image
                src={url}
                alt={key}
                fill
                unoptimized
                style={{ objectFit: "cover", objectPosition: "top" }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SENTIMENT LIST ────────────────────────────────────────────────────────────
function SentimentList({ items, positive }: { items: string[]; positive: boolean }) {
  const color = positive ? "#0F6E56" : "#993C1D";
  const bg = positive ? "#E1F5EE" : "#FAECE7";
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {items?.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{
            flex: "0 0 auto",
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: bg,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            marginTop: 1,
          }}>
            {positive ? "+" : "−"}
          </span>
          <span style={{ fontSize: "0.85rem", lineHeight: 1.6, color: "var(--color-text-secondary)" }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── REVIEW CARD ──────────────────────────────────────────────────────────────
function ReviewCard({ review }: { review: Review | string }) {
  const r = typeof review === "string"
    ? { title: "Review", body: review, username: "", date: "" }
    : review;
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: "0.875rem", color: "var(--color-text-primary)", lineClamp: 1 }}>
          {r.title || "—"}
        </p>
        <span style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {r.date}
        </span>
      </div>
      {r.username && (
        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>{r.username}</p>
      )}
      <ExpandableText text={r.body || ""} lines={3} />
    </Card>
  );
}

// ─── STAT CHIP ────────────────────────────────────────────────────────────────
function StatChip({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{
      background: "var(--color-background-secondary)",
      borderRadius: 12,
      padding: "12px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <span style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>
        {label}
      </span>
      <span style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", lineHeight: 1.4 }}>
        {Array.isArray(value) ? (value as string[]).join(", ") : value}
      </span>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function AppStoreViewer({ appStoreData, framework = "Unknown" }: AppStoreViewerProps) {
  const { raw_data = {}, intelligence = {}, screenshots = {} } = appStoreData || {};
  const info = raw_data.app_info || {};
  const reviews = raw_data.raw_reviews || [];
  const hasScreenshots = Object.keys(screenshots).length > 0;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: hasScreenshots ? "420px 1fr" : "1fr",
      minHeight: "100vh",
      fontFamily: "var(--font-sans)",
    }}>

      {/* ─── LEFT: Screenshots ─────────────────────────────────────────── */}
      {hasScreenshots && <ScreenshotPanel screenshots={screenshots} />}

      {/* ─── RIGHT: Intelligence ───────────────────────────────────────── */}
      <div style={{ overflowY: "auto" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 32px 80px" }}>

          {/* ── HEADER ── */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              <Pill color="var(--color-background-info)">
                <Icon.Code /> {framework}
              </Pill>
              {info.Category && <Pill>{info.Category as string}</Pill>}
              {info.Size && <Pill>{info.Size as string}</Pill>}
              {info["Age Rating"] && <Pill>{info["Age Rating"] as string}</Pill>}
            </div>

            <h1 style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 700,
              lineHeight: 1.15,
              margin: "0 0 12px",
              color: "var(--color-text-primary)",
              letterSpacing: "-0.02em",
            }}>
              {raw_data.hero?.title || "App Store Intelligence"}
            </h1>

            {raw_data.hero?.subtitle && (
              <p style={{
                fontSize: "1.05rem",
                lineHeight: 1.6,
                color: "var(--color-text-secondary)",
                margin: 0,
                maxWidth: 560,
              }}>
                {raw_data.hero.subtitle}
              </p>
            )}
          </div>

          {/* ── POSITIONING & STRATEGY ── */}
          {intelligence.executive_summary && (
            <div style={{ marginBottom: 40 }}>
              <Label icon={<Icon.Target />} color="#185FA5">Positioning & strategy</Label>
              <Card style={{ borderLeft: "3px solid #185FA5", borderRadius: "0 16px 16px 0" }}>
                <p style={{
                  margin: 0,
                  fontSize: "1rem",
                  fontWeight: 500,
                  lineHeight: 1.7,
                  color: "var(--color-text-primary)",
                }}>
                  {intelligence.executive_summary}
                </p>
                {intelligence.positioning_and_messaging && (
                  <>
                    <Divider />
                    <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                      {intelligence.positioning_and_messaging}
                    </p>
                  </>
                )}
              </Card>
            </div>
          )}

          {/* ── APP DETAILS + MONETIZATION ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>

            {/* App Details */}
            <Card>
              <Label icon={<Icon.Layers />} color="#0F6E56">App details</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <StatChip label="Seller" value={info.Seller as string} />
                <StatChip label="Category" value={info.Category as string} />
                <StatChip label="Size" value={info.Size as string} />
                <StatChip label="Age rating" value={info["Age Rating"] as string} />
                <StatChip label="Languages" value={info.Languages as string} />
                <StatChip label="Copyright" value={info.Copyright as string} />
              </div>
              {(info.Compatibility) && (
                <div style={{ marginTop: 10 }}>
                  <StatChip
                    label="Compatibility"
                    value={Array.isArray(info.Compatibility)
                      ? (info.Compatibility as string[]).join(" · ")
                      : info.Compatibility as string}
                  />
                </div>
              )}
            </Card>

            {/* Monetization */}
            <Card>
              <Label icon={<Icon.DollarSign />} color="#854F0B">Pricing & IAP</Label>
              {intelligence.monetization_strategy && (
                <p style={{ margin: "0 0 16px", fontSize: "0.875rem", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
                  {intelligence.monetization_strategy}
                </p>
              )}
              {raw_data.in_app_purchases ? (
                <div style={{
                  background: "var(--color-background-secondary)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  borderLeft: "2px solid #EF9F27",
                }}>
                  <p style={{ margin: "0 0 6px", fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#854F0B" }}>
                    Raw IAP data
                  </p>
                  <pre style={{ margin: 0, fontSize: "0.75rem", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                    {raw_data.in_app_purchases}
                  </pre>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                  No IAP data captured.
                </p>
              )}
            </Card>
          </div>

          {/* ── DESCRIPTION ── */}
          {raw_data.description && (
            <div style={{ marginBottom: 40 }}>
              <Label color="var(--color-text-tertiary)">App store description</Label>
              <Card>
                <ExpandableText text={raw_data.description} lines={5} />
              </Card>
            </div>
          )}

          {/* ── USER SENTIMENT ── */}
          {intelligence.user_sentiment && (
            <div style={{ marginBottom: 40 }}>
              <Label icon={<Icon.Star />} color="#BA7517">User sentiment</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                {intelligence.user_sentiment.strengths?.length ? (
                  <Card>
                    <p style={{ margin: "0 0 14px", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0F6E56" }}>
                      What users love
                    </p>
                    <SentimentList items={intelligence.user_sentiment.strengths} positive={true} />
                  </Card>
                ) : null}
                {intelligence.user_sentiment.complaints_and_missing_features?.length ? (
                  <Card>
                    <p style={{ margin: "0 0 14px", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#993C1D" }}>
                      Pain points
                    </p>
                    <SentimentList items={intelligence.user_sentiment.complaints_and_missing_features} positive={false} />
                  </Card>
                ) : null}
              </div>

              {/* Raw reviews grid */}
              {reviews.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {reviews.map((rev, i) => (
                    <ReviewCard key={i} review={rev} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── RELEASE VELOCITY ── */}
          {(intelligence.release_velocity || raw_data.version_history?.full_text) && (
            <div style={{ marginBottom: 40 }}>
              <Label icon={<Icon.Activity />} color="#533AB7">Release velocity</Label>
              {intelligence.release_velocity && (
                <Card style={{ marginBottom: 16, borderLeft: "3px solid #533AB7", borderRadius: "0 16px 16px 0" }}>
                  <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
                    {intelligence.release_velocity}
                  </p>
                </Card>
              )}
              {raw_data.version_history?.full_text && (
                <Card style={{ background: "var(--color-background-secondary)" }}>
                  <p style={{ margin: "0 0 10px", fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>
                    Raw version log
                  </p>
                  <ExpandableText text={raw_data.version_history.full_text} lines={6} />
                </Card>
              )}
            </div>
          )}

          {/* ── TECHNICAL PROFILE ── */}
          {intelligence.technical_profile && (
            <div style={{ marginBottom: 40 }}>
              <Label icon={<Icon.Globe />} color="#533AB7">Technical profile</Label>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                  <StatChip label="Min iOS" value={intelligence.technical_profile.min_ios} />
                  <StatChip label="App size" value={intelligence.technical_profile.app_size} />
                  <StatChip label="Platforms" value={intelligence.technical_profile.platform_support} />
                  <StatChip label="Languages" value={intelligence.technical_profile.languages} />
                  <StatChip label="Age rating" value={intelligence.technical_profile.age_rating} />
                </div>
              </Card>
            </div>
          )}

          {/* ── DEVELOPER ECOSYSTEM ── */}
          {intelligence.developer_ecosystem && (
            <div style={{ marginBottom: 40 }}>
              <Label icon={<Icon.AlertCircle />} color="var(--color-text-tertiary)">Developer ecosystem</Label>
              <Card>
                <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.75, color: "var(--color-text-secondary)" }}>
                  {intelligence.developer_ecosystem}
                </p>
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}