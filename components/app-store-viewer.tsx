// components/app-store-viewer.tsx
"use client";

import { useState } from "react";
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

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = {
  Star: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
  Zap: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
  DollarSign: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  Layers: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  Target: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
  Activity: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  ChevronDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>,
  ChevronUp: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>,
  Code: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
  AlertCircle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
  Globe: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
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
          fontSize: "14px",
          lineHeight: "1.8",
          color: "var(--color-foreground)",
          opacity: 0.85,
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
          padding: "10px 0 0",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 700,
          color: "#0066FF",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {expanded ? <><Icon.ChevronUp /> Less</> : <><Icon.ChevronDown /> Show more</>}
      </button>
    </div>
  );
}

// ─── SECTION LABEL ────────────────────────────────────────────────────────────
function Label({ icon, children, color = "var(--color-foreground)" }: { icon?: React.ReactNode; children: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
      {icon && (
        <span style={{ color, display: "flex", alignItems: "center" }}>{icon}</span>
      )}
      <span style={{
        fontSize: "12px",
        fontWeight: 800,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color,
        opacity: 0.8,
      }}>
        {children}
      </span>
    </div>
  );
}

// ─── CARD WRAPPER ──────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl" style={{
      borderRadius: "24px",
      padding: "24px 32px",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── PILL BADGE ───────────────────────────────────────────────────────────────
function Pill({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span className="backdrop-blur-md shadow-sm" style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 14px",
      borderRadius: 999,
      fontSize: "12px",
      fontWeight: 700,
      background: highlight ? "rgba(0, 102, 255, 0.1)" : "rgba(255, 255, 255, 0.5)",
      color: highlight ? "#0066FF" : "var(--color-foreground)",
      border: highlight ? "1px solid rgba(0, 102, 255, 0.2)" : "1px solid rgba(255, 255, 255, 0.6)",
    }}>
      {children}
    </span>
  );
}

// ─── DIVIDER ─────────────────────────────────────────────────────────────────
const Divider = () => (
  <div style={{ height: "1px", background: "rgba(0,0,0,0.05)", margin: "24px 0" }} />
);

