"use client";
import { useCallback, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import type { CanvasV2MediaPlaybackStore } from "@/lib/canvas-v2/media-playback-store";

export function CanvasV2MediaPlaybackButton({ nodeId, store, onToggle }: { nodeId: string; store: CanvasV2MediaPlaybackStore; onToggle: () => void }) {
  const subscribe = useCallback((notify: () => void) => store.subscribe(nodeId, notify), [nodeId, store]);
  const snapshot = useCallback(() => store.playing(nodeId), [nodeId, store]);
  const playing = useSyncExternalStore(subscribe, snapshot, () => false);
  return <button aria-label={playing ? "Pause selected media" : "Play selected media"} title={playing ? "Pause · Space" : "Play · Space"} onClick={onToggle} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white/10">{playing ? <Pause className="h-3.5 w-3.5"/> : <Play className="h-3.5 w-3.5"/>}</button>;
}
