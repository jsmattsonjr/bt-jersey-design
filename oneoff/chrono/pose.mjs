// The pose the jersey is measured in. POSE=stopped (default) is the settings
// page's static preview: rider_m on the low-LOD skeleton, `mount` clip at
// t=0. seated/standing use the pedalling clips at T seconds; bind is the
// GLB's own pose.
import { readFileSync } from 'node:fs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { parseGLB } = await import(R + 'src/glb.js');
const CLIP = { stopped: 'mount', seated: 'pedal.seated', standing: 'pedal.standing' };
export const POSE = process.env.POSE || 'stopped';

export function posed(rig) {
  if (POSE === 'bind') return rig.reset();
  const b = readFileSync(R + 'assets/rider_low_lod.glb');
  const lod = parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  rig.applyClip(lod.animations[CLIP[POSE]], Number(process.env.T || 0));
}

// World position of a bone.
export const at = (rig, name) => { const e = rig.bones.get(name).matrixWorld.elements; return [e[12], e[13], e[14]]; };
