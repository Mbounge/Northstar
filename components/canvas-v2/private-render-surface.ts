import type { CSSProperties } from "react";

// Keep measuring DOM paint-isolated from its first frame, including before
// utility CSS loads. Do not hide the iframe document: it still needs layout.
export const PRIVATE_RENDER_SURFACE_STYLE: CSSProperties = {
  position: "fixed", left: -100_000, top: -100_000, width: 1, height: 1,
  overflow: "hidden", opacity: 0, pointerEvents: "none",
  clipPath: "inset(50%)", contain: "strict",
};
