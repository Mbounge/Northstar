// components/app-store-viewer.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Review {
  title?: string;
  date?: string;
  username?: string;
  body?: string;
}

interface Competitor {
  name: string;
  subtitle?: string;
  iconUrl?: string;
  rating?: string;
}

interface AppStoreViewerProps {
  appStoreData: {
    actual_screenshots?: string[];
    raw_data?: {
      hero?: { title?: string; subtitle?: string };
      description?: string;
      app_info?: Record<string, string | string[]>;
      in_app_purchases?: any;
      version_history?: { full_text?: string };
      raw_reviews?: (Review | string)[];
      competitors?: Competitor[];
    };
    intelligence?: {
      executive_summary?: any;
      positioning_and_messaging?: any;
      monetization_strategy?: any;
      release_velocity?: any;
      user_sentiment?: {
        strengths?: string[];
        complaints_and_missing_features?: string[];
      };
      technical_profile?: Record<string, any>;
      developer_ecosystem?: any;
      competitors?: Competitor[];
    };
    icons?: Record<string, string>;
    competitors?: Competitor[];
  };
  framework?: string;
}

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = {
  Star: ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
  Zap: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
  DollarSign: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  Layers: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  Target: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
  Activity: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 18 15 21 9 3 6 12 2 12" /></svg>,
  ChevronDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>,
  ChevronUp: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>,
  Code: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
  AlertCircle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
  Globe: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
  Users: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  Maximize2: ({ className, size = 16 }: { className?: string, size?: number }) => <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>,
};

