import { execFileSync } from 'node:child_process';
import { productionCodexHost } from '../lib/canvas-v2/codex-app-server/server';
import { CODEX_VERSION } from '../lib/canvas-v2/codex-app-server/rpc.server';
import { createWorkerServer, workerConfig } from '../lib/canvas-v2/worker/http.server';

try {
  const config = workerConfig(process.env);
  const binary = process.env.NORTHSTAR_CODEX_BINARY || 'codex';
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (version !== `codex-cli ${CODEX_VERSION}`) throw new Error(`Install the pinned Codex ${CODEX_VERSION} binary.`);
  const port = Number(process.env.PORT || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Configure a valid PORT.');
  const { server, shutdown } = createWorkerServer(productionCodexHost(), config);
  server.listen(port, '0.0.0.0', () => process.stdout.write(`Northstar worker ready on port ${port}; Codex ${CODEX_VERSION}\n`));
  const stop = () => { shutdown(); const timer = setTimeout(() => process.exit(0), 5000); timer.unref(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
} catch {
  // Never print environment secrets or child diagnostics on startup failures.
  process.stderr.write('Worker startup failed. Check the pinned binary, API key, worker secret, public URL and allowed origins.\n');
  process.exitCode = 1;
}
