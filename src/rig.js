// The rider's skeleton, re-posed from the riding bind pose into the A-pose a
// jersey mockup is drawn in, and skinned on the CPU so the bake can use it.
//
// Rig axes (rider_m.rb1Dgf6L, checked 2026-10-14): +y up, +x forward (the
// hands reach the bars at x ~ 0.37), +z the rider's right. The torso is
// already upright in the bind pose (spine x ~ -0.04 from y 0.99 to 1.48), so
// only the arms move.
import { Bone, Matrix4, Quaternion, Vector3 } from '../vendor/three.module.js';

// Triangles whose UVs reach below the 32 px palette row (of 512) are jersey;
// every other triangle samples a palette cell. No triangle straddles the row.
export const PALETTE_ROW_V = 32 / 512;

export function createRig(glb) {
  const bones = glb.nodes.map((n) => {
    const b = new Bone();
    b.name = n.name;
    b.position.fromArray(n.translation);
    b.quaternion.fromArray(n.rotation);
    b.scale.fromArray(n.scale);
    return b;
  });
  glb.nodes.forEach((n, i) => n.children.forEach((c) => bones[i].add(bones[c])));
  const roots = bones.filter((b) => !b.parent);
  const byName = new Map(bones.map((b) => [b.name, b]));
  const rest = bones.map((b) => b.quaternion.clone());

  const joints = glb.skinJoints.map((i) => bones[i]);
  const inverseBind = joints.map((_, j) => new Matrix4().fromArray(glb.inverseBind, j * 16));

  const nVert = glb.position.length / 3;
  const index = glb.index || Uint32Array.from({ length: nVert }, (_, i) => i);
  const jerseyTris = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (Math.max(glb.uv[a * 2 + 1], glb.uv[b * 2 + 1], glb.uv[c * 2 + 1]) >= PALETTE_ROW_V)
      jerseyTris.push(a, b, c);
  }

  function update() {
    roots.forEach((r) => r.updateMatrixWorld(true));
  }

  function reset() {
    bones.forEach((b, i) => b.quaternion.copy(rest[i]));
    update();
  }

  const _q = new Quaternion(), _w = new Quaternion(), _p = new Quaternion();
  const _a = new Vector3(), _b = new Vector3();

  // Turn `bone` in world space so that the direction from it to `tip` becomes
  // `target`, then spin it `twist` radians about that direction.
  function aim(bone, tip, target, twist) {
    _a.setFromMatrixPosition(tip.matrixWorld).sub(_b.setFromMatrixPosition(bone.matrixWorld)).normalize();
    _q.setFromUnitVectors(_a, target);
    if (twist) _q.premultiply(new Quaternion().setFromAxisAngle(target, twist));
    bone.getWorldQuaternion(_w);
    bone.parent.getWorldQuaternion(_p);
    bone.quaternion.copy(_p.invert().multiply(_q.multiply(_w)));
    update();
  }

  // armDeg: upper arm angle from straight down, out to the side.
  // twistDeg: roll of the whole arm about its own axis, mirrored per side.
  function pose({ armDeg = 40, twistDeg = 0 } = {}) {
    reset();
    const a = (armDeg * Math.PI) / 180;
    for (const [side, s] of [['l', -1], ['r', 1]]) {
      const target = new Vector3(0, -Math.cos(a), s * Math.sin(a)).normalize();
      const tw = (s * twistDeg * Math.PI) / 180;
      aim(byName.get(`upperArm.${side}`), byName.get(`forearm.${side}`), target, tw);
      aim(byName.get(`forearm.${side}`), byName.get(`hand.${side}`), target, 0);
    }
  }

  // Linear blend skinning of every vertex: positions and normals in world space.
  function skin() {
    const mats = joints.map((b, j) => new Matrix4().multiplyMatrices(b.matrixWorld, inverseBind[j]).elements);
    const position = new Float32Array(nVert * 3);
    const normal = new Float32Array(nVert * 3);
    const m = new Float64Array(16);
    const { position: P, normal: N, joints: J, weights: W } = glb;
    for (let v = 0; v < nVert; v++) {
      m.fill(0);
      for (let k = 0; k < 4; k++) {
        const w = W[v * 4 + k];
        if (!w) continue;
        const e = mats[J[v * 4 + k]];
        for (let i = 0; i < 16; i++) m[i] += w * e[i];
      }
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      position[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
      position[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      position[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      // Rotations and near-uniform scale only, so the 3x3 part serves for normals.
      const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
      let ox = m[0] * nx + m[4] * ny + m[8] * nz;
      let oy = m[1] * nx + m[5] * ny + m[9] * nz;
      let oz = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(ox, oy, oz) || 1;
      normal[v * 3] = ox / l; normal[v * 3 + 1] = oy / l; normal[v * 3 + 2] = oz / l;
    }
    return { position, normal };
  }

  update();
  return { glb, bones: byName, index, jerseyTris: Uint32Array.from(jerseyTris), reset, pose, skin };
}
