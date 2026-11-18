"use client";
/* Native GIF bytes must bypass image optimization to preserve animation and local blob sources. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Pause, Play, X } from "lucide-react";
import { CanvasV2InteractiveFilm } from './interactive-film';
import { explainerWebVtt } from '@/lib/canvas-v2/explainer';
import { CANVAS_V2_MEDIA_TOGGLE_EVENT, CANVAS_V2_MEDIA_STATE_EVENT, canvasV2VideoEmbedUrl, type CanvasV2PlayableMedia } from "@/lib/canvas-v2/canvas-media";
import { canvasV2WarmMediaRetention, releaseCanvasV2VideoSource, rememberCanvasV2MediaTime, restoreCanvasV2MediaTime, type CanvasV2RetainedMediaPlayback } from "@/lib/canvas-v2/media-playback-store";

/** Media is a native canvas object. Playback never writes a revision or calls a model. */
export function CanvasV2PlayableMediaObject(props: { media: CanvasV2PlayableMedia; nodeId: string; retainedPlayback?: CanvasV2RetainedMediaPlayback }) {
  const { media } = props;
  const playback = media.explainer;
  if (playback?.interaction) return <CanvasV2InteractiveFilm key={playback.interaction.sourceRevision} media={media} playback={playback} film={playback.interaction} nodeId={props.nodeId} />;
  return <StandardMediaObject {...props} />;
}