// ─── SCREENSHOT PANEL ─────────────────────────────────────────────────────────
function ScreenshotPanel({ screenshots }: { screenshots: Record<string, string> }) {
  const entries = Object.entries(screenshots || {});
  const [activeKey, setActiveKey] = useState(entries[0]?.[0] || "");

  if (!entries.length) return null;
  const activeUrl = screenshots[activeKey];
  const label = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="bg-white/20 dark:bg-white/5 backdrop-blur-2xl border-r border-white/40 dark:border-white/10" style={{
      position: "sticky",
      top: 0,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "32px 24px 24px 32px",
      gap: 20,
    }}>
      <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-foreground)", opacity: 0.6, flexShrink: 0 }}>
        App store capture
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        {activeUrl ? (
          <div style={{ height: "100%", maxHeight: "calc(100vh - 200px)", aspectRatio: "9 / 19.5", borderRadius: 48, border: "10px solid #111", outline: "2px solid rgba(255,255,255,0.2)", background: "#111", boxSizing: "border-box", flexShrink: 0, overflow: "hidden", position: "relative", boxShadow: "0 24px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 100, height: 30, background: "#111", borderBottomLeftRadius: 18, borderBottomRightRadius: 18, zIndex: 2 }} />
            <div style={{ position: "absolute", inset: 0, borderRadius: 38, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none" }}>
              <img src={activeUrl} alt={activeKey} style={{ width: "100%", height: "auto", display: "block" }} />
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--color-foreground)", opacity: 0.5, fontSize: "14px", textAlign: "center" }}>No screenshot</div>
        )}
      </div>

      {entries.length > 1 && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, flexShrink: 0 }} className="hide-scrollbar">
          {entries.map(([key, url]) => (
            <button
              key={key}
              title={label(key)}
              onClick={() => setActiveKey(key)}
              style={{ flex: "0 0 auto", width: 48, height: 96, borderRadius: 12, overflow: "hidden", border: `2px solid ${activeKey === key ? "#0066FF" : "transparent"}`, opacity: activeKey === key ? 1 : 0.5, cursor: "pointer", padding: 0, background: "#111", transition: "all 0.2s", position: "relative", boxShadow: activeKey === key ? "0 4px 12px rgba(0,102,255,0.3)" : "none" }}
            >
              <Image src={url} alt={key} fill unoptimized style={{ objectFit: "cover", objectPosition: "top" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SENTIMENT LIST ────────────────────────────────────────────────────────────
function SentimentList({ items, positive }: { items: string[]; positive: boolean }) {
  const color = positive ? "#059669" : "#E11D48";
  const bg = positive ? "rgba(5, 150, 105, 0.1)" : "rgba(225, 29, 72, 0.1)";
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      {items?.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 auto", width: 24, height: 24, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, marginTop: 2, border: `1px solid ${color}30` }}>
            {positive ? "+" : "−"}
          </span>
          <span style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--color-foreground)", opacity: 0.9, fontWeight: 500 }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── REVIEW CARD ──────────────────────────────────────────────────────────────
function ReviewCard({ review }: { review: Review | string }) {
  const r = typeof review === "string" ? { title: "Review", body: review, username: "", date: "" } : review;
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "15px", color: "var(--color-foreground)", lineClamp: 1 }}>{r.title || "—"}</p>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-foreground)", opacity: 0.5, whiteSpace: "nowrap", flexShrink: 0 }}>{r.date}</span>
      </div>
      {r.username && <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "var(--color-foreground)", opacity: 0.6 }}>{r.username}</p>}
      <ExpandableText text={r.body || ""} lines={3} />
    </Card>
  );
}

// ─── STAT CHIP ────────────────────────────────────────────────────────────────
function StatChip({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 16, padding: "16px", display: "flex", flexDirection: "column", gap: 6, boxShadow: "inset 0 2px 4px rgba(255,255,255,0.5)" }}>
      <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-foreground)", opacity: 0.6 }}>{label}</span>
      <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-foreground)", lineHeight: 1.4 }}>
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
    <div style={{ display: "grid", gridTemplateColumns: hasScreenshots ? "460px 1fr" : "1fr", height: "100%", fontFamily: "var(--font-sans)", background: "transparent" }}>
      {hasScreenshots && <ScreenshotPanel screenshots={screenshots} />}
      <div style={{ overflowY: "auto" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 40px 120px" }}>

          {/* ── HEADER ── */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
              <Pill highlight><Icon.Code /> {framework}</Pill>
              {info.Category && <Pill>{info.Category as string}</Pill>}
              {info.Size && <Pill>{info.Size as string}</Pill>}
              {info["Age Rating"] && <Pill>{info["Age Rating"] as string}</Pill>}
            </div>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 16px", color: "var(--color-foreground)", letterSpacing: "-0.03em", textShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
              {raw_data.hero?.title || "App Store Intelligence"}
            </h1>
            {raw_data.hero?.subtitle && (
              <p style={{ fontSize: "1.2rem", fontWeight: 500, lineHeight: 1.6, color: "var(--color-foreground)", opacity: 0.8, margin: 0, maxWidth: 640 }}>
                {raw_data.hero.subtitle}
              </p>
            )}
          </div>

          {/* ── POSITIONING & STRATEGY ── */}
          {intelligence.executive_summary && (
            <div style={{ marginBottom: 48 }}>
              <Label icon={<Icon.Target />} color="#0066FF">Positioning & strategy</Label>
              <Card style={{ borderLeft: "4px solid #0066FF", paddingLeft: "28px" }}>
                <p style={{ margin: 0, fontSize: "16px", fontWeight: 600, lineHeight: 1.8, color: "var(--color-foreground)" }}>
                  {intelligence.executive_summary}
                </p>
                {intelligence.positioning_and_messaging && (
                  <>
                    <Divider />
                    <p style={{ margin: 0, fontSize: "15px", color: "var(--color-foreground)", opacity: 0.8, lineHeight: 1.8, fontWeight: 500 }}>
                      {intelligence.positioning_and_messaging}
                    </p>
                  </>
                )}
              </Card>
            </div>
          )}

          {/* ── APP DETAILS + MONETIZATION ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 48 }}>
            <Card>
              <Label icon={<Icon.Layers />} color="#059669">App details</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <StatChip label="Seller" value={info.Seller as string} />
                <StatChip label="Category" value={info.Category as string} />
                <StatChip label="Size" value={info.Size as string} />
                <StatChip label="Age rating" value={info["Age Rating"] as string} />
                <StatChip label="Languages" value={info.Languages as string} />
                <StatChip label="Copyright" value={info.Copyright as string} />
              </div>
              {(info.Compatibility) && (
                <div style={{ marginTop: 12 }}>
                  <StatChip label="Compatibility" value={Array.isArray(info.Compatibility) ? (info.Compatibility as string[]).join(" · ") : info.Compatibility as string} />
                </div>
              )}
            </Card>

            <Card>
              <Label icon={<Icon.DollarSign />} color="#D97706">Pricing & IAP</Label>
              {intelligence.monetization_strategy && (
                <p style={{ margin: "0 0 24px", fontSize: "15px", fontWeight: 500, lineHeight: 1.8, color: "var(--color-foreground)", opacity: 0.85 }}>
                  {intelligence.monetization_strategy}
                </p>
              )}
              {raw_data.in_app_purchases ? (
                <div style={{ background: "rgba(255,255,255,0.5)", borderRadius: 16, padding: "20px", borderLeft: "3px solid #D97706", borderTop: "1px solid rgba(255,255,255,0.6)", borderRight: "1px solid rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(255,255,255,0.6)" }}>
                  <p style={{ margin: "0 0 12px", fontSize: "11px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "#D97706" }}>
                    Raw IAP data
                  </p>
                  <pre style={{ margin: 0, fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", color: "var(--color-foreground)", opacity: 0.8, lineHeight: 1.7 }}>
                    {raw_data.in_app_purchases}
                  </pre>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--color-foreground)", opacity: 0.5, fontStyle: "italic" }}>No IAP data captured.</p>
              )}
            </Card>
          </div>

          {/* ── DESCRIPTION ── */}
          {raw_data.description && (
            <div style={{ marginBottom: 48 }}>
              <Label>App store description</Label>
              <Card><ExpandableText text={raw_data.description} lines={5} /></Card>
            </div>
          )}

          {/* ── USER SENTIMENT ── */}
          {intelligence.user_sentiment && (
            <div style={{ marginBottom: 48 }}>
              <Label icon={<Icon.Star />} color="#9333EA">User sentiment</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
                {intelligence.user_sentiment.strengths?.length ? (
                  <Card>
                    <p style={{ margin: "0 0 20px", fontSize: "12px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "#059669" }}>What users love</p>
                    <SentimentList items={intelligence.user_sentiment.strengths} positive={true} />
                  </Card>
                ) : null}
                {intelligence.user_sentiment.complaints_and_missing_features?.length ? (
                  <Card>
                    <p style={{ margin: "0 0 20px", fontSize: "12px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "#E11D48" }}>Pain points</p>
                    <SentimentList items={intelligence.user_sentiment.complaints_and_missing_features} positive={false} />
                  </Card>
                ) : null}
              </div>
              {reviews.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {reviews.map((rev, i) => <ReviewCard key={i} review={rev} />)}
                </div>
              )}
            </div>
          )}

          {/* ── RELEASE VELOCITY ── */}
          {(intelligence.release_velocity || raw_data.version_history?.full_text) && (
            <div style={{ marginBottom: 48 }}>
              <Label icon={<Icon.Activity />} color="#0891B2">Release velocity</Label>
              {intelligence.release_velocity && (
                <Card style={{ marginBottom: 20, borderLeft: "4px solid #0891B2", paddingLeft: "28px" }}>
                  <p style={{ margin: 0, fontSize: "15px", fontWeight: 600, lineHeight: 1.8, color: "var(--color-foreground)" }}>
                    {intelligence.release_velocity}
                  </p>
                </Card>
              )}
              {raw_data.version_history?.full_text && (
                <Card style={{ background: "rgba(255,255,255,0.3)" }}>
                  <p style={{ margin: "0 0 16px", fontSize: "11px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-foreground)", opacity: 0.6 }}>Raw version log</p>
                  <ExpandableText text={raw_data.version_history.full_text} lines={6} />
                </Card>
              )}
            </div>
          )}

          {/* ── TECHNICAL PROFILE ── */}
          {intelligence.technical_profile && (
            <div style={{ marginBottom: 48 }}>
              <Label icon={<Icon.Globe />}>Technical profile</Label>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
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
            <div style={{ marginBottom: 48 }}>
              <Label icon={<Icon.AlertCircle />}>Developer ecosystem</Label>
              <Card>
                <p style={{ margin: 0, fontSize: "15px", fontWeight: 500, lineHeight: 1.8, color: "var(--color-foreground)", opacity: 0.8 }}>
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