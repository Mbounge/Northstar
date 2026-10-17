/** SVG controls do not expose HTMLElement.click(). Keep their authored event path testable. */
export function activateScreenControl(element: Element) {
  const click = (element as HTMLElement).click;
  if (typeof click === 'function') {
    click.call(element);
    return;
  }
  const view = element.ownerDocument.defaultView;
  if (!view) throw new Error('The control document is unavailable.');
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(new view.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
    detail: 1,
  }));
}
