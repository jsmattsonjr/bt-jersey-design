// Position of every sleeve texel in the pose from pose.mjs, in its upper-arm bone frame.
import { readFileSync } from 'node:fs';
import { posed } from './pose.mjs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { parseGLB } = await import(R + 'src/glb.js');
const { loadRig } = await import(R + 'src/pipeline.js');
const { rasterTriangle } = await import(R + 'src/view.js');
const { Matrix4, Vector3 } = await import(R + 'vendor/three.module.js');

export function sleeveMap(S = 512, ss = 1) {
  const buf = readFileSync(R + 'assets/rider_m.glb');
  const glb = parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const rig = loadRig(glb);
  posed(rig);
  const { position: P, normal: N } = rig.skin();
  const UV = glb.uv, T = rig.jerseyTris, N2 = S * ss;
  // side per texel: 0 none, 1 = left island (x<0.31), 2 = right
  const inv = {}, origin = {};
  for (const s of ['l', 'r']) {
    const b = rig.bones.get(`upperArm.${s}`);
    inv[s] = new Matrix4().copy(b.matrixWorld).invert();
  }
  const out = { S: N2, side: new Uint8Array(N2 * N2), loc: new Float32Array(N2 * N2 * 3), wpos: new Float32Array(N2*N2*3), nrm: new Float32Array(N2*N2*3), tri: new Int32Array(N2*N2).fill(-1) };
  const v = new Vector3();
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const vmax = Math.max(UV[a*2+1], UV[b*2+1], UV[c*2+1]);
    if (vmax > 0.45) continue; // sleeves are the top band
    const umid = (UV[a*2]+UV[b*2]+UV[c*2])/3;
    const side = umid < 0.31 ? 'l' : 'r';
    rasterTriangle(UV[a*2]*N2, UV[a*2+1]*N2, UV[b*2]*N2, UV[b*2+1]*N2, UV[c*2]*N2, UV[c*2+1]*N2, N2, N2, (x, y, b0, b1, b2) => {
      const k = y * N2 + x;
      const w = [0,1,2].map(i => b0*P[a*3+i]+b1*P[b*3+i]+b2*P[c*3+i]);
      const n = [0,1,2].map(i => b0*N[a*3+i]+b1*N[b*3+i]+b2*N[c*3+i]);
      v.set(...w).applyMatrix4(inv[side]);
      out.side[k] = side === 'l' ? 1 : 2; out.tri[k] = t/3;
      out.loc.set([v.x, v.y, v.z], k*3); out.wpos.set(w, k*3); out.nrm.set(n, k*3);
    });
  }
  return { ...out, rig, glb, P, N };
}
