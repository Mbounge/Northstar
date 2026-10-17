/** Installs private-journey-only output suppression before authored code runs.
 * This function is deliberately self-contained so its source can be embedded
 * into the opaque journey frame. Counters describe intercepted API attempts;
 * they do not measure device output or acoustic quality. */
export function installPrivateJourneyAudioIsolation(win: Window & typeof globalThis) {
  const diagnostics = {
    mediaPlayRequests: 0,
    speechSpeakRequests: 0,
    audioContextConstructors: 0,
    audioContextResumes: 0,
    webAudioOutputConnections: 0,
    hookFailures: [] as string[],
    unavailableApis: [] as string[],
    get audioMuted() { return this.hookFailures.length === 0; },
  };
  const mediaNativeDescriptors: Record<string, PropertyDescriptor | undefined> = Object.create(null);
  const hooks = {
    mediaNativePlay: undefined as HTMLMediaElement['play'] | undefined,
    audioNodeNativeConnect: undefined as ((this: AudioNode, destination: AudioNode | AudioParam, ...indices: number[]) => AudioNode | AudioParam) | undefined,
    resumeByPrototype: new WeakMap<object, (...args: unknown[]) => Promise<void>>(),
    fail(name: string) { if (!diagnostics.hookFailures.includes(name)) diagnostics.hookFailures.push(name); },
    install(target: object, key: PropertyKey, descriptor: PropertyDescriptor, label: string) {
      try { Object.defineProperty(target, key, descriptor); return true; }
      catch { hooks.fail(label); return false; }
    },
    mediaPlay(this: HTMLMediaElement, ...args: unknown[]) {
      diagnostics.mediaPlayRequests++;
      hooks.clampMedia(this);
      return hooks.mediaNativePlay!.apply(this, args as []);
    },
    readMediaBoolean(this: HTMLMediaElement, key: string) { return mediaNativeDescriptors[key]?.get?.call(this) ?? true; },
    readMediaVolume(this: HTMLMediaElement) { return mediaNativeDescriptors.volume?.get?.call(this) ?? 0; },
    readMuted(this: HTMLMediaElement) { return hooks.readMediaBoolean.call(this, 'muted'); },
    readDefaultMuted(this: HTMLMediaElement) { return hooks.readMediaBoolean.call(this, 'defaultMuted'); },
    clampMediaBoolean(this: HTMLMediaElement, key: string) {
      try { mediaNativeDescriptors[key]?.set?.call(this, true); }
      catch { hooks.fail('media-state-clamp-failed'); }
    },
    clampMuted(this: HTMLMediaElement) { hooks.clampMediaBoolean.call(this, 'muted'); },
    clampDefaultMuted(this: HTMLMediaElement) { hooks.clampMediaBoolean.call(this, 'defaultMuted'); },
    clampMediaVolume(this: HTMLMediaElement) {
      try { mediaNativeDescriptors.volume?.set?.call(this, 0); }
      catch { hooks.fail('media-state-clamp-failed'); }
    },
    clampMedia(element: HTMLMediaElement) {
      hooks.clampMediaBoolean.call(element, 'muted');
      hooks.clampMediaBoolean.call(element, 'defaultMuted');
      hooks.clampMediaVolume.call(element);
    },
    ignoreMediaWrite() { /* muted/defaultMuted/volume stay clamped in native state */ },
    silenceSubtree(node: ParentNode) {
      if (node instanceof win.HTMLMediaElement) hooks.clampMedia(node);
      node.querySelectorAll?.('audio,video').forEach(element => hooks.clampMedia(element as HTMLMediaElement));
    },
    speechSpeak() { diagnostics.speechSpeakRequests++; },
    connect(this: AudioNode, destination: AudioNode | AudioParam, ...indices: number[]) {
      let context: BaseAudioContext | undefined;
      try { context = this.context; } catch { /* native implementation will report invalid nodes */ }
      if (context && destination === context.destination) {
        diagnostics.webAudioOutputConnections++;
        try {
          const cached = (context as BaseAudioContext & { __northstarPrivateSilentGain?: GainNode }).__northstarPrivateSilentGain;
          const gain = cached || context.createGain();
          if (!cached) {
            gain.gain.value = 0;
            Object.defineProperty(context, '__northstarPrivateSilentGain', { configurable: true, value: gain });
            hooks.audioNodeNativeConnect!.call(gain, context.destination);
          }
          const [output] = indices;
          if (output !== undefined) hooks.audioNodeNativeConnect!.call(this, gain, output, 0);
          else hooks.audioNodeNativeConnect!.call(this, gain);
          return destination;
        } catch { hooks.fail('audio-output-gate-failed'); return destination; }
      }
      return hooks.audioNodeNativeConnect!.call(this, destination, ...indices);
    },
    resume(this: BaseAudioContext, ...args: unknown[]) {
      diagnostics.audioContextResumes++;
      const native = hooks.resumeByPrototype.get(Object.getPrototypeOf(this));
      if (!native) { hooks.fail('audio-context-resume-hook-failed'); return Promise.reject(new Error('Audio context resume hook unavailable')); }
      return native.apply(this, args);
    },
  };

  const mediaPrototype = win.HTMLMediaElement?.prototype;
  if (!mediaPrototype) diagnostics.unavailableApis.push('media');
  else {
    const nativePlay = mediaPrototype.play;
    hooks.mediaNativePlay = nativePlay;
    if (typeof nativePlay !== 'function') hooks.fail('media-play-unavailable');
    else hooks.install(mediaPrototype, 'play', { configurable: true, writable: true, value: hooks.mediaPlay }, 'media-play-hook-failed');
    for (const [key, label] of [['muted', 'media-muted-hook-failed'], ['defaultMuted', 'media-default-muted-hook-failed'], ['volume', 'media-volume-hook-failed']] as const) {
      const original = Object.getOwnPropertyDescriptor(mediaPrototype, key);
      if (!original?.get || !original.set) { hooks.fail(`${key}-property-unavailable`); continue; }
      mediaNativeDescriptors[key] = original;
      const getter = key === 'volume' ? hooks.readMediaVolume : key === 'muted' ? hooks.readMuted : hooks.readDefaultMuted;
      const setter = key === 'volume' ? hooks.clampMediaVolume : key === 'muted' ? hooks.clampMuted : hooks.clampDefaultMuted;
      hooks.install(mediaPrototype, key, { configurable: true, enumerable: original.enumerable, get: getter, set: setter }, label);
    }
    if (!win.document?.documentElement || typeof win.MutationObserver !== 'function') hooks.fail('media-mutation-observer-unavailable');
    else {
      try {
        hooks.silenceSubtree(win.document);
        new win.MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
          if (node.nodeType === 1) hooks.silenceSubtree(node as Element);
        }))).observe(win.document.documentElement, { childList: true, subtree: true });
      } catch { hooks.fail('media-mutation-observer-hook-failed'); }
    }
  }

  const speech = win.speechSynthesis;
  if (!speech) diagnostics.unavailableApis.push('speech-synthesis');
  else {
    try { speech.cancel(); } catch { hooks.fail('speech-cancel-failed'); }
    const nativeSpeak = speech.speak;
    if (typeof nativeSpeak !== 'function') hooks.fail('speech-speak-unavailable');
    else hooks.install(speech, 'speak', { configurable: true, writable: true, value: hooks.speechSpeak }, 'speech-speak-hook-failed');
  }

  const nativeConnect = win.AudioNode?.prototype?.connect as unknown as ((this: AudioNode, destination: AudioNode | AudioParam, ...indices: number[]) => AudioNode | AudioParam) | undefined;
  hooks.audioNodeNativeConnect = nativeConnect;
  if (!win.AudioNode?.prototype || typeof nativeConnect !== 'function') {
    if (typeof (win as unknown as Record<string, unknown>).AudioContext === 'function' || typeof (win as unknown as Record<string, unknown>).webkitAudioContext === 'function') hooks.fail('audio-node-connect-unavailable');
    else diagnostics.unavailableApis.push('web-audio');
  }
  else hooks.install(win.AudioNode.prototype, 'connect', { configurable: true, writable: true, value: hooks.connect }, 'audio-node-connect-hook-failed');

  const contextConstructors = ['AudioContext', 'webkitAudioContext'] as const;
  let contextCount = 0;
  const installedNativeContexts: unknown[] = [];
  for (const key of contextConstructors) {
    const Native = (win as unknown as Record<string, unknown>)[key];
    if (typeof Native !== 'function') continue;
    if (installedNativeContexts.includes(Native)) continue;
    installedNativeContexts.push(Native);
    contextCount++;
    try {
      const nativePrototype = (Native as { prototype: object }).prototype as { resume?: () => Promise<void> };
      const nativeResume = nativePrototype.resume;
      if (typeof nativeResume === 'function') {
        hooks.resumeByPrototype.set(nativePrototype, nativeResume as (...args: unknown[]) => Promise<void>);
        if (!hooks.install(nativePrototype, 'resume', { configurable: true, writable: true, value: hooks.resume }, 'audio-context-resume-hook-failed')) continue;
      } else hooks.fail('audio-context-resume-unavailable');
      const wrapped = new Proxy(Native, { construct(target, args, newTarget) {
        diagnostics.audioContextConstructors++;
        return Reflect.construct(target, args, newTarget);
      } });
      const descriptor = Object.getOwnPropertyDescriptor(win, key);
      if (!descriptor || descriptor.configurable || descriptor.writable) {
        Object.defineProperty(win, key, { configurable: true, enumerable: descriptor?.enumerable ?? true, writable: true, value: wrapped });
      } else hooks.fail(`${key}-constructor-hook-failed`);
    } catch { hooks.fail(`${key}-hook-failed`); }
  }
  if (!contextCount && !diagnostics.unavailableApis.includes('web-audio')) diagnostics.unavailableApis.push('web-audio');
  return diagnostics;
}