function StandardMediaObject({ media, nodeId, retainedPlayback }: { media: CanvasV2PlayableMedia; nodeId: string; retainedPlayback?: CanvasV2RetainedMediaPlayback }) {
  const host = useRef<HTMLDivElement>(null);
  const transcriptDialog = useRef<HTMLDialogElement>(null);
  const transcriptTrigger = useRef<HTMLButtonElement>(null);
  const pendingSeek = useRef<number | undefined>(undefined);
  const [captionSource, setCaptionSource] = useState<string>();
  const explainer = media.explainer;
  useEffect(() => {
    if (!explainer) return;
    const url = URL.createObjectURL(new Blob([explainer.captions ?? explainerWebVtt(explainer.chapters)], { type: 'text/vtt' }));
    setCaptionSource(url);
    return () => { URL.revokeObjectURL(url); };
  }, [explainer]);
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
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [loadedMediaSource, setLoadedMediaSource] = useState<string>();
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [pausedByUser, setPausedByUser] = useState(playback.userPaused ?? false);
  const userPaused = useRef(playback.userPaused ?? false);
  // Native pause events are asynchronous in browsers. Keep suppression until
  // onPause consumes the matching event instead of clearing it in a microtask.
  const programmaticPause = useRef(0);
  const autoStarted = useRef(false);
  const reportedPlayback = useRef<{ nodeId: string; playing: boolean } | undefined>(undefined);
  const embedUrl = media.type === "video" ? canvasV2VideoEmbedUrl(media.src) : undefined;
  const warmOwner = useMemo(() => ({ source: media.src, type: media.type }), [media.src, media.type]);
  const warmLease = useRef<{ owner: object; visible: () => void } | undefined>(undefined);
  const sourceIdentity = media.type + '\n' + media.src;
  const currentSourceIdentity = useRef(sourceIdentity); currentSourceIdentity.current = sourceIdentity;
  const previousSourceIdentity = useRef(sourceIdentity);
  const videoSource = nearby && pageVisible || loadedMediaSource === media.src ? media.src : undefined;
  const attachGif = useCallback((element: HTMLImageElement | null) => {
    if (!element && gifImage.current) gifImage.current.removeAttribute('src');
    // A ref can detach and reattach the same node during development replay.
    // React's unchanged src prop will not restore the resource we released.
    if (element && element.getAttribute('src') !== media.src) element.setAttribute('src', media.src);
    gifImage.current = element;
  }, [media.src]);
  useLayoutEffect(() => {
    const element = video.current;
    return () => {
      if (element) {
        rememberCanvasV2MediaTime(playback, element);
        element.pause(); element.removeAttribute('src'); releaseCanvasV2VideoSource(playback, element);
      }
      playback.userPaused = userPaused.current;
      // Eviction/unmount keeps metadata, while explicitly releasing its decoder.
    };
  }, [media.type, playback]);
  useLayoutEffect(() => {
    if (previousSourceIdentity.current === sourceIdentity) return;
    previousSourceIdentity.current = sourceIdentity;
    delete playback.currentTime; delete playback.userPaused;
    userPaused.current = false; autoStarted.current = false; programmaticPause.current = 0;
    gifPosterSource.current = undefined;
    setLoadedMediaSource(undefined); setPausedByUser(false); setPlaying(false); setInteracting(false); setError(false);
    if (poster.current) { poster.current.width = 0; poster.current.height = 0; }
  }, [playback, sourceIdentity]);
  const pauseMedia = useCallback((explicit = true) => {
    if (media.type === "gif" && poster.current && gifImage.current?.complete && gifImage.current.naturalWidth) poster.current.getContext("2d")?.drawImage(gifImage.current, 0, 0);
    if (video.current) rememberCanvasV2MediaTime(playback, video.current);
    if (video.current && !video.current.paused) { programmaticPause.current += 1; video.current.pause(); }
    setPlaying(false); setInteracting(false); if (explicit) { userPaused.current = true; playback.userPaused = true; setPausedByUser(true); autoStarted.current = false; }
  }, [media.type, playback]);
  const play = useCallback(async (automatic = false) => {
    if (automatic && (explainer || reducedMotion || userPaused.current)) return;
    if (!automatic) { userPaused.current = false; playback.userPaused = false; setPausedByUser(false); }
    setError(false); setInteracting(true);
    if (embedUrl) setPlaying(true);
    else if (media.type === "video") {
      if (explainer && !automatic && video.current) video.current.muted = false;
      try { await video.current?.play(); }
      catch (failure) {
        // A normal offscreen pause can abort a still-loading autoplay request.
        if (automatic && failure instanceof DOMException && failure.name === "AbortError") return;
        setError(true); setInteracting(false);
      }
    }
    else setPlaying(true);
  }, [embedUrl, explainer, media.type, playback, reducedMotion]);
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
      if (warmLease.current) {
        if (entry.isIntersecting && !document.hidden) warmLease.current.visible();
        else canvasV2WarmMediaRetention.offscreen(warmLease.current.owner);
      }
    }, { root: node.closest('[data-canvas-v2-native-wheel-capture]'), rootMargin: "0px" });
    // Observe the actual video surface. An authored wrapper can extend beyond
    // its pixels and otherwise keep an offscreen decoder marked nearby.
    observer.observe(video.current ?? node);
    const toggle = () => togglePlayback.current();
    node.addEventListener(CANVAS_V2_MEDIA_TOGGLE_EVENT, toggle);
    const pauseWhenHidden = () => {
      const policy = playbackPolicy.current;
      setPageVisible(!document.hidden);
      if (document.hidden) { autoStarted.current = false; policy.pauseMedia(false); if (warmLease.current) canvasV2WarmMediaRetention.offscreen(warmLease.current.owner); }
      else {
        if (policy.nearby) warmLease.current?.visible();
      }
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") playbackPolicy.current.pauseMedia(); };
    document.addEventListener("visibilitychange", pauseWhenHidden); window.addEventListener("keydown", escape);
    return () => { node.removeEventListener(CANVAS_V2_MEDIA_TOGGLE_EVENT, toggle); observer.disconnect(); document.removeEventListener("visibilitychange", pauseWhenHidden); window.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => {
    if (!embedUrl && nearby && pageVisible && (media.type === 'video' || playing)) setLoadedMediaSource(media.src);
  }, [embedUrl, media.src, media.type, nearby, pageVisible, playing]);
  useEffect(() => {
    if (embedUrl || loadedMediaSource !== media.src) return;
    const evict = () => {
      if (currentSourceIdentity.current !== sourceIdentity) return;
      if (playbackPolicy.current.nearby && !document.hidden) { visible(); return; }
      setLoadedMediaSource(current => current === media.src ? undefined : current);
    };
    const visible = () => canvasV2WarmMediaRetention.visible(warmOwner, evict);
    warmLease.current = { owner: warmOwner, visible };
    visible();
    if (!playbackPolicy.current.nearby || document.hidden) canvasV2WarmMediaRetention.offscreen(warmOwner);
    return () => { canvasV2WarmMediaRetention.remove(warmOwner); if (warmLease.current?.owner === warmOwner) warmLease.current = undefined; };
  }, [embedUrl, loadedMediaSource, media.src, sourceIdentity, warmOwner]);
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
      image.onload = null; image.onerror = null; image.removeAttribute('src');
    };
    image.onerror = () => { if (!cancelled) setError(true); }; image.src = media.src;
    return () => { cancelled = true; image.onload = null; image.onerror = null; image.removeAttribute('src'); };
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
    if (!explainer && nearby && pageVisible && !reducedMotion && !userPaused.current && !autoStarted.current && !embedUrl) {
      autoStarted.current = true; void play(true);
    }
  }, [explainer, nearby, pageVisible, reducedMotion, embedUrl, play]);
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
      autoPlay={!explainer && nearby && pageVisible && !reducedMotion && !pausedByUser} muted={!explainer} loop={!explainer} playsInline preload="metadata" controls={Boolean(explainer) || interacting}
      poster={explainer?.poster}
      aria-label={explainer ? media.description : undefined}
      data-canvas-v2-media-control={explainer || interacting ? "true" : undefined}
      style={{ width:"100%",height:"100%",objectFit:"contain",pointerEvents:explainer || interacting ? "auto" : "none" }}
      onLoadedMetadata={event => {
        restoreCanvasV2MediaTime(playback, event.currentTarget);
        if (pendingSeek.current !== undefined) {
          event.currentTarget.currentTime = pendingSeek.current;
          pendingSeek.current = undefined;
        }
      }}
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
    >{captionSource && explainer && <track default kind="captions" label="English" srcLang="en" src={captionSource}/>}</video> : <>
      <canvas ref={poster} aria-label={`Paused GIF: ${media.description}`} className="h-full w-full object-contain" style={{ display: playing ? "none" : "block" }}/>
      {(loadedMediaSource === media.src || playing && nearby && pageVisible) && <img ref={attachGif} src={media.src} alt={media.description} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" style={{visibility:playing && nearby && pageVisible?'visible':'hidden'}} onError={() => setError(true)}/>}
    </>}
    {error ? <div className="absolute inset-0 grid place-content-center gap-2 bg-[#15151a]/95 p-5 text-center text-xs text-white"><span>This media could not be played.</span><small className="max-w-[260px] opacity-55">Check the file format or source. Local files are available for this browser session.</small><button data-canvas-v2-media-control aria-label="Retry media" onClick={() => { video.current?.load(); void play(); }} className="mx-auto rounded-md bg-white/10 px-3 py-1.5">Retry</button></div> : <>
      {!explainer && !playing && !interacting && <button data-canvas-v2-media-control aria-label={media.type === "video" ? "Play video" : "Play GIF"} onClick={() => void play()} className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/60 text-white shadow-lg"><Play size={18} fill="currentColor"/></button>}
      {!explainer && (playing || interacting) && <button data-canvas-v2-media-control aria-label={media.type === "video" ? "Pause video" : "Pause GIF"} onClick={() => pauseMedia()} className="absolute right-2 top-2 rounded-lg border border-white/15 bg-black/70 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><Pause size={14}/></button>}

      <span title="Drag to move" className="absolute left-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"><GripVertical size={14}/></span>
    </>}
    {explainer && <>
      <button type="button" ref={transcriptTrigger} data-canvas-v2-media-control="true"
        className="absolute right-2 top-2 rounded-md bg-black/80 px-3 py-2 text-xs text-white"
        onClick={() => { pauseMedia(); transcriptDialog.current?.showModal(); }}>Transcript</button>
      <dialog ref={transcriptDialog} aria-label={`Transcript for ${media.description}`}
        onClose={() => transcriptTrigger.current?.focus()}
        onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
        className="m-auto max-h-[85vh] w-[min(38rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-black/10 bg-white p-5 text-slate-950 shadow-xl backdrop:bg-black/60 dark:border-white/10 dark:bg-[#201c2b] dark:text-white">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{media.description}</h2>
          <button type="button" aria-label="Close transcript" onClick={() => transcriptDialog.current?.close()} className="rounded-md p-2 hover:bg-violet-500/15"><X size={18}/></button>
        </div>
        <ol className="space-y-4">
          {explainer.chapters.map((chapter, index) => <li key={index} className="border-t border-current/15 pt-3">
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => {
              if (video.current && video.current.readyState >= 1) video.current.currentTime = chapter.start;
              else pendingSeek.current = chapter.start;
              transcriptDialog.current?.close();
            }}>{Math.floor(chapter.start / 60)}:{String(Math.floor(chapter.start % 60)).padStart(2, '0')} · {chapter.title}</button>
            <p className="mt-1 text-sm leading-relaxed">{chapter.narration}</p>
            <p className="mt-1 text-sm leading-relaxed"><strong>Visual description</strong> {chapter.description}</p>
          </li>)}
        </ol>
      </dialog>
    </>}
  </div>;
}
