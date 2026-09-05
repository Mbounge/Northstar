"use client";

import type { ReactNode } from "react";
import { canvasV2OpaquePaintColor } from "@/lib/canvas-v2/paint-style";

export const CANVAS_COLOR_SWATCH_ROWS = [
  [
    { label: "Ink", value: "#1f1f20" },
    { label: "Graphite", value: "#8d8d8d" },
    { label: "Vermilion", value: "#ff4f2e" },
    { label: "Orange", value: "#ffa23f" },
    { label: "Sunflower", value: "#ffc84b" },
    { label: "Green", value: "#62d378" },
    { label: "Teal", value: "#57cec8" },
    { label: "Blue", value: "#42a8ee" },
    { label: "Violet", value: "#874cf2" },
    { label: "Pink", value: "#f044b5" },
    { label: "White", value: "#ffffff" },
  ],
  [
    { label: "Silver", value: "#bdbdbd" },
    { label: "Cloud", value: "#e3e3e3" },
    { label: "Blush", value: "#ffc4bf" },
    { label: "Peach", value: "#ffe0c4" },
    { label: "Butter", value: "#ffe9b8" },
    { label: "Mint", value: "#c9efd1" },
    { label: "Sea glass", value: "#c6efed" },
    { label: "Sky", value: "#c5e3f7" },
    { label: "Lavender", value: "#d9cef7" },
    { label: "Rose", value: "#f6c9e6" },
  ],
] as const;

/** Shared paint UI for object fills, rules, text ranges and connectors. */
export function CanvasV2ColorPalette({ colors, customColor, onChange, header, label = "Color palette" }: { colors: readonly string[]; customColor?: string; onChange: (color: string) => void; header?: ReactNode; label?: string }) {
  const selected = colors.map(color => canvasV2OpaquePaintColor(color, "#1f1f20").toLowerCase());
  return <div data-testid="canvas-v2-color-palette" aria-label={label} className="w-[280px] max-w-[calc(100vw-20px)] overflow-hidden rounded-[12px] border border-white/[.09] bg-[#1d1d1f] text-white shadow-[0_6px_20px_rgba(0,0,0,.22)]">
    {header && <><div className="flex min-h-9 items-center gap-1 px-2 py-1">{header}</div><div className="h-px bg-white/[.12]" /></>}
    <div className="space-y-2 px-2.5 py-2.5">{CANVAS_COLOR_SWATCH_ROWS.map((row, index) => <div key={index} className="grid grid-cols-11 items-center gap-1">
      {row.map(swatch => <button key={swatch.label} type="button" title={swatch.label} aria-label={`Use ${swatch.label}`} aria-pressed={selected.includes(swatch.value)} onClick={() => onChange(swatch.value)} className={`h-5 w-5 rounded-full border transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1597f4] ${selected.includes(swatch.value) ? "border-[#1d1d1f] ring-2 ring-[#934cff] ring-offset-1 ring-offset-[#1d1d1f]" : swatch.value === "#1f1f20" ? "border-white/20" : "border-white/30"}`} style={{ background: swatch.value }} />)}
      {index === 1 && <label title="Choose a custom color" className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-white/30 bg-[conic-gradient(from_90deg,#ff4f4f,#ffd84d,#58dc76,#4dc8ff,#8c5cff,#ff4db8,#ff4f4f)]"><input aria-label="Choose custom color" type="color" value={canvasV2OpaquePaintColor(customColor || colors[0], "#874cf2")} onChange={event => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" /></label>}
    </div>)}</div>
  </div>;
}
