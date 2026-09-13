"use client";
/* Native GIF bytes must bypass image optimization to preserve animation and local blob sources. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { GripVertical, Pause, Play } from "lucide-react";
import { CANVAS_V2_MEDIA_TOGGLE_EVENT, CANVAS_V2_MEDIA_STATE_EVENT, canvasV2VideoEmbedUrl, type CanvasV2PlayableMedia } from "@/lib/canvas-v2/canvas-media";

/** Media is a native canvas object. Playback never writes a revision or calls a model. */
export function CanvasV2PlayableMediaObject({ media, nodeId }: { media: CanvasV2PlayableMedia; nodeId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const togglePlayback = useRef<() => void>(() => undefined);
  const video = useRef<HTMLVideoElement>(null);
  const poster = useRef<HTMLCanvasElement>(null);
  const gifImage = useRef<HTMLImageElement>(null);
  const [playing, setPlaying] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [error, setError] = useState(false);
  const [nearby, setNearby] = useState(false);
  const embedUrl = media.type === "video" ? canvasV2VideoEmbedUrl(media.src) : undefined;
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { setNearby(entry.isIntersecting); if (!entry.isIntersecting) { video.current?.pause(); setPlaying(false); setInteracting(false); } }, { rootMargin: "100px" });
    observer.observe(node);
    const toggle = () => togglePlayback.current();
    node.addEventListener(CANVAS_V2_MEDIA_TOGGLE_EVENT, toggle);
    const pause = () => { if (document.hidden) { video.current?.pause(); setPlaying(false); setInteracting(false); } };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { video.current?.pause(); setPlaying(false); setInteracting(false); } };
    document.addEventListener("visibilitychange", pause); window.addEventListener("keydown", escape);
    return () => { node.removeEventListener(CANVAS_V2_MEDIA_TOGGLE_EVENT, toggle); observer.disconnect(); document.removeEventListener("visibilitychange", pause); window.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => {
    if (media.type !== "gif" || !nearby) return;
    const image = new Image(); let cancelled = false;
    image.onload = () => { if (!cancelled && poster.current) { poster.current.width = image.naturalWidth; poster.current.height = image.naturalHeight; poster.current.getContext("2d")?.drawImage(image, 0, 0); } };
    image.onerror = () => { if (!cancelled) setError(true); }; image.src = media.src;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [media.src, media.type, nearby]);
  useEffect(() => {
    host.current?.dispatchEvent(new CustomEvent(CANVAS_V2_MEDIA_STATE_EVENT, { bubbles: true, detail: { nodeId, playing } }));
  }, [nodeId, playing]);
  const pause = () => {
    if (media.type === "gif" && poster.current && gifImage.current) poster.current.getContext("2d")?.drawImage(gifImage.current, 0, 0);
    video.current?.pause(); setPlaying(false); setInteracting(false);
  };
  const play = async () => {
    setError(false); setInteracting(true);
    if (embedUrl) setPlaying(true);
    else if (media.type === "video") { try { await video.current?.play(); } catch { setError(true); setInteracting(false); } }
    else setPlaying(true);
  };
  togglePlayback.current = () => {
    if (embedUrl ? playing : media.type === "video" ? video.current && !video.current.paused : playing) pause(); else void play();
  };
  return <div ref={host} className="group relative h-full w-full overflow-hidden bg-transparent" data-canvas-v2-playable-media data-playing={playing ? "true" : "false"} aria-label={media.description || (media.type === "video" ? "Video clip" : "Animated GIF")}>
    {embedUrl ? <>
      {playing && nearby ? <iframe src={embedUrl} title={media.description || "Video player"} allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full border-0" data-canvas-v2-media-control="true"/> : <div className="grid h-full place-content-center bg-black/10 px-6 pb-16 text-center text-sm">{media.description || "Video clip"}</div>}
      <a href={media.src} target="_blank" rel="noopener noreferrer" data-canvas-v2-media-control="true" className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">Open source</a>
    </> : media.type === "video" ? <video ref={video} src={nearby ? media.src : undefined} playsInline preload="metadata" controls={interacting} data-canvas-v2-media-control={interacting ? "true" : undefined} style={{ width:"100%",height:"100%",objectFit:"contain",pointerEvents:interacting ? "auto" : "none" }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setInteracting(false); }} onError={() => setError(true)} /> : <>
      <canvas ref={poster} aria-label={`Paused GIF: ${media.description}`} className="h-full w-full object-contain" style={{ display: playing ? "none" : "block" }}/>
      {playing && nearby && <img ref={gifImage} src={media.src} alt={media.description} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" onError={() => setError(true)}/>}
    </>}
    {error ? <div className="absolute inset-0 grid place-content-center gap-2 bg-[#15151a]/95 p-5 text-center text-xs text-white"><span>This media could not be played.</span><small className="max-w-[260px] opacity-55">Check the file format or source. Local files are available for this browser session.</small><button data-canvas-v2-media-control aria-label="Retry media" onClick={() => { video.current?.load(); void play(); }} className="mx-auto rounded-md bg-white/10 px-3 py-1.5">Retry</button></div> : <>
      {!playing && !interacting && <button data-canvas-v2-media-control aria-label={media.type === "video" ? "Play video" : "Play GIF"} onClick={() => void play()} className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/60 text-white shadow-lg"><Play size={18} fill="currentColor"/></button>}
      {(playing || interacting) && <button data-canvas-v2-media-control aria-label={media.type === "video" ? "Pause video" : "Pause GIF"} onClick={pause} className="absolute right-2 top-2 rounded-lg border border-white/15 bg-black/70 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><Pause size={14}/></button>}

      <span title="Drag to move" className="absolute left-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"><GripVertical size={14}/></span>
    </>}
  </div>;
}
