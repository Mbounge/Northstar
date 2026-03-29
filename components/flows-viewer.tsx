//components/flows-viewer.tsx

"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  ChevronRight,
  ChevronDown,
  Layers,
  X,
  Copy,
  Bookmark,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Figma,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

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
}

interface FlowsData {
  taxonomy: FlowNode[];
  screen_catalog: Screen[];
}

// ─── HELPERS ────────────────────────────────────────────────────
function collectAllFlows(nodes: FlowNode[]): FlowNode[] {
  const result: FlowNode[] =[];
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

// ─── DETAIL MODAL ───────────────────────────────────────────────
function ScreenDetailModal({
  screens,
  initialIndex,
  flowLabel,
  appName,
  mode,
  onClose,
}: {
  screens: Screen[];
  initialIndex: number;
  flowLabel: string;
  appName: string;
  mode: string;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const scrollToIndex = useCallback(
    (idx: number, behavior: ScrollBehavior = "smooth") => {
      if (scrollRef.current) {
        const child = scrollRef.current.children[idx] as HTMLElement;
        if (child) {
          const container = scrollRef.current;
          const scrollLeft =
            child.offsetLeft -
            container.offsetWidth / 2 +
            child.offsetWidth / 2;
          container.scrollTo({ left: scrollLeft, behavior });
        }
      }
    },[]
  );

  useEffect(() => {
    requestAnimationFrame(() => scrollToIndex(initialIndex, "instant"));
  },[initialIndex, scrollToIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        setCurrentIndex((i) => {
          const next = Math.min(i + 1, screens.length - 1);
          requestAnimationFrame(() => scrollToIndex(next));
          return next;
        });
      }
      if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => {
          const next = Math.max(i - 1, 0);
          requestAnimationFrame(() => scrollToIndex(next));
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, screens.length, scrollToIndex]);

  // Click outside modal to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    // Backdrop — dimmed, click to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-150"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)" }}
      onClick={handleBackdropClick}
    >
      {/* Modal container — ~90% of viewport, rounded, fully opaque */}
      <div
        ref={modalRef}
        className="relative w-full h-full max-w-[96%] max-h-[92%] bg-[#1C1C1C] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-[0.98] duration-200"
      >
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-6 h-[60px] shrink-0">
          {/* Left: Flow label with Figma icon */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-white text-[13px] font-medium truncate">
              {flowLabel}
            </span>
          </div>

          {/* Center: Screens toggle */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-[#2A2A2A] rounded-full p-[3px]">
            <button className="px-4 py-1.5 rounded-full text-[13px] font-medium text-white bg-[#3A3A3A]">
              Screens
            </button>
          </div>

          {/* Right: User avatar + actions + close */}
          <div className="flex items-center gap-1">
            {/* Figma logo placeholder */}
            <div className="w-7 h-7 rounded-full bg-[#2A2A2A] flex items-center justify-center mr-1">
              <Figma className="w-3.5 h-3.5 text-white/80" />
            </div>
            {/* User avatar placeholder */}
            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-[11px] font-semibold text-white mr-2">
              U
            </div>

            <div className="w-px h-5 bg-white/[0.08] mx-1" />

            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] transition-all">
              <MessageSquare className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] transition-all">
              <Link2 className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-white/[0.08] mx-1" />

            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Screens strip ── */}
        <div className="flex-1 relative overflow-hidden">
          <div
            ref={scrollRef}
            className="flex items-end h-full overflow-x-auto overflow-y-hidden px-10 pb-6 pt-4 gap-3 scrollbar-none scroll-smooth"
          >
            {screens.map((screen, idx) => {
              const imgUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${appName}/${mode}/screenshots/${screen.screenshot_file}`;
              const isActive = idx === currentIndex;
              const isHovered = idx === hoveredIndex;

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setCurrentIndex(idx);
                    requestAnimationFrame(() => scrollToIndex(idx));
                  }}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={cn(
                    "shrink-0 cursor-pointer transition-all duration-300 ease-out relative",
                    isActive ? "h-[97%]" : "h-[80%] hover:h-[84%]"
                  )}
                >
                  <div
                    className={cn(
                      "relative h-full aspect-[9/19.5] rounded-2xl overflow-hidden transition-all duration-300",
                      isActive
                        ? "opacity-100"
                        : "opacity-35 hover:opacity-55"
                    )}
                  >
                    <Image
                      src={imgUrl}
                      alt={screen.display_label}
                      fill
                      className="object-contain bg-[#222]"
                      unoptimized
                    />

                    {/* Hover overlay with Save/Copy pill buttons */}
                    {(isHovered || isActive) && isHovered && (
                      <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-5 gap-2 animate-in fade-in duration-150">
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="h-9 px-5 rounded-full bg-white text-[13px] font-semibold text-[#1C1C1C] hover:bg-white/90 transition-colors shadow-lg"
                        >
                          Save
                        </button>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="h-9 px-5 rounded-full bg-white text-[13px] font-semibold text-[#1C1C1C] hover:bg-white/90 transition-colors shadow-lg flex items-center gap-1.5"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="flex items-center justify-between px-6 h-[56px] shrink-0 border-t border-white/[0.06]">
          {/* Left: Screen label */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white text-[13px] truncate">
              {screens[currentIndex]?.display_label}
            </span>
          </div>

          {/* Center: Action buttons — white pills */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <button className="h-9 px-5 flex items-center gap-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[13px] font-medium text-white transition-all border border-white/[0.08]">
              <Bookmark className="w-3.5 h-3.5" />
              Save
            </button>
            <button className="h-9 px-5 flex items-center gap-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[13px] font-medium text-white transition-all border border-white/[0.08]">
              <Figma className="w-3.5 h-3.5" />
              Copy
            </button>
            <button className="h-9 w-9 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white transition-all border border-white/[0.08]">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Right: More info */}
          <div className="flex items-center gap-4">
            <span className="text-white/70 text-[12px] tabular-nums">
              {currentIndex + 1} / {screens.length}
            </span>
            <button className="text-white hover:text-white/80 text-[13px] transition-colors">
              More info
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR NODE ───────────────────────────────────────────────
function SidebarNode({
  node,
  depth = 0,
  activeFlowId,
  expandedNodes,
  onSelect,
  onToggle,
}: {
  node: FlowNode;
  depth?: number;
  activeFlowId: string | null;
  expandedNodes: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string, e: React.MouseEvent) => void;
}) {
  const isExpanded = expandedNodes.has(node.id);
  const isActive = activeFlowId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const isTopLevel = depth === 0;

  return (
    <div className="flex flex-col">
      <div
        onClick={() => onSelect(node.id)}
        className={cn(
          "group flex items-center justify-between py-[7px] cursor-pointer select-none transition-colors duration-150",
          isActive ? "text-white" : "text-white/70 hover:text-white",
          isTopLevel && "mt-0.5"
        )}
        style={{ paddingLeft: `${depth * 16 + 16}px`, paddingRight: "16px" }}
      >
        <div className="flex items-center gap-1.5 truncate pr-2 min-w-0">
          {hasChildren ? (
            <button
              onClick={(e) => onToggle(node.id, e)}
              className="p-0.5 -ml-0.5 rounded hover:bg-white/[0.04] transition-colors shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-white/40" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-white/40" />
              )}
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}
          <span
            className={cn(
              "text-[13px] truncate leading-tight",
              isActive ? "font-medium" : "font-normal",
              isTopLevel && "font-medium"
            )}
          >
            {node.label}
          </span>
        </div>

        {node.screen_count > 0 && (
          <span
            className={cn(
              "text-[11px] tabular-nums shrink-0",
              isActive ? "text-white/70" : "text-white/40 group-hover:text-white/60"
            )}
          >
            {node.screen_count}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {node.children!.map((child) => (
            <SidebarNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFlowId={activeFlowId}
              expandedNodes={expandedNodes}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FLOW SECTION ───────────────────────────────────────────────
function FlowSection({
  flow,
  screens,
  appName,
  mode,
  isHighlighted,
  onScreenClick,
  sectionRef,
}: {
  flow: FlowNode;
  screens: Screen[];
  appName: string;
  mode: string;
  isHighlighted: boolean;
  onScreenClick: (screens: Screen[], index: number, label: string) => void;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={sectionRef} className="flex flex-col">
      <div className="px-8 pt-8 pb-3">
        <h2
          className={cn(
            "text-[15px] font-semibold tracking-[-0.01em] transition-colors",
            isHighlighted ? "text-white" : "text-white/80"
          )}
        >
          {flow.label}
        </h2>
        <span className="text-white/60 text-[13px]">
          {screens.length} screen{screens.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/[0.04] hover:scrollbar-thumb-white/[0.08] pb-4">
        <div className="flex gap-3 px-8 min-w-max">
          {screens.map((screen, idx) => {
            const imgUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${appName}/${mode}/screenshots/${screen.screenshot_file}`;

            return (
              <div
                key={idx}
                onClick={() => onScreenClick(screens, idx, flow.label)}
                className="group flex flex-col shrink-0 cursor-pointer animate-in fade-in duration-200"
                style={{
                  animationDelay: `${idx * 30}ms`,
                  animationFillMode: "both",
                }}
              >
                <div className="relative w-[232px] h-[502px] rounded-xl overflow-hidden bg-[#161616] ring-1 ring-white/[0.03] group-hover:ring-white/[0.06] transition-all duration-200 group-hover:shadow-lg group-hover:shadow-black/20">
                  <Image
                    src={imgUrl}
                    alt={screen.display_label}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>

                <div className="pt-3 w-[232px] flex flex-col items-center text-center gap-1.5">
                  <span
                    className="text-white text-[12px] font-medium truncate w-full group-hover:text-white transition-colors duration-200"
                    title={screen.display_label}
                  >
                    {screen.display_label}
                  </span>
                  <span className="text-white text-[10px] font-semibold tabular-nums bg-white/[0.08] px-2.5 py-0.5 rounded-full">
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
  flowsData,
  appName,
  mode,
}: {
  flowsData: FlowsData;
  appName: string;
  mode: string;
}) {
  const [activeFlowId, setActiveFlowId] = useState<string | null>(
    flowsData?.taxonomy?.[0]?.id || null
  );
  const[expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(flowsData?.taxonomy?.map((t) => t.id) || [])
  );
  const [detailModal, setDetailModal] = useState<{
    screens: Screen[];
    initialIndex: number;
    flowLabel: string;
  } | null>(null);

  const sectionRefs = useRef<Map<string, React.RefObject<HTMLDivElement | null>>>(new Map());

  const allFlows = useMemo(() => collectAllFlows(flowsData.taxonomy), [flowsData]);

  const flowScreensMap = useMemo(() => {
    const map = new Map<string, Screen[]>();
    for (const flow of allFlows) {
      const resolved = flow.screens
        .map((step) =>
          flowsData.screen_catalog.find((s) => s.timeline_step === step)
        )
        .filter(Boolean) as Screen[];
      map.set(flow.id, resolved);

      if (!sectionRefs.current.has(flow.id)) {
        sectionRefs.current.set(flow.id, { current: null });
      }
    }
    return map;
  }, [allFlows, flowsData.screen_catalog]);

  const toggleExpand = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  },[]);

  const handleSidebarSelect = useCallback((id: string) => {
    setActiveFlowId(id);
    const ref = sectionRefs.current.get(id);
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  },[]);

  const openDetail = useCallback(
    (screens: Screen[], index: number, label: string) => {
      setDetailModal({ screens, initialIndex: index, flowLabel: label });
    },[]
  );

  if (!flowsData || !flowsData.taxonomy || flowsData.taxonomy.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-white/60 bg-[#111]">
        <div className="flex flex-col items-center gap-3">
          <Layers className="w-7 h-7 opacity-40" />
          <p className="text-sm">No flow taxonomy generated yet.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full bg-[#111] overflow-hidden">
        {/* ═══ LEFT SIDEBAR ═══ */}
        <div className="w-[260px] bg-[#111] border-r border-white/[0.06] flex flex-col shrink-0">
          <div className="px-4 pt-5 pb-3">
            <h3 className="text-white text-xs font-semibold uppercase tracking-wider">
              Flows
            </h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col pb-4">
              {flowsData.taxonomy.map((node) => (
                <SidebarNode
                  key={node.id}
                  node={node}
                  activeFlowId={activeFlowId}
                  expandedNodes={expandedNodes}
                  onSelect={handleSidebarSelect}
                  onToggle={toggleExpand}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* ═══ MAIN ═══ */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          {activeFlowId &&
            (() => {
              const flow = findFlow(flowsData.taxonomy, activeFlowId);
              if (!flow) return null;
              return (
                <div className="px-8 pt-8 pb-3 border-b border-white/[0.04]">
                  <h1 className="text-xl font-semibold text-white tracking-[-0.01em] mb-1">
                    {flow.label}
                  </h1>
                  <span className="text-white/70 text-sm">
                    {flow.screen_count} screens
                  </span>
                  {flow.description && (
                    <p className="text-white/70 text-sm mt-1.5 max-w-3xl leading-relaxed">
                      {flow.description}
                    </p>
                  )}
                </div>
              );
            })()}

          <div className="flex flex-col divide-y divide-white/[0.04]">
            {allFlows.map((flow) => {
              const screens = flowScreensMap.get(flow.id) ||[];
              if (screens.length === 0) return null;

              return (
                <FlowSection
                  key={flow.id}
                  flow={flow}
                  screens={screens}
                  appName={appName}
                  mode={mode}
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
          mode={mode}
          onClose={() => setDetailModal(null)}
        />
      )}
    </>
  );
}