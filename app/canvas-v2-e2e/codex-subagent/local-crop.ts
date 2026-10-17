import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { preparedAssetJob } from '@/lib/canvas-v2/creative/asset-preparation';
import { creativeArtifact } from '@/lib/canvas-v2/creative/runtime.server';
import type { JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';
import type { CreativeContext, CreativeResult } from '@/lib/canvas-v2/creative/types';

/** Test adapter for the same deterministic crop script used by the hosted tool.
 * No model-authored command, URL, external request or arbitrary local input.
 * The normal browser executor still validates the inspection receipt first.
 */
export async function prepareSubagentAsset(args: JsonObject, context: CreativeContext, signal: AbortSignal, python = process.env.NORTHSTAR_SUBAGENT_PYTHON): Promise<CreativeResult> {
  if (!python || !python.startsWith('/')) throw new Error('Configure NORTHSTAR_SUBAGENT_PYTHON with an absolute Python executable that has Pillow.');
  signal.throwIfAborted();
  const job = preparedAssetJob(args, randomUUID());
  const input = context.inputs.find(value => value.reference === args.assetId);
  const match = input && /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(input.dataUrl);
  if (!input || !match || match[1].length > 8_000_000) throw new Error('Crop input must be retained PNG, JPEG or WebP bytes within 6 MB.');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 6_000_000) throw new Error('Crop input must be retained image bytes within 6 MB.');
  const root = await mkdtemp(join(tmpdir(), 'northstar-subagent-crop-'));
  try {
    for (const file of job.operation.files) {
      const path = join(root, file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, file.text, { mode: 0o600 });
    }
    await writeFile(join(root, job.operation.inputs[0].path), bytes, { mode: 0o600 });
    const script = job.operation.files.find(file => file.path.endsWith('/prepare.py'))!;
    const { stdout, stderr } = await promisify(execFile)(python, [script.path], { cwd: root, signal, timeout: job.operation.timeoutMs, maxBuffer: 256_000 });
    signal.throwIfAborted();
    const output = job.operation.exports[0];
    const pixels = await readFile(join(root, output.path));
    if (!pixels.length || pixels.length > 8_000_000) throw new Error('Prepared crop exceeds the transfer limit.');
    const prepared = creativeArtifact(pixels, output.path, output.label, 'computed', [input.id]);
    if (!prepared.asset || prepared.asset.mimeType !== 'image/png') throw new Error('Preparation did not return a verified PNG.');
    return {
      summary: job.operation.summary,
      artifacts: [prepared.artifact],
      assets: [{ ...prepared.asset, tags: [...(prepared.asset.tags ?? []), `asset-role:${job.role}`], description: 'Cropped from retained reference pixels. Inspect the crop before binding it to the product screen.' }],
      execution: { commands: [job.operation.command], stdout, stderr, exitCode: 0, timedOut: false, workspace: 'local-subagent-crop' },
    };
  } finally { await rm(root, { recursive: true, force: true }); }
}
