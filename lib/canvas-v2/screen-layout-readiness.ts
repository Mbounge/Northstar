/** Recover a canvas initialized before its first usable CSS layout. Notify the
 * author's own sizing handler rather than choosing a bitmap size, rerunning
 * scripts, or resetting product state. Ready canvases leave the observer. */
export function installScreenLayoutReadiness() {
  if (typeof ResizeObserver === 'undefined') return;
  const pending = new Set<HTMLCanvasElement>();
  const attempted = new WeakSet<HTMLCanvasElement>();
  const prepared = new WeakSet<HTMLCanvasElement>();
  let frame: number | undefined;
  const lifecycle = { check() {
    frame = undefined;
    let notify = false;
    for (const canvas of pending) {
      if (!canvas.isConnected) { pending.delete(canvas); observer.unobserve(canvas); continue; }
      if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) continue;
      if (canvas.width > 0 && canvas.height > 0) {
        pending.delete(canvas); observer.unobserve(canvas); prepared.add(canvas);
      } else if (!attempted.has(canvas)) {
        attempted.add(canvas);
        notify = true;
      }
    }
    if (notify) {
      window.dispatchEvent(new Event('resize'));
      // Allow an author's RAF-based resize to finish, then release its watch.
      // An unresolved canvas gets no repeated synthetic events or polling.
      lifecycle.schedule();
    }
  },
  schedule() { if (frame === undefined) frame = requestAnimationFrame(lifecycle.check); },
  watch(canvas: HTMLCanvasElement) {
    if (prepared.has(canvas) || pending.has(canvas)) return;
    pending.add(canvas); observer.observe(canvas);
  },
  scan(node: Node, added: boolean) {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const canvases = element.tagName === 'CANVAS' ? [element as HTMLCanvasElement] : element.querySelectorAll<HTMLCanvasElement>('canvas');
    for (const canvas of canvases) {
      if (added) lifecycle.watch(canvas);
      else { pending.delete(canvas); observer.unobserve(canvas); }
    }
  } };
  const observer = new ResizeObserver(() => lifecycle.schedule());
  lifecycle.scan(document.documentElement, true);
  const mutations = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.removedNodes) lifecycle.scan(node, false);
      for (const node of record.addedNodes) lifecycle.scan(node, true);
    }
  });
  mutations.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => {
    observer.disconnect(); mutations.disconnect(); pending.clear();
    if (frame !== undefined) cancelAnimationFrame(frame);
  }, { once: true });
}
