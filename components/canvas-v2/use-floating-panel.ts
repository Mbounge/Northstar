'use client';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export type PanelRect = { x: number; y: number; width: number; height: number };
export type PanelHandle = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export function constrainPanel(rect: PanelRect, width: number, height: number): PanelRect {
  const w = Math.min(Math.max(320, rect.width), Math.max(1, width - 16));
  const h = Math.min(Math.max(300, rect.height), Math.max(1, height - 16));
  return { x: Math.max(8, Math.min(rect.x, width - w - 8)), y: Math.max(8, Math.min(rect.y, height - h - 8)), width: w, height: h };
}
export function movePanel(rect: PanelRect, handle: PanelHandle, dx: number, dy: number, width: number, height: number): PanelRect {
  if (handle === 'move') return constrainPanel({ ...rect, x: rect.x + dx, y: rect.y + dy }, width, height);
  let left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height;
  const minWidth = Math.min(320, width - 16), minHeight = Math.min(300, height - 16);
  if (handle.includes('w')) left = Math.max(8, Math.min(left + dx, right - minWidth));
  if (handle.includes('e')) right = Math.min(width - 8, Math.max(right + dx, left + minWidth));
  if (handle.includes('n')) top = Math.max(8, Math.min(top + dy, bottom - minHeight));
  if (handle.includes('s')) bottom = Math.min(height - 8, Math.max(bottom + dy, top + minHeight));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
/** Chrome geometry only: never changes the canvas camera or remounts its contents. */
export function useFloatingPanel() {
  const [rect, setRect] = useState<PanelRect>();
  const [active, setActive] = useState(false);
  const rectRef = useRef(rect); rectRef.current = rect;
  const gesture = useRef<{ id: number; handle: PanelHandle; x: number; y: number; rect: PanelRect } | undefined>(undefined);
  useEffect(() => {
    const resize = () => setRect(current => constrainPanel(current ?? { x: 20, y: 90, width: 390, height: window.innerHeight - 186 }, window.innerWidth, window.innerHeight));
    resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  const pointerDown = (handle: PanelHandle) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !rectRef.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, handle, x: event.clientX, y: event.clientY, rect: rectRef.current }; setActive(true);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current; if (!g || g.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    setRect(movePanel(g.rect, g.handle, event.clientX - g.x, event.clientY - g.y, window.innerWidth, window.innerHeight));
  };
  const pointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = undefined; setActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyDown = (handle: PanelHandle) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!rectRef.current || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 40 : 10;
    setRect(movePanel(rectRef.current, handle, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0, window.innerWidth, window.innerHeight));
  };
  return { rect, active, pointerDown, pointerMove, pointerEnd, keyDown };
}
