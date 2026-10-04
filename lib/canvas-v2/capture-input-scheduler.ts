let tracking = false;
let lastInputAt = -Infinity;
const activePointers = new Set<number>();

function trackCanvasInput() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener("pointerdown", (event) => {
    activePointers.add(event.pointerId);
    lastInputAt = performance.now();
  }, true);
  document.addEventListener("pointermove", () => {
    if (activePointers.size) lastInputAt = performance.now();
  }, true);
  for (const type of ["pointerup", "pointercancel"] as const) document.addEventListener(type, (event) => {
    activePointers.delete(event.pointerId);
    lastInputAt = performance.now();
  }, true);
  for (const type of ["keydown", "wheel"] as const) document.addEventListener(type, () => {
    lastInputAt = performance.now();
  }, { capture: true, passive: true });
  window.addEventListener("blur", () => {
    activePointers.clear();
    lastInputAt = performance.now();
  });
}

/** Human gestures take precedence over private screenshot work. */
export async function waitForCanvasInputQuiet(quietMs = 220, isCurrent?: () => boolean): Promise<void> {
  trackCanvasInput();
  while (activePointers.size || performance.now() - lastInputAt < quietMs) {
    if (isCurrent && !isCurrent()) throw new Error("Canvas observation was superseded.");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 32));
  }
  if (isCurrent && !isCurrent()) throw new Error("Canvas observation was superseded.");
}
