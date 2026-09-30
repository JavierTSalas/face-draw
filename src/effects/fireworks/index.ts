import { defineEffect } from '../../core/effect';
import { TAU, pick, rand } from '../../lib/math';

// Night-sky camera grade + light from the explosions on your face.
const shader = /* glsl */ `
uniform vec3 u_flash;     // colour * intensity of the latest burst
uniform vec2 u_flashPos;  // CSS px

vec4 mainImage(vec2 uv) {
  vec3 c = camera(uv);
  // Night grade: darker, bluer, more contrast.
  c = pow(c, vec3(1.25)) * vec3(0.62, 0.66, 0.85);
  vec2 px = toPx(uv);
  float d = length(px - u_flashPos) / u_resolution.y;
  float light = 0.35 + 0.65 * exp(-d * d * 6.0);
  c += u_flash * light * (0.25 + c * 1.6);
  // Soft vignette.
  vec2 v = uv - 0.5;
  c *= 1.0 - dot(v, v) * 0.9;
  return vec4(c, 1.0);
}
`;

type BurstKind = 'peony' | 'ring' | 'heart' | 'willow' | 'crossette' | 'palm';

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  kind: BurstKind;
  alive: boolean;
  /** Small secondary rocket from a crossette burst. */
  mini?: boolean;
}

const PALETTE = [0xff3355, 0xffcc33, 0x33ddff, 0x66ff66, 0xff66ff, 0xffffff, 0xff8833, 0x9966ff];

