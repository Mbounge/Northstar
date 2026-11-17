// Embedded GLB validation ported from UKIO/Sanctuary.
export const MODEL3D_LIMIT = 8 * 1024 * 1024;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const check = (test, message) => { if (!test) throw new Error(message); };
export function inspectModelGLB(bytes, scene) {
  check(bytes instanceof Uint8Array && bytes.byteLength >= 28 && bytes.byteLength <= MODEL3D_LIMIT,
    'Choose an embedded GLB no larger than 8 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = offset => view.getUint32(offset, true);
  check(u32(0) === 0x46546c67 && u32(4) === 2 && u32(8) === bytes.byteLength, 'This file is not a complete glTF 2 GLB.');
  const length = u32(12), binHeader = 20 + length;
  check(length <= 1024 * 1024 && length % 4 === 0 && binHeader + 8 <= bytes.byteLength &&
    u32(16) === 0x4e4f534a && u32(binHeader + 4) === 0x004e4942 &&
    binHeader + 8 + u32(binHeader) === bytes.byteLength && u32(binHeader) % 4 === 0,
    'The GLB needs one JSON chunk and one embedded geometry buffer.');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, binHeader))); }
  catch { throw new Error('The GLB has invalid JSON metadata.'); }
  const todo = [data];
  while (todo.length) {
    const value = todo.pop();
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        check(key !== 'uri' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype', 'The GLB cannot refer to external resources.');
        if (child && typeof child === 'object') todo.push(child);
      }
    }
  }
  check(data?.asset?.version === '2.0' && !data.extensionsUsed?.length && !data.extensionsRequired?.length &&
    !data.images?.length && !data.textures?.length && !data.skins?.length && !data.animations?.length &&
    Array.isArray(data.buffers) && data.buffers.length === 1 && Number.isInteger(data.buffers[0]?.byteLength) &&
    data.buffers[0].byteLength > 0 && data.buffers[0].byteLength <= u32(binHeader) &&
    u32(binHeader) - data.buffers[0].byteLength <= 3,
    'Export an uncompressed GLB with embedded geometry and ordinary materials. Textures, extensions and rigs are not supported in this viewer.');
  const { nodes, meshes, scenes, accessors, bufferViews } = data;
  check(Array.isArray(nodes) && nodes.length > 0 && nodes.length <= 1024 && Array.isArray(meshes) &&
    meshes.length > 0 && meshes.length <= 1024 && Array.isArray(scenes) && scenes.length <= 16 &&
    Array.isArray(accessors) && accessors.length <= 4096 && Array.isArray(bufferViews) && bufferViews.length <= 4096,
    'This GLB exceeds the viewer’s geometry budget or has no visible meshes.');
  const roots = scenes[data.scene ?? 0]?.nodes;
  check(Array.isArray(roots) && roots.length > 0, 'The GLB needs a default scene with visible objects.');
  const index = (value, items) => Number.isInteger(value) && value >= 0 && value < items.length;
  for (const item of bufferViews) {
    const offset = item?.byteOffset ?? 0;
    check(item?.buffer === 0 && Number.isInteger(offset) && offset >= 0 && Number.isInteger(item.byteLength) &&
      item.byteLength > 0 && offset + item.byteLength <= data.buffers[0].byteLength, 'A GLB geometry range is outside its embedded buffer.');
  }
  const componentBytes = new Map([[5120,1],[5121,1],[5122,2],[5123,2],[5125,4],[5126,4]]);
  const dimensions = new Map([['SCALAR',1],['VEC2',2],['VEC3',3],['VEC4',4]]);
  for (const item of accessors) {
    check(index(item?.bufferView, bufferViews) && !item.sparse && Number.isInteger(item.count) &&
      item.count > 0 && item.count <= 1_500_000, 'A GLB accessor is outside the supported geometry budget.');
    const size = componentBytes.get(item.componentType) * dimensions.get(item.type);
    const range = bufferViews[item.bufferView], offset = item.byteOffset ?? 0, stride = range.byteStride ?? size;
    check(size > 0 && Number.isInteger(offset) && offset >= 0 && Number.isInteger(stride) &&
      stride >= size && stride <= 252 && offset + stride * (item.count - 1) + size <= range.byteLength,
      'A GLB accessor exceeds its geometry range.');
  }
  const meshTriangles = meshes.map(mesh => {
    check(Array.isArray(mesh?.primitives) && mesh.primitives.length > 0 && mesh.primitives.length <= 16,
      'Each GLB mesh needs a bounded set of primitives.');
    let count = 0;
    for (const primitive of mesh.primitives) {
      const position = primitive?.attributes?.POSITION;
      check((primitive?.mode === undefined || primitive.mode === 4) && index(position, accessors) &&
        accessors[position].type === 'VEC3' && accessors[position].componentType === 5126 &&
        Object.values(primitive.attributes).every(value => index(value, accessors) && accessors[value].count === accessors[position].count) &&
        !primitive.targets && (primitive.indices === undefined || index(primitive.indices, accessors) &&
        accessors[primitive.indices].type === 'SCALAR' && [5121,5123,5125].includes(accessors[primitive.indices].componentType)),
        'Use triangle meshes with valid position and index data.');
      const vertices = accessors[primitive.indices ?? position].count;
      check(vertices % 3 === 0, 'A GLB triangle is missing a vertex.');
      count += vertices / 3;
    }
    return count;
  });
  const visited = new Set(), names = new Map();
  let triangles = 0;
  function visit(value, depth) {
    check(index(value, nodes) && depth <= 48 && !visited.has(value), 'The GLB scene contains an invalid or repeated node.');
    visited.add(value);
    const node = nodes[value];
    check(record(node) && (node.mesh === undefined || index(node.mesh, meshes)) &&
      (node.children === undefined || Array.isArray(node.children)), 'A GLB node has invalid geometry.');
    let visible = node.mesh !== undefined;
    if (visible) triangles += meshTriangles[node.mesh];
    for (const child of node.children || []) visible = visit(child, depth + 1) || visible;
    if (typeof node.name === 'string') {
      names.set(node.name, names.has(node.name) ? 2 : Number(visible));
    }
    return visible;
  }
  for (const root of roots) visit(root, 0);
  check(triangles > 0 && triangles <= 1_000_000, 'The model has no geometry or exceeds the triangle budget.');
  for (const part of scene?.parts || []) for (const name of part.nodes)
    check(names.get(name) === 1, 'Selectable GLB node is missing or ambiguous: ' + name);
  return data;
}
