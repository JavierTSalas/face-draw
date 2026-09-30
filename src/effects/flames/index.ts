import { defineEffect } from '../../core/effect';
import { rand } from '../../lib/math';

// Procedural fire that rises from the edges of your silhouette.
const shader = /* glsl */ `
uniform float u_heat;   // 0..1 ramps up when the effect starts
uniform float u_breath; // 0..1 fire-breath glow around the mouth

vec3 fireRamp(float x) {
  x = clamp(x, 0.0, 1.0);
  return vec3(smoothstep(0.0, 0.4, x), smoothstep(0.25, 0.75, x) * 0.85, smoothstep(0.65, 1.0, x) * 0.7);
}

vec4 mainImage(vec2 uv) {
  vec3 cam = camera(uv);
  vec2 px = toPx(uv);
  vec2 q = px / u_resolution.y;          // aspect-correct, 1 unit = screen height
  float t = u_time;
  float m = personMask(uv);

  // Tongues: noise stretched vertically and scrolling upward.
  float n1 = fbm(vec2(q.x * 9.0, q.y * 3.2 + t * 2.4));
  float n2 = fbm(vec2(q.x * 17.0 + 4.0, q.y * 6.0 + t * 4.1));
  float turb = n1 * 0.7 + n2 * 0.3;

  // Look below this pixel for the person: flames sit above their outline.
  float reach = 0.11;
  float acc = 0.0;
  for (int i = 1; i <= 5; i++) {
    float k = float(i) / 5.0;
    vec2 off = vec2((turb - 0.5) * 0.08 * k, reach * k);
    acc += personMask(uv + off) * (1.15 - k);
  }
  acc /= 2.6;

  float heat = acc * (1.0 - m * 0.85) * u_heat;
  float fire = heat * (turb * 1.9) - 0.25 * (1.0 - heat);
  fire = clamp(fire, 0.0, 1.0);

  // Scene: darker background, warm rim light on the person.
  vec3 col = cam * mix(0.45, 1.0, m);
  col += cam * vec3(0.9, 0.35, 0.05) * acc * 0.8 * u_heat;
  col += fireRamp(fire) * 1.35;

  // Fire-breath glow from the mouth.
  float md = length(px - u_mouth) / max(u_faceSize.y, 1.0);
  col += vec3(1.0, 0.5, 0.1) * u_breath * exp(-md * md * 3.0) * 0.8;

  // Heat shimmer vignette at the bottom.
  col += vec3(0.5, 0.12, 0.0) * smoothstep(0.7, 1.0, uv.y) * (0.4 + 0.6 * n2) * u_heat;
  return vec4(col, 1.0);
}
`;

export default defineEffect({
  id: 'flames',
  name: 'On Fire',
  icon: '🔥',
  order: 20,
  description: 'Flames rise off your silhouette. Open your mouth to breathe fire.',
  hint: 'Open your mouth to breathe fire 🐉',
  needs: { segmentation: true },
  shader,
  create(ctx) {
    const embers = ctx.particles({
      max: 900,
      shape: 'glow',
      gravity: -140,
      drag: 0.6,
      turbulence: 500,
      endColor: 0xaa1100,
      fadePower: 1.3,
      endScale: 0.4,
    });
    const breath = ctx.particles({
      max: 1200,
      shape: 'glow',
      gravity: -260,
      drag: 1.4,
      endColor: 0x991100,
      endScale: 3.2,
      fadePower: 1.4,
      turbulence: 300,
    });
    let heat = 0;
    let breathGlow = 0;
    const u = { u_heat: 0, u_breath: 0 };

    return {
      update(f) {
        const { dt, face, width: W, height: H } = f;
        heat = Math.min(1, heat + dt * 0.8);
        // Embers drifting up from around the head (or the bottom of the screen).
        const rate = 40 * dt;
        for (let k = 0; k < rate + Math.random(); k++) {
          let x: number;
          let y: number;
          if (face && Math.random() < 0.75) {
            const a = rand(-Math.PI, 0) + face.roll;
            x = face.cx + Math.cos(a) * face.width * 0.6;
            y = face.cy + Math.sin(a) * face.height * 0.62;
          } else {
            x = rand(0, W);
            y = H + 10;
          }
          embers.emit(x, y, rand(-30, 30), rand(-120, -40), rand(1, 2.2), rand(2, 4.5), 0xffd060);
        }
        // Fire breath.
        const open = face ? Math.max(0, (face.mouthOpen - 0.2) / 0.5) : 0;
        breathGlow += (Math.min(1, open) - breathGlow) * Math.min(1, dt * 10);
        if (face && open > 0) {
          const n = Math.ceil(open * 260 * dt);
          // Aim where the head points (yaw/pitch), mostly downward-forward.
          const dirX = face.yaw * 0.9;
          const dirY = 0.55 + face.pitch * 0.4;
          const c = Math.cos(face.roll);
          const s = Math.sin(face.roll);
          const dx = dirX * c - dirY * s;
          const dy = dirX * s + dirY * c;
          const speed = 520 * Math.min(1.3, open);
          for (let k = 0; k < n; k++) {
            breath.emit(
              face.mouthX + rand(-6, 6),
              face.mouthY + rand(-4, 4),
              (dx + rand(-0.25, 0.25)) * speed,
              (dy + rand(-0.2, 0.2)) * speed,
              rand(0.5, 0.9),
              rand(face.eyeDist * 0.12, face.eyeDist * 0.22),
              Math.random() < 0.3 ? 0xffffaa : 0xffa030,
              0.8,
            );
          }
        }
        u.u_heat = heat;
        u.u_breath = breathGlow;
      },
      uniforms: () => u,
    };
  },
});
