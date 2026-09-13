import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { object, string, type JsonObject } from '../managed-agent/protocol';

export const CODEX_VERSION = '0.153.4';
export interface CodexTransport {
  cwd: string;
  request(method: string, params: unknown): Promise<JsonObject>;
  notify(method: string, params: unknown): void;
  reject(id: string | number, message: string): void;
  reply(id: string | number, result: unknown): void;
  onMessage(handler: (message: JsonObject) => void): void;
  onClose(handler: (error: Error) => void): void;
  close(): void;
}
export class CodexRpcError extends Error { constructor(message: string, readonly code?: number) { super(message); } }

/** Keep network trust/routing, without inheriting credentials, personal config or TLS bypasses. */
export async function codexChildEnvironment(
  home: string,
  source: NodeJS.ProcessEnv = process.env,
  options: { platform?: NodeJS.Platform; systemCaFile?: string } = {},
): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { NODE_ENV: source.NODE_ENV, PATH: source.PATH, HOME: home, CODEX_HOME: home, TMPDIR: tmpdir() };
  for (const key of ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy']) {
    if (source[key]) env[key] = source[key];
  }
  // Codex gives CODEX_CA_CERTIFICATE precedence over SSL_CERT_FILE. Resolve relative
  // paths before changing the child's cwd to its private workspace.
  const explicitKey = ['CODEX_CA_CERTIFICATE', 'SSL_CERT_FILE'].find(key => source[key]?.trim());
  if (source.SSL_CERT_DIR?.trim()) env.SSL_CERT_DIR = source.SSL_CERT_DIR.split(':').map(p => resolve(p)).join(':');
  let caFile = explicitKey ? resolve(source[explicitKey]!) : undefined;
  if (!caFile && !env.SSL_CERT_DIR && (options.platform ?? process.platform) === 'darwin') {
    // Native keychain root discovery can fail inside macOS's sandbox. The OS PEM
    // bundle supplies trusted roots to both Codex HTTPS and WebSocket clients.
    caFile = options.systemCaFile ?? '/etc/ssl/cert.pem';
  }
  if (caFile) {
    try {
      const pem = await readFile(caFile, 'utf8');
      const blocks = pem.match(/-----BEGIN (?:TRUSTED )?CERTIFICATE-----[\s\S]*?-----END (?:TRUSTED )?CERTIFICATE-----/g);
      if (!blocks?.length) throw new Error('Empty CA bundle');
      for (const block of blocks) new X509Certificate(block.replaceAll('TRUSTED CERTIFICATE', 'CERTIFICATE'));
    } catch {
      // Fail before creating a session; never hide an explicit trust configuration error.
      throw new Error(`Codex cannot load its trusted CA bundle (${explicitKey ?? 'macOS system bundle'}). Configure CODEX_CA_CERTIFICATE with a readable PEM certificate bundle.`);
    }
    env[explicitKey ?? 'CODEX_CA_CERTIFICATE'] = caFile;
  }
  return env;
}

/** Private stdio child; no desktop profile, shell interpolation, or browser access. */
export async function spawnCodex(binary: string): Promise<CodexTransport> {
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (version !== `codex-cli ${CODEX_VERSION}`) throw new Error(`Northstar requires Codex ${CODEX_VERSION}; the configured binary has a different version.`);
  const home = await mkdtemp(join(tmpdir(), 'northstar-codex-'));
  const cwd = join(home, 'workspace');
  let env: NodeJS.ProcessEnv;
  try { env = await codexChildEnvironment(home); await mkdir(cwd); }
  catch (error) { await rm(home, { recursive: true, force: true }); throw error; }
  const child = spawn(binary, ['app-server', '--listen', 'stdio://', '-c', 'features.shell_tool=false', '-c', 'features.multi_agent=false', '-c', 'features.code_mode=false', '-c', 'web_search="live"', '-c', 'cli_auth_credentials_store="file"'], {
    cwd, env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let sequence = 0, buffer = '', closed = false;
  const pending = new Map<number, { resolve: (v: JsonObject) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let receive: (message: JsonObject) => void = () => {}; let ended: (error: Error) => void = () => {};
  const cleanup = () => { void rm(home, { recursive: true, force: true }); };
  const fail = (error: Error) => {
    if (closed) return; closed = true;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); ended(error);
  };
  const write = (message: unknown) => { if (closed) throw new Error('Codex process is closed.'); child.stdin.write(JSON.stringify(message) + '\n'); };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    if (buffer.length > 24_000_000) { fail(new Error('Codex event exceeded the transport limit.')); child.kill(); return; }
    let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line.trim()) continue;
      try {
        const message = object(JSON.parse(line)); const id = Number(message.id);
        if (!message.method && pending.has(id)) {
          const p = pending.get(id)!; pending.delete(id); clearTimeout(p.timer);
          if (message.error) p.reject(new CodexRpcError(string(object(message.error).message) || 'Codex request failed.', Number(object(message.error).code)));
          else p.resolve(object(message.result));
        } else receive(message);
      } catch { fail(new Error('Codex returned an invalid protocol message.')); child.kill(); }
    }
  });
  // Never relay diagnostic stderr (which can contain prompts or credential details) to clients.
  child.stderr.resume(); child.stdin.on('error', () => fail(new Error('Codex input disconnected.')));
  child.on('error', () => { fail(new Error('Could not start the configured Codex binary.')); cleanup(); });
  child.on('exit', () => { fail(new Error('Codex process ended. Start a new conversation.')); cleanup(); });
  return {
    cwd, onMessage(handler) { receive = handler; }, onClose(handler) { ended = handler; },
    request(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex ${method} timed out; its outcome is uncertain.`)); }, 30_000);
        pending.set(id, { resolve, reject, timer });
        try { write({ id, method, params }); } catch (e) { clearTimeout(timer); pending.delete(id); reject(e); }
      });
    },
    notify(method, params) { write({ method, params }); },
    reject(id, message) { write({ id, error: { code: -32601, message } }); },
    reply(id, result) { write({ id, result }); },
    close() { fail(new Error('Codex session closed.')); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 2000); timer.unref(); },
  };
}
