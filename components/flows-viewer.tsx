// components/flows-viewer.tsx
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronRight, ChevronDown, ChevronLeft, Layers, X, Check, Copy, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanoramicMockup } from "./PanoramicMockup";

// ─── TYPES ──────────────────────────────────────────────────────
interface Screen {
  timeline_step: number;
  screenshot_file: string;
  display_label: string;
}
interface FlowNode {
  id: string;
  label: string;
  description?: string;
  screen_count: number;
  screens: number[];
  children?: FlowNode[];
  is_reference?: boolean;
}
interface FlowsData {
  taxonomy: FlowNode[];
  screen_catalog: Screen[];
}

// ─── HELPERS ────────────────────────────────────────────────────
function collectAllFlows(nodes: FlowNode[]): FlowNode[] {
  const result: FlowNode[] = [];
  const walk = (list: FlowNode[]) => {
    for (const n of list) {
      if (n.screens && n.screens.length > 0) result.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

function findFlow(nodes: FlowNode[], id: string): FlowNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFlow(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function buildImgUrl(tenantId: string, appName: string, mode: string, file: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${tenantId}/${appName}/${mode}/screenshots/${file}`;
}

async function copyImageToClipboard(url: string, onSuccess?: () => void, onError?: () => void) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const blob = await res.blob();
    const pngBlob = blob.type === "image/png" ? blob : await convertToPng(blob);
    if (!navigator.clipboard?.write) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    onSuccess?.();
  } catch (err) {
    console.warn("Copy failed:", err instanceof Error ? err.message : err);
    onError?.();
  }
}

async function convertToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png");
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── DETAIL MODAL ───────────────────────────────────────────────
function ScreenDetailModal({
  screens, initialIndex, flowLabel, appName, tenantId, mode, onClose,
}: {
  screens: Screen[]; initialIndex: number; flowLabel: string;
  appName: string; tenantId: string; mode: string; onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const currentScreen = screens[currentIndex];
  const currentImgUrl = currentScreen ? buildImgUrl(tenantId, appName, mode, currentScreen.screenshot_file) : "";

  const scrollToIndex = useCallback((idx: number, behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      const child = scrollRef.current.children[idx] as HTMLElement;
      if (child) {
        scrollRef.current.scrollTo({
          left: child.offsetLeft - scrollRef.current.offsetWidth / 2 + child.offsetWidth / 2,
          behavior,
        });
      }
    }
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => scrollToIndex(initialIndex, "instant"));
  }, [initialIndex, scrollToIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCurrentIndex((i) => { const n = Math.min(i + 1, screens.length - 1); requestAnimationFrame(() => scrollToIndex(n)); return n; });
      if (e.key === "ArrowLeft") setCurrentIndex((i) => { const n = Math.max(i - 1, 0); requestAnimationFrame(() => scrollToIndex(n)); return n; });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, screens.length, scrollToIndex]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
  }, [onClose]);

  const handleCopy = () => {
    copyImageToClipboard(
      currentImgUrl,
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { setCopyError(true); setTimeout(() => setCopyError(false), 2000); }
    );
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] backdrop-blur-2xl bg-black/50 animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div ref={modalRef} className="w-full h-full flex flex-col">

        {/* ── TOP BAR ── */}
        <div className="h-[60px] shrink-0 flex items-center justify-between px-8 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-[15px]">{flowLabel}</span>
            <span className="text-white/40 font-mono text-[13px]">{currentIndex + 1} / {screens.length}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className={cn(
                "h-9 px-5 flex items-center gap-2 rounded-full text-[13px] font-bold transition-all border",
                copied ? "bg-emerald-500 border-emerald-400 text-white"
                  : copyError ? "bg-red-500 border-red-400 text-white"
                  : "bg-white/10 border-white/20 text-white hover:bg-white/20"
              )}
            >
              {copied ? <><Check className="w-3.5 h-3.5" />Copied!</>
               : copyError ? "Failed"
               : <><Copy className="w-3.5 h-3.5" />Copy</>}
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* ── CAROUSEL ── */}
        <div className="flex-1 relative min-h-0">
          {/* Prev arrow */}
          <button
            onClick={() => setCurrentIndex((i) => { const n = Math.max(i - 1, 0); requestAnimationFrame(() => scrollToIndex(n)); return n; })}
            disabled={currentIndex === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md transition-all disabled:opacity-20 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          {/* Scrollable screen strip */}
          <div
            ref={scrollRef}
            className="flex items-end h-full overflow-x-auto overflow-y-hidden gap-6 px-20 pb-8 pt-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {screens.map((screen, idx) => {
              const imgUrl = buildImgUrl(tenantId, appName, mode, screen.screenshot_file);
              const isActive = idx === currentIndex;
              const isPanoramic = screen.screenshot_file.includes("panoramic") || screen.screenshot_file.includes("full_page");
              const hasNav = screen.screenshot_file.includes("withnav") || (!screen.screenshot_file.includes("nonav") && isPanoramic);

              return (
                <div
                  key={idx}
                  onClick={() => { setCurrentIndex(idx); requestAnimationFrame(() => scrollToIndex(idx)); }}
                  className={cn(
                    "shrink-0 cursor-pointer transition-all duration-300 ease-out flex items-end",
                    isActive ? "h-[94%]" : "h-[75%] hover:h-[80%]"
                  )}
                >
                  <div
                    className={cn(
                      "relative h-full aspect-[9/19.5] bg-white transition-all duration-300",
                      isPanoramic ? "overflow-hidden" : "overflow-hidden",
                      isActive
                        ? "opacity-100 shadow-2xl ring-4 ring-white/30 ring-offset-4 ring-offset-transparent"
                        : "opacity-50 hover:opacity-80 shadow-lg"
                    )}
                    style={{ borderRadius: "2rem", borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid" }}
                  >
                    {isPanoramic ? (
                      <PanoramicMockup
                        imgUrl={imgUrl}
                        alt={screen.display_label}
                        isActive={isActive}
                        hasBottomNav={hasNav}
                      />
                    ) : (
                      <Image src={imgUrl} alt={screen.display_label} fill className="object-cover" unoptimized />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Next arrow */}
          <button
            onClick={() => setCurrentIndex((i) => { const n = Math.min(i + 1, screens.length - 1); requestAnimationFrame(() => scrollToIndex(n)); return n; })}
            disabled={currentIndex === screens.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md transition-all disabled:opacity-20 disabled:pointer-events-none"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* ── BOTTOM LABEL ── */}
        <div className="h-[52px] shrink-0 flex items-center justify-center border-t border-white/10">
          <span className="text-white/60 text-[13px] font-medium">{currentScreen?.display_label}</span>
        </div>

      </div>
    </div>,
    document.body
  );
}

// ─── SIDEBAR NODE ───────────────────────────────────────────────
function SidebarNode({
  node, depth = 0, activeFlowId, expandedNodes, onSelect, onToggle,
}: {
  node: FlowNode; depth?: number; activeFlowId: string | null;
  expandedNodes: Set<string>; onSelect: (id: string) => void;
  onToggle: (id: string, e: React.MouseEvent) => void;
}) {
  const isExpanded = expandedNodes.has(node.id);
  const isActive = activeFlowId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col">
      <div
        onClick={() => onSelect(node.id)}
        className={cn(
          "group flex items-center justify-between py-2 cursor-pointer select-none transition-all duration-200 rounded-lg mx-2 mb-0.5",
          isActive
            ? "text-zinc-900 dark:text-white bg-white/50 dark:bg-white/10 backdrop-blur-md border border-white/60 dark:border-white/20 shadow-sm"
            : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-white/30 dark:hover:bg-white/5 border border-transparent",
          depth === 0 && "mt-1",
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px`, paddingRight: "12px" }}
      >
        <div className="flex items-center gap-2 truncate pr-2 min-w-0">
          {hasChildren ? (
            <button onClick={(e) => onToggle(node.id, e)} className="p-1 -ml-1 rounded-md hover:bg-white/60 dark:hover:bg-white/10 transition-colors shrink-0">
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <span className={cn(
            "truncate leading-tight",
            isActive ? "font-bold" : "font-medium",
            depth === 0 ? "text-[14px] font-bold" : "text-[13px]",
            node.is_reference && "text-blue-600 dark:text-blue-400 italic"
          )}>
            {node.label}
          </span>
          {node.is_reference && (
            <Link className="w-3 h-3 shrink-0 text-blue-500 opacity-70" />
          )}
        </div>
        {node.screen_count > 0 && (
          <span className={cn(
            "text-[11px] tabular-nums shrink-0 font-mono font-semibold px-2 py-0.5 rounded-full",
            isActive
              ? "bg-white/60 dark:bg-black/40 text-zinc-800 dark:text-zinc-200"
              : "bg-white/30 dark:bg-white/5 text-zinc-500 dark:text-zinc-400"
          )}>
            {node.screen_count}
          </span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div className="flex flex-col mt-0.5">
          {node.children!.map((child) => (
            <SidebarNode
              key={child.id} node={child} depth={depth + 1}
              activeFlowId={activeFlowId} expandedNodes={expandedNodes}
              onSelect={onSelect} onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FLOW SECTION ───────────────────────────────────────────────
function FlowSection({
  flow, screens, appName, tenantId, mode, isHighlighted, onScreenClick, sectionRef,
}: {
  flow: FlowNode; screens: Screen[]; appName: string; tenantId: string; mode: string;
  isHighlighted: boolean; onScreenClick: (screens: Screen[], index: number, label: string) => void;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={sectionRef} className="flex flex-col">
      <div className="px-10 pt-10 pb-4 flex items-baseline gap-4">
        <h2 className={cn(
          "text-2xl font-bold tracking-tight transition-colors",
          isHighlighted ? "text-zinc-900 dark:text-white" : "text-zinc-700 dark:text-zinc-300"
        )}>
          {flow.label}
        </h2>
        <span className="text-zinc-500 dark:text-zinc-400 text-sm font-semibold bg-white/40 dark:bg-black/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/50 dark:border-white/10">
          {screens.length} screen{screens.length !== 1 ? "s" : ""}
        </span>
      </div>

      {flow.description && (
        <p className="mx-10 mb-2 text-[14px] text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/30 dark:bg-black/20 backdrop-blur-md px-5 py-3 rounded-xl border border-white/40 dark:border-white/10">
          {flow.description}
        </p>
      )}

      <div className="overflow-x-auto overflow-y-hidden pb-8 pt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex gap-8 px-10 min-w-max items-end">
          {screens.map((screen, idx) => {
            const imgUrl = buildImgUrl(tenantId, appName, mode, screen.screenshot_file);
            const isPanoramic = screen.screenshot_file.includes("panoramic") || screen.screenshot_file.includes("full_page");
            const hasNav = screen.screenshot_file.includes("withnav") || (!screen.screenshot_file.includes("nonav") && isPanoramic);

            return (
              <div
                key={idx}
                onClick={() => onScreenClick(screens, idx, flow.label)}
                className="group flex flex-col shrink-0 cursor-pointer"
              >
                {/* Phone frame */}
                <div
                  className={cn(
                    "relative w-[200px] h-[433px] bg-white shadow-xl transition-all duration-300 group-hover:shadow-2xl group-hover:-translate-y-1",
                    isPanoramic ? "overflow-hidden" : "overflow-hidden",
                  )}
                  style={{ borderRadius: "1.8rem", borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid" }}
                >
                  {isPanoramic ? (
                    <PanoramicMockup
                      imgUrl={imgUrl}
                      alt={screen.display_label}
                      isActive={false}
                      hasBottomNav={hasNav}
                    />
                  ) : (
                    <Image src={imgUrl} alt={screen.display_label} fill className="object-cover" unoptimized />
                  )}
                </div>

                {/* Label */}
                <div className="pt-3 w-[200px] flex flex-col items-center text-center gap-1.5">
                  <span
                    className="text-zinc-800 dark:text-zinc-200 text-[13px] font-semibold truncate w-full group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                    title={screen.display_label}
                  >
                    {screen.display_label}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400 text-[10px] font-mono font-bold bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/20 px-2.5 py-0.5 rounded-full">
                    {screen.timeline_step}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────
export function FlowsViewer({
  flowsData, appName, tenantId, mode,
}: {
  flowsData: FlowsData; appName: string; tenantId: string; mode: string;
}) {
  const sanitizedTaxonomy = useMemo(() => {
    if (!flowsData?.taxonomy) return [];
    const seenIds = new Set<string>();
    const sanitize = (nodes: FlowNode[]): FlowNode[] =>
      nodes.map((n) => {
        let newId = n.id; let counter = 1;
        while (seenIds.has(newId)) { newId = `${n.id}-${counter}`; counter++; }
        seenIds.add(newId);
        return { ...n, id: newId, children: n.children ? sanitize(n.children) : undefined };
      });
    return sanitize(flowsData.taxonomy);
  }, [flowsData?.taxonomy]);

  const allFlows = useMemo(() => collectAllFlows(sanitizedTaxonomy), [sanitizedTaxonomy]);

  const [activeFlowId, setActiveFlowId] = useState<string | null>(allFlows[0]?.id || sanitizedTaxonomy[0]?.id || null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(sanitizedTaxonomy.map((t) => t.id)));
  const [detailModal, setDetailModal] = useState<{ screens: Screen[]; initialIndex: number; flowLabel: string } | null>(null);

  const sectionRefs = useRef<Map<string, React.RefObject<HTMLDivElement | null>>>(new Map());
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const flowScreensMap = useMemo(() => {
    const map = new Map<string, Screen[]>();
    for (const flow of allFlows) {
      const resolved = flow.screens
        .map((step) => flowsData.screen_catalog.find((s) => s.timeline_step === step))
        .filter(Boolean) as Screen[];
      map.set(flow.id, resolved);
      if (!sectionRefs.current.has(flow.id)) sectionRefs.current.set(flow.id, { current: null });
    }
    return map;
  }, [allFlows, flowsData.screen_catalog]);

  const toggleExpand = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSidebarSelect = useCallback((id: string) => {
    setActiveFlowId(id);
    const ref = sectionRefs.current.get(id);
    if (ref?.current && mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: ref.current.offsetTop, behavior: "smooth" });
    }
  }, []);

  const openDetail = useCallback((screens: Screen[], index: number, label: string) => {
    setDetailModal({ screens, initialIndex: index, flowLabel: label });
  }, []);

  if (!flowsData?.taxonomy?.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 bg-white/40 dark:bg-black/30 backdrop-blur-xl border border-white/50 dark:border-white/10 p-8 rounded-3xl shadow-xl">
          <Layers className="w-8 h-8 opacity-50 text-zinc-500" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No flow taxonomy generated yet.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full overflow-hidden bg-transparent">

        {/* ═══ LEFT SIDEBAR ═══ */}
        <div className="w-[280px] flex flex-col bg-white/20 dark:bg-white/5 backdrop-blur-2xl border-r border-white/40 dark:border-white/10 shrink-0 h-full">
          <div className="px-6 pt-6 pb-4 shrink-0 border-b border-black/5 dark:border-white/5">
            <h3 className="text-zinc-500 dark:text-zinc-400 text-[11px] font-bold uppercase tracking-[0.15em]">
              Flows Explorer
            </h3>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex flex-col pb-8 pt-2">
              {sanitizedTaxonomy.map((node) => (
                <SidebarNode
                  key={node.id} node={node}
                  activeFlowId={activeFlowId} expandedNodes={expandedNodes}
                  onSelect={handleSidebarSelect} onToggle={toggleExpand}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div ref={mainScrollRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-transparent [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
            {allFlows.map((flow) => {
              const screens = flowScreensMap.get(flow.id) || [];
              if (screens.length === 0) return null;
              return (
                <FlowSection
                  key={flow.id} flow={flow} screens={screens}
                  appName={appName} tenantId={tenantId} mode={mode}
                  isHighlighted={flow.id === activeFlowId}
                  onScreenClick={openDetail}
                  sectionRef={sectionRefs.current.get(flow.id)}
                />
              );
            })}
          </div>
          <div className="h-16" />
        </div>
      </div>

      {/* ═══ DETAIL MODAL ═══ */}
      {detailModal && (
        <ScreenDetailModal
          screens={detailModal.screens}
          initialIndex={detailModal.initialIndex}
          flowLabel={detailModal.flowLabel}
          appName={appName}
          tenantId={tenantId}
          mode={mode}
          onClose={() => setDetailModal(null)}
        />
      )}
    </>
  );
}