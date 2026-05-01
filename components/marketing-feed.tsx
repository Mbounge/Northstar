// components/marketing-feed.tsx
"use client";

import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { SocialPost } from "@/lib/data";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// ── TEXT CLEANER ──────────────────────────────────────────────────────────────
// Scraped social posts often start with platform metadata dumped as raw text:
// "Feed post number 1\nElite Prospects\nElite Prospects\n1,218 followers\n2d •\n..."
// or for X:
// "Peter Sibner reposted\nHockeysverige.se @hockeysverige · Jan 7\nActual content..."
// We strip this boilerplate so only the real post content is shown on cards.

function cleanPostText(raw: string, platform: string, entity: string): string {
  if (!raw) return "";

  const p = (platform ?? "").toLowerCase();
  const isLinkedIn = p.includes("linkedin");
  const isX = p.includes("twitter") || p === "x";

  if (!isLinkedIn && !isX) return raw.trim();

  const lines = raw.split("\n").map((l) => l.trim());

  if (isLinkedIn) {
    // Normalize entity for comparison (handles "EliteProspects" vs "Elite Prospects")
    const entityNorm = (entity ?? "").toLowerCase().replace(/[\s\-_.]/g, "");

    const isJunkLine = (line: string): boolean => {
      if (!line) return true;
      if (/^feed post number \d+/i.test(line)) return true;
      if (/^\d[\d,]*\s+followers?/i.test(line)) return true;
      if (/^\d+[dwmhy]/i.test(line)) return true;
      if (/\d+\s+(day|week|month|hour)s?\s+ago/i.test(line)) return true;
      if (/^(1st|2nd|3rd|[0-9]+[a-z]+\+?|premium)\s*[•·]?/i.test(line)) return true;
      if (/^[•·]\s*(1st|2nd|3rd|[0-9])/i.test(line)) return true;
      if (/^(follow|connect|message|more)$/i.test(line)) return true;
      if (/^(reposted this|shared this|reposted)$/i.test(line)) return true;
      if (/reposted this$/.test(line)) return true;
      if (/visible to (anyone|connections)/i.test(line)) return true;
      if (/^[•·\-]+$/.test(line)) return true;
      if (/^[\d,]+$/.test(line)) return true;
      return false;
    };

    // Find the last junk line in the first 15 lines — content starts after it
    let lastJunkIdx = -1;
    const scanLimit = Math.min(15, lines.length);

    for (let i = 0; i < scanLimit; i++) {
      const line = lines[i];
      const lineNorm = line.toLowerCase().replace(/[\s\-_.]/g, "");
      const isJunk = isJunkLine(line);
      const isEntityRepeat =
        entityNorm.length > 3 &&
        (lineNorm === entityNorm ||
          line.toLowerCase().replace(/\s+/g, "") === entityNorm);

      if (isJunk || isEntityRepeat) {
        lastJunkIdx = i;
      } else if (line.length > 30) {
        // Long non-junk line = real content, stop scanning
        break;
      }
      // Short non-junk lines: keep scanning (could still be header artifact)
    }

    let result = lines.slice(lastJunkIdx + 1).filter((l) => l);

    // Remove truncated duplicate lines (scraper sometimes emits both full + "…" version)
    result = result.filter((line, i, arr) => {
      const isTrunc = /[\.…]{2,}$/.test(line) || line.endsWith("…");
      if (!isTrunc) return true;
      const core = line.replace(/[.…\s]+$/, "").slice(0, 30).toLowerCase();
      const next = (arr[i + 1] || "").toLowerCase();
      const prev = (arr[i - 1] || "").toLowerCase();
      if (next.startsWith(core) || prev.startsWith(core)) return false;
      return true;
    });

    return result.join("\n").trim() || raw.trim();
  }

  if (isX) {
    const result: string[] = [];
    let pastHeader = false;

    for (const line of lines) {
      if (!line) {
        if (pastHeader) result.push(line);
        continue;
      }
      if (!pastHeader) {
        if (/reposted$/i.test(line)) continue;
        if (/^@\w[\w.]*\s*[·•]/i.test(line)) continue;
        if (/^\w[\w\s]+@\w[\w.]*\s*[·•]/i.test(line)) continue;
        if (/^from\s+\S+\.\S+/i.test(line)) continue;
        if (/^[\d\s.,KMBk]+$/.test(line) && line.length < 25) continue;
        pastHeader = true;
      }
      if (/^from\s+\S+\.\S+/i.test(line)) continue;
      if (/^[\d\s.,KMBk]+$/.test(line) && line.length < 25) continue;
      result.push(line);
    }

    return result.join("\n").trim() || raw.trim();
  }

  return raw.trim();
}

