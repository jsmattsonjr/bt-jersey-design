// Minimal GLB reader: the rider files carry one skinned primitive, a node tree
// and a skin, with no materials or images, so this is all the core needs.
// Works on an ArrayBuffer in both the browser and node.

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function parseGLB(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const binLen = view.getUint32(20 + jsonLen, true);
  const bin = buffer.slice(binStart, binStart + binLen);

  // Copy each accessor out to a tightly packed typed array (strides honoured).
  function accessor(i) {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const Type = COMPONENT[a.componentType];
    const n = WIDTH[a.type];
    const size = Type.BYTES_PER_ELEMENT;
    const stride = bv.byteStride || size * n;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Type(a.count * n);
    const dv = new DataView(bin);
    const get = {
      5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o),
      5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true),
      5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
    }[a.componentType];
    for (let k = 0; k < a.count; k++)
      for (let c = 0; c < n; c++) out[k * n + c] = get(base + k * stride + c * size);
    if (a.normalized) {
      const max = { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[a.componentType];
      return Float32Array.from(out, (v) => v / max);
    }
    return out;
  }

  const meshNode = json.nodes.findIndex((n) => n.mesh !== undefined && n.skin !== undefined);
  if (meshNode < 0) throw new Error('no skinned mesh in GLB');
  const prim = json.meshes[json.nodes[meshNode].mesh].primitives[0];
  const at = prim.attributes;
  const skin = json.skins[json.nodes[meshNode].skin];

  return {
    nodes: json.nodes.map((n) => ({
      name: n.name,
      children: n.children || [],
      translation: n.translation || [0, 0, 0],
      rotation: n.rotation || [0, 0, 0, 1],
      scale: n.scale || [1, 1, 1],
    })),
    meshNode,
    position: accessor(at.POSITION),
    normal: accessor(at.NORMAL),
    uv: accessor(at.TEXCOORD_0),
    joints: accessor(at.JOINTS_0),
    weights: accessor(at.WEIGHTS_0),
    index: prim.indices !== undefined ? accessor(prim.indices) : null,
    skinJoints: skin.joints,
    inverseBind: accessor(skin.inverseBindMatrices),
  };
}
