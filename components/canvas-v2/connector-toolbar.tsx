"use client";

import { useCanvasV2PopoverViewport } from "./use-popover-viewport";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CanvasV2ColorPalette } from "@/components/canvas-v2/color-palette";
import { Bold, Strikethrough, ChevronDown, Type } from "lucide-react";
import type { CanvasV2ConnectorAppearance, CanvasV2ConnectorCap } from "@/lib/canvas-v2/connector-geometry";

const CAPS: Array<[CanvasV2ConnectorCap, string]> = [["none", "None"], ["line-arrow", "Line arrow"], ["triangle", "Triangle arrow"], ["reverse-triangle", "Reversed triangle"], ["circle", "Circle"], ["diamond", "Diamond"]];

function Endpoint({ cap, start = false }: { cap: CanvasV2ConnectorCap; start?: boolean }) {
  return <svg aria-hidden viewBox="0 0 32 24" className="h-5 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: start ? "scaleX(-1)" : undefined }}>
    <path d={cap === "none" ? "M 3 12 H 29" : "M 3 12 H 19"} />
    {cap === "line-arrow" && <path d="m 20 6 7 6 -7 6" />}
    {cap === "triangle" && <path d="M 19 6 L 29 12 L 19 18 Z" />}
    {cap === "reverse-triangle" && <path d="M 29 6 L 19 12 L 29 18 Z" />}
    {cap === "circle" && <circle cx="24" cy="12" r="5" />}
    {cap === "diamond" && <path d="M 18 12 L 24 6 L 30 12 L 24 18 Z" />}
  </svg>;
}
function Route({ value }: { value: CanvasV2ConnectorAppearance["route"] }) {
  return <svg aria-hidden viewBox="0 0 28 28" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={value === "bent" ? "M 5 23 H 12 V 5 H 23" : value === "curve" ? "M 5 23 C 20 23 8 5 23 5" : "M 5 23 L 23 5"} /></svg>;
}
export function CanvasV2ConnectorToolbar({ value, onChange, onEditText, placement, editing = false }: { editing?: boolean; value: CanvasV2ConnectorAppearance; onChange: (style: CanvasV2ConnectorAppearance) => void; onEditText: () => void; placement: "above" | "below" | "side" | "dock" }) {
  const [menu, setMenu] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);
  useCanvasV2PopoverViewport(ref, menu);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setMenu(undefined); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setMenu(undefined); } };
    document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", key, true); };
  }, [menu]);
  const buttonClass = "flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1597f4]";
  const option = (label: string, active: boolean, icon: ReactNode, action: () => void) => <button type="button" key={label} title={label} aria-label={label} aria-pressed={active} onClick={action} className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-lg px-2 ${active ? "bg-[#8b36f4]" : "hover:bg-white/10"}`}>{icon}</button>;
  const popup = (name: string, children: ReactNode) => menu === name && <div data-canvas-v2-popover role="group" aria-label={`${name} options`} className={`absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap ${name === "Color" ? "" : "rounded-[12px] border border-white/10 bg-[#1c1c20] p-2 shadow-xl"} ${placement === "above" ? "bottom-[calc(100%+12px)]" : "top-[calc(100%+12px)]"}`}>{children}</div>;
  const trigger = (name: string, icon: ReactNode, children: ReactNode) => <div className="relative"><button type="button" aria-label={`Connector ${name.toLowerCase()}`} title={name} aria-expanded={menu === name} onClick={() => { setMenu(menu === name ? undefined : name); }} className={`${buttonClass} ${menu === name ? "bg-white/10" : ""}`}>{icon}<ChevronDown className="h-2.5 w-2.5" /></button>{popup(name, children)}</div>;
  return <div ref={ref} data-canvas-v2-connector-toolbar className="flex items-center gap-1" onPointerDown={event => { event.stopPropagation(); if (editing && !(event.target as Element).closest("input")) event.preventDefault(); }}>
    {trigger("Color", <span className="h-4 w-4 rounded-full border border-white/25" style={{ background: value.color || "#808080" }} />, <CanvasV2ColorPalette colors={[value.color || "#808080"]} onChange={color => onChange({ color })} header={<><span className="px-2 text-[11px] font-semibold">Stroke</span><button type="button" aria-label="Show connector text background" aria-pressed={!!value.labelBackground} onClick={() => onChange({ labelBackground: !value.labelBackground })} className="ml-auto flex h-7 items-center gap-2 rounded-md px-2 text-[11px] hover:bg-white/10"><span className={`grid h-4 w-4 place-items-center rounded-sm border border-white/20 text-[10px] ${value.labelBackground ? "bg-[#874cf2]" : ""}`}>T</span>Text background</button></>} />)}
    {trigger("Line style", <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M 3 4 H 21 M 3 9 H 21 V 12 H 3 Z M 3 17 H 21 V 22 H 3 Z" /></svg>, <>
      {option("Thin connector", value.weight === 2, <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M 2 17 Q 6 3 11 12 T 22 7" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>, () => onChange({ weight: 2 }))}
      {option("Thick connector", value.weight === 4, <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M 2 17 Q 6 3 11 12 T 22 7" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>, () => onChange({ weight: 4 }))}
      <span className="mx-1 h-7 w-px bg-white/15" />
      {option("Solid connector", !value.dashed, <Route value="straight" />, () => onChange({ dashed: false }))}
      {option("Dashed connector", !!value.dashed, <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M 3 21 L 21 3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" /></svg>, () => onChange({ dashed: true }))}
    </>)}
    <span className="mx-1 h-6 w-px bg-white/15" />
    <div className="relative"><button type="button" aria-label="Edit connector label" title="Text" className={buttonClass} onClick={() => { setMenu(undefined); onEditText(); }}><Type className="h-5 w-5" /></button></div>
    {editing && <>{option("Bold connector label", !!value.labelBold, <Bold className="h-4 w-4" />, () => onChange({ labelBold: !value.labelBold }))}{option("Strike through connector label", !!value.labelStrike, <Strikethrough className="h-4 w-4" />, () => onChange({ labelStrike: !value.labelStrike }))}</>}
    <span className="mx-1 h-6 w-px bg-white/15" />
    {trigger("Start point", <Endpoint cap={value.start || "none"} start />, CAPS.map(([cap, label]) => option(`Start: ${label}`, (value.start || "none") === cap, <Endpoint cap={cap} start />, () => { onChange({ start: cap }); setMenu(undefined); })))}
    {trigger("Line shape", <Route value={value.route} />, ([['bent', 'Bent'], ['curve', 'Curved'], ['straight', 'Straight']] as const).map(([route, label]) => option(`${label} connector`, value.route === route, <Route value={route} />, () => { onChange({ route }); setMenu(undefined); })))}
    {trigger("End point", <Endpoint cap={value.end || "none"} />, CAPS.map(([cap, label]) => option(`End: ${label}`, (value.end || "none") === cap, <Endpoint cap={cap} />, () => { onChange({ end: cap }); setMenu(undefined); })))}
  </div>;
}
