const text = { type: "string" };
const exportsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: { path: text, label: text },
    required: ["path", "label"],
    additionalProperties: false,
  },
};
const inputsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: { assetId: text, path: text },
    required: ["assetId", "path"],
    additionalProperties: false,
  },
};
export const NORTHSTAR_CREATIVE_TOOLS = [
  {
    type: 'function', name: 'prepare_asset',
    description: 'Extract an authentic logo, photo, avatar or illustration from a retained image without redrawing it. Inspect the source first, then choose its visible rectangle with normalized coordinates (0–1 relative to the full image). The exact reference pixels are cropped in the isolated execution workspace, retained with source lineage, and returned as reusable image handles. mask=none preserves a rectangular crop and existing transparency; circle clips the crop to an ellipse with transparent corners. maxEdge only downsizes; it never enlarges low-resolution pixels. Inspect the result, then bind its handle in canvas_screen or canvas_edit. Reuse prepared assets across product variations. For complex processing use workspace_run; for new imagery use generate_image. No public URL, arbitrary filesystem access or generated reconstruction of an existing mark.',
    parameters: { type: 'object', properties: {
      assetId: text, label: text,
      role: { type: 'string', enum: ['brand-mark', 'photo', 'avatar', 'illustration', 'other'] },
      crop: { type: 'object', properties: {
        x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 },
        width: { type: 'number', exclusiveMinimum: 0, maximum: 1 }, height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
      }, required: ['x', 'y', 'width', 'height'], additionalProperties: false },
      mask: { type: 'string', enum: ['none', 'circle'] }, maxEdge: { type: 'integer', minimum: 64, maximum: 2048 },
    }, required: ['assetId', 'label', 'crop'], additionalProperties: false },
  },
  {
    type: "function",
    name: "workspace_run",
    description: `Execute your shell command in this conversation's isolated Linux workspace with Python and Node. Use it for calculations, data analysis, graph/layout geometry, file creation, media processing and checking assumptions. cwd is /mnt/data/northstar. Files and variables in files persist while the workspace is alive. The latest canvas source and all current measured nodes are provided as canvas.json. Check measurementRevisionId matches revisionId before trusting geometry; absent measurements require canvas_review first. inputs copies retained image/artifact bytes to the requested relative paths. files writes text/CSV/scripts at relative paths before execution. exports retains output files for download, follow-up work and native canvas placement (raster images only). No network or server secrets; retrieve public media with research tools first. No interactive terminal. Return actual computed values and repair execution errors. A failed command does not imply rollback of workspace files. A workspace restart is reported; durable exported assets can be re-imported. Do not flatten editable text, cards or connectors into a generated image: calculate geometry then use canvas_edit. Code checks supplement actual canvas_review pixels; they do not establish that the public canvas was changed.`,
    parameters: {
      type: "object",
      properties: {
        command: text,
        summary: text,
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
        inputs: inputsSchema,
        files: {
          type: "array",
          items: {
            type: "object",
            properties: { path: text, text },
            required: ["path", "text"],
            additionalProperties: false,
          },
        },
        exports: exportsSchema,
      },
      required: ["command", "summary"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "workspace_export",
    description:
      "Retain existing files from this conversation’s execution workspace. Exports become downloadable artifacts; raster images also become retained canvas assets. Use to retrieve additional files without rerunning code. Paths are relative to /mnt/data/northstar.",
    parameters: {
      type: "object",
      properties: { exports: exportsSchema },
      required: ["exports"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "generate_image",
    description: `Create one original image, or edit retained images by supplying inputAssetIds. Returns a retained generated asset and downloadable file. Use confidently for product-specific logos and brand concepts, polished hero imagery, illustrations, textures, credible mock content, concept visuals and visual explanations; inspect_asset afterwards to inspect the actual pixels before composing. For existing brands, reuse their retained authentic marks and reference assets when fidelity requires them. Create original assets for new product concepts and realistic mock experiences as needed; synthetic design assets must not be presented as verified documentary evidence or actual captured screenshots. Keep text, charts, cards, connectors and overall composition structure native and editable. Preserve original assets; editing creates a new derived asset. To replace an earlier generated image, keep its stable image node id and bind the new asset id and URL. Retained derivation lineage permits that replacement without a visible duplicate of the old image. Include context, visual direction and intended use in prompt. No artificial total image count: call again when additional assets earn their place.`,
    parameters: {
      type: "object",
      properties: {
        prompt: text,
        label: text,
        inputAssetIds: { type: "array", items: text },
        size: {
          type: "string",
          enum: ["1024x1024", "1536x1024", "1024x1536", "auto"],
        },
        quality: { type: "string", enum: ["low", "medium", "high", "auto"] },
        background: { type: "string", enum: ["opaque", "transparent", "auto"] },
      },
      required: ["prompt", "label"],
      additionalProperties: false,
    },
  },
];
