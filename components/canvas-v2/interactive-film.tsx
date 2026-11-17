'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, FileText, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { explainerWebVtt, type CanvasExplainerPlayback } from '@/lib/canvas-v2/explainer';
import { filmPlaybackBranches, type InteractiveFilm } from '@/lib/canvas-v2/interactive-film';
import { CANVAS_V2_MEDIA_STATE_EVENT, CANVAS_V2_MEDIA_TOGGLE_EVENT, type CanvasV2PlayableMedia } from '@/lib/canvas-v2/canvas-media';

type Branch = ReturnType<typeof filmPlaybackBranches>[number];
type Take = { until: number; rejoinAt: number };
const button = 'inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md border border-transparent px-2 text-sm font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-300 aria-disabled:opacity-55';
const pressed = ' !border-violet-300/50 bg-violet-300/15';
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;

export function CanvasV2InteractiveFilm({ media, playback, film, nodeId }: {
  media: CanvasV2PlayableMedia; playback: CanvasExplainerPlayback; film: InteractiveFilm; nodeId: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const transcriptButton = useRef<HTMLButtonElement>(null);
  const transcriptHeading = useRef<HTMLHeadingElement>(null);
  const transport = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLHeadingElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLTrackElement>(null);
  const last = useRef(-1);
  const take = useRef<Take | undefined>(undefined);
  const branches = useMemo(() => filmPlaybackBranches(film, playback.chapters), [film, playback.chapters]);
  const [nearby, setNearby] = useState(false);
  const [activated, setActivated] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const [verifiedSource, setVerifiedSource] = useState<string>();
  const [captions, setCaptions] = useState(true);
  const [muted, setMuted] = useState(false);
  const [captionSource, setCaptionSource] = useState<string>();
  const [caption, setCaption] = useState('');
  const [viewIndex, setViewIndex] = useState(-1);
  const [hold, setHold] = useState<Branch>();
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [time, setTime] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const rect = film.views[viewIndex]?.rect ?? [0, 0, 1, 1];
  const aspect = film.frame[0] * rect[2] / (film.frame[1] * rect[3]);

  useEffect(() => {
    if (!activated) return;
    const url = URL.createObjectURL(new Blob([explainerWebVtt(playback.chapters)], { type: 'text/vtt' }));
    setCaptionSource(url);
    return () => URL.revokeObjectURL(url);
  }, [activated, playback.chapters]);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      setNearby(entry.isIntersecting);
      if (entry.isIntersecting) setActivated(true);
      else video.current?.pause();
    }, { root: node.closest('[data-canvas-v2-native-wheel-capture]') });
    observer.observe(node);
    const pause = () => { if (document.hidden) video.current?.pause(); };
    document.addEventListener('visibilitychange', pause);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', pause); };
  }, []);
  useEffect(() => {
    host.current?.dispatchEvent(new CustomEvent(CANVAS_V2_MEDIA_STATE_EVENT, { bubbles: true, detail: { nodeId, playing } }));
  }, [nodeId, playing]);
  useEffect(() => { if (transcript) transcriptHeading.current?.focus({ preventScroll: true }); }, [transcript]);
  useEffect(() => { if (hold) question.current?.focus({ preventScroll: true }); }, [hold]);
  useEffect(() => {
    if (!activated) return;
    let closed = false;
    void (async () => {
      try {
        const payload = media.src.slice('data:video/mp4;base64,'.length);
        if (!media.src.startsWith('data:video/mp4;base64,') || payload.length > 6_670_000) throw Error();
        const bytes = Uint8Array.from(atob(payload), byte => byte.charCodeAt(0));
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const hex = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
        if (hex !== film.sourceRevision) throw Error();
        if (!closed) setVerifiedSource(media.src);
      } catch { if (!closed) setError('This film changed. Render a new cut to restore its views and choices.'); }
    })();
    return () => { closed = true; };
  }, [activated, media.src, film.sourceRevision]);
  useEffect(() => {
    const object = track.current?.track;
    if (!object) return;
    const update = () => setCaption(captions ? Array.from(object.activeCues ?? [], cue => (cue as VTTCue).text).join('\n') : '');
    object.mode = captions ? 'hidden' : 'disabled';
    object.addEventListener('cuechange', update);
    update();
    return () => object.removeEventListener('cuechange', update);
  }, [captionSource, captions]);

  function seek(seconds: number) {
    const player = video.current;
    if (!player || player.readyState < 1 || error) return;
    player.currentTime = Math.min(playback.duration, Math.max(0, seconds));
    last.current = player.currentTime;
    setTime(player.currentTime);
  }
  function scrub(seconds: number) {
    const branch = branches.find(item => item.choices.some(choice => seconds >= choice.from && seconds < choice.until));
    const choice = branch?.choices.find(item => seconds >= item.from && seconds < item.until);
    take.current = branch && choice ? { until: choice.until, rejoinAt: branch.rejoinAt } : undefined;
    if (hold) setHold(undefined);
    setNotice('');
    seek(seconds);
  }
  function play() {
    const player = video.current;
    if (!player || !ready || hold || error || !nearby || document.hidden) return;
    if (player.ended) scrub(0);
    void player.play().catch((failure: DOMException) => {
      if (failure.name !== 'AbortError') setNotice('Playback could not start. Try Play again.');
    });
  }
  function choose(branch: Branch, choice: Branch['choices'][number]) {
    take.current = { until: choice.until, rejoinAt: branch.rejoinAt };
    setHold(undefined);
    setNotice(`Playing ${choice.label}.`);
    seek(choice.from);
    transport.current?.focus({ preventScroll: true });
    void video.current?.play().catch((failure: DOMException) => {
      if (failure.name !== 'AbortError') setNotice('Playback could not start. Try Play again.');
    });
  }
  function advance(player: HTMLVideoElement) {
    if (player.seeking) return;
    const now = player.currentTime;
    if (!player.paused) {
      const selected = take.current;
      if (selected && now >= selected.until - .015) {
        take.current = undefined;
        setNotice('Back to the shared ending.');
        seek(selected.rejoinAt);
        return;
      }
      const branch = branches.find(item => last.current <= item.holdAt && now >= item.holdAt);
      if (branch) {
        player.pause();
        seek(branch.holdAt);
        setNotice('');
        setHold(branch);
        return;
      }
    }
    last.current = now;
    setTime(previous => Math.abs(previous - now) < .15 && !player.paused ? previous : now);
  }
  const observeFrames = useRef(advance);
  observeFrames.current = advance;
  useEffect(() => {
    const player = video.current;
    if (!playing || !player?.requestVideoFrameCallback) return;
    let request: number;
    const frame = () => {
      observeFrames.current(player);
      if (!player.paused) request = player.requestVideoFrameCallback(frame);
    };
    request = player.requestVideoFrameCallback(frame);
    return () => player.cancelVideoFrameCallback(request);
  }, [playing]);

  const toggle = () => {
    if (video.current && !video.current.paused) video.current.pause();
    else if (!transcript) play();
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const node = host.current;
    const activate = () => toggleRef.current();
    node?.addEventListener(CANVAS_V2_MEDIA_TOGGLE_EVENT, activate);
    return () => node?.removeEventListener(CANVAS_V2_MEDIA_TOGGLE_EVENT, activate);
  }, []);

  function closeTranscript() {
    setTranscript(false);
    transcriptButton.current?.focus({ preventScroll: true });
  }

  return <div ref={host} role="region" aria-label={media.description}
    data-canvas-v2-playable-media data-canvas-v2-media-nearby={nearby ? 'true' : 'false'} data-playing={playing ? 'true' : 'false'}
    className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/15 bg-[#171522] text-[#f6f2fc]">
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-[#111018]" style={{ containerType: 'size' }}>
        <div className="relative overflow-hidden" style={{ aspectRatio: aspect, width: `min(100%, calc(100cqh * ${aspect}))` }}>
          <video ref={video} src={verifiedSource} preload="metadata" poster={playback.poster} muted={muted} playsInline disablePictureInPicture
            aria-label={media.description}
            style={{ position:'absolute', objectFit:'fill', left:`${-100 * rect[0] / rect[2]}%`, top:`${-100 * rect[1] / rect[3]}%`,
              width:`${100 / rect[2]}%`, height:`${100 / rect[3]}%`, maxWidth:'none' }}
            onLoadedMetadata={event => {
              const player = event.currentTarget;
              if (player.videoWidth !== film.frame[0] || player.videoHeight !== film.frame[1] ||
                  Math.abs(player.duration - playback.duration) > .12) {
                setError('The video dimensions or duration changed. Render a new cut.');
                return;
              }
              setReady(true);
            }}
            onTimeUpdate={event => advance(event.currentTarget)}
            onPlay={event => {
              if (!nearby || document.hidden) { event.currentTarget.pause(); return; }
              setPlaying(true);
            }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onError={() => { if (verifiedSource) setError('The film could not load.'); }}>
            {captionSource && <track ref={track} kind="captions" label="English" srcLang="en" src={captionSource} />}
          </video>
        </div>
      </div>
      {captions && <div className="flex min-h-7 shrink-0 items-center justify-center bg-black/35 px-2 py-1 text-center text-[13px] leading-4">
        {caption}
      </div>}
      {error && <p role="alert" className="m-0 bg-[#281c2c] px-3 py-2 text-sm">{error}</p>}
      {hold && !transcript && <section className="max-h-[58%] shrink-0 overflow-auto border-t border-violet-300/40 bg-[#282039] p-2"
        data-canvas-v2-media-control="true" data-canvas-v2-film-scroll aria-label="Choose what happens next" onWheel={event => event.stopPropagation()}>
        <h3 ref={question} tabIndex={-1} className="m-0 text-sm font-semibold">{hold.prompt}</h3>
        <div className="mt-1 flex flex-wrap gap-1">
          {hold.choices.map(choice => <button key={choice.beat} type="button" className={button + pressed}
            onClick={() => choose(hold, choice)}>{choice.label}</button>)}
        </div>
      </section>}
      {transcript && <section aria-label="Chapters and transcript" data-canvas-v2-media-control="true" data-canvas-v2-film-scroll
        className="absolute inset-0 overflow-auto overscroll-contain bg-[#201b2b] px-4 py-3"
        onWheel={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') closeTranscript(); }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 ref={transcriptHeading} tabIndex={-1} className="text-sm font-semibold">Chapters and transcript</h3>
          <button type="button" className={button} onClick={closeTranscript}>Close transcript</button>
        </div>
        <ol className="space-y-3 text-sm">
          {playback.chapters.map((chapter, index) => <li key={chapter.start} className="border-t border-white/15 pt-2">
            <button type="button" className="text-left font-medium underline underline-offset-4"
              disabled={!ready || Boolean(error)} onClick={() => { scrub(chapter.start); closeTranscript(); }}>
              {timeLabel(chapter.start)} · {chapter.title}
            </button>
            <p className="mt-1">{chapter.narration}</p><p className="mt-1 text-violet-100/90">{chapter.description}</p>
            {branches.find(branch => branch.afterBeat === index + 1)?.choices.map(choice =>
              <span key={choice.beat} className="mr-3 text-xs text-violet-100">{choice.label}</span>)}
          </li>)}
        </ol>
      </section>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1 border-t border-white/15 p-1"
      data-canvas-v2-media-control="true" aria-label="Playback controls">
      <button ref={transport} type="button" className={button} aria-disabled={Boolean(hold) || !ready || Boolean(error) || transcript}
        aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={toggle}>
        {playing ? <Pause size={16} aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}
      </button>
      <input className="min-w-12 flex-1 accent-violet-300" aria-label="Film timeline" aria-valuetext={timeLabel(time)}
        type="range" min={0} max={playback.duration} step={.05} value={time} disabled={!ready || Boolean(error)}
        onChange={event => scrub(Number(event.currentTarget.value))}/>
      <span className="mx-1 whitespace-nowrap text-xs tabular-nums">{timeLabel(time)} / {timeLabel(playback.duration)}</span>
      {film.views.length > 0 && <select aria-label="Synchronized view" value={viewIndex}
        className="max-w-[40%] min-w-0 rounded-md border border-white/20 bg-[#232033] px-1 py-1.5 text-xs focus-visible:outline-violet-300"
        onChange={event => setViewIndex(Number(event.currentTarget.value))}>
        <option value={-1}>All views</option>
        {film.views.map((view, index) => <option key={view.id} value={index}>{view.label}</option>)}
      </select>}
      <button type="button" className={button + (captions ? pressed : '')} aria-pressed={captions} aria-label="Captions" title="Captions"
        onClick={() => setCaptions(!captions)}><Captions size={17} aria-hidden="true"/></button>
      <button type="button" className={button} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}
        onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={16} aria-hidden="true"/> : <Volume2 size={16} aria-hidden="true"/>}</button>
      <button ref={transcriptButton} type="button" className={button + (transcript ? pressed : '')} aria-expanded={transcript}
        aria-label={transcript ? 'Close transcript' : 'Chapters and transcript'} title="Chapters and transcript"
        onClick={() => { if (transcript) closeTranscript(); else { video.current?.pause(); setTranscript(true); } }}>
        <FileText size={16} aria-hidden="true"/>
      </button>
    </div>
    <p role="status" className="sr-only">{notice}</p>
  </div>;
}
