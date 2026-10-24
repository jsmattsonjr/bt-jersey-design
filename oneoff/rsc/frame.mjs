// The torso frame in the posed rig: O at spine.1, U up the torso axis
// (spine.1 to neck), F forward, L to the rider's left (-z).
import { at } from '../chrono/pose.mjs';
import { rig } from './paint.mjs';
import { sub, norm, cross, dot } from '../chrono/decal.mjs';
export const O = at(rig, 'spine.1'), NECK = at(rig, 'neck');
export const U = norm(sub(NECK, O));
export const F = norm(cross([0, 0, -1], U)), L = cross(U, F);
export const body = (p) => { const q = sub(p, O); return [dot(q, F), dot(q, U), dot(q, L)]; }; // [fwd, up, left]
export const bodyDir = (d) => [dot(d, F), dot(d, U), dot(d, L)];
