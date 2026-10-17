/** Observe the author's successful context selection without making one for it.
 * Probing getContext before an async renderer starts permanently claims its
 * canvas for that backend, so diagnostics must only read this observation. */
export function installScreenCanvasContextObservation() {
  const prototype = HTMLCanvasElement.prototype;
  const original = prototype.getContext;
  const contexts = new WeakMap<HTMLCanvasElement, { type: string; context: unknown }>();
  const observer = { getContext(this: HTMLCanvasElement, ...args: Parameters<HTMLCanvasElement['getContext']>) {
    const context: unknown = Reflect.apply(original, this, args);
    if (context && !contexts.has(this)) contexts.set(this, { type: String(args[0]).toLowerCase(), context });
    return context;
  } };
  const observed = observer.getContext as HTMLCanvasElement['getContext'];
  prototype.getContext = observed;
  window.addEventListener('pagehide', () => {
    if (prototype.getContext === observed) prototype.getContext = original;
  }, { once: true });
  return (canvas: HTMLCanvasElement) => contexts.get(canvas);
}
