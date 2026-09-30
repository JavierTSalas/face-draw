import { defineEffect } from '../../core/effect';
import { rand } from '../../lib/math';

// Ice creeps up your body; frost, cracks and sparkles.
const shader = /* glsl */ `
uniform float u_freeze;  // 0..1 progress of the ice front
uniform float u_frost;   // 0..1 screen-edge frost

// Distance to the nearest Voronoi cell edge (for ice cracks).
float cracks(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash22(i + g);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}

vec4 mainImage(vec2 uv) {
  vec3 cam = camera(uv);
  vec2 q = toPx(uv) / u_resolution.y;
  float m = personMask(uv);

  // Ragged ice front rising from the bottom of the screen.
  float n = fbm(q * 7.0);
  float front = u_freeze * 1.35 - (1.0 - uv.y) + (n - 0.5) * 0.3;
  float frozen = smoothstep(0.0, 0.06, front) * m;

  // Ice look: cold, bright, glassy.
  float l = luma(cam);
  vec3 ice = mix(vec3(0.42, 0.68, 0.95) * (0.35 + l * 1.1), vec3(0.95, 0.99, 1.0), pow(l, 2.5) * 0.9);
  float frostTex = fbm(q * 55.0 + 3.0);
  ice += (frostTex - 0.45) * 0.28;
  float cr = cracks(q * 11.0 + n * 1.5);
  ice = mix(ice, vec3(1.0), (1.0 - smoothstep(0.0, 0.035, cr)) * 0.55);
  ice = mix(ice, vec3(0.2, 0.45, 0.8), (1.0 - smoothstep(0.035, 0.09, cr)) * 0.15);
  // Twinkles: a few cells host a small four-point star.
  vec2 cq = q * 45.0;
  vec2 cell = floor(cq);
  vec2 fc = fract(cq) - 0.5;
  float h = hash21(cell);
  float star = pow(max(0.0, 1.0 - length(fc) * 3.0), 3.0)
    + (1.0 - smoothstep(0.0, 0.05, abs(fc.x))) * (1.0 - smoothstep(0.0, 0.45, abs(fc.y))) * 0.6
    + (1.0 - smoothstep(0.0, 0.05, abs(fc.y))) * (1.0 - smoothstep(0.0, 0.45, abs(fc.x))) * 0.6;
  float tw = step(0.985, h) * pow(0.5 + 0.5 * sin(u_time * 5.0 + h * 80.0), 4.0);
  ice += tw * star * 1.6;

  // Glowing edge where the ice is advancing.
  float rim = smoothstep(0.0, 0.05, front) - smoothstep(0.05, 0.16, front);

  vec3 bg = cam * vec3(0.82, 0.92, 1.08) + vec3(0.0, 0.02, 0.05);
  vec3 col = mix(bg, ice, frozen);
  col += rim * m * vec3(0.55, 0.85, 1.0) * 0.9;

  // Frost growing in from the screen edges.
  vec2 d = abs(uv - 0.5) * 2.0;
  float e = max(d.x, d.y) + (fbm(q * 5.0) - 0.5) * 0.35;
  float vig = smoothstep(1.0 - 0.4 * u_frost, 1.05, e) * u_frost;
  col = mix(col, vec3(0.86, 0.94, 1.0) * (0.75 + 0.35 * frostTex), vig * 0.85);
  return vec4(col, 1.0);
}
`;

export default defineEffect({
  id: 'freeze',
  name: 'Freeze',
  icon: '🧊',
  order: 30,
  description: 'Ice creeps up your body. Breathe out cold air; tap to thaw and refreeze.',
  hint: 'Hold still… 🥶  Open your mouth for icy breath, tap to refreeze',
  needs: { segmentation: true },
  shader,
  create(ctx) {
    const snow = ctx.particles({ max: 450, shape: 'flake', blend: 'normal', gravity: 25, drag: 0.4, turbulence: 90, fadePower: 0.3 });
    const breath = ctx.particles({
      max: 700,
      shape: 'smoke',
      blend: 'normal',
      gravity: -40,
      drag: 1.8,
      endScale: 3,
      fadePower: 1.2,
      fadeIn: 0.1,
      turbulence: 60,
    });
    const shards = ctx.particles({ max: 400, shape: 'spark', gravity: 600, drag: 0.5, stretch: 0.02, fadePower: 1 });
    let progress = 0;
    let target = 1;
    const u = { u_freeze: 0, u_frost: 0 };

    return {
      update(f) {
        const { dt, face, width: W } = f;
        // Thaw quickly, freeze slowly.
        progress += (target > progress ? dt / 3 : -dt * 1.5);
        progress = Math.max(0, Math.min(1, progress));
        if (target === 0 && progress === 0) target = 1;
        u.u_freeze = progress;
        u.u_frost = Math.min(1, progress * 1.2);

        for (let k = 0; k < 30 * dt + Math.random() * 0.6; k++) {
          snow.emit(rand(-20, W + 20), -10, rand(-15, 15), rand(30, 70), rand(6, 11), rand(3, 7), 0xffffff, rand(0.6, 0.95), rand(0, 6), rand(-1, 1));
        }
        if (face && face.mouthOpen > 0.25) {
          const n = Math.ceil((face.mouthOpen - 0.2) * 120 * dt + 0.3);
          for (let k = 0; k < n; k++) {
            breath.emit(
              face.mouthX + rand(-5, 5),
              face.mouthY + rand(-3, 3),
              rand(-50, 50) + face.yaw * 120,
              rand(20, 90),
              rand(1.2, 2),
              face.eyeDist * rand(0.12, 0.2),
              0xdff4ff,
              0.35,
            );
          }
        }
      },
      uniforms: () => u,
      pointerDown(_x, _y, f) {
        // Shatter the ice and refreeze.
        if (progress > 0.3 && f.face) {
          const fc = f.face;
          for (let k = 0; k < 120; k++) {
            const a = rand(0, Math.PI * 2);
            const s = rand(150, 600);
            shards.emit(
              fc.cx + rand(-0.5, 0.5) * fc.width,
              fc.cy + rand(-0.5, 0.8) * fc.height,
              Math.cos(a) * s,
              Math.sin(a) * s - 200,
              rand(0.6, 1.2),
              rand(2, 4),
              Math.random() < 0.5 ? 0xffffff : 0x9fd8ff,
            );
          }
          ctx.sfx.play('crunch');
        }
        target = 0;
        return true;
      },
    };
  },
});