interface MarketingFeedProps {
  posts: SocialPost[];
  companyId: string;
  snapshotId: string;
  tenantId: string;
}

// ── PLATFORM ICONS ───────────────────────────────────────────────────────────

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function LinkedInIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function InstagramIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}

function GlobeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm7.926 9h-2.013a14.1 14.1 0 00-1.565-5.498A8.008 8.008 0 0119.926 11zM12 20c-.738 0-1.99-1.755-2.678-5H14.678C13.99 18.245 12.738 20 12 20zm-2.935-7a14.93 14.93 0 010-2h5.87a14.93 14.93 0 010 2H9.065zm.622 5.498C9.04 16.84 8.5 14.5 8.087 13h7.826c-.413 1.5-.953 3.84-1.6 5.498a8.006 8.006 0 01-4.626 0zm-3.074-5.498H4.074A8.008 8.008 0 013.926 11h2.013a14.1 14.1 0 001.674 2zm0-4H5.939A8.008 8.008 0 018.613 4.502C7.966 6.16 7.426 8.5 7.013 9zm8.974 0c-.413-1.5-.953-3.84-1.6-5.498a8.006 8.006 0 014.626 0C18.366 5.162 17.826 7.5 17.413 9h-2.426z"/>
    </svg>
  );
}

// ── PLATFORM CONFIG ───────────────────────────────────────────────────────────

type PlatformKey = "twitter" | "linkedin" | "instagram" | "web";

interface PlatformConfig {
  key: PlatformKey;
  label: string;
  accentColor: string;
  avatarBg: string;
  icon: React.ReactNode;
  iconLarge: React.ReactNode;
  showVerified: boolean;
}

function getPlatformConfig(platform: string): PlatformConfig {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("twitter") || p === "x") return {
    key: "twitter",
    label: "X",
    accentColor: "#1d9bf0",
    avatarBg: "#000",
    icon: <XIcon size={12} />,
    iconLarge: <XIcon size={18} />,
    showVerified: true,
  };
  if (p.includes("linkedin")) return {
    key: "linkedin",
    label: "LinkedIn",
    accentColor: "#0a66c2",
    avatarBg: "#0a66c2",
    icon: <LinkedInIcon size={12} />,
    iconLarge: <LinkedInIcon size={18} />,
    showVerified: false,
  };
  if (p.includes("instagram")) return {
    key: "instagram",
    label: "Instagram",
    accentColor: "#e1306c",
    avatarBg: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
    icon: <InstagramIcon size={12} />,
    iconLarge: <InstagramIcon size={18} />,
    showVerified: true,
  };
  return {
    key: "web",
    label: platform || "Web/Media",
    accentColor: "#6366f1",
    avatarBg: "#3f3f46",
    icon: <GlobeIcon size={12} />,
    iconLarge: <GlobeIcon size={18} />,
    showVerified: false,
  };
}

// ── VERIFIED BADGE ────────────────────────────────────────────────────────────

function VerifiedBadge({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 22 22" className="w-[15px] h-[15px] shrink-0" style={{ fill: color }}>
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
    </svg>
  );
}

// ── POST DETAIL MODAL ─────────────────────────────────────────────────────────

