import { defineEffect, type Frame } from '../../core/effect';
import { captureFace, drawSavedFace } from '../../lib/cutout';
import { rand } from '../../lib/math';

interface Ball {
  img: HTMLCanvasElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
}

interface Flyer {
  img: HTMLCanvasElement;
  t: number;
  x: number;
  y: number;
  size: number;
}

const MAX_BALLS = 28;
const TRAY_Y = 132;
const TRAY_SIZE = 44;

// Cut your face out, keep it, and play with it. Saved faces are shared with
// Face Swap, Head Orbit and Flappy Face.
export default defineEffect({
  id: 'face-grab',
  name: 'Face Grab',
  icon: '✂️',
  order: 5,
  description: 'Cut out your face and save it. Saved faces rain down, bounce off your head, and show up in other effects and games.',
  hint: 'Tap to cut out your face ✂️  Open your mouth to spit faces',
  create(ctx) {
    const balls: Ball[] = [];
    const flyers: Flyer[] = [];
    const confetti = ctx.particles({ max: 500, shape: 'dot', blend: 'normal', gravity: 700, drag: 0.8, fadePower: 0.5 });

    function spawnBall(img: HTMLCanvasElement, x: number, y: number, vx: number, vy: number, r: number) {
      if (balls.length >= MAX_BALLS) balls.shift();
      balls.push({ img, x, y, vx, vy, r, rot: rand(-0.3, 0.3), vr: rand(-3, 3) });
    }

    function grab(f: Frame) {
      const face = f.face;
      if (!face) {
        ctx.toast('No face found 🙈');
        return;
      }
      const img = captureFace(f, face);
      ctx.faces.add(img);
      flyers.push({ img, t: 0, x: face.cx, y: face.cy, size: face.height });
      for (let i = 0; i < 60; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(200, 600);
        confetti.emit(face.cx, face.cy, Math.cos(a) * s, Math.sin(a) * s - 250, rand(1, 1.8), rand(3, 5), [0xffd400, 0xff4d88, 0x33ddff, 0x66ff66][i % 4]);
      }
      ctx.sfx.play('chime');
      ctx.toast('Face saved! Try it in Flappy Face 🐦');
    }

    return {
      update(f) {
        const { dt, width: W, height: H, face } = f;
        const saved = ctx.faces.faces;
        if (f.events.mouthOpened && face && saved.length) {
          for (let k = 0; k < 3; k++) {
            const img = saved[(Math.random() * saved.length) | 0].image;
            spawnBall(img, face.mouthX, face.mouthY, rand(-250, 250), rand(-700, -400), face.eyeDist * rand(0.5, 0.8));
          }
          ctx.sfx.play('pop');
        }
        const floor = H - 150;
        for (const b of balls) {
          b.vy += 1400 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.rot += b.vr * dt;
          if (b.y + b.r > floor) {
            b.y = floor - b.r;
            b.vy *= -0.55;
            b.vx *= 0.9;
            b.vr *= 0.9;
          }
          if (b.x - b.r < 0) {
            b.x = b.r;
            b.vx = Math.abs(b.vx) * 0.8;
          } else if (b.x + b.r > W) {
            b.x = W - b.r;
            b.vx = -Math.abs(b.vx) * 0.8;
          }
          // Bounce off your head.
          if (face) {
            const hr = face.height * 0.52;
            const dx = b.x - face.cx;
            const dy = b.y - face.cy;
            const d = Math.hypot(dx, dy);
            const min = hr + b.r;
            if (d < min && d > 0) {
              const nx = dx / d;
              const ny = dy / d;
              b.x = face.cx + nx * min;
              b.y = face.cy + ny * min;
              const vn = b.vx * nx + b.vy * ny;
              if (vn < 0) {
                b.vx -= 1.7 * vn * nx;
                b.vy -= 1.7 * vn * ny;
                b.vr += vn * 0.01;
              }
            }
          }
        }
        // Ball-ball collisions.
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i];
            const b = balls[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const min = a.r + b.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const push = (min - d) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel < 0) {
              const imp = -rel * 0.9;
              a.vx -= imp * nx;
              a.vy -= imp * ny;
              b.vx += imp * nx;
              b.vy += imp * ny;
            }
          }
        }
        for (const fl of flyers) fl.t += dt / 0.7;
        for (let i = flyers.length - 1; i >= 0; i--) {
          if (flyers[i].t >= 1) {
            const fl = flyers[i];
            spawnBall(fl.img, rand(0.3, 0.7) * W, -40, rand(-100, 100), 0, Math.min(W, H) * rand(0.07, 0.1));
            flyers.splice(i, 1);
          }
        }
      },
      draw(g, f) {
        const face = f.face;
        const saved = ctx.faces.faces;
        // Guide around your face.
        if (face && flyers.length === 0) {
          g.save();
          g.setLineDash([8, 8]);
          g.lineDashOffset = -f.t * 30;
          g.lineWidth = 3;
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.beginPath();
          face.traceOval(g, 1.1);
          g.stroke();
          g.restore();
        }
        for (const b of balls) drawSavedFace(g, b.img, b.x, b.y, b.r * 1.9, b.rot);
        // Tray of saved faces.
        const trayY = TRAY_Y;
        saved.forEach((s, i) => {
          const x = f.width - 16 - TRAY_SIZE / 2 - i * (TRAY_SIZE + 6);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          g.arc(x, trayY, TRAY_SIZE / 2 + 3, 0, Math.PI * 2);
          g.fill();
          drawSavedFace(g, s.image, x, trayY, TRAY_SIZE * 0.9);
        });
        // Freshly cut faces fly to the tray.
        for (const fl of flyers) {
          const e = 1 - Math.pow(1 - fl.t, 3);
          const tx = f.width - 16 - TRAY_SIZE / 2;
          const x = fl.x + (tx - fl.x) * e;
          const y = fl.y + (trayY - fl.y) * e - Math.sin(e * Math.PI) * 80;
          const size = fl.size + (TRAY_SIZE * 0.9 - fl.size) * e;
          const pop = 1 + Math.sin(Math.min(1, fl.t * 3) * Math.PI) * 0.25;
          drawSavedFace(g, fl.img, x, y, size * pop, Math.sin(fl.t * 12) * 0.2 * (1 - e));
        }
      },
      pointerDown(_x, _y, f) {
        grab(f);
        return true;
      },
      shutter(f) {
        grab(f);
        return true;
      },
    };
  },
});
