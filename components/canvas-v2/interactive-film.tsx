'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, X } from 'lucide-react';
import { explainerWebVtt, type CanvasExplainerPlayback } from '@/lib/canvas-v2/explainer';
import { filmPlaybackBranches, type InteractiveFilm } from '@/lib/canvas-v2/interactive-film';
import type { CanvasV2PlayableMedia } from '@/lib/canvas-v2/canvas-media';

type Branch = ReturnType<typeof filmPlaybackBranches>[number];
type Take = { until: number; rejoinAt: number };
const button = 'rounded-md border border-white/20 px-3 py-2 text-sm font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:opacity-60';
const pressed = ' border-violet-300/70 bg-violet-300/20';
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;

export function CanvasV2InteractiveFilm({ media, playback, film }: {
  media: CanvasV2PlayableMedia; playback: CanvasExplainerPlayback; film: InteractiveFilm;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const transport = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLHeadingElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLTrackElement>(null);
  const last = useRef(-1);
  const take = useRef<Take | undefined>(undefined);
  const branches = useMemo(() => filmPlaybackBranches(film, playback.chapters), [film, playback.chapters]);
  const [open, setOpen] = useState(false);
  const [verifiedSource, setVerifiedSource] = useState<string>();
  const [captions, setCaptions] = useState(true);
  const [captionSource, setCaptionSource] = useState<string>();
  const [caption, setCaption] = useState('');
  const [viewIndex, setViewIndex] = useState(0);
  const [hold, setHold] = useState<Branch>();
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [time, setTime] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const rect = film.views[viewIndex]?.rect ?? [0, 0, 1, 1];
  const aspect = film.frame[0] * rect[2] / (film.frame[1] * rect[3]);

  useEffect(() => {
    if (!open) return;
    const url = URL.createObjectURL(new Blob([explainerWebVtt(playback.chapters)], { type: 'text/vtt' }));
    setCaptionSource(url);
    return () => URL.revokeObjectURL(url);
  }, [open, playback.chapters]);
  useEffect(() => {
    if (!open) return;
    const decoder = video.current;
    const pause = () => { if (document.hidden) decoder?.pause(); };
    document.addEventListener('visibilitychange', pause);
    return () => { document.removeEventListener('visibilitychange', pause); decoder?.pause(); };
  }, [open]);
  useEffect(() => { if (hold) question.current?.focus({ preventScroll: true }); }, [hold]);
  useEffect(() => {
    if (!open) return;
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
  }, [open, media.src, film.sourceRevision]);
  useEffect(() => {
    const object = track.current?.track;
    if (!open || !object) return;
    const update = () => setCaption(captions ? Array.from(object.activeCues ?? [], cue => (cue as VTTCue).text).join('\n') : '');
    object.mode = captions ? 'hidden' : 'disabled';
    object.addEventListener('cuechange', update);
    update();
    return () => object.removeEventListener('cuechange', update);
  }, [open, captionSource, captions]);

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
    if (!player || !ready || hold || error) return;
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
      const branch = branches.find(item => last.current < item.holdAt && now >= item.holdAt);
      if (branch) {
        player.pause();
        seek(branch.holdAt);
        setNotice('');
        setHold(branch);
        return;
      }
    }
    last.current = now;
    setTime(now);
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

  return <div className="relative h-full w-full overflow-hidden rounded-lg bg-[#171522]" data-canvas-v2-playable-media>
    <img src={playback.poster} alt="" className="h-full w-full object-contain" draggable={false} />
    <button type="button" ref={trigger} data-canvas-v2-media-control="true"
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-[#1d172c] px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-violet-300/50 focus-visible:outline-2 focus-visible:outline-violet-200"
      onClick={() => { setOpen(true); dialog.current?.showModal(); }}><Clapperboard size={16} aria-hidden="true" /> Open interactive film</button>
    <dialog ref={dialog} aria-label={media.description} data-canvas-v2-media-control="true"
      className="m-auto max-h-[92dvh] w-[min(54rem,calc(100vw-1rem))] overflow-auto overscroll-contain rounded-xl border border-white/15 bg-[#201b2a] p-3 text-[#f5effc] shadow-xl backdrop:bg-black/75 sm:p-5"
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
      onClose={() => {
        video.current?.pause(); setOpen(false); setVerifiedSource(undefined); setReady(false); setPlaying(false);
        setTime(0); setHold(undefined); setError(''); setNotice(''); setCaption(''); last.current = -1; take.current = undefined;
        trigger.current?.focus({ preventScroll: true });
      }}>
      {open && <>
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{media.description}</h2>
          <button type="button" className={button} aria-label="Close film" onClick={() => dialog.current?.close()}><X size={18}/></button>
        </header>
        {film.views.length > 0 && <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Synchronized views">
          {film.views.map((view, index) => <button key={view.id} type="button"
            className={button + (index === viewIndex ? pressed : '')} aria-pressed={index === viewIndex}
            onClick={() => setViewIndex(index)}>{view.label}</button>)}
        </div>}
        <div className="relative mx-auto overflow-hidden rounded-lg bg-[#121017]"
          style={{ aspectRatio: aspect, width: `min(100%, ${aspect * 53}dvh)` }}>
          <video ref={video} src={verifiedSource} preload="auto" poster={playback.poster} playsInline disablePictureInPicture
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
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onError={() => { if (verifiedSource) setError('The film could not load.'); }}>
            {captionSource && <track ref={track} kind="captions" label="English" srcLang="en" src={captionSource} />}
          </video>
          {caption && <p className="pointer-events-none absolute bottom-2 left-1/2 m-0 w-max max-w-[90%] -translate-x-1/2 whitespace-pre-wrap rounded bg-black/90 px-3 py-1 text-center text-sm text-white">{caption}</p>}
        </div>
        {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button ref={transport} type="button" className={button} aria-disabled={Boolean(hold) || !ready}
              onClick={() => { if (playing) video.current?.pause(); else play(); }}>{playing ? 'Pause' : 'Play'}</button>
            <input className="min-w-24 flex-1 accent-violet-300" aria-label="Film timeline" aria-valuetext={timeLabel(time)}
              type="range" min={0} max={playback.duration} step={.05} value={time} disabled={!ready}
              onChange={event => scrub(Number(event.currentTarget.value))}/>
            <span className="text-sm tabular-nums">{timeLabel(time)} / {timeLabel(playback.duration)}</span>
            <button type="button" className={button + (captions ? pressed : '')} aria-pressed={captions}
              onClick={() => setCaptions(!captions)}>Captions</button>
          </div>
          {hold && <section className="mt-3 rounded-lg border border-violet-300/40 bg-violet-300/10 p-3" aria-label="Choose what happens next">
            <h3 ref={question} tabIndex={-1} className="text-base font-medium">{hold.prompt}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {hold.choices.map(choice => <button key={choice.beat} type="button" className={button}
                onClick={() => choose(hold, choice)}>{choice.label}</button>)}
            </div>
          </section>}
          <p role="status" className="mt-1 text-sm text-violet-100/90">{notice}</p>
        </>}
        <details className="mt-2 border-t border-white/15 pt-2">
          <summary className="cursor-pointer py-2 text-sm font-medium">Chapters and transcript</summary>
          <ol className="space-y-3 text-sm">
            {playback.chapters.map((chapter, index) => <li key={chapter.start}>
              <button type="button" className="text-left font-medium underline underline-offset-4"
                disabled={!ready || Boolean(error)} onClick={() => { video.current?.pause(); scrub(chapter.start); }}>
                {timeLabel(chapter.start)} · {chapter.title}
              </button>
              <p>{chapter.narration}</p><p className="mt-1 text-violet-100/90">{chapter.description}</p>
              {branches.find(branch => branch.afterBeat === index + 1)?.choices.map(choice =>
                <span key={choice.beat} className="mr-3 text-xs text-violet-100">{choice.label}</span>)}
            </li>)}
          </ol>
        </details>
      </>}
    </dialog>
  </div>;
}
