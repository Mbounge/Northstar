import test from 'node:test';
import assert from 'node:assert/strict';
import { installPrivateJourneyAudioIsolation } from '../lib/canvas-v2/screen-private-audio';

test('private journey boot intercepts detached media, speech and Web Audio output without retaining content', () => {
  class Media {
    nodeType = 1; _muted = false; _defaultMuted = false; _volume = 1; playCalls = 0;
    get muted() { return this._muted; } set muted(value: boolean) { this._muted = value; }
    get defaultMuted() { return this._defaultMuted; } set defaultMuted(value: boolean) { this._defaultMuted = value; }
    get volume() { return this._volume; } set volume(value: number) { this._volume = value; }
    play() { this.playCalls++; return Promise.resolve(); }
  }
  class Node {
    context!: Context; connections: Array<{ destination: object; output?: number }> = [];
    connect(destination: object, output?: number) { this.connections.push({ destination, output }); return destination; }
  }
  class Gain extends Node { gain = { value: 1 }; }
  class Context {
    destination = { speaker: true }; state = 'suspended'; gain?: Gain;
    createGain() { this.gain = new Gain(); this.gain.context = this; return this.gain; }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  const utterances: string[] = [];
  const speech = { cancelCalls: 0, cancel() { this.cancelCalls++; }, speak(value: { text: string }) { utterances.push(value.text); } };
  const existing = new Media();
  let observerCallback: MutationCallback | undefined;
  class Observer { constructor(callback: MutationCallback) { observerCallback = callback; } observe() {} disconnect() {} takeRecords() { return []; } }
  const document = {
    documentElement: {},
    querySelectorAll: () => [existing],
  };
  const realm = {
    HTMLMediaElement: Media,
    AudioNode: Node,
    AudioContext: Context,
    webkitAudioContext: Context,
    speechSynthesis: speech,
    document,
    MutationObserver: Observer,
  } as unknown as Window & typeof globalThis;

  // Exercise the exact serialization form used to install helpers in the
  // opaque frame, so the helper cannot depend on module-scope closures.
  const serializedInstall = new Function('win', `return (${installPrivateJourneyAudioIsolation.toString()})(win)`) as (win: Window & typeof globalThis) => ReturnType<typeof installPrivateJourneyAudioIsolation>;
  const diagnostics = serializedInstall(realm);
  assert.equal(existing._muted, true); assert.equal(existing._defaultMuted, true); assert.equal(existing._volume, 0);
  const detached = new Media();
  void detached.play();
  detached.muted = false; detached.defaultMuted = false; detached.volume = 1;
  const future = new Media();
  observerCallback?.([{ addedNodes: [future] } as unknown as MutationRecord] as unknown as MutationRecord[], {} as MutationObserver);
  const context = new (realm as unknown as { AudioContext: typeof Context }).AudioContext();
  const oscillator = new Node(); oscillator.context = context;
  oscillator.connect(context.destination);
  void context.resume();
  speech.speak({ text: 'private spoken content' });

  assert.equal(detached.playCalls, 1);
  assert.equal(detached.muted, true); assert.equal(detached.defaultMuted, true); assert.equal(detached.volume, 0);
  assert.equal(detached._muted, true); assert.equal(detached._defaultMuted, true); assert.equal(detached._volume, 0);
  assert.equal(future._muted, true); assert.equal(future._defaultMuted, true); assert.equal(future._volume, 0);
  assert.equal(context.gain?.gain.value, 0);
  assert.equal(oscillator.connections.length, 1);
  assert.equal(oscillator.connections[0]?.destination, context.gain);
  assert.equal(context.gain?.connections[0]?.destination, context.destination);
  assert.equal(speech.cancelCalls, 1); assert.deepEqual(utterances, []);
  assert.equal(diagnostics.audioMuted, true);
  assert.deepEqual({
    media: diagnostics.mediaPlayRequests,
    speech: diagnostics.speechSpeakRequests,
    contexts: diagnostics.audioContextConstructors,
    resumes: diagnostics.audioContextResumes,
    outputs: diagnostics.webAudioOutputConnections,
  }, { media: 1, speech: 1, contexts: 1, resumes: 1, outputs: 1 });
  assert.equal(JSON.stringify(diagnostics).includes('private spoken content'), false);
});

test('private journey isolation reports unsupported output hooks instead of claiming full suppression', () => {
  const diagnostics = installPrivateJourneyAudioIsolation({} as Window & typeof globalThis);
  assert.equal(diagnostics.audioMuted, true);
  assert.deepEqual(diagnostics.hookFailures, []);
  assert.deepEqual(diagnostics.unavailableApis.sort(), ['media', 'speech-synthesis', 'web-audio']);
});