export default defineEffect({
  id: 'fireworks',
  name: 'Fireworks',
  icon: '🎆',
  order: 10,
  description: 'A fireworks show around your head. Open your mouth to launch a volley.',
  hint: 'Open your mouth to launch fireworks 🎆  Tap to aim',
  shader,
  create(ctx) {
    const sparks = ctx.particles({ max: 4000, shape: 'spark', gravity: 160, drag: 1.1, stretch: 0.035, fadePower: 1.6 });
    const trails = ctx.particles({ max: 1500, shape: 'glow', gravity: 30, drag: 2, fadePower: 1.2, endScale: 0.3 });
    const glitter = ctx.particles({ max: 1200, shape: 'star', gravity: 60, drag: 1.5, fadePower: 0.8 });
    const rockets: Rocket[] = [];
    let nextAuto = 0.3;
    let flashX = 0;
    let flashY = 0;
    const flash = [0, 0, 0];
    const flashPos = [0, 0];

    const ROCKET_G = 420;

    function launch(x: number, y: number, tx: number, ty: number, kind?: BurstKind) {
      const h = Math.max(40, y - ty);
      const vy = -Math.sqrt(2 * ROCKET_G * h);
      const tFlight = -vy / ROCKET_G;
      rockets.push({
        x,
        y,
        vx: (tx - x) / tFlight,
        vy,
        color: pick(PALETTE),
        kind: kind ?? pick<BurstKind>(['peony', 'peony', 'ring', 'heart', 'willow', 'crossette', 'palm']),
        alive: true,
      });
      ctx.sfx.play('whoosh', 0.5);
    }

    function explode(r: Rocket) {
      const { x, y, color } = r;
      const c2 = pick(PALETTE);
      switch (r.kind) {
        case 'peony':
          sparks.burst(x, y, 140, 330, 1.4, 3, () => (Math.random() < 0.8 ? color : c2), 0.35);
          break;
        case 'ring': {
          const n = 90;
          const tilt = rand(0, TAU);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            const vx = Math.cos(a) * 300;
            const vy = Math.sin(a) * 120;
            const c = Math.cos(tilt);
            const s = Math.sin(tilt);
            sparks.emit(x, y, vx * c - vy * s, vx * s + vy * c, 1.3, 3, color);
          }
          sparks.burst(x, y, 30, 90, 1, 2.5, 0xffffff);
          break;
        }
        case 'heart': {
          const n = 110;
          for (let i = 0; i < n; i++) {
            const t = (i / n) * TAU;
            const hx = 16 * Math.sin(t) ** 3;
            const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
            sparks.emit(x, y, hx * 17, hy * 17, 1.5, 3.2, 0xff4d88);
          }
          break;
        }
        case 'willow':
          for (let i = 0; i < 120; i++) {
            const a = rand(0, TAU);
            const s = rand(80, 260);
            glitter.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(2, 3), rand(2.5, 4), 0xffcc55);
          }
          break;
        case 'palm':
          for (let arm = 0; arm < 8; arm++) {
            const a = (arm / 8) * TAU + rand(-0.1, 0.1);
            for (let k = 0; k < 14; k++) {
              const s = 150 + k * 16;
              sparks.emit(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, 1.6, 3.5, k % 3 ? color : 0xffffff);
            }
          }
          break;
        case 'crossette':
          sparks.burst(x, y, 60, 260, 0.9, 3, color, 0.2);
          // Secondary pops handled by delayed mini-rockets.
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU + rand(0, 1);
            rockets.push({
              x,
              y,
              vx: Math.cos(a) * 200,
              vy: Math.sin(a) * 200 - 150,
              color: c2,
              kind: 'peony',
              alive: true,
              mini: true,
            });
          }
          break;
      }
      glitter.burst(x, y, 25, 200, 1.6, 2.5, 0xffffff, 0.8);
      flashX = x;
      flashY = y;
      flash[0] = (((color >> 16) & 255) / 255) * 0.9;
      flash[1] = (((color >> 8) & 255) / 255) * 0.9;
      flash[2] = ((color & 255) / 255) * 0.9;
      ctx.sfx.play('boom', 0.6);
    }

    return {
      update(f) {
        const { dt, width: W, height: H, face, events } = f;
        // Automatic show.
        nextAuto -= dt;
        if (nextAuto <= 0) {
          nextAuto = rand(0.5, 1.2);
          const tx = face ? face.cx + rand(-1, 1) * Math.max(face.width * 1.4, W * 0.3) : rand(0.2, 0.8) * W;
          const ty = face ? Math.max(H * 0.08, face.cy - face.height * rand(0.6, 1.3)) : rand(0.1, 0.4) * H;
          launch(rand(0.1, 0.9) * W, H + 10, tx, ty);
        }
        // Mouth volley.
        if (events.mouthOpened && face) {
          for (let k = -1; k <= 1; k++) {
            launch(face.mouthX, face.mouthY, face.mouthX + k * W * 0.3, H * rand(0.08, 0.22));
          }
        }
        // Smile sparkles along the top of the head.
        if (face && face.smile > 0.5) {
          for (let k = 0; k < 3; k++) {
            const a = rand(-1.2, 1.2) + face.roll - Math.PI / 2;
            const rx = face.width * 0.62;
            const ry = face.height * 0.62;
            glitter.emit(
              face.cx + Math.cos(a) * rx,
              face.cy + Math.sin(a) * ry,
              rand(-20, 20),
              rand(-60, -10),
              rand(0.5, 1),
              rand(2, 4),
              pick([0xffe066, 0xffffff, 0xff99cc]),
            );
          }
        }
        // Rockets.
        for (const r of rockets) {
          const mini = r.mini;
          r.vy += (mini ? 300 : ROCKET_G) * dt;
          r.x += r.vx * dt;
          r.y += r.vy * dt;
          trails.emit(r.x, r.y, rand(-15, 15), rand(10, 40), mini ? 0.25 : 0.45, mini ? 3 : 4.5, mini ? r.color : 0xffc070, 0.9);
          if (r.vy >= (mini ? 60 : 0)) {
            r.alive = false;
            if (mini) {
              sparks.burst(r.x, r.y, 26, 140, 0.8, 2.5, r.color, 0.4);
              flash[0] += 0.1;
            } else explode(r);
          }
        }
        for (let i = rockets.length - 1; i >= 0; i--) if (!rockets[i].alive) rockets.splice(i, 1);
        // Fade the light.
        const k = Math.exp(-dt * 3.5);
        flash[0] *= k;
        flash[1] *= k;
        flash[2] *= k;
        flashPos[0] = flashX;
        flashPos[1] = flashY;
      },
      uniforms: () => ({ u_flash: flash, u_flashPos: flashPos }),
      pointerDown(x, y, f) {
        launch(rand(0.3, 0.7) * f.width, f.height + 10, x, y);
        return true;
      },
    };
  },
});
