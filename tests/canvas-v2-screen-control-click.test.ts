import test from 'node:test';
import assert from 'node:assert/strict';
import { activateScreenControl } from '../lib/canvas-v2/screen-control-click';

test('HTML controls retain their native activation and receiver', () => {
  let activated = false;
  const button = { click() { assert.equal(this, button); activated = true; } };
  activateScreenControl(button as unknown as Element);
  assert.equal(activated, true);
});

test('SVG controls without click() receive a bubbling pointer-positioned click', () => {
  class MouseEventMock {
    constructor(public type: string, public init: MouseEventInit) {}
  }
  const view = { MouseEvent: MouseEventMock };
  let event: MouseEventMock | undefined;
  const pin = {
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => ({left: 100, top: 200, width: 24, height: 32}),
    dispatchEvent: (value: MouseEventMock) => { event = value; return true; },
  };
  activateScreenControl(pin as unknown as Element);
  assert.equal(event?.type, 'click');
  assert.equal(event?.init.bubbles, true);
  assert.equal(event?.init.cancelable, true);
  assert.equal(event?.init.view, view);
  assert.equal(event?.init.clientX, 112);
  assert.equal(event?.init.clientY, 216);
});
