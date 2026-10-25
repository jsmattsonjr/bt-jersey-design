// The rider's skeleton, posed from a clip and skinned on the CPU, so a script
// can find the 3D position of every jersey texel.
//
// Rig axes (rider_m.rb1Dgf6L, checked 2026-10-14): +y up, +x forward (the
// hands reach the bars at x ~ 0.37), +z the rider's right. The torso is
// upright in the bind pose (spine x ~ -0.04 from y 0.99 to 1.48), but the bind
// pose is not what the site shows: its avatar preview poses rider_m with
// rider_low_lod.glb's clips (applyClip; stopped is `mount` at t=0, torso
// leaning 24 deg forward).
import { Bone, Matrix4, Quaternion, Vector3 } from '../vendor/three.module.js';

// Triangles whose UVs reach below the 32 px palette row (of 512) are jersey;
// every other triangle samples a palette cell. No triangle straddles the row.
export const PALETTE_ROW_V = 32 / 512;

export function loadRig(glb) {
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
  const restPos = bones.map((b) => b.position.clone()), restScale = bones.map((b) => b.scale.clone());

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
    bones.forEach((b, i) => { b.quaternion.copy(rest[i]); b.position.copy(restPos[i]); b.scale.copy(restScale[i]); });
    update();
  }

  // Pose the skeleton from a clip (glb.animations[name], from this file or
  // another with the same bone names) at time t, as three's AnimationMixer
  // does: clamped to the first/last key, linear between, slerp for rotations.
  // Bones the clip leaves alone keep their rest pose.
  function applyClip(channels, t = 0) {
    reset();
    for (const { node, path, times, values } of channels) {
      const b = byName.get(node); if (!b || path === 'weights') continue;
      const w = path === 'rotation' ? 4 : 3, n = times.length;
      let i = 0; while (i < n - 1 && times[i + 1] <= t) i++;
      const f = i >= n - 1 || t <= times[0] ? 0 : (t - times[i]) / (times[i + 1] - times[i]);
      const j = Math.min(i + 1, n - 1), a = values.subarray(i * w, i * w + w), c = values.subarray(j * w, j * w + w);
      if (path === 'rotation') b.quaternion.fromArray(a).slerp(new Quaternion().fromArray(c), t <= times[0] ? 0 : f);
      else b[path === 'translation' ? 'position' : 'scale'].fromArray(a).lerp(new Vector3().fromArray(c), t <= times[0] ? 0 : f);
    }
    update();
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
  return { glb, bones: byName, index, jerseyTris: Uint32Array.from(jerseyTris), reset, applyClip, skin };
}