function PostDetailModal({
  post,
  imagePath,
  timeAgo,
  open,
  onClose,
}: {
  post: SocialPost;
  imagePath: string | null;
  timeAgo: string;
  open: boolean;
  onClose: () => void;
}) {
  const config = getPlatformConfig(post.platform ?? "");
  const text = cleanPostText(post.raw_text ?? "", post.platform ?? "", post.entity ?? "");
  const displayName = post.entity || post.platform || "Unknown";
  const meta = post.meta ?? {};

  let fullDate = "";
  try { fullDate = format(new Date(post.timestamp), "h:mm a · MMM d, yyyy"); } catch {}

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl w-full p-0 overflow-hidden bg-white dark:bg-[#0d0d0d] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <VisuallyHidden><DialogTitle>{displayName} · {config.label}</DialogTitle></VisuallyHidden>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 text-[13px] font-bold"
              style={{ background: config.avatarBg }}
            >
              {config.key === "twitter" ? config.iconLarge : displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[14px] text-zinc-900 dark:text-white leading-tight">{displayName}</span>
                {config.showVerified && <VerifiedBadge color={config.accentColor} />}
              </div>
              <div className="text-[12px] text-zinc-400 dark:text-zinc-500">{config.label} · {timeAgo}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

          {/* Full image — no crop, full natural height */}
          {imagePath && (
            <div className="bg-black">
              <img src={imagePath} alt="" className="w-full object-contain" />
            </div>
          )}

          <div className="px-5 py-5 space-y-5">

            {/* Post text */}
            {text && (
              <p className="text-zinc-900 dark:text-zinc-100 text-[15px] leading-[1.65] whitespace-pre-wrap break-words">
                {text}
              </p>
            )}

            {/* Replies / comments */}
            {post.comments && post.comments.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-zinc-400 dark:text-zinc-500">
                  Captured replies · {post.comments.length}
                </div>
                {post.comments.map((c, i) => (
                  <div
                    key={i}
                    className="bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/10 rounded-xl px-4 py-3"
                  >
                    <p className="text-zinc-700 dark:text-zinc-300 text-[13px] leading-relaxed">{c}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Intelligence signals */}
            {(meta.sentiment || meta.category || meta.summary) && (
              <div className="pt-4 border-t border-zinc-100 dark:border-white/10 space-y-3">
                <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-zinc-400 dark:text-zinc-500">
                  Intelligence
                </div>
                {meta.summary && (
                  <p className="text-zinc-600 dark:text-zinc-300 text-[13px] leading-relaxed italic">
                    "{meta.summary}"
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {meta.sentiment && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 uppercase tracking-wide border border-zinc-200 dark:border-white/10">
                      {meta.sentiment}
                    </span>
                  )}
                  {meta.category && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 uppercase tracking-wide border border-zinc-200 dark:border-white/10">
                      {meta.category}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-100 dark:border-white/10 flex items-center justify-between">
              <span className="text-zinc-400 dark:text-zinc-500 text-[12px]">{fullDate || timeAgo}</span>
              {post.url && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  View original
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── POST CARD ─────────────────────────────────────────────────────────────────

function PostCard({ post, imagePath, timeAgo }: { post: SocialPost; imagePath: string | null; timeAgo: string }) {
  const [open, setOpen] = useState(false);
  const config = getPlatformConfig(post.platform ?? "");
  const text = cleanPostText(post.raw_text ?? "", post.platform ?? "", post.entity ?? "");
  const displayName = post.entity || post.platform || "Unknown";
  const meta = post.meta ?? {};
  const isX = config.key === "twitter";
  const handle = isX ? `@${displayName.toLowerCase().replace(/\s+/g, "")}` : null;

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className={cn(
          "group cursor-pointer rounded-2xl overflow-hidden transition-all duration-200",
          "border",
          // Light
          "bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-lg",
          // Dark
          "dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:shadow-2xl",
          "hover:-translate-y-[1px]",
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-2.5 px-4 pt-4 pb-3">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-[13px] font-bold overflow-hidden"
            style={{ background: config.avatarBg }}
          >
            {isX ? <XIcon size={16} /> : displayName.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[14px] text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                {displayName}
              </span>
              {config.showVerified && <VerifiedBadge color={config.accentColor} />}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {handle && (
                <span className="text-zinc-400 dark:text-zinc-500 text-[12px]">{handle}</span>
              )}
              {handle && <span className="text-zinc-300 dark:text-zinc-700 text-[11px]">·</span>}
              <span className="text-zinc-400 dark:text-zinc-500 text-[12px]">{timeAgo}</span>
              <span className="text-zinc-300 dark:text-zinc-700 text-[11px]">·</span>
              {/* Platform pill */}
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                style={{
                  background: `${config.accentColor}15`,
                  color: config.accentColor,
                }}
              >
                {config.icon}
                {config.label}
              </span>
            </div>
          </div>
        </div>

        {/* Text */}
        {text && (
          <div className="px-4 pb-3">
            <p className="text-zinc-800 dark:text-zinc-200 text-[14px] leading-[1.55] line-clamp-5 whitespace-pre-wrap break-words">
              {text}
            </p>
          </div>
        )}

        {/* Image */}
        {imagePath && (
          <div className="mx-3 mb-3 rounded-xl overflow-hidden bg-zinc-100 dark:bg-black">
            <img
              src={imagePath}
              alt=""
              className="w-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
              style={{
                maxHeight: config.key === "instagram" ? undefined : "400px",
                aspectRatio: config.key === "instagram" ? "1/1" : undefined,
                objectFit: "cover",
              }}
            />
          </div>
        )}

        {/* Footer: meta + cue */}
        <div className="px-4 pb-3.5 flex items-center gap-2 flex-wrap">
          {meta.sentiment && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/8 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10">
              {meta.sentiment}
            </span>
          )}
          {meta.category && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/8 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10">
              {meta.category}
            </span>
          )}
          <span className="ml-auto text-[11px] text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500 dark:group-hover:text-zinc-500 transition-colors">
            View signal →
          </span>
        </div>
      </div>

      <PostDetailModal
        post={post}
        imagePath={imagePath}
        timeAgo={timeAgo}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ── MAIN FEED ─────────────────────────────────────────────────────────────────

export function MarketingFeed({ posts, companyId, snapshotId, tenantId }: MarketingFeedProps) {
  const [filter, setFilter] = useState<string | null>(null);

  const getImagePath = (rawPath: string) => {
    if (!rawPath) return "";
    if (rawPath.startsWith("http")) return rawPath;
    const filename = rawPath.split("/").pop();
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${tenantId}/${companyId}/snapshots/${snapshotId}/marketing/screenshots/${filename}`;
  };

  if (!posts || posts.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-500 text-[14px] font-mono bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-2xl">
        No marketing signals extracted for this snapshot.
      </div>
    );
  }

  const platforms = Array.from(new Set(posts.map((p) => p.platform).filter(Boolean)));
  const filteredPosts = filter ? posts.filter((p) => p.platform === filter) : posts;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="text-[12px] font-bold tracking-[0.15em] uppercase text-zinc-500 bg-white dark:bg-black/30 backdrop-blur-md px-4 py-2 rounded-xl border border-zinc-200 dark:border-white/10">
          Signals Captured
          <span className="font-mono text-zinc-900 dark:text-white ml-2">{posts.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              "px-4 py-2 text-[11px] uppercase font-bold tracking-wider rounded-xl border transition-all",
              filter === null
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent"
                : "bg-white dark:bg-white/10 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/20 hover:border-zinc-400 dark:hover:border-white/40"
            )}
          >
            All
          </button>
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={cn(
                "px-4 py-2 text-[11px] uppercase font-bold tracking-wider rounded-xl border transition-all",
                filter === p
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent"
                  : "bg-white dark:bg-white/10 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/20 hover:border-zinc-400 dark:hover:border-white/40"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Masonry grid */}
      <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
        {filteredPosts.map((post, i) => {
          const imagePath = post.screenshot ? getImagePath(post.screenshot) : null;
          let timeAgo = "recently";
          try { timeAgo = formatDistanceToNow(new Date(post.timestamp), { addSuffix: true }); } catch {}

          return (
            <div key={i} className="break-inside-avoid">
              <PostCard post={post} imagePath={imagePath} timeAgo={timeAgo} />
            </div>
          );
        })}
      </div>
    </div>
  );
}