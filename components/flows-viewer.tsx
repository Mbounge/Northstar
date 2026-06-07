// components/flows-viewer.tsx
"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from "react";
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

interface FlowBranch {
  label: string;
  description: string;
  screenshots: string[];
}

interface FlowNode {
  id: string;
  label: string;
  description?: string;
  screen_count: number;
  screens: number[];
  children?: FlowNode[];
  is_reference?: boolean;
  is_nav_tab?: boolean;
  // Dual-Compatible V2 Fields
  spine?: string[];
  branches?: FlowBranch[];
}

interface FlowsData {
  taxonomy: FlowNode[];
  screen_catalog?: Screen[];
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
    
    // Check virtual children (branches) first
    if (node.branches) {
      const branchIndex = node.branches.findIndex((_, bi) => `${node.id}__branch_${bi}` === id);
      if (branchIndex !== -1) {
        const b = node.branches[branchIndex];
        return {
          id,
          label: b.label || "Interaction",
          description: b.description,
          screen_count: b.screenshots ? b.screenshots.length : 0,
          screens: [],
          children: []
        };
      }
    }
    
    // Check real taxonomy children
    if (node.children) {
      const found = findFlow(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getLeafFlows(node: FlowNode): FlowNode[] {
  const leaves: FlowNode[] = [];
  const walk = (n: FlowNode) => {
    const hasChildren = n.children && n.children.length > 0;
    if (!hasChildren && n.screens && n.screens.length > 0) {
      leaves.push(n);
    }
    if (n.children) {
      n.children.forEach(walk);
    }
  };
  walk(node);
  return leaves;
}

function buildImgUrl(tenantId: string, appName: string, mode: string, file: string): string {
  const cleanFileName = file.split('/').pop() || file;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${tenantId}/${appName}/${mode}/screenshots/${cleanFileName}`;
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
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  const currentScreen = screens[currentIndex];
  const currentImgUrl = currentScreen ? buildImgUrl(tenantId, appName, mode, currentScreen.screenshot_file) : "";

  const scrollToIndex = useCallback((idx: number, behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      isProgrammaticScroll.current = true;
      const child = scrollRef.current.children[idx] as HTMLElement;
      if (child) {
        scrollRef.current.scrollTo({
          left: child.offsetLeft - scrollRef.current.offsetWidth / 2 + child.offsetWidth / 2,
          behavior,
        });
      }
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, behavior === "instant" ? 10 : 500); 
    }
  }, []);

  const handleModalScroll = useCallback(() => {
    if (isProgrammaticScroll.current) return; 
    if (!scrollRef.current) return;
    
    const container = scrollRef.current;
    const center = container.scrollLeft + container.clientWidth / 2;
    let closestIdx = 0, minDiff = Infinity;
    
    Array.from(container.children).forEach((child, idx) => {
      const el = child as HTMLElement;
      const diff = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
      if (diff < minDiff) { minDiff = diff; closestIdx = idx; }
    });
    
    if (closestIdx !== currentIndex) setCurrentIndex(closestIdx);
  }, [currentIndex]);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (mounted && scrollRef.current) {
      scrollToIndex(initialIndex, "instant");
    }
  }, [mounted, initialIndex, scrollToIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCurrentIndex((i) => { const n = Math.min(i + 1, screens.length - 1); scrollToIndex(n); return n; });
      if (e.key === "ArrowLeft") setCurrentIndex((i) => { const n = Math.max(i - 1, 0); scrollToIndex(n); return n; });
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
    <div className="fixed inset-0 z-[9999] backdrop-blur-2xl bg-black/50 animate-in fade-in duration-150" onClick={handleBackdropClick}>
      <div ref={modalRef} className="w-full h-full flex flex-col">
        <div className="h-[60px] shrink-0 flex items-center justify-between px-8 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-[15px]">{flowLabel}</span>
            <span className="text-white/40 font-mono text-[13px]">{currentIndex + 1} / {screens.length}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleCopy} className={cn("h-9 px-5 flex items-center gap-2 rounded-full text-[13px] font-bold transition-all border", copied ? "bg-emerald-500 border-emerald-400 text-white" : copyError ? "bg-red-500 border-red-400 text-white" : "bg-white/10 border-white/20 text-white hover:bg-white/20")}>
              {copied ? <><Check className="w-3.5 h-3.5" />Copied!</> : copyError ? "Failed" : <><Copy className="w-3.5 h-3.5" />Copy</>}
            </button>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative min-h-0 flex flex-col justify-center">
          <button onClick={() => setCurrentIndex((i) => { const n = Math.max(i - 1, 0); scrollToIndex(n); return n; })} disabled={currentIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md transition-all disabled:opacity-20 disabled:pointer-events-none">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          <div ref={scrollRef} onScroll={handleModalScroll} className="flex-1 w-full flex items-center gap-8 overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ paddingLeft: "calc(50vw - 18.5vh)", paddingRight: "calc(50vw - 18.5vh)" }}>
            {screens.map((screen, idx) => {
              const imgUrl = buildImgUrl(tenantId, appName, mode, screen.screenshot_file);
              const isActive = idx === currentIndex;
              const isPanoramic = screen.screenshot_file.includes("panoramic") || screen.screenshot_file.includes("full_page");
              const hasNav = screen.screenshot_file.includes("withnav") || (!screen.screenshot_file.includes("nonav") && isPanoramic);

              return (
                <div key={idx} onClick={() => { setCurrentIndex(idx); scrollToIndex(idx); }} className="snap-center shrink-0 cursor-pointer h-[80vh] flex items-center justify-center" style={{ aspectRatio: "9/19.5" }}>
                  <div className={cn("relative w-full h-full bg-white transition-all duration-300 ease-out origin-center", isPanoramic ? "overflow-hidden" : "overflow-hidden", isActive ? "scale-100 opacity-100 shadow-2xl ring-2 ring-white/20" : "scale-95 opacity-40 hover:opacity-70 shadow-lg")} style={{ borderRadius: "0.8rem", borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid" }}>
                    {isPanoramic ? <PanoramicMockup imgUrl={imgUrl} alt={screen.display_label} isActive={false} hasBottomNav={hasNav} /> : <img src={imgUrl} alt={screen.display_label} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={() => setCurrentIndex((i) => { const n = Math.min(i + 1, screens.length - 1); scrollToIndex(n); return n; })} disabled={currentIndex === screens.length - 1} className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md transition-all disabled:opacity-20 disabled:pointer-events-none">
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </div>

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
  
  const hasRealChildren = node.children && node.children.length > 0;
  const hasVirtualChildren = node.branches && node.branches.length > 0;
  const hasChildren = hasRealChildren || hasVirtualChildren;

  // Synthesize interaction branches as visual children in the sidebar
  const virtualChildren = useMemo(() => {
    if (!node.branches) return [];
    return node.branches.map((b, bi) => ({
      id: `${node.id}__branch_${bi}`,
      label: b.label || "Interaction",
      screen_count: b.screenshots ? b.screenshots.length : 0,
      screens: [],
      children: []
    }));
  }, [node.branches, node.id]);

  // Dynamic Highlight: Highlight parent folder if any of its nested branches are active
  const isBranchOfThisNodeActive = useMemo(() => {
    if (!activeFlowId || !node.branches) return false;
    return node.branches.some((_, bi) => `${node.id}__branch_${bi}` === activeFlowId);
  }, [node.branches, node.id, activeFlowId]);

  const isActive = activeFlowId === node.id || isBranchOfThisNodeActive;

  return (
    <div className="flex flex-col" data-id={node.id}>
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
        <div className="flex items-center gap-2 pr-2 min-w-0">
          {hasChildren ? (
            <button onClick={(e) => onToggle(node.id, e)} className="p-1 -ml-1 rounded-md hover:bg-white/60 dark:hover:bg-white/10 transition-colors shrink-0">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />}
            </button>
          ) : <span className="w-5 shrink-0" />}
          
          <span className={cn(
            "truncate leading-tight",
            isActive ? "font-bold" : "font-medium",
            depth === 0 ? "text-[14px] font-bold" : "text-[13px]"
          )}>
            {node.label}
          </span>
          {node.is_reference && (
            <Link className="w-3 h-3 shrink-0 text-zinc-400 dark:text-zinc-500 opacity-50" />
          )}
        </div>
        {node.screen_count > 0 && !hasVirtualChildren && (
          <span className={cn(
            "text-[11px] tabular-nums shrink-0 font-mono font-semibold px-2 py-0.5 rounded-full",
            isActive ? "bg-white/60 dark:bg-black/40 text-zinc-800 dark:text-zinc-200" : "bg-white/30 dark:bg-white/5 text-zinc-500 dark:text-zinc-400"
          )}>
            {node.screen_count}
          </span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div className="flex flex-col mt-0.5">
          {hasRealChildren && node.children!.map((child) => (
            <SidebarNode key={child.id} node={child} depth={depth + 1} activeFlowId={activeFlowId} expandedNodes={expandedNodes} onSelect={onSelect} onToggle={onToggle} />
          ))}
          {hasVirtualChildren && virtualChildren.map((child) => (
            <SidebarNode key={child.id} node={child as any} depth={depth + 1} activeFlowId={activeFlowId} expandedNodes={expandedNodes} onSelect={onSelect} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FLOW SECTION ───────────────────────────────────────────────
interface FlowSectionProps {
  flow: FlowNode;
  catalog: Screen[];
  appName: string;
  tenantId: string;
  mode: string;
  isHighlighted: boolean;
  activeFlowId: string | null; // Pass down the globally active section ID
  onScreenClick: (screens: Screen[], index: number, label: string) => void;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  getRef: (id: string) => React.RefObject<HTMLDivElement | null>;
}

function FlowSection({
  flow, catalog, appName, tenantId, mode, isHighlighted, activeFlowId, onScreenClick, sectionRef, getRef,
}: FlowSectionProps) {
  const hasSpineOrBranches = (Array.isArray(flow.spine) && flow.spine.length > 0) || 
                             (Array.isArray(flow.branches) && flow.branches.length > 0);

  if (hasSpineOrBranches) {
    // Resolve spine screenshots
    const spineScreens = (flow.spine || [])
      .map(path => {
        const fname = path.split('/').pop()?.toLowerCase();
        return catalog.find(s => s.screenshot_file.split('/').pop()?.toLowerCase() === fname);
      })
      .filter(Boolean) as Screen[];

    return (
      <div ref={sectionRef} data-section-id={flow.id} className="flex flex-col pt-4 pb-8 divide-y divide-black/5 dark:divide-white/5">
        
        {/* Main Viewport Spine / Pristine Survey Lane */}
        {spineScreens.length > 0 && (
          <div className="py-4" data-section-id={flow.id}>
            <div className="px-10 pb-4 flex items-baseline gap-4">
              <h2 className={cn("text-2xl font-bold tracking-tight transition-colors", isHighlighted ? "text-[#0066FF]" : "text-zinc-700 dark:text-zinc-300")}>
                {flow.label}
              </h2>
              <span className="text-zinc-500 dark:text-zinc-400 text-sm font-semibold bg-white/40 dark:bg-black/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/50 dark:border-white/10">
                {spineScreens.length} screen{spineScreens.length !== 1 ? "s" : ""}
              </span>
            </div>
            {flow.description && (
              <p className="mx-10 mb-2 text-[14px] text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/30 dark:bg-black/20 backdrop-blur-md px-5 py-3 rounded-xl border border-white/40 dark:border-white/10">
                {flow.description}
              </p>
            )}
            <div className="overflow-x-auto overflow-y-hidden pb-4 pt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="flex gap-8 px-10 min-w-max items-end">
                {spineScreens.map((screen, idx) => {
                  const imgUrl = buildImgUrl(tenantId, appName, mode, screen.screenshot_file);
                  const isPanoramic = screen.screenshot_file.includes("panoramic") || screen.screenshot_file.includes("full_page");
                  const hasNav = screen.screenshot_file.includes("withnav") || (!screen.screenshot_file.includes("nonav") && isPanoramic);

                  return (
                    <div key={idx} onClick={() => onScreenClick(spineScreens, idx, flow.label)} className="group flex flex-col shrink-0 cursor-pointer">
                      <div className="relative w-[260px] h-[563px] bg-white shadow-xl transition-all duration-300 group-hover:shadow-2xl group-hover:-translate-y-1 overflow-hidden" style={{ borderRadius: "0.8rem", borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid" }}>
                        {isPanoramic ? <PanoramicMockup imgUrl={imgUrl} alt={screen.display_label} isActive={false} hasBottomNav={hasNav} /> : <img src={imgUrl} alt={screen.display_label} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Interaction Storyboard Lanes (Each has its own unique anchor ref) */}
        {(flow.branches || []).map((branch, bi) => {
          const branchId = `${flow.id}__branch_${bi}`;
          const isBranchActive = branchId === activeFlowId;
          const branchScreens = (branch.screenshots || [])
            .map(path => {
              const fname = path.split('/').pop()?.toLowerCase();
              return catalog.find(s => s.screenshot_file.split('/').pop()?.toLowerCase() === fname);
            })
            .filter(Boolean) as Screen[];

          if (branchScreens.length === 0) return null;

          return (
            <div key={bi} ref={getRef(branchId)} data-section-id={branchId} className="py-8">
              <div className="px-10 pb-4 flex items-baseline gap-4">
                {/* Dynamically highlight the active interaction branch on scroll */}
                <h3 className={cn("text-xl font-bold tracking-tight transition-colors", isBranchActive ? "text-[#0066FF]" : "text-zinc-800 dark:text-zinc-200")}>
                  {branch.label}
                </h3>
                <span className="text-zinc-500 dark:text-zinc-400 text-xs font-semibold bg-white/40 dark:bg-black/30 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/50 dark:border-white/10">
                  {branchScreens.length} screen{branchScreens.length !== 1 ? "s" : ""}
                </span>
              </div>
              {branch.description && (
                <p className="mx-10 mb-2 text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/20 dark:bg-black/10 backdrop-blur-sm px-5 py-2.5 rounded-xl border border-white/30 dark:border-white/5">
                  {branch.description}
                </p>
              )}
              <div className="overflow-x-auto overflow-y-hidden pb-4 pt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="flex gap-8 px-10 min-w-max items-end">
                  {branchScreens.map((screen, idx) => {
                    const imgUrl = buildImgUrl(tenantId, appName, mode, screen.screenshot_file);
                    const isPanoramic = screen.screenshot_file.includes("panoramic") || screen.screenshot_file.includes("full_page");
                    const hasNav = screen.screenshot_file.includes("withnav") || (!screen.screenshot_file.includes("nonav") && isPanoramic);

                    return (
                      <div key={idx} onClick={() => onScreenClick(branchScreens, idx, branch.label)} className="group flex flex-col shrink-0 cursor-pointer">
                        <div className="relative w-[260px] h-[563px] bg-white shadow-xl transition-all duration-300 group-hover:shadow-2xl group-hover:-translate-y-1 overflow-hidden" style={{ borderRadius: "0.8rem", borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid" }}>
                          {isPanoramic ? <PanoramicMockup imgUrl={imgUrl} alt={screen.display_label} isActive={false} hasBottomNav={hasNav} /> : <img src={imgUrl} alt={screen.display_label} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: Standard Linear Flow (Single Flat Track)
  const legacyScreens = (flow.screens || [])
    .map(step => catalog.find(s => Number(s.timeline_step) === Number(step)))
    .filter(Boolean) as Screen[];

  if (legacyScreens.length === 0) return null;

  return (
    <div ref={sectionRef} data-section-id={flow.id} className="flex flex-col pt-4 pb-8">
      <div className="px-10 pb-4 flex items-baseline gap-4">
        <h2 className={cn("text-2xl font-bold tracking-tight transition-colors", isHighlighted ? "text-[#0066FF]" : "text-zinc-700 dark:text-zinc-300")}>
          {flow.label}
        </h2>
        <span className="text-zinc-500 dark:text-zinc-400 text-sm font-semibold bg-white/40 dark:bg-black/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/50 dark:border-white/10">
          {legacyScreens.length} screen{legacyScreens.length !== 1 ? "s" : ""}
        </span>
      </div>
      {flow.description && (
        <p className="mx-10 mb-2 text-[14px] text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/30 dark:bg-black/20 backdrop-blur-md px-5 py-3 rounded-xl border border-white/40 dark:border-white/10">
          {flow.description}
        </p>
      )}
      <div className="overflow-x-auto overflow-y-hidden pb-4 pt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex gap-8 px-10 min-w-max items-end">
          {legacyScreens.map((screen, idx) => {
            const imgUrl = buildImgUrl(tenantId, appName, mode, screen.screenshot_file);
            const isPanoramic = screen.screenshot_file.includes("panoramic") || screen.screenshot_file.includes("full_page");
            const hasNav = screen.screenshot_file.includes("withnav") || (!screen.screenshot_file.includes("nonav") && isPanoramic);

            return (
              <div key={idx} onClick={() => onScreenClick(legacyScreens, idx, flow.label)} className="group flex flex-col shrink-0 cursor-pointer">
                <div className="relative w-[260px] h-[563px] bg-white shadow-xl transition-all duration-300 group-hover:shadow-2xl group-hover:-translate-y-1 overflow-hidden" style={{ borderRadius: "0.8rem", borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid" }}>
                  {isPanoramic ? <PanoramicMockup imgUrl={imgUrl} alt={screen.display_label} isActive={false} hasBottomNav={hasNav} /> : <img src={imgUrl} alt={screen.display_label} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
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
  const isScrollAnchoring = useRef(false);
  const anchorTimeout = useRef<NodeJS.Timeout | null>(null);

  // Helper to dynamically get or create a ref for any section or branch ID
  const getRef = useCallback((id: string) => {
    if (!sectionRefs.current.has(id)) {
      sectionRefs.current.set(id, { current: null });
    }
    return sectionRefs.current.get(id)!;
  }, []);

  // ── DUAL STYLE RESOLUTION ENGINE (SAFE ON BOTH STANDARD & BRANCHED RUNS) ──
  const resolveFlowScreens = useCallback((flow: FlowNode): Screen[] => {
    const catalog = flowsData.screen_catalog ?? [];
    
    // Determine if this run has visual spine/branch file indicators (Teardown & Pathway)
    const hasSpineOrBranches = (Array.isArray(flow.spine) && flow.spine.length > 0) || 
                               (Array.isArray(flow.branches) && flow.branches.length > 0);
                               
    if (hasSpineOrBranches) {
      const uniqueFileNames = new Set<string>();
      
      if (Array.isArray(flow.spine)) {
        flow.spine.forEach(path => {
          const fname = path.split('/').pop()?.toLowerCase();
          if (fname) uniqueFileNames.add(fname);
        });
      }
      
      if (Array.isArray(flow.branches)) {
        flow.branches.forEach(branch => {
          if (Array.isArray(branch.screenshots)) {
            branch.screenshots.forEach(path => {
              const fname = path.split('/').pop()?.toLowerCase();
              if (fname) uniqueFileNames.add(fname);
            });
          }
        });
      }
      
      return Array.from(uniqueFileNames)
        .map(fname => catalog.find(s => {
          const catalogFname = s.screenshot_file.split('/').pop()?.toLowerCase();
          return catalogFname === fname;
        }))
        .filter(Boolean) as Screen[];
        
    } else {
      return (flow.screens || [])
        .map((step) => catalog.find((s) => Number(s.timeline_step) === Number(step)))
        .filter(Boolean) as Screen[];
    }
  }, [flowsData.screen_catalog]);

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
    const target = sectionRefs.current.get(id)?.current;
    if (target) {
      isScrollAnchoring.current = true;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      
      if (anchorTimeout.current) clearTimeout(anchorTimeout.current);
      anchorTimeout.current = setTimeout(() => {
        isScrollAnchoring.current = false;
      }, 800); // Wait for smooth scroll transit to finish before releasing observer
    } else {
      // If a parent tab itself is tapped, smoothly scroll to its first child
      const parent = findFlow(sanitizedTaxonomy, id);
      if (parent && parent.children && parent.children.length > 0) {
        const firstChildId = parent.children[0].id;
        const firstChildTarget = sectionRefs.current.get(firstChildId)?.current;
        if (firstChildTarget) {
          isScrollAnchoring.current = true;
          firstChildTarget.scrollIntoView({ behavior: "smooth", block: "start" });
          
          if (anchorTimeout.current) clearTimeout(anchorTimeout.current);
          anchorTimeout.current = setTimeout(() => {
            isScrollAnchoring.current = false;
          }, 800);
        }
      }
    }
  }, [sanitizedTaxonomy]);

  const openDetail = useCallback((screens: Screen[], index: number, label: string) => {
    setDetailModal({ screens, initialIndex: index, flowLabel: label });
  }, []);

  // ─── DYNAMIC INTERSECTION OBSERVER (SCROLL-SPY ENGINE) ───
  useEffect(() => {
    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      if (isScrollAnchoring.current) return;

      const intersectingEntries = entries.filter(entry => entry.isIntersecting);
      
      if (intersectingEntries.length > 0) {
        // Find the intersection entry closest to the top of the viewport
        const bestEntry = intersectingEntries.reduce((best, current) => {
          return (current.boundingClientRect.top < best.boundingClientRect.top) ? current : best;
        });
        
        const id = bestEntry.target.getAttribute("data-section-id");
        if (id) {
          setActiveFlowId(id);
        }
      }
    };

    const observer = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: "-15% 0px -70% 0px", // Trigger active state when entering the upper-middle reading band
      threshold: 0
    });

    // Observe all container divs currently registered in sectionRefs
    sectionRefs.current.forEach((ref) => {
      if (ref.current) {
        observer.observe(ref.current);
      }
    });

    return () => {
      observer.disconnect();
      if (anchorTimeout.current) clearTimeout(anchorTimeout.current);
    };
  }, [allFlows, sanitizedTaxonomy]);

  // ─── ANCESTRY AUTO-EXPANSION ON SCROLL ───
  useEffect(() => {
    if (!activeFlowId) return;

    // Recursively walk the active ID's path and expand all parental folders in the sidebar
    const findParentPath = (nodes: FlowNode[], targetId: string, path: string[] = []): string[] | null => {
      for (const n of nodes) {
        if (n.id === targetId) return path;

        // Trace virtual branch children
        if (n.branches) {
          const hasBranch = n.branches.some((_, bi) => `${n.id}__branch_${bi}` === targetId);
          if (hasBranch) return [...path, n.id];
        }

        // Trace real taxonomy children
        if (n.children) {
          const found = findParentPath(n.children, targetId, [...path, n.id]);
          if (found) return found;
        }
      }
      return null;
    };

    const parentPath = findParentPath(sanitizedTaxonomy, activeFlowId);
    if (parentPath && parentPath.length > 0) {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        let changed = false;
        parentPath.forEach(id => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [activeFlowId, sanitizedTaxonomy]);

  // ─── DYNAMIC SIDEBAR AUTO-SCROLLER ───
  useEffect(() => {
    if (activeFlowId) {
      const activeEl = document.querySelector(`[data-id="${activeFlowId}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [activeFlowId]);

  // Pre-initialize refs for every section and sub-branch in the active tree
  useEffect(() => {
    for (const flow of allFlows) {
      if (!sectionRefs.current.has(flow.id)) {
        sectionRefs.current.set(flow.id, { current: null });
      }
      if (flow.branches) {
        flow.branches.forEach((_, bi) => {
          const branchId = `${flow.id}__branch_${bi}`;
          if (!sectionRefs.current.has(branchId)) {
            sectionRefs.current.set(branchId, { current: null });
          }
        });
      }
    }
    sanitizedTaxonomy.forEach(root => {
      if (!sectionRefs.current.has(root.id)) {
        sectionRefs.current.set(root.id, { current: null });
      }
    });
  }, [allFlows, sanitizedTaxonomy]);

  if (!flowsData?.taxonomy?.length) {
    return (
      <div className="flex h-[500px] items-center justify-center">
        <div className="flex flex-col items-center gap-4 bg-white/40 dark:bg-black/30 backdrop-blur-xl border border-white/50 dark:border-white/10 p-8 rounded-3xl shadow-xl">
          <Layers className="w-8 h-8 opacity-50 text-zinc-500" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No flow taxonomy generated yet.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-start bg-transparent relative w-full h-full">

        {/* ═══ LEFT SIDEBAR ═══ */}
        <div className="w-[280px] sticky top-[24px] h-[calc(100vh-48px)] flex flex-col border-r border-black/5 dark:border-white/10 shrink-0 z-10">
          <div className="px-6 pt-6 pb-4 shrink-0 border-b border-black/5 dark:border-white/5">
            <h3 className="text-zinc-500 dark:text-zinc-400 text-[11px] font-bold uppercase tracking-[0.15em]">
              Flows Explorer
            </h3>
          </div>
          <div className="flex-1 min-h-0 w-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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

        {/* ═══ MAIN CONTENT (ONE GIANT CONTINUOUS CANVAS) ═══ */}
        <div className="flex-1 min-w-0 bg-transparent">
          <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
            {sanitizedTaxonomy.map((rootNode) => {
              // Gather every unique screenshot under this entire parent node sequentially
              const combinedScreens: Screen[] = [];
              const leaves = getLeafFlows(rootNode);
              leaves.forEach(leaf => {
                const leafScreens = resolveFlowScreens(leaf);
                leafScreens.forEach(s => {
                  if (!combinedScreens.some(exist => exist.screenshot_file === s.screenshot_file)) {
                    combinedScreens.push(s);
                  }
                });
              });

              return (
                <div key={rootNode.id} className="flex flex-col">
                  
                  {/* Parent Tab Master Timeline View */}
                  <div ref={getRef(rootNode.id)} data-section-id={rootNode.id} className="flex flex-col pt-8 pb-8 bg-zinc-50/20 dark:bg-black/10">
                    <div className="px-10 pb-4 flex items-baseline gap-4">
                      <h2 className={cn("text-3xl font-extrabold tracking-tight transition-colors", rootNode.id === activeFlowId ? "text-[#0066FF]" : "text-zinc-900 dark:text-white")}>
                        {rootNode.label}
                      </h2>
                      <span className="text-zinc-500 dark:text-zinc-400 text-sm font-semibold bg-white/40 dark:bg-black/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/50 dark:border-white/10">
                        {combinedScreens.length} screen{combinedScreens.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {rootNode.description && (
                      <p className="mx-10 mb-4 text-[14px] text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/30 dark:bg-black/20 backdrop-blur-md px-5 py-3 rounded-xl border border-white/40 dark:border-white/10">
                        {rootNode.description}
                      </p>
                    )}
                    <div className="overflow-x-auto overflow-y-hidden pb-4 pt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                      <div className="flex gap-8 px-10 min-w-max items-end">
                        {combinedScreens.map((screen, idx) => {
                          const imgUrl = buildImgUrl(tenantId, appName, mode, screen.screenshot_file);
                          const isPanoramic = screen.screenshot_file.includes("panoramic") || screen.screenshot_file.includes("full_page");
                          const hasNav = screen.screenshot_file.includes("withnav") || (!screen.screenshot_file.includes("nonav") && isPanoramic);

                          return (
                            <div key={idx} onClick={() => openDetail(combinedScreens, idx, rootNode.label)} className="group flex flex-col shrink-0 cursor-pointer">
                              <div className="relative w-[260px] h-[563px] bg-white shadow-xl transition-all duration-300 group-hover:shadow-2xl group-hover:-translate-y-1 overflow-hidden" style={{ borderRadius: "0.8rem", borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid" }}>
                                {isPanoramic ? <PanoramicMockup imgUrl={imgUrl} alt={screen.display_label} isActive={false} hasBottomNav={hasNav} /> : <img src={imgUrl} alt={screen.display_label} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Child Storyboard Lanes belonging to this parent */}
                  {rootNode.children?.map((childFlow) => {
                    const leafScreens = resolveFlowScreens(childFlow);
                    if (leafScreens.length === 0) return null;

                    return (
                      <FlowSection
                        key={childFlow.id} flow={childFlow} catalog={flowsData.screen_catalog ?? []}
                        appName={appName} tenantId={tenantId} mode={mode}
                        isHighlighted={childFlow.id === activeFlowId || (childFlow.branches?.some((_, bi) => `${childFlow.id}__branch_${bi}` === activeFlowId) ?? false)}
                        activeFlowId={activeFlowId} // Pass down activeFlowId so children can highlight
                        onScreenClick={openDetail}
                        sectionRef={getRef(childFlow.id)}
                        getRef={getRef} // Pass getRef down so we can attach refs to the dynamic branches!
                      />
                    );
                  })}

                </div>
              );
            })}
          </div>
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