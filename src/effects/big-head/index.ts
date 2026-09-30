import { defineEffect } from '../../core/effect';
import { Spring } from '../../lib/math';

// Up to three radial warps. Each is (centre.x, centre.y, radius, scale) in
// CSS px; scale > 1 magnifies, < 1 shrinks. Uses inverse mapping so there are
// no holes: for each output pixel we find where to sample the camera.
const shader = /* glsl */ `
uniform vec4 u_w0;
uniform vec4 u_w1;
uniform vec4 u_w2;

vec2 warp(vec2 px, vec4 w) {
  if (w.z <= 0.0) return px;
  vec2 d = px - w.xy;
  float r = length(d) / w.z;
  if (r >= 1.0) return px;
  float k = smoothstep(0.0, 1.0, r);
  return w.xy + d * mix(1.0 / w.w, 1.0, k);
}

vec4 mainImage(vec2 uv) {
  vec2 px = toPx(uv);
  px = warp(px, u_w0);
  px = warp(px, u_w1);
  px = warp(px, u_w2);
  return vec4(camera(toUV(px)), 1.0);
}
`;

type Mode = { name: string; hint: string };
const MODES: Mode[] = [
  { name: 'Bobble Head', hint: 'Shake your head! 🤪' },
  { name: 'Big Eyes', hint: 'Anime eyes 👀' },
  { name: 'Tiny Face', hint: 'Tiny face 🤏' },
  { name: 'Alien', hint: 'Greetings, earthling 👽' },
];

export default defineEffect({
  id: 'big-head',
  name: 'Face Warp',
  icon: '🤪',
  order: 60,
  description: 'Bobble head, big eyes, tiny face and alien warps. Tap to switch.',
  hint: 'Tap to switch warp 🤪',
  shader,
  create(ctx) {
    let mode = ctx.store.get('mode', 0) % MODES.length;
    const w0 = [0, 0, 0, 1];
    const w1 = [0, 0, 0, 1];
    const w2 = [0, 0, 0, 1];
    const wobble = new Spring(0, 90, 5);
    const lean = new Spring(0, 60, 6);
    let lastX = 0;
    let lastY = 0;
    const u = { u_w0: w0, u_w1: w1, u_w2: w2 };

    const set = (w: number[], x: number, y: number, r: number, s: number) => {
      w[0] = x;
      w[1] = y;
      w[2] = r;
      w[3] = s;
    };

    return {
      update(f) {
        const face = f.face;
        w0[2] = w1[2] = w2[2] = 0;
        if (!face) return;
        const vx = f.dt > 0 ? (face.cx - lastX) / f.dt : 0;
        const vy = f.dt > 0 ? (face.cy - lastY) / f.dt : 0;
        lastX = face.cx;
        lastY = face.cy;
        const speed = Math.min(3000, Math.hypot(vx, vy)) / face.height;
        const wob = wobble.update(0, f.dt);
        if (f.events.tracked) wobble.v += speed * 0.25 * (Math.random() < 0.5 ? -1 : 1);
        lean.update(0, f.dt);
        if (f.events.tracked) lean.v -= (vx / face.height) * 0.02;

        const h = face.height;
        switch (mode) {
          case 0: {
            // Bobble head: big, wobbly, slightly lagging.
            const s = 1.75 + wob * 0.6;
            const ox = lean.x * h;
            set(w0, face.cx + ox, face.cy - h * 0.08, h * 1.15, Math.max(1.1, s));
            break;
          }
          case 1: {
            const r = face.eyeDist * 0.55;
            set(w0, face.eyeLX, face.eyeLY, r, 1.9);
            set(w1, face.eyeRX, face.eyeRY, r, 1.9);
            set(w2, face.mouthX, face.mouthY, face.eyeDist * 0.5, 0.75);
            break;
          }
          case 2:
            set(w0, face.cx, face.cy, h * 0.9, 0.55);
            break;
          case 3: {
            const r = face.eyeDist * 0.6;
            set(w0, face.eyeLX, face.eyeLY, r, 2.2);
            set(w1, face.eyeRX, face.eyeRY, r, 2.2);
            // Shrink the lower face towards the mouth: narrow chin.
            set(w2, face.mouthX, face.mouthY + h * 0.08, h * 0.45, 0.6);
            break;
          }
        }
      },
      uniforms: () => u,
      pointerDown() {
        mode = (mode + 1) % MODES.length;
        ctx.store.set('mode', mode);
        ctx.toast(MODES[mode].name);
        ctx.sfx.play('pop');
        return true;
      },
    };
  },
});