// ─── SAFE RENDERER ────────────────────────────────────────────────────────
function SafeRender({ data, className = "" }: { data: any, className?: string }) {
  if (!data) return null;
  
  if (typeof data === 'string') {
    return <p className={className} style={{ margin: 0 }}>{data}</p>;
  }
  
  if (Array.isArray(data)) {
    return <p className={className} style={{ margin: 0 }}>{data.join(", ")}</p>;
  }
  
  if (typeof data === 'object') {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} className={className}>
        {Object.entries(data).map(([k, v]) => (
          <div key={k} style={{ fontSize: "14px", lineHeight: 1.6 }}>
            <strong style={{ textTransform: "capitalize", color: "var(--color-foreground)" }}>
              {k.replace(/_/g, " ")}:
            </strong>{" "}
            <span style={{ opacity: 0.8, color: "var(--color-foreground)" }}>
              {typeof v === 'string' ? v : JSON.stringify(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  
  return <p className={className} style={{ margin: 0 }}>{String(data)}</p>;
}

// ─── EXPANDABLE TEXT ─────────────────────────────────────────────────────────
function ExpandableText({ text, lines = 4 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return (
    <div>
      <div
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
        <SafeRender data={text} />
      </div>
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
function Card({ children, style, className = "" }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={`bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl transition-all ${className}`} style={{
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
  <div style={{ height: "1px", background: "rgba(0,0,0,0.05)", margin: "24px 0" }} className="dark:bg-white/10" />
);

// ─── COMPETITOR AVATAR ───────────────────────────────────────────────────────
function CompetitorAvatar({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img 
        src={url} 
        alt={name} 
        onError={() => setFailed(true)}
        style={{ width: 56, height: 56, borderRadius: 14, border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 8px 16px rgba(0,0,0,0.1)", objectFit: "cover", flexShrink: 0 }} 
      />
    );
  }

  return (
    <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "bold", color: "var(--color-foreground)", opacity: 0.6, flexShrink: 0 }} className="dark:bg-white/10">
      {name ? String(name).charAt(0).toUpperCase() : "?"}
    </div>
  );
}

// ─── SENTIMENT LIST ────────────────────────────────────────────────────────────
function SentimentList({ items, positive }: { items: any[]; positive: boolean }) {
  const color = positive ? "#059669" : "#E11D48";
  const bg = positive ? "rgba(5, 150, 105, 0.1)" : "rgba(225, 29, 72, 0.1)";
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      {items?.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 auto", width: 24, height: 24, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, marginTop: 2, border: `1px solid ${color}30` }}>
            {positive ? "+" : "−"}
          </span>
          <span style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--color-foreground)", opacity: 0.9, fontWeight: 500 }}>
            {typeof item === 'string' ? item : JSON.stringify(item)}
          </span>
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
        <p style={{ margin: 0, fontWeight: 700, fontSize: "15px", color: "var(--color-foreground)", lineClamp: 1 }}>{typeof r.title === 'string' ? r.title : "—"}</p>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-foreground)", opacity: 0.5, whiteSpace: "nowrap", flexShrink: 0 }}>{typeof r.date === 'string' ? r.date : ""}</span>
      </div>
      {r.username && <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "var(--color-foreground)", opacity: 0.6 }}>{typeof r.username === 'string' ? r.username : ""}</p>}
      <ExpandableText text={typeof r.body === 'string' ? r.body : JSON.stringify(r.body || "")} lines={3} />
    </Card>
  );
}

// ─── STAT CHIP ────────────────────────────────────────────────────────────────
function StatChip({ label, value }: { label: string; value?: any }) {
  if (!value) return null;
  const displayValue = typeof value === 'string' ? value : Array.isArray(value) ? value.join(", ") : JSON.stringify(value);
  
  return (
    <div style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 16, padding: "16px", display: "flex", flexDirection: "column", gap: 6, boxShadow: "inset 0 2px 4px rgba(255,255,255,0.5)" }} className="dark:bg-white/5 dark:border-white/10 dark:shadow-none">
      <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-foreground)", opacity: 0.6 }}>{label}</span>
      <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-foreground)", lineHeight: 1.4 }}>
        {displayValue}
      </span>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function AppStoreViewer({ appStoreData, framework = "Unknown" }: AppStoreViewerProps) {
  const { raw_data = {}, intelligence = {}, actual_screenshots = [], icons = {} } = appStoreData || {};
  const info = raw_data.app_info || {};
  const reviews = raw_data.raw_reviews || [];
  
  const hasScreenshots = actual_screenshots.length > 0;
  const competitors = appStoreData.competitors || raw_data.competitors || intelligence.competitors || [];
  const mainAppIcon = icons.main_computed || icons.main || icons.app_icon || icons.icon || null;

  return (
    <div className="h-full font-sans bg-transparent overflow-y-auto hide-scrollbar pb-24">
      <div className="max-w-6xl mx-auto px-10 pt-12">

        {/* 1. ── HERO HEADER WITH HIGH-RES APP ICON ── */}
        <div style={{ display: "flex", gap: 32, alignItems: "center", marginBottom: 48 }}>
          {mainAppIcon && typeof mainAppIcon === 'string' && (
            <div style={{ flexShrink: 0 }}>
              <img
                src={mainAppIcon}
                alt="App Icon"
                style={{
                  width: 132,
                  height: 132,
                  borderRadius: 30, // iOS Style squircle approximation
                  boxShadow: "0 24px 48px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.4)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  objectFit: "cover"
                }}
              />
            </div>
          )}
          
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              {framework && framework !== "Unknown" && <Pill highlight><Icon.Code /> {framework}</Pill>}
              {info.Category && info.Category !== "Unknown" && <Pill>{String(info.Category)}</Pill>}
              {info.Size && <Pill>{String(info.Size)}</Pill>}
              {info["Age Rating"] && <Pill>{String(info["Age Rating"])}</Pill>}
            </div>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 2.75rem)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 12px", color: "var(--color-foreground)", letterSpacing: "-0.03em", textShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
              {typeof raw_data.hero?.title === 'string' ? raw_data.hero.title : "App Store Intelligence"}
            </h1>
            {raw_data.hero?.subtitle && (
              <div style={{ fontSize: "1.1rem", fontWeight: 500, lineHeight: 1.6, color: "var(--color-foreground)", opacity: 0.8, margin: 0, maxWidth: 640 }}>
                <SafeRender data={raw_data.hero.subtitle} />
              </div>
            )}
          </div>
        </div>

        {/* 2. ── APP STORE SCREENSHOTS (FLOWS-STYLE HORIZONTAL CAROUSEL) ── */}
        {hasScreenshots && (
          <div style={{ marginBottom: 64 }}>
            <Label icon={<Icon.Layers />} color="var(--color-foreground)">App Store Capture</Label>
            <div className="flex gap-8 overflow-x-auto pb-8 pt-4 hide-scrollbar -mx-10 px-10">
              {actual_screenshots.map((url, idx) => (
                <Dialog key={idx}>
                  <DialogTrigger asChild>
                    <div 
                      className="group shrink-0 relative bg-white/50 dark:bg-white/5 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-zoom-in"
                      style={{ 
                        height: "460px", 
                        borderRadius: "1.8rem", 
                        borderWidth: "0.3px", 
                        borderColor: "#818A98", 
                        borderStyle: "solid", 
                        overflow: "hidden" 
                      }}
                    >
                      <img 
                        src={url} 
                        alt={`Screenshot ${idx + 1}`} 
                        className="h-full w-auto object-cover" 
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white/90 backdrop-blur-md p-3.5 rounded-full shadow-2xl transform scale-90 group-hover:scale-100 transition-all duration-300">
                          <Icon.Maximize2 size={24} className="text-zinc-900" />
                        </div>
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] max-h-[95vh] h-auto w-auto bg-transparent border-none p-0 overflow-hidden flex items-center justify-center shadow-none">
                    <DialogTitle className="sr-only">Expanded Screenshot {idx + 1}</DialogTitle>
                    <img 
                      src={url} 
                      alt={`Full Screenshot ${idx + 1}`} 
                      className="w-auto h-auto max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl" 
                    />
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </div>
        )}

        {/* 3. ── DESCRIPTION ── */}
        {raw_data.description && (
          <div style={{ marginBottom: 48 }}>
            <Label>App store description</Label>
            <Card><ExpandableText text={typeof raw_data.description === 'string' ? raw_data.description : JSON.stringify(raw_data.description)} lines={5} /></Card>
          </div>
        )}

        {/* 4. ── POSITIONING & STRATEGY ── */}
        {intelligence.executive_summary && (
          <div style={{ marginBottom: 48 }}>
            <Label icon={<Icon.Target />} color="#0066FF">Positioning & strategy</Label>
            <Card style={{ borderLeft: "4px solid #0066FF", paddingLeft: "28px" }}>
              <SafeRender data={intelligence.executive_summary} className="text-[16px] font-semibold leading-[1.8] text-[var(--color-foreground)]" />
              {intelligence.positioning_and_messaging && (
                <>
                  <Divider />
                  <SafeRender data={intelligence.positioning_and_messaging} className="text-[15px] font-medium leading-[1.8] text-[var(--color-foreground)] opacity-80" />
                </>
              )}
            </Card>
          </div>
        )}

        {/* 5. ── APP DETAILS + MONETIZATION ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 48 }}>
          <Card>
            <Label icon={<Icon.Layers />} color="#059669">App details</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <StatChip label="Seller" value={info.Seller} />
              <StatChip label="Category" value={info.Category} />
              <StatChip label="Size" value={info.Size} />
              <StatChip label="Age rating" value={info["Age Rating"]} />
              <StatChip label="Languages" value={info.Languages} />
              <StatChip label="Copyright" value={info.Copyright} />
            </div>
            {(info.Compatibility) && (
              <div style={{ marginTop: 12 }}>
                <StatChip label="Compatibility" value={info.Compatibility} />
              </div>
            )}
          </Card>

          <Card>
            <Label icon={<Icon.DollarSign />} color="#D97706">Pricing & IAP</Label>
            {intelligence.monetization_strategy && (
              <div style={{ margin: "0 0 24px", fontSize: "15px", fontWeight: 500, lineHeight: 1.8, color: "var(--color-foreground)", opacity: 0.85 }}>
                <SafeRender data={intelligence.monetization_strategy} />
              </div>
            )}
            {raw_data.in_app_purchases ? (
              <div style={{ background: "rgba(255,255,255,0.5)", borderRadius: 16, padding: "20px", borderLeft: "3px solid #D97706", borderTop: "1px solid rgba(255,255,255,0.6)", borderRight: "1px solid rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(255,255,255,0.6)" }} className="dark:bg-white/5 dark:border-white/10">
                <p style={{ margin: "0 0 12px", fontSize: "11px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "#D97706" }}>
                  Raw IAP data
                </p>
                <pre style={{ margin: 0, fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", color: "var(--color-foreground)", opacity: 0.8, lineHeight: 1.7 }}>
                  {typeof raw_data.in_app_purchases === 'string' ? raw_data.in_app_purchases : JSON.stringify(raw_data.in_app_purchases, null, 2)}
                </pre>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--color-foreground)", opacity: 0.5, fontStyle: "italic" }}>No IAP data captured.</p>
            )}
          </Card>
        </div>

        {/* 6. ── USER SENTIMENT ── */}
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

        {/* 7. ── RELEASE VELOCITY ── */}
        {(intelligence.release_velocity || raw_data.version_history?.full_text) && (
          <div style={{ marginBottom: 48 }}>
            <Label icon={<Icon.Activity />} color="#0891B2">Release velocity</Label>
            {intelligence.release_velocity && (
              <Card style={{ marginBottom: 20, borderLeft: "4px solid #0891B2", paddingLeft: "28px" }}>
                <SafeRender data={intelligence.release_velocity} className="text-[15px] font-semibold leading-[1.8] text-[var(--color-foreground)]" />
              </Card>
            )}
            {raw_data.version_history?.full_text && (
              <Card style={{ background: "rgba(255,255,255,0.3)" }} className="dark:bg-white/5">
                <p style={{ margin: "0 0 16px", fontSize: "11px", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-foreground)", opacity: 0.6 }}>Raw version log</p>
                <ExpandableText text={String(raw_data.version_history.full_text)} lines={6} />
              </Card>
            )}
          </div>
        )}

        {/* 8. ── DEVELOPER ECOSYSTEM ── */}
        {intelligence.developer_ecosystem && (
          <div style={{ marginBottom: 48 }}>
            <Label icon={<Icon.AlertCircle />}>Developer ecosystem</Label>
            <Card>
              <SafeRender data={intelligence.developer_ecosystem} className="text-[15px] font-medium leading-[1.8] text-[var(--color-foreground)] opacity-80" />
            </Card>
          </div>
        )}

        {/* 9. ── TECHNICAL PROFILE ── */}
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

        {/* 10. ── COMPETITORS & SIMILAR APPS ── */}
        {competitors.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            <Label icon={<Icon.Users />} color="#db2777">Competitors & Similar Apps</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {competitors.map((comp, i) => (
                <Card key={i} style={{ padding: "16px 20px", display: "flex", gap: 16, alignItems: "center" }} className="hover:bg-white/60 dark:hover:bg-white/10 cursor-default">
                  <CompetitorAvatar url={comp.iconUrl} name={comp.name || "Unknown"} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: "0 0 2px", fontSize: "14px", fontWeight: 700, color: "var(--color-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {comp.name ? String(comp.name) : "Unknown"}
                    </h4>
                    {comp.subtitle && (
                      <div style={{ margin: 0, fontSize: "12px", fontWeight: 500, color: "var(--color-foreground)", opacity: 0.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4 }}>
                        <SafeRender data={comp.subtitle} />
                      </div>
                    )}
                    {comp.rating && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: "11px", fontWeight: 700, color: "#D97706" }}>
                        <Icon.Star size={10} /> {String(comp.rating)}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}