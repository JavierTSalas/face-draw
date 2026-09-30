import { defineEffect } from '../../core/effect';
import { clamp, rand } from '../../lib/math';

const shader = /* glsl */ `
uniform float u_power;
vec4 mainImage(vec2 uv) {
  vec3 c = camera(uv);
  vec2 px = toPx(uv);
  float d = min(length(px - u_eyeL), length(px - u_eyeR)) / max(u_faceSize.x, 1.0);
  // Red light spill around the eyes and a slight dark, hot grade.
  c = c * vec3(0.8, 0.72, 0.72) + vec3(1.0, 0.1, 0.05) * exp(-d * d * 10.0) * u_power * 0.9;
  return vec4(c, 1.0);
}
`;

/** Point where a ray from (x,y) along (dx,dy) leaves the screen. */
function toEdge(x: number, y: number, dx: number, dy: number, W: number, H: number) {
  let t = Infinity;
  if (dx > 1e-4) t = Math.min(t, (W - x) / dx);
  if (dx < -1e-4) t = Math.min(t, -x / dx);
  if (dy > 1e-4) t = Math.min(t, (H - y) / dy);
  if (dy < -1e-4) t = Math.min(t, -y / dy);
  return t === Infinity ? 0 : t;
}

export default defineEffect({
  id: 'laser-eyes',
  name: 'Laser Eyes',
  icon: '👀',
  order: 50,
  description: 'Turn your head to sweep laser beams across the screen. Open wide for the mega beam.',
  hint: 'Turn your head to aim 🔴  Open your mouth for MEGA',
  shader,
  create(ctx) {
    const sparks = ctx.particles({ max: 1500, shape: 'spark', gravity: 500, drag: 1, stretch: 0.03, fadePower: 1.2 });
    const glow = ctx.particles({ max: 300, shape: 'glow', fadePower: 1, endScale: 2 });
    let dirX = 0;
    let dirY = 0;
    let power = 0;
    let lastZap = 0;
    let mega = false;
    const beams: { x0: number; y0: number; x1: number; y1: number; reach: number }[] = [];
    const u = { u_power: 0 };

    return {
      update(f) {
        const { dt, face, width: W, height: H, t } = f;
        beams.length = 0;
        const on = face && !face.eyesClosed;
        power += ((on ? 1 : 0) - power) * Math.min(1, dt * 12);
        u.u_power = power;
        if (!face || !on) return;
        mega = face.mouthOpen > 0.35;
        // Head direction in face space, rotated to screen space.
        const c = Math.cos(face.roll);
        const s = Math.sin(face.roll);
        const tx = face.yaw * 1.6 * c - face.pitch * 1.3 * s;
        const ty = face.yaw * 1.6 * s + face.pitch * 1.3 * c;
        const k = Math.min(1, dt * 14);
        dirX += (tx - dirX) * k;
        dirY += (ty - dirY) * k;
        const mag = Math.hypot(dirX, dirY);
        // Looking straight at the camera: beams come at you (short + flare).
        const reach = clamp((mag - 0.08) / 0.5);
        const nx = mag > 1e-3 ? dirX / mag : 0;
        const ny = mag > 1e-3 ? dirY / mag : 1;
        for (const [ex, ey] of [
          [face.eyeLX, face.eyeLY],
          [face.eyeRX, face.eyeRY],
        ]) {
          const full = toEdge(ex, ey, nx, ny, W, H);
          const len = full * reach;
          const x1 = ex + nx * len;
          const y1 = ey + ny * len;
          beams.push({ x0: ex, y0: ey, x1, y1, reach });
          if (reach > 0.95) {
            // Beam hits the screen edge: sparks fly back.
            const n = mega ? 10 : 4;
            for (let i = 0; i < n; i++) {
              sparks.emit(x1, y1, -nx * rand(100, 400) + rand(-200, 200), -ny * rand(100, 400) + rand(-250, 50), rand(0.3, 0.7), rand(2, 3.5), Math.random() < 0.5 ? 0xffee88 : 0xff5522);
            }
            if (Math.random() < dt * 20) glow.emit(x1, y1, 0, 0, 0.3, rand(20, 40) * (mega ? 2 : 1), 0xff4411, 0.5);
          }
        }
        if (mega && t - lastZap > 0.25) {
          lastZap = t;
          ctx.sfx.play('zap', 0.6);
        }
      },
      uniforms: () => u,
      draw(g, f) {
        const face = f.face;
        if (!face || power < 0.02) return;
        const scale = face.eyeDist / 60;
        const flick = 0.85 + Math.random() * 0.3;
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        for (const b of beams) {
          const layers: [number, string][] = [
            [26 * scale * (mega ? 2.2 : 1) * flick, 'rgba(255,20,10,0.25)'],
            [12 * scale * (mega ? 2 : 1) * flick, 'rgba(255,60,30,0.6)'],
            [4 * scale * (mega ? 1.8 : 1), 'rgba(255,240,220,0.95)'],
          ];
          for (const [w, col] of layers) {
            g.strokeStyle = col;
            g.lineWidth = w;
            g.beginPath();
            g.moveTo(b.x0, b.y0);
            g.lineTo(b.x1, b.y1);
            g.stroke();
          }
          // Eye flare, bigger when the beam points at the viewer.
          const r = face.eyeDist * (0.35 + (1 - b.reach) * 0.5) * flick * (mega ? 1.5 : 1);
          const grad = g.createRadialGradient(b.x0, b.y0, 0, b.x0, b.y0, r);
          grad.addColorStop(0, 'rgba(255,255,255,1)');
          grad.addColorStop(0.2, 'rgba(255,120,90,0.9)');
          grad.addColorStop(1, 'rgba(255,0,0,0)');
          g.fillStyle = grad;
          g.globalAlpha = power;
          g.beginPath();
          g.arc(b.x0, b.y0, r, 0, Math.PI * 2);
          g.fill();
          // Horizontal lens streak.
          g.fillStyle = 'rgba(255,90,70,0.35)';
          g.fillRect(b.x0 - r * 2.5, b.y0 - r * 0.06, r * 5, r * 0.12);
          g.globalAlpha = 1;
        }
        g.globalCompositeOperation = 'source-over';
      },
    };
  },
});
