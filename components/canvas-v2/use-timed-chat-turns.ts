"use client";
import { useCallback, useState, type SetStateAction } from 'react';
import { canvasV2StampTurnTiming } from '@/lib/canvas-v2/chat-lifecycle';
import type { CanvasV2ChatTurn } from './use-canvas-v2-chat';

export function useTimedChatTurns(initial: CanvasV2ChatTurn[] = []) {
  const [turns, setState] = useState<CanvasV2ChatTurn[]>(initial);
  const setTurns = useCallback((update: SetStateAction<CanvasV2ChatTurn[]>) => {
    const now = Date.now();
    setState(previous => canvasV2StampTurnTiming(previous, typeof update === 'function' ? update(previous) : update, now));
  }, []);
  return [turns, setTurns] as const;
}
