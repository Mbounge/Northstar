import { object, string, type JsonObject } from '../managed-agent/protocol';
import { assetPixelRect, assetSourceSize } from '../asset-crop';

/** Exact source pixels, not a generative reconstruction of an existing brand. */
export function preparedAssetJob(args: JsonObject, jobId: string) {
  const assetId = string(args.assetId), label = string(args.label).trim();
  if (!assetId || !label || label.length > 160) throw new Error('Choose a retained asset and a label of at most 160 characters.');
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(jobId)) throw new Error('Invalid asset preparation identity.');
  if ((args.crop !== undefined) === (args.cropPixels !== undefined)) throw new Error('Choose cropPixels or normalized crop, never both.');
  const sourceSize = args.sourceSize === undefined ? undefined : assetSourceSize(args.sourceSize);
  const cropPixels = args.cropPixels === undefined ? undefined : assetPixelRect(args.cropPixels, assetSourceSize(args.sourceSize));
  const crop = object(args.crop);
  const values = ['x', 'y', 'width', 'height'].map(key => crop[key]);
  if (!cropPixels && values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Supply a normalized crop rectangle with numeric x, y, width and height.');
  const [x, y, width, height] = values as number[];
  if (!cropPixels && (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1)) throw new Error('The crop must lie inside the source image: coordinates run from 0 to 1.');
  const mask = args.mask ?? 'none', maxEdge = args.maxEdge ?? 1024;
  if (!['none', 'circle'].includes(string(mask))) throw new Error('Choose none or circle for the mask.');
  if (mask === 'circle' && cropPixels && cropPixels.width !== cropPixels.height) throw new Error('A circle mask requires a square source-pixel selection. Inspect and refine the bounds instead of stretching the portrait.');
  if (!Number.isInteger(maxEdge) || Number(maxEdge) < 64 || Number(maxEdge) > 2048) throw new Error('maxEdge must be an integer between 64 and 2048.');
  const role = args.role ?? 'other';
  if (!['brand-mark', 'photo', 'avatar', 'illustration', 'other'].includes(string(role))) throw new Error('Choose a supported asset role.');
  const directory = `assets/${jobId}`;
  const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'prepared-asset'}.png`;
  const output = `${directory}/${name}`;
  // Arguments are data in a file; user strings are never interpolated into shell/Python code.
  const configuration = { ...(cropPixels ? { cropPixels } : { crop: { x, y, width, height } }), sourceSize, mask, maxEdge, source: `${directory}/source`, output };
  const script = `import json, math, warnings
from PIL import Image, ImageDraw, ImageChops
Image.MAX_IMAGE_PIXELS = 32000000
warnings.simplefilter('error', Image.DecompressionBombWarning)
p = json.load(open('${directory}/config.json'))
with Image.open(p['source']) as source:
    source.load()
    w, h = source.size
    if p.get('sourceSize') and p['sourceSize'] != {'width':w, 'height':h}:
        raise ValueError('Original source dimensions changed; inspect the original again before cropping.')
    if p.get('cropPixels'):
        c = p['cropPixels']
        box = (c['x'], c['y'], c['x']+c['width'], c['y']+c['height'])
    else:
        c = p['crop']
        box = (math.floor(c['x']*w), math.floor(c['y']*h), math.ceil((c['x']+c['width'])*w), math.ceil((c['y']+c['height'])*h))
    if box[0] < 0 or box[1] < 0 or box[2] > w or box[3] > h:
        raise ValueError('Crop extends outside the original source; it was not clamped.')
    if p['mask'] == 'circle' and box[2]-box[0] != box[3]-box[1]:
        raise ValueError('A circle mask requires a square pixel selection; inspect/refine the original crop.')
    image = source.crop(box).convert('RGBA')
    if min(image.size) < 2: raise ValueError('The selected crop is smaller than two pixels.')
    if p['mask'] == 'circle':
        mask = Image.new('L', (image.width*4, image.height*4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, mask.width-1, mask.height-1), fill=255)
        mask = mask.resize(image.size, Image.Resampling.LANCZOS)
        image.putalpha(ImageChops.multiply(image.getchannel('A'), mask))
    image.thumbnail((p['maxEdge'], p['maxEdge']), Image.Resampling.LANCZOS)
    image.save(p['output'], 'PNG')
    print(json.dumps({'operation':'crop-retained-reference', 'sourceSize':[w,h], 'cropPixels':box, 'outputSize':list(image.size), 'mask':p['mask']}))
`;
  return {
    role: string(role),
    operation: {
      command: `python '${directory}/prepare.py'`, summary: `Prepared ${label} from retained reference pixels.`,
      timeoutMs: 30000, inputs: [{ assetId, path: configuration.source }],
      files: [{ path: `${directory}/config.json`, text: JSON.stringify(configuration) }, { path: `${directory}/prepare.py`, text: script }],
      exports: [{ path: output, label }],
    },
  };
}
