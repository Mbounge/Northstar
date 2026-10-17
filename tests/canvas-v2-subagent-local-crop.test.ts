import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareSubagentAsset } from '../app/canvas-v2-e2e/codex-subagent/local-crop';
import { SubagentLocalCreativeRuntime, SUBAGENT_TEST_MODEL } from '../app/canvas-v2-e2e/codex-subagent/relay';

const python = process.env.NORTHSTAR_SUBAGENT_PYTHON;
test('subscription crop executes production pixel math locally, preserves alpha and verifies original dimensions', { skip: !python && 'Set NORTHSTAR_SUBAGENT_PYTHON to a Python with Pillow.' }, async () => {
  const run = promisify(execFile);
  const { stdout } = await run(python!, ['-c', "from PIL import Image\nimport io,base64\nim=Image.new('RGBA',(128,96))\nim.putdata([(x,y,(x+y)%256,128) for y in range(96) for x in range(128)])\nb=io.BytesIO();im.save(b,'PNG');print(base64.b64encode(b.getvalue()).decode())"]);
  const context = { inputs: [{ reference: 'source', id: 'retained-source', label: 'Source', dataUrl: 'data:image/png;base64,' + stdout.trim() }] };
  const args = { assetId: 'source', label: 'Portrait', cropInspectionId: 'validated-by-browser', sourceSize: { width: 128, height: 96 }, cropPixels: { x: 11, y: 17, width: 32, height: 32 }, role: 'avatar', mask: 'none', maxEdge: 64 };
  const signal = new AbortController().signal;
  const result = await prepareSubagentAsset(args, context, signal, python);
  const runtime = new SubagentLocalCreativeRuntime(() => { throw new Error('Cropping must not select or call a model'); }, python);
  try {
    assert.equal(runtime.start('local-crop', 'prepare_asset', args, context).status, 'running');
    const deadline = Date.now() + 5000;
    while (runtime.job('local-crop')?.status === 'running' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    const job = runtime.job('local-crop');
    assert.equal(job?.status, 'completed', JSON.stringify(job));
    if (job?.status !== 'completed') throw new Error('Local crop did not complete');
    assert.equal(job.result.execution?.workspace, 'local-subagent-crop');
    assert.equal(job.result.artifacts[0].dataUrl, result.artifacts[0].dataUrl);
    runtime.release('local-crop');
    assert.equal(runtime.job('local-crop'), undefined);
  } finally { runtime.dispose(); }
  const missingPython = new SubagentLocalCreativeRuntime(() => SUBAGENT_TEST_MODEL, '');
  try {
    missingPython.start('missing-python', 'prepare_asset', args, context);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(missingPython.job('missing-python')?.status, 'failed');
  } finally { missingPython.dispose(); }
  assert.equal(result.assets.length, 1);
  assert.equal(result.execution?.exitCode, 0);
  assert.deepEqual(result.artifacts[0].inputAssetIds, ['retained-source']);
  assert.equal(JSON.parse(result.execution!.stdout).operation, 'crop-retained-reference');
  const extracted = result.artifacts[0].dataUrl.split(',')[1];
  await run(python!, ['-c', "from PIL import Image\nimport io,base64,sys\nim=Image.open(io.BytesIO(base64.b64decode(sys.argv[1])))\nassert im.size==(32,32)\nassert list(im.getdata())==[(x,y,(x+y)%256,128) for y in range(17,49) for x in range(11,43)]", extracted]);
  const circle = await prepareSubagentAsset({ ...args, mask: 'circle' }, context, signal, python);
  await run(python!, ['-c', "from PIL import Image\nimport io,base64,sys\nim=Image.open(io.BytesIO(base64.b64decode(sys.argv[1])))\nassert im.size==(32,32) and im.getpixel((0,0))[3]==0\nassert im.getpixel((16,16))==(27,33,60,128)", circle.artifacts[0].dataUrl.split(',')[1]]);
  await assert.rejects(prepareSubagentAsset({ ...args, sourceSize: { width: 130, height: 96 } }, context, signal, python), /Original source dimensions changed/);
  await assert.rejects(prepareSubagentAsset({ ...args, cropPixels: { x: 11, y: 17, width: 32, height: 34 }, mask: 'circle' }, context, signal, python), /square/);
  await assert.rejects(prepareSubagentAsset(args, { inputs: [{ ...context.inputs[0], dataUrl: 'https://example.com/image.png' }] }, signal, python), /retained/);
  const stopped = new AbortController(); stopped.abort(new Error('Stopped'));
  await assert.rejects(prepareSubagentAsset(args, context, stopped.signal, python), /Stopped/);
});
