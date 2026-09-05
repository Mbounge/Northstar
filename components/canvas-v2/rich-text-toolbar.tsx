"use client";

import { useCanvasV2PopoverViewport } from "./use-popover-viewport";

import { CanvasV2ColorPalette } from "@/components/canvas-v2/color-palette";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlignCenter, AlignLeft, AlignRight, Bold, Check, ChevronDown, Italic, Link, List, ListOrdered, Strikethrough } from "lucide-react";
import { canvasV2SafeTextLink, canvasV2TextColorSwatch, canvasV2TextStyleSummary } from "@/lib/canvas-v2/rich-text";

const fonts = [["Simple", "Inter,system-ui,sans-serif"], ["Bookish", "Georgia,serif"], ["Technical", "monospace"], ["Scribbled", "cursive"]];

const control = "grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-white/[.1] aria-pressed:bg-white/[.12]";

/** Range commands retain the original canvas toolbar's compact visual language. */
export function CanvasV2RichTextToolbar({ editable, finish }: { editable: HTMLElement; finish: () => void }) {
  const range = useRef<Range | null>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<"font" | "size" | "color" | "list" | "align" | "link">();
  useCanvasV2PopoverViewport(toolbar, menu);
  const [link, setLink] = useState("");
  const [sizeDraft, setSizeDraft] = useState("");
  const [summary, setSummary] = useState(() => canvasV2TextStyleSummary(editable));
  const [position, setPosition] = useState({ left: 16, top: 100 });
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const track = () => {
      const selection = window.getSelection();
      if (selection?.rangeCount && editable.contains(selection.anchorNode) && editable.contains(selection.focusNode)) {
        range.current = selection.getRangeAt(0).cloneRange();
        setSummary(canvasV2TextStyleSummary(editable, range.current));
      }
      // A cell's toolbar belongs outside the entire table, not over its rows.
      const bounds = (editable.closest("table") ?? editable).getBoundingClientRect();
      const width = toolbar.current?.offsetWidth ?? 550;
      const height = toolbar.current?.offsetHeight ?? 56;
      const isBelow = bounds.top - height - 20 < 90;
      setBelow(isBelow);
      setPosition({ left: Math.max(16, Math.min(window.innerWidth - width - 16, bounds.left + bounds.width / 2 - width / 2)), top: Math.max(90, Math.min(window.innerHeight - height - 96, isBelow ? bounds.bottom + 20 : bounds.top - height - 20)) });
    };
    const openLink = () => { setLink(""); setMenu("link"); };
    editable.addEventListener("northstar-text-link", openLink);
    editable.addEventListener("input", track);
    document.addEventListener("selectionchange", track);
    window.addEventListener("resize", track);
    track();
    const observer = new ResizeObserver(track);
    observer.observe(editable);
    if (toolbar.current) observer.observe(toolbar.current);
    return () => { observer.disconnect(); editable.removeEventListener("northstar-text-link", openLink); editable.removeEventListener("input", track); document.removeEventListener("selectionchange", track); window.removeEventListener("resize", track); };
  }, [editable]);
  const command = (name: string, value?: string) => {
    editable.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (range.current && selection) { selection.removeAllRanges(); selection.addRange(range.current); }
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(name, false, value);
    if (selection?.rangeCount) range.current = selection.getRangeAt(0).cloneRange();
    editable.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const setSize = (value: string) => {
    const size = Number(value);
    if (!Number.isFinite(size) || size < 8 || size > 240) return;
    command("fontSize", "7");
    editable.querySelectorAll<HTMLElement>('font[size="7"], [style*="xxx-large"]').forEach((element) => {
      if (!range.current?.intersectsNode(element)) return;
      element.removeAttribute("size"); element.style.fontSize = `${size}px`;
    });
    editable.dispatchEvent(new Event("input", { bubbles: true })); setMenu(undefined);
  };
  const toggle = (next: typeof menu) => setMenu(current => current === next ? undefined : next);
  const family = summary.fontFamily.toLowerCase();
  const fontLabel = family === "mixed" ? "Mixed" : family.includes("georgia") ? "Bookish" : family.includes("mono") ? "Technical" : family.includes("cursive") ? "Scribbled" : "Simple";
  const popover = `absolute left-0 rounded-[12px] border border-white/[.1] bg-[#1c1c20] p-2 shadow-2xl ${below ? "top-[calc(100%+10px)]" : "bottom-[calc(100%+10px)]"}`;
  return createPortal(<div ref={toolbar} data-canvas-v2-rich-toolbar role="toolbar" aria-label="Text formatting" style={{ position: "fixed", ...position, zIndex: 100 }} className="flex min-h-10 max-w-[calc(100vw-32px)] items-center gap-1 rounded-[12px] border border-white/[.08] bg-[#1c1c20]/[.98] px-1.5 text-white shadow-[0_6px_20px_rgba(0,0,0,.22)] backdrop-blur-xl" onPointerDown={(event) => { event.stopPropagation(); if (!(event.target as HTMLElement).closest("input")) event.preventDefault(); }}>
    <button type="button" aria-label="Text range colors" title={summary.textColors.length > 1 ? "Mixed text colors" : "Text color"} aria-expanded={menu === "color"} className="flex h-7 shrink-0 items-center gap-2 rounded-lg px-2 hover:bg-white/[.1]" onClick={() => toggle("color")}><span data-testid="canvas-v2-range-color-swatch" className="h-4 w-4 rounded-full border border-[#48484a]" style={{ background: canvasV2TextColorSwatch(summary.textColors) }} /><ChevronDown className="h-3 w-3" /></button>
    <button type="button" aria-label="Text range font" aria-expanded={menu === "font"} onClick={() => toggle("font")} className="flex h-7 min-w-[80px] items-center justify-between gap-2 rounded-lg px-3 text-xs font-bold hover:bg-white/[.1]">{fontLabel}<ChevronDown className="h-3.5 w-3.5" /></button>
    <button type="button" aria-label="Text range size" aria-expanded={menu === "size"} onClick={() => { setSizeDraft(summary.fontSize === "mixed" ? "" : String(parseFloat(summary.fontSize))); toggle("size"); }} className="flex h-7 min-w-[52px] items-center justify-between gap-2 rounded-lg px-3 text-xs font-bold hover:bg-white/[.1]">{summary.fontSize === "mixed" ? "Mixed" : Math.round(parseFloat(summary.fontSize))}<ChevronDown className="h-3.5 w-3.5" /></button>
    {[["bold", "bold", Bold, summary.fontWeight === "mixed" ? "mixed" : parseInt(summary.fontWeight) >= 600], ["italic", "italic", Italic, summary.fontStyle === "mixed" ? "mixed" : summary.fontStyle === "italic"], ["strikethrough", "strikeThrough", Strikethrough, summary.textDecoration === "mixed" ? "mixed" : summary.textDecoration.includes("line-through")]] .map(([label, action, Icon, active]) => {
      const Glyph = Icon as typeof Bold;
      return <button key={String(action)} type="button" aria-label={`Text range ${label}`} title={String(label)} aria-pressed={active as boolean | "mixed"} className={control} onClick={() => command(String(action))}><Glyph className="h-4 w-4" /></button>;
    })}
    <button type="button" aria-label="Text range link" title="Link" className={control} onClick={() => { setLink(""); toggle("link"); }}><Link className="h-4 w-4" /></button>
    <button type="button" aria-label="Text range lists" title="Lists" aria-expanded={menu === "list"} className={control} onClick={() => toggle("list")}><List className="h-4 w-4" /></button>
    <div className="mx-1 h-7 w-px bg-white/[.12]" />
    <button type="button" aria-label="Text range alignment" title="Alignment" aria-expanded={menu === "align"} className={control} onClick={() => toggle("align")}>{summary.textAlign === "center" ? <AlignCenter className="h-4 w-4" /> : summary.textAlign === "right" ? <AlignRight className="h-4 w-4" /> : <AlignLeft className="h-4 w-4" />}</button>
    <button type="button" aria-label="Finish text editing" title="Finish editing · Escape" className={control} onClick={finish}><Check className="h-4 w-4" /></button>
    {menu === "font" && <div data-canvas-v2-popover className={`${popover} w-[180px]`}>{fonts.map(([label, value]) => <button key={label} type="button" className="flex h-8 w-full items-center rounded-lg px-3 text-sm hover:bg-white/10" style={{ fontFamily: value }} onClick={() => { command("fontName", value); setMenu(undefined); }}>{label}</button>)}</div>}
    {menu === "size" && <form data-canvas-v2-popover className={`${popover} w-44`} onSubmit={event => { event.preventDefault(); setSize(sizeDraft); }}><input autoFocus aria-label="Custom text range size" type="number" min="8" max="240" placeholder="Mixed" value={sizeDraft} onChange={event => setSizeDraft(event.target.value)} className="w-full rounded-lg border border-white/20 bg-transparent px-3 py-2 text-sm" /><div className="mt-1 grid grid-cols-3">{[12,16,20,24,28,32,40,48,64].map(size => <button key={size} type="button" className="h-7 rounded-lg text-xs hover:bg-white/10" onClick={() => setSize(String(size))}>{size}</button>)}</div></form>}
    {menu === "color" && <div data-canvas-v2-popover className={`absolute left-0 ${below ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]"}`}><CanvasV2ColorPalette colors={summary.textColors} onChange={color => command("foreColor", color)} header={<span className="px-2 text-[11px] font-semibold">Text</span>} /></div>}
    {menu === "list" && <div data-canvas-v2-popover className={`${popover} w-44`}>{[["bulleted", "insertUnorderedList", List], ["numbered", "insertOrderedList", ListOrdered]].map(([label, action, Icon]) => { const Glyph = Icon as typeof List; return <button key={String(action)} type="button" aria-label={`Text range ${label} list`} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-xs hover:bg-white/10" onClick={() => { command(String(action)); setMenu(undefined); }}><Glyph className="h-4 w-4" />{String(label)} list</button>; })}</div>}
    {menu === "align" && <div data-canvas-v2-popover className={`${popover} flex`}>{[["left", "justifyLeft", AlignLeft], ["center", "justifyCenter", AlignCenter], ["right", "justifyRight", AlignRight]].map(([label, action, Icon]) => { const Glyph = Icon as typeof AlignLeft; return <button key={String(action)} type="button" aria-label={`Text range align ${label}`} className={control} onClick={() => { command(String(action)); setMenu(undefined); }}><Glyph className="h-4 w-4" /></button>; })}</div>}
    {menu === "link" && <form data-canvas-v2-popover className={`${popover} flex w-80 items-center gap-2`} onSubmit={event => { event.preventDefault(); const href = canvasV2SafeTextLink(link); if (href) { command("createLink", href); setMenu(undefined); } }}><input autoFocus aria-label="Text link URL" placeholder="https://…" value={link} onChange={event => setLink(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-transparent px-3 py-2 text-xs" /><button aria-label="Apply link" title="Apply link" className={control}><Check className="h-4 w-4" /></button><button type="button" title="Remove link" aria-label="Remove link" className={control} onClick={() => { command("unlink"); setMenu(undefined); }}><Strikethrough className="h-4 w-4" /></button></form>}
  </div>, document.body);
}
