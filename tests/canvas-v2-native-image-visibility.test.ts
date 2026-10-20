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
    const values = new Map<string,string>();
    return {
      attributes,
      hasAttribute(name:string){return attributes.has(name);},
      getAttribute(name:string){return values.get(name)??(attributes.has(name)?'':null);},
      setAttribute(name:string,value:string){attributes.add(name);values.set(name,value);},
      toggleAttribute(name: string, force: boolean) { if (force) attributes.add(name); else attributes.delete(name); },
      removeAttribute(name: string) { attributes.delete(name);values.delete(name); },
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

test('public image culling records authored visibility once and never replaces intentional hidden paint with visible',()=>{
  const previousObserver=globalThis.IntersectionObserver,previousStyle=globalThis.getComputedStyle;
  let callback:IntersectionObserverCallback|undefined,styleReads=0;
  globalThis.IntersectionObserver=class{constructor(next:IntersectionObserverCallback){callback=next}observe(){}unobserve(){}disconnect(){}} as unknown as typeof IntersectionObserver;
  const image=(visibility:string)=>{const attributes=new Map<string,string>();return{visibility,attributes,hasAttribute(name:string){return attributes.has(name)},getAttribute(name:string){return attributes.get(name)??null},setAttribute(name:string,value:string){attributes.set(name,value)},removeAttribute(name:string){attributes.delete(name)},toggleAttribute(name:string,force:boolean){if(force)attributes.set(name,'');else attributes.delete(name)}}};
  const visible=image('visible'),hidden=image('hidden'),collapsed=image('collapse');
  globalThis.getComputedStyle=((target:unknown)=>{styleReads++;const value=target as ReturnType<typeof image>;return{visibility:value.hasAttribute('data-canvas-v2-image-offscreen')?'hidden':value.visibility}}) as typeof getComputedStyle;
  const scene={querySelectorAll:()=>[visible,hidden,collapsed],closest:()=>null} as unknown as HTMLElement;
  try{
    const observer=observeCanvasV2ImageVisibility(scene),notify=(image:typeof visible,intersecting:boolean)=>callback!([{target:image,isIntersecting:intersecting} as unknown as IntersectionObserverEntry],{} as IntersectionObserver);
    for(const item of [visible,hidden,collapsed])notify(item,false);
    assert.equal(visible.getAttribute('data-canvas-v2-image-authored-visibility'),'visible');assert.equal(hidden.getAttribute('data-canvas-v2-image-authored-visibility'),'hidden');assert.equal(collapsed.getAttribute('data-canvas-v2-image-authored-visibility'),'collapse');assert.equal(styleReads,3);
    for(const item of [visible,hidden,collapsed])notify(item,false);assert.equal(styleReads,3,'Repeated offscreen notifications must not overwrite the pre-cull value.');
    visible.visibility='hidden';hidden.visibility='visible';observer.refresh();assert.equal(styleReads,6,'A source revision must refresh authored visibility even while an image stays culled.');assert.equal(visible.getAttribute('data-canvas-v2-image-authored-visibility'),'hidden');assert.equal(hidden.getAttribute('data-canvas-v2-image-authored-visibility'),'visible');assert.equal(collapsed.getAttribute('data-canvas-v2-image-authored-visibility'),'collapse');for(const item of [visible,hidden,collapsed])assert.equal(item.hasAttribute('data-canvas-v2-image-offscreen'),true,'Reading authored state may not leave a distant image painting publicly.');
    notify(visible,true);assert.equal(visible.hasAttribute('data-canvas-v2-image-offscreen'),false);assert.equal(visible.hasAttribute('data-canvas-v2-image-authored-visibility'),false);
    visible.visibility='collapse';notify(visible,false);assert.equal(visible.getAttribute('data-canvas-v2-image-authored-visibility'),'collapse','A later authored visibility change must be retained on the next cull.');observer.dispose();
    notify(visible,true);assert.equal(visible.getAttribute('data-canvas-v2-image-authored-visibility'),'collapse','Disposed callbacks may not change remaining public metadata.');
  }finally{globalThis.IntersectionObserver=previousObserver;globalThis.getComputedStyle=previousStyle}
});
