import { defineEffect } from '../../core/effect';

// Datamosh-style glitch that gets worse when you move or open your mouth.
const shader = /* glsl */ `
uniform float u_amt;

vec4 mainImage(vec2 uv) {
  vec2 px = toPx(uv);
  // Stronger on the face than on the background.
  float onFace = 1.0 - smoothstep(0.8, 1.3, faceDist(px));
  float amt = u_amt * (0.45 + 0.55 * onFace * u_hasFace);
  float t = floor(u_time * 14.0);

  // Horizontal slices that jump sideways.
  float rows = 18.0 + 40.0 * hash21(vec2(t, 3.0));
  float row = floor(uv.y * rows);
  float r = hash21(vec2(row, t));
  float shift = r > 1.0 - 0.35 * amt ? (hash21(vec2(row, t + 7.0)) - 0.5) * 0.25 * amt : 0.0;
  // Blocky macro-block errors.
  vec2 blk = floor(uv * vec2(10.0, 18.0));
  float b = hash21(blk + t);
  vec2 u2 = uv + vec2(shift, 0.0);
  if (b > 1.0 - 0.08 * amt) u2 = floor(u2 * 40.0) / 40.0;

  // RGB split.
  float ca = (0.003 + 0.03 * amt) * (0.6 + 0.4 * sin(u_time * 30.0));
  vec3 c = vec3(camera(u2 + vec2(ca, 0.0)).r, camera(u2).g, camera(u2 - vec2(ca, ca * 0.5)).b);

  // Colour-inverted glitch bands.
  if (hash21(vec2(floor(uv.y * 60.0), t + 3.0)) > 1.0 - 0.04 * amt) c = 1.0 - c.gbr;
  // Scanlines and noise.
  c *= 0.9 + 0.1 * sin(px.y * 2.5);
  c += (hash21(px + fract(u_time) * 100.0) - 0.5) * (0.06 + 0.12 * amt);
  return vec4(c, 1.0);
}
`;

export default defineEffect({
  id: 'glitch',
  name: 'Glitch',
  icon: '📺',
  order: 90,
  description: 'Digital glitch that intensifies when you move or open your mouth. Tap for a burst.',
  hint: 'Move fast or open your mouth to glitch out 📺',
  shader,
  create(ctx) {
    let burst = 0;
    let motion = 0;
    let lx = 0;
    let ly = 0;
    const u = { u_amt: 0.2 };
    return {
      update(f) {
        const face = f.face;
        if (face && f.events.tracked) {
          const d = Math.hypot(face.cx - lx, face.cy - ly) / Math.max(1, face.height);
          lx = face.cx;
          ly = face.cy;
          motion = Math.max(motion, Math.min(1, d * 6));
        }
        motion *= Math.exp(-f.dt * 4);
        burst *= Math.exp(-f.dt * 3);
        const mouth = face ? Math.max(0, face.mouthOpen - 0.15) * 1.4 : 0;
        u.u_amt = Math.min(1, 0.15 + mouth + motion + burst);
      },
      uniforms: () => u,
      pointerDown() {
        burst = 1;
        ctx.sfx.play('zap', 0.5);
        return true;
      },
    };
  },
});
