// End-to-end frame delivery check over the same Mac-to-Hetzner tunnel as Chrome.
// Run with the preview browser tab closed; the lab admits one viewer at a time.
const endpoint = process.env.PREVIEW_WS_URL ?? 'ws://127.0.0.1:18080/stream';
const seconds = Number(process.argv[2] ?? 10);
if (typeof WebSocket !== 'function') throw new Error('Run this benchmark with Node.js 22 or newer');
if (!Number.isFinite(seconds) || seconds < 2 || seconds > 300) {
  throw new Error('Duration must be between 2 and 300 seconds');
}

const socket = new WebSocket(endpoint);
socket.binaryType = 'arraybuffer';
const times = [];
const sizes = [];
const started = performance.now();
let error = null;

socket.addEventListener('message', event => {
  if (typeof event.data === 'string') {
    const notice = JSON.parse(event.data);
    if (notice.type === 'error') error = notice.message;
    return;
  }
  times.push(performance.now());
  sizes.push(event.data.byteLength);
  socket.send('{"type":"frame_ready"}');
  if (performance.now() - started >= seconds * 1000) socket.close();
});

await new Promise((resolve, reject) => {
  socket.addEventListener('close', resolve);
  socket.addEventListener('error', () => reject(new Error('Preview WebSocket connection failed')));
  setTimeout(() => socket.close(), (seconds + 5) * 1000);
});

if (error) throw new Error(error);
if (times.length < 2) throw new Error('No usable preview frames received');
const gaps = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
const sortedSizes = sizes.sort((a, b) => a - b);
const percentile = (list, fraction) => Math.round(list[Math.floor((list.length - 1) * fraction)]);
console.log(JSON.stringify({
  seconds: Math.round((times.at(-1) - times[0]) / 1000),
  frames: times.length,
  fps: Math.round((times.length - 1) * 1000 / (times.at(-1) - times[0])),
  medianGapMs: percentile(gaps, 0.5),
  p95GapMs: percentile(gaps, 0.95),
  maxGapMs: percentile(gaps, 1),
  medianFrameBytes: percentile(sortedSizes, 0.5),
}, null, 2));
