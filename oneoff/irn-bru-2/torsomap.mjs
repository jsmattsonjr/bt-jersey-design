// Bind-pose world position and normal of every torso texel (v below the sleeves).
import { readFileSync } from 'node:fs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { parseGLB } = await import(R + 'src/glb.js');
const { loadRig } = await import(R + 'src/pipeline.js');
const { rasterTriangle } = await import(R + 'src/view.js');
// pose(rig) poses it (default: bind pose); the posed rig comes back as .rig.
export function torsoMap(S = 512, ss = 1, pose = (rig) => rig.reset()) {
  const buf = readFileSync(R + 'assets/rider_m.glb');
  const glb = parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const rig = loadRig(glb); pose(rig);
  const { position: P, normal: N } = rig.skin();
  const UV = glb.uv, T = rig.jerseyTris, N2 = S * ss;
  const out = { S: N2, on: new Uint8Array(N2*N2), wpos: new Float32Array(N2*N2*3), nrm: new Float32Array(N2*N2*3) };
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t+1], c = T[t+2];
    if (Math.max(UV[a*2+1], UV[b*2+1], UV[c*2+1]) <= 0.45) continue;
    rasterTriangle(UV[a*2]*N2, UV[a*2+1]*N2, UV[b*2]*N2, UV[b*2+1]*N2, UV[c*2]*N2, UV[c*2+1]*N2, N2, N2, (x, y, b0, b1, b2) => {
      const k = y*N2 + x; out.on[k] = 1;
      for (let i = 0; i < 3; i++) { out.wpos[k*3+i] = b0*P[a*3+i]+b1*P[b*3+i]+b2*P[c*3+i]; out.nrm[k*3+i] = b0*N[a*3+i]+b1*N[b*3+i]+b2*N[c*3+i]; }
    });
  }
  return { ...out, rig };
}
