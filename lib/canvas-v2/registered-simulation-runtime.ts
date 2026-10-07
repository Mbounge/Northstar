import type { ScreenAction } from './interactive-screen-runtime';

/** Only used for Northstar's approved, tenant-protected first-party simulation.
 * Generated HTML always stays in the separate opaque runtime. */
export async function inspectRegisteredSimulation(frame: HTMLIFrameElement, command: ScreenAction, signal: AbortSignal) {
  signal.throwIfAborted();
  const doc = frame.contentDocument;
  if (!doc?.querySelector('[data-graet-embedded]')) throw new Error('The authorized simulation is unavailable.');
  const win = doc.defaultView!;
  const visible = (el: Element) => { const r = el.getBoundingClientRect(), s = win.getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < win.innerHeight && r.left < win.innerWidth && s.display !== 'none' && s.visibility !== 'hidden'; };
  const selector = (el: Element): string => el.id ? `#${CSS.escape(el.id)}` : el.parentElement ? `${selector(el.parentElement)} > ${el.tagName.toLowerCase()}:nth-child(${[...el.parentElement.children].indexOf(el) + 1})` : el.tagName.toLowerCase();
  const field = command.selector ? doc.querySelector(command.selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null : null;
  if (command.selector && !field) throw new Error('No control matches this selector.');
  if (command.action === 'click') {
    if (!field || !visible(field) || field.disabled) throw new Error('Choose a visible enabled control.');
    field.click();
  } else if (command.action === 'fill') {
    if (!field || !['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName) || !visible(field) || field.disabled) throw new Error('Choose a visible editable field.');
    // Native setter triggers the same React input/change path as user entry.
    const prototype = Object.getPrototypeOf(field);
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, String(command.value ?? ''));
    const EventConstructor = (win as unknown as { Event: typeof Event }).Event;
    field.dispatchEvent(new EventConstructor('input', { bubbles: true }));
    field.dispatchEvent(new EventConstructor('change', { bubbles: true }));
  } else if (command.action === 'scroll') {
    const scroll = field ?? doc.querySelector('[data-graet-scroll]');
    scroll?.scrollTo(Number(command.x) || 0, Number(command.y) || 0);
  } else if (!['inspect', 'snapshot'].includes(command.action)) throw new Error('Unknown simulation action.');
  await new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
  signal.throwIfAborted();
  return { title: doc.title, text: doc.body.innerText.slice(0, 16000),
    controls: [...doc.querySelectorAll('button,input,textarea,select,a,[role="button"]')].filter(visible).slice(0, 100).map(el => ({ selector: selector(el), label: el.getAttribute('aria-label'), text: (el as HTMLElement).innerText, value: (el as HTMLInputElement).value, disabled: (el as HTMLButtonElement).disabled })),
    images: [...doc.images].map(el => ({ label: el.alt, loaded: el.complete && el.naturalWidth > 0, visible: visible(el) })),
    note: 'Registered first-party simulation. Inspect the pixels for captured image overlays and crop quality.',
  };
}
