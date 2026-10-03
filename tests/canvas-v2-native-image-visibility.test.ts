import assert from "node:assert/strict";
import test from "node:test";
import { observeCanvasV2ImageVisibility } from "@/components/canvas-v2/native-image-visibility";

test("scene revisions retain offscreen image state and observe only new images", () => {
  const previousObserver = globalThis.IntersectionObserver;
  const observed: unknown[] = [];
  const unobserved: unknown[] = [];
  let callback: IntersectionObserverCallback | undefined;
  let disconnected = false;
  globalThis.IntersectionObserver = class {
    constructor(next: IntersectionObserverCallback) { callback = next; }
    observe(image: Element) { observed.push(image); }
    unobserve(image: Element) { unobserved.push(image); }
    disconnect() { disconnected = true; }
  } as unknown as typeof IntersectionObserver;

  const image = () => {
    const attributes = new Set<string>();
    return {
      attributes,
      toggleAttribute(name: string, force: boolean) { if (force) attributes.add(name); else attributes.delete(name); },
      removeAttribute(name: string) { attributes.delete(name); },
    };
  };
  const first = image();
  const second = image();
  const third = image();
  let images = [first, second];
  const scene = {
    querySelectorAll: () => images,
    closest: () => null,
  } as unknown as HTMLElement;

  try {
    const visibility = observeCanvasV2ImageVisibility(scene);
    assert.deepEqual(observed, [first, second]);
    callback?.([{ target: first, isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    assert.equal(first.attributes.has("data-canvas-v2-image-offscreen"), true);

    visibility.refresh();
    assert.deepEqual(observed, [first, second], "unchanged images must not be re-observed");
    assert.equal(first.attributes.has("data-canvas-v2-image-offscreen"), true, "an edit must not briefly repaint an offscreen image");

    images = [first, third];
    visibility.refresh();
    assert.deepEqual(observed, [first, second, third]);
    assert.deepEqual(unobserved, [second]);
    assert.equal(first.attributes.has("data-canvas-v2-image-offscreen"), true);
    visibility.dispose();
    assert.equal(disconnected, true);
  } finally {
    globalThis.IntersectionObserver = previousObserver;
  }
});
