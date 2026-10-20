let tracking = false;
let lastInputAt = -Infinity;
const activePointers = new Map<number, string>();

/** Call only after validating the sending frame, protocol and scoped token (or
 * a first-party event's isTrusted flag). Iframe input does not bubble here. */
export function noteCanvasInputActivity(type: unknown, sequence?: unknown): boolean {
  if (typeof type !== 'string' || !['pointerdown', 'wheel', 'keydown', 'input', 'click', 'change'].includes(type)
    || sequence !== undefined && (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1)) return false;
  trackCanvasInput();
  lastInputAt = performance.now();
  return true;
}

function trackCanvasInput() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted) return;
    activePointers.set(event.pointerId, event.pointerType);
    lastInputAt = performance.now();
  }, true);
  const recoverReleasedMouse = (event: PointerEvent) => {
    if (!event.isTrusted) return;
    // Pointer-up inside another document can be lost. A native unpressed mouse
    // proves release; never infer a touch/pen release from buttons alone.
    if (event.pointerType === "mouse" && event.buttons === 0 && activePointers.get(event.pointerId) === "mouse") {
      activePointers.delete(event.pointerId);
      lastInputAt = performance.now();
    } else if (activePointers.size) lastInputAt = performance.now();
  };
  document.addEventListener("pointermove", recoverReleasedMouse, true);
  document.addEventListener("pointerover", recoverReleasedMouse, true);
  document.addEventListener("lostpointercapture", recoverReleasedMouse, true);
  for (const type of ["pointerup", "pointercancel"] as const) document.addEventListener(type, (event) => {
    if (!event.isTrusted) return;
    activePointers.delete(event.pointerId);
    lastInputAt = performance.now();
  }, true);
  for (const type of ["keydown", "wheel"] as const) document.addEventListener(type, (event) => {
    if (!event.isTrusted) return;
    lastInputAt = performance.now();
  }, { capture: true, passive: true });
  const cancelHeldInput = () => {
    activePointers.clear();
    lastInputAt = performance.now();
  };
  window.addEventListener("blur", cancelHeldInput);
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelHeldInput(); });
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
