/**
 * A scene owns its drawing, while this host owns time and playback controls.
 * The preview and the offline renderer share the same synchronous draw callback.
 * This function is serialized into the opaque preview iframe.
 */
export function installCanvasV2AuthoredTimeline(exporting: boolean, exportPixelRatio = 1) {
  let registration: { duration: number; render: (seconds: number) => void; loop: boolean; exportCanvas?: HTMLCanvasElement } | undefined;
  let time = 0, frame = 0, last: number | undefined, playing = false, visible = true;
  let button: HTMLButtonElement | undefined, slider: HTMLInputElement | undefined, status: HTMLOutputElement | undefined;
  let error = '';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => {
    if (button) button.textContent = playing ? 'Pause' : time >= (registration?.duration ?? Infinity) ? 'Replay' : 'Play';
    if (slider) {
      slider.value = String(time);
      slider.setAttribute('aria-valuetext', time.toFixed(1) + ' of ' + registration?.duration + ' seconds');
    }
    if (status) status.value = error || time.toFixed(1) + ' / ' + registration?.duration + ' s';
  };
  const draw = (value: number) => {
    if (!registration || !Number.isFinite(value)) throw Error('The live scene has no registered timeline.');
    time = Math.max(0, Math.min(registration.duration, value));
    try {
      registration.render(time);
      error = '';
    } catch (failure) {
      playing = false;
      error = failure instanceof Error ? failure.message : 'Scene rendering failed.';
      update();
      throw failure;
    }
    update();
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = undefined;
    if (!exporting && playing && visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const tick = (now: number) => {
    if (!registration || !playing || !visible || document.hidden) return;
    const next = time + (last === undefined ? 0 : Math.min(.1, (now - last) / 1000));
    last = now;
    if (!registration.loop && next >= registration.duration) playing = false;
    try {
      draw(registration.loop ? next % registration.duration : next);
    } catch {
      return;
    }
    if (playing) frame = requestAnimationFrame(tick);
  };
  const pause = () => { playing = false; schedule(); update(); };
  const play = () => {
    if (!registration || exporting) return;
    if (time >= registration.duration) draw(0);
    playing = true; schedule(); update();
  };
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', event => { if (event.matches) pause(); });
  window.addEventListener('pagehide', pause, { once: true });
  const api = Object.freeze({
    ...(exporting ? {exportPixelRatio} : {}),
    register(input: { duration: number; render: (seconds: number) => void; loop?: boolean; autoplay?: boolean; exportCanvas?: HTMLCanvasElement }) {
      if (registration || typeof input?.render !== 'function' || !Number.isFinite(input.duration) || input.duration < .5 || input.duration > 90) {
        throw Error('Register one synchronous scene timeline lasting 0.5–90 seconds.');
      }
      const mount = document.querySelector('[data-northstar-timeline]');
      if (!mount) throw Error('Add a data-northstar-timeline control container to the scene.');
      if (input.exportCanvas !== undefined && !(input.exportCanvas instanceof HTMLCanvasElement)) {
        throw Error('Film export needs a Canvas2D element with the full painted scene.');
      }
      registration = { duration: input.duration, render: input.render, loop: input.loop === true, exportCanvas: input.exportCanvas };
      const emptySlot = !mount.childElementCount && !mount.textContent?.trim();
      if (exporting) {
        if (emptySlot) mount.setAttribute('hidden', '');
        for (const controls of mount.querySelectorAll<HTMLElement>('[data-northstar-timeline-controls]')) {
          controls.style.setProperty('display', 'none', 'important');
        }
      }
      if (!exporting && emptySlot) {
        button = document.createElement('button');
        button.type = 'button';
        button.addEventListener('click', () => { if (playing) pause(); else play(); });
        slider = document.createElement('input');
        slider.type = 'range'; slider.min = '0'; slider.max = String(input.duration); slider.step = '.01';
        slider.setAttribute('aria-label', 'Scene time');
        slider.addEventListener('input', () => { draw(Number(slider?.value)); schedule(); });
        status = document.createElement('output');
        status.setAttribute('aria-live', 'off');
        mount.replaceChildren(button, slider, status);
      }
      draw(0);
      if (input.autoplay && !motion.matches) play();
    },
    getState: () => ({ duration: registration?.duration, time, playing, error,
      ...(registration?.exportCanvas ? { directCanvasExport:true } : {}) }),
    captureFrame(seconds: number, width: number, height: number) {
      const canvas = registration?.exportCanvas;
      if (!exporting || !canvas) throw Error('Direct frame capture needs an explicitly registered export canvas.');
      draw(seconds);
      if (canvas.width !== width || canvas.height !== height) {
        throw Error(`The export canvas backing size is ${canvas.width} × ${canvas.height}. Set its backing size to ${width} × ${height}, including devicePixelRatio.`);
      }
      return canvas.toDataURL('image/jpeg', .94);
    },
    seek: draw,
    play,
    pause,
    setViewportActive(value: boolean) { visible = value; schedule(); },
  });
  Object.defineProperty(window, 'northstarTimeline', { value: api, writable: false, configurable: false });
}
