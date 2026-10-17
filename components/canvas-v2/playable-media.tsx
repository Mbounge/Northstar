"use client";
/* Native GIF bytes must bypass image optimization to preserve animation and local blob sources. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripVertical, Pause, Play } from "lucide-react";
import { CANVAS_V2_MEDIA_TOGGLE_EVENT, CANVAS_V2_MEDIA_STATE_EVENT, canvasV2VideoEmbedUrl, type CanvasV2PlayableMedia } from "@/lib/canvas-v2/canvas-media";
import { releaseCanvasV2VideoSource, rememberCanvasV2MediaTime, restoreCanvasV2MediaTime, type CanvasV2RetainedMediaPlayback } from "@/lib/canvas-v2/media-playback-store";

/** Media is a native canvas object. Playback never writes a revision or calls a model. */
export function CanvasV2PlayableMediaObject({ media, nodeId, retainedPlayback }: { media: CanvasV2PlayableMedia; nodeId: string; retainedPlayback?: CanvasV2RetainedMediaPlayback }) {
  const host = useRef<HTMLDivElement>(null);
  const togglePlayback = useRef<() => void>(() => undefined);
  const video = useRef<HTMLVideoElement>(null);
  const poster = useRef<HTMLCanvasElement>(null);
  const gifImage = useRef<HTMLImageElement>(null);
  const playbackRef = useRef<CanvasV2RetainedMediaPlayback>(retainedPlayback ?? {});
  const playback = playbackRef.current;
  const gifPosterSource = useRef<string | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [error, setError] = useState(false);
  const [nearby, setNearby] = useState(false);
  const [loadedVideoSource, setLoadedVideoSource] = useState<string>();
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [pausedByUser, setPausedByUser] = useState(playback.userPaused ?? false);
  const userPaused = useRef(playback.userPaused ?? false);
  // Native pause events are asynchronous in browsers. Keep suppression until
  // onPause consumes the matching event instead of clearing it in a microtask.
  const programmaticPause = useRef(0);
  const autoStarted = useRef(false);
  const reportedPlayback = useRef<{ nodeId: string; playing: boolean } | undefined>(undefined);
  const embedUrl = media.type === "video" ? canvasV2VideoEmbedUrl(media.src) : undefined;
  const videoSource = nearby || loadedVideoSource === media.src ? media.src : undefined;
  useLayoutEffect(() => {
    const element = video.current;
    return () => {
      if (element) rememberCanvasV2MediaTime(playback, element);
      playback.userPaused = userPaused.current;
      // Culling removes the DOM decoder; NativeNode keeps only this metadata.
    };
  }, [playback]);
  const pauseMedia = useCallback((explicit = true) => {
    if (media.type === "gif" && poster.current && gifImage.current?.complete && gifImage.current.naturalWidth) poster.current.getContext("2d")?.drawImage(gifImage.current, 0, 0);
    if (video.current) rememberCanvasV2MediaTime(playback, video.current);
    if (video.current && !video.current.paused) { programmaticPause.current += 1; video.current.pause(); }
    setPlaying(false); setInteracting(false); if (explicit) { userPaused.current = true; playback.userPaused = true; setPausedByUser(true); autoStarted.current = false; }
  }, [media.type, playback]);
  const play = useCallback(async (automatic = false) => {
    if (automatic && (reducedMotion || userPaused.current)) return;
    if (!automatic) { userPaused.current = false; playback.userPaused = false; setPausedByUser(false); }
    setError(false); setInteracting(true);
    if (embedUrl) setPlaying(true);
    else if (media.type === "video") {
      try { await video.current?.play(); }
      catch (failure) {
        // A normal offscreen pause can abort a still-loading autoplay request.
        if (automatic && failure instanceof DOMException && failure.name === "AbortError") return;
        setError(true); setInteracting(false);
      }
    }
    else setPlaying(true);
  }, [embedUrl, media.type, playback, reducedMotion]);
  const playbackPolicy = useRef({ nearby, reducedMotion, embedUrl, pauseMedia, play });
  playbackPolicy.current = { nearby, reducedMotion, embedUrl, pauseMedia, play };
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      node.dataset.canvasV2MediaObservedBounds = JSON.stringify({ nearby: entry.isIntersecting, top: entry.boundingClientRect.top, bottom: entry.boundingClientRect.bottom, rootTop: entry.rootBounds?.top, rootBottom: entry.rootBounds?.bottom, observedAt: performance.now() });
      playbackPolicy.current.nearby = entry.isIntersecting;
      setNearby(entry.isIntersecting);
      if (!entry.isIntersecting) { autoStarted.current = false; playbackPolicy.current.pauseMedia(false); }
    }, { root: node.closest('[data-canvas-v2-native-wheel-capture]'), rootMargin: "100px" });
    // Observe the actual video surface. An authored wrapper can extend beyond
    // its pixels and otherwise keep an offscreen decoder marked nearby.
    observer.observe(video.current ?? node);
    const toggle = () => togglePlayback.current();
    node.addEventListener(CANVAS_V2_MEDIA_TOGGLE_EVENT, toggle);
    const pauseWhenHidden = () => {
      const policy = playbackPolicy.current;
      if (document.hidden) { autoStarted.current = false; policy.pauseMedia(false); }
      else if (policy.nearby && !policy.reducedMotion && !userPaused.current && !autoStarted.current && !policy.embedUrl) { autoStarted.current = true; void policy.play(true); }
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") playbackPolicy.current.pauseMedia(); };
    document.addEventListener("visibilitychange", pauseWhenHidden); window.addEventListener("keydown", escape);
    return () => { node.removeEventListener(CANVAS_V2_MEDIA_TOGGLE_EVENT, toggle); observer.disconnect(); document.removeEventListener("visibilitychange", pauseWhenHidden); window.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => {
    if (media.type !== "video" || embedUrl) return;
    if (nearby) { setLoadedVideoSource(media.src); return; }
    if (loadedVideoSource !== media.src) return;
    // A quick reverse pan keeps its decoder and exact clip time. Distant
    // reference videos release the source after a bounded grace period.
    const timer = window.setTimeout(() => setLoadedVideoSource(undefined), 1500);
    return () => window.clearTimeout(timer);
  }, [embedUrl, loadedVideoSource, media.src, media.type, nearby]);
  useEffect(() => {
    // React has now removed src. Empty the selected resource as well so distant
    // reference videos retain only playback metadata, not a loaded decoder.
    if (videoSource === undefined && video.current) releaseCanvasV2VideoSource(playback, video.current);
  }, [playback, videoSource]);
  useEffect(() => {
    if (media.type !== "gif" || !nearby || gifPosterSource.current === media.src) return;
    const image = new Image(); let cancelled = false;
    image.onload = () => {
      if (!cancelled && poster.current) { poster.current.width = image.naturalWidth; poster.current.height = image.naturalHeight; poster.current.getContext("2d")?.drawImage(image, 0, 0); gifPosterSource.current = media.src; }
      // The visible GIF owns animation; this temporary first-frame decoder is
      // unnecessary after its full-resolution poster has been painted.
      image.onload = null; image.onerror = null; image.src = "";
    };
    image.onerror = () => { if (!cancelled) setError(true); }; image.src = media.src;
    return () => { cancelled = true; image.onload = null; image.onerror = null; image.src = ""; };
  }, [media.src, media.type, nearby]);
  useEffect(() => {
    if (reportedPlayback.current?.nodeId === nodeId && reportedPlayback.current.playing === playing) return;
    reportedPlayback.current = { nodeId, playing };
    host.current?.dispatchEvent(new CustomEvent(CANVAS_V2_MEDIA_STATE_EVENT, { bubbles: true, detail: { nodeId, playing } }));
  }, [nodeId, playing]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => { setReducedMotion(query.matches); if (query.matches) { autoStarted.current = false; pauseMedia(false); } };
    query.addEventListener?.("change", changed);
    return () => query.removeEventListener?.("change", changed);
  }, [pauseMedia]);
  useEffect(() => { autoStarted.current = false; userPaused.current = playback.userPaused ?? false; setPausedByUser(userPaused.current); }, [media.src, media.type, playback]);
  useEffect(() => {
    if (nearby && !reducedMotion && !userPaused.current && !autoStarted.current && !embedUrl) {
      autoStarted.current = true; void play(true);
    }
  }, [nearby, reducedMotion, embedUrl, play]);
  togglePlayback.current = () => {
    if (embedUrl ? playing : media.type === "video" ? video.current && !video.current.paused : playing) pauseMedia(); else void play();
  };
  return <div ref={host} className="group relative h-full w-full overflow-hidden bg-transparent" data-canvas-v2-playable-media data-canvas-v2-media-nearby={nearby ? "true" : "false"} data-playing={playing ? "true" : "false"} aria-label={media.description || (media.type === "video" ? "Video clip" : "Animated GIF")}>
    {embedUrl ? <>
      {playing && nearby ? <iframe src={embedUrl} title={media.description || "Video player"} allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full border-0" data-canvas-v2-media-control="true"/> : <div className="grid h-full place-content-center bg-black/10 px-6 pb-16 text-center text-sm">{media.description || "Video clip"}</div>}
      <a href={media.src} target="_blank" rel="noopener noreferrer" data-canvas-v2-media-control="true" className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">Open source</a>
    </> : media.type === "video" ? <video
      ref={video}
      src={videoSource}
      autoPlay={nearby && !reducedMotion && !pausedByUser} muted loop playsInline preload="metadata" controls={interacting}
      data-canvas-v2-media-control={interacting ? "true" : undefined}
      style={{ width:"100%",height:"100%",objectFit:"contain",pointerEvents:interacting ? "auto" : "none" }}
      onLoadedMetadata={event => restoreCanvasV2MediaTime(playback, event.currentTarget)}
      onTimeUpdate={event => rememberCanvasV2MediaTime(playback, event.currentTarget)}
      onPlay={() => {
        // A pending metadata load/play promise may complete after the camera
        // has left. Keep native reference decoders paused until nearby again.
        if (!playbackPolicy.current.nearby || document.hidden) { autoStarted.current = false; playbackPolicy.current.pauseMedia(false); return; }
        userPaused.current = false; playback.userPaused = false; setPausedByUser(false); setPlaying(true); setInteracting(true);
      }}
      onPause={event => {
        const wasProgrammatic = programmaticPause.current > 0;
        if (wasProgrammatic) programmaticPause.current -= 1;
        else if (event.currentTarget.readyState >= 1) { userPaused.current = true; playback.userPaused = true; setPausedByUser(true); autoStarted.current = false; }
        rememberCanvasV2MediaTime(playback, event.currentTarget);
        setPlaying(false);
      }}
      onEnded={() => { setPlaying(false); setInteracting(false); }} onError={() => setError(true)}
    /> : <>
      <canvas ref={poster} aria-label={`Paused GIF: ${media.description}`} className="h-full w-full object-contain" style={{ display: playing ? "none" : "block" }}/>
      {playing && nearby && <img ref={gifImage} src={media.src} alt={media.description} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" onError={() => setError(true)}/>}
    </>}
    {error ? <div className="absolute inset-0 grid place-content-center gap-2 bg-[#15151a]/95 p-5 text-center text-xs text-white"><span>This media could not be played.</span><small className="max-w-[260px] opacity-55">Check the file format or source. Local files are available for this browser session.</small><button data-canvas-v2-media-control aria-label="Retry media" onClick={() => { video.current?.load(); void play(); }} className="mx-auto rounded-md bg-white/10 px-3 py-1.5">Retry</button></div> : <>
      {!playing && !interacting && <button data-canvas-v2-media-control aria-label={media.type === "video" ? "Play video" : "Play GIF"} onClick={() => void play()} className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/60 text-white shadow-lg"><Play size={18} fill="currentColor"/></button>}
      {(playing || interacting) && <button data-canvas-v2-media-control aria-label={media.type === "video" ? "Pause video" : "Pause GIF"} onClick={() => pauseMedia()} className="absolute right-2 top-2 rounded-lg border border-white/15 bg-black/70 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><Pause size={14}/></button>}

      <span title="Drag to move" className="absolute left-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"><GripVertical size={14}/></span>
    </>}
  </div>;
}
