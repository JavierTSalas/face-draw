import { defineEffect, type Frame } from '../../core/effect';
import { bigText, drawButton, hit, Popups, type Button } from '../../lib/game';
import { pick, rand } from '../../lib/math';
import { drawEmoji } from '../../lib/sprites';

const FOOD = ['🍔', '🍕', '🍩', '🍎', '🍓', '🌮', '🍪', '🧁', '🍉', '🍌', '🍟', '🍒'];
const BAD = ['💣', '🌶️', '🧦', '🪳'];

interface Item {
  e: string;
  bad: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  bounced: boolean;
}

type State = 'ready' | 'play' | 'over';

// Catch falling food in your mouth. Avoid the bombs.
export default defineEffect({
  id: 'munch',
  name: 'Munch',
  icon: '🍔',
  kind: 'game',
  order: 20,
  description: 'Catch falling food with your open mouth. Food bounces off your face when your mouth is shut. Avoid bombs!',
  create(ctx) {
    const crumbs = ctx.particles({ max: 600, shape: 'dot', blend: 'normal', gravity: 900, drag: 0.5, fadePower: 0.6 });
    const booms = ctx.particles({ max: 400, shape: 'glow', gravity: -50, drag: 2, fadePower: 1.2, endScale: 2.5 });
    const popups = new Popups();
    let state: State = 'ready';
    let items: Item[] = [];
    let score = 0;
    let combo = 0;
    let lives = 3;
    let best = ctx.store.get('best', 0);
    let spawnT = 0;
    let elapsed = 0;
    let shake = 0;
    let overAt = 0;
    let again: Button | null = null;

    const start = () => {
      state = 'play';
      items = [];
      score = 0;
      combo = 0;
      lives = 3;
      elapsed = 0;
      spawnT = 0.5;
      again = null;
    };

    const spawn = (f: Frame) => {
      const bad = Math.random() < Math.min(0.3, 0.12 + elapsed * 0.004);
      const size = Math.min(f.width, f.height) * 0.14;
      items.push({
        e: bad ? pick(BAD) : pick(FOOD),
        bad,
        x: rand(size, f.width - size),
        y: -size,
        vx: rand(-30, 30),
        vy: rand(160, 220) + elapsed * 4,
        rot: rand(-1, 1),
        vr: rand(-2, 2),
        size,
        bounced: false,
      });
    };

    const eat = (it: Item, f: Frame) => {
      const face = f.face!;
      if (it.bad) {
        lives--;
        combo = 0;
        shake = 1;
        ctx.sfx.play('hit');
        for (let i = 0; i < 30; i++) {
          booms.emit(it.x, it.y, rand(-250, 250), rand(-250, 250), rand(0.4, 0.8), rand(10, 22), i % 2 ? 0xff5522 : 0xffcc33);
        }
        popups.add(it.e === '🌶️' ? 'HOT!' : 'OUCH!', face.mouthX, face.mouthY - 40, '#ff5a5a');
        if (lives <= 0) {
          state = 'over';
          overAt = f.t;
          if (score > best) {
            best = score;
            ctx.store.set('best', best);
          }
        }
      } else {
        combo++;
        const pts = Math.min(5, 1 + Math.floor(combo / 5));
        score += pts;
        ctx.sfx.play('crunch');
        for (let i = 0; i < 14; i++) {
          crumbs.emit(face.mouthX, face.mouthY, rand(-220, 220), rand(-320, -60), rand(0.5, 0.9), rand(2.5, 4.5), pick([0xf4c27a, 0xd98c3a, 0xffffff, 0xff6b6b]));
        }
        popups.add(pts > 1 ? `+${pts} x${combo}` : '+1', face.mouthX, face.mouthY - 40, pts > 1 ? '#ffd400' : '#fff');
      }
    };

    return {
      update(f) {
        const { dt, face, events, height: H } = f;
        popups.update(dt);
        shake *= Math.exp(-dt * 8);
        if (state === 'ready') {
          if (events.mouthOpened) start();
          return;
        }
        if (state === 'over') {
          if (events.mouthOpened && f.t - overAt > 1.2) start();
        }
        if (state === 'play') {
          elapsed += dt;
          spawnT -= dt;
          if (spawnT <= 0) {
            spawn(f);
            spawnT = Math.max(0.35, 1.1 - elapsed * 0.012) * rand(0.7, 1.3);
          }
        }
        const open = face && face.mouthOpen > 0.22;
        const mouthR = face ? face.eyeDist * 0.55 : 0;
        for (const it of items) {
          it.vy += 120 * dt;
          it.x += it.vx * dt;
          it.y += it.vy * dt;
          it.rot += it.vr * dt;
          if (!face || state !== 'play') continue;
          const dx = it.x - face.mouthX;
          const dy = it.y - face.mouthY;
          if (open && dx * dx + dy * dy < (mouthR + it.size * 0.3) ** 2) {
            it.y = 1e9; // eaten
            eat(it, f);
            continue;
          }
          // Bounce off the face when the mouth is shut.
          if (!it.bounced) {
            const fx = it.x - face.cx;
            const fy = it.y - face.cy;
            const rr = face.height * 0.5 + it.size * 0.35;
            if (fx * fx + fy * fy < rr * rr) {
              const d = Math.hypot(fx, fy) || 1;
              const nx = fx / d;
              const ny = fy / d;
              const vn = it.vx * nx + it.vy * ny;
              if (vn < 0) {
                it.vx -= 1.8 * vn * nx;
                it.vy -= 1.8 * vn * ny;
                it.vr += rand(-6, 6);
                it.bounced = true;
                ctx.sfx.play('pop', 0.5);
              }
            }
          }
        }
        items = items.filter((it) => it.y < H + it.size && it.y < 1e8);
      },
      draw(g, f) {
        const { width: W, face } = f;
        if (shake > 0.01) g.translate(rand(-1, 1) * shake * 12, rand(-1, 1) * shake * 12);
        // Mouth target.
        if (face && state !== 'over') {
          const open = face.mouthOpen > 0.22;
          g.strokeStyle = open ? 'rgba(80,255,120,0.9)' : 'rgba(255,255,255,0.5)';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(face.mouthX, face.mouthY, face.eyeDist * 0.55, 0, Math.PI * 2);
          g.stroke();
        }
        for (const it of items) drawEmoji(g, it.e, it.x, it.y, it.size, it.rot);
        popups.draw(g);

        const top = 90;
        if (state === 'ready') {
          bigText(g, 'MUNCH', W / 2, top + 40, 52, '#ffd400');
          bigText(g, 'Catch food in your mouth', W / 2, top + 95, 20);
          bigText(g, 'Avoid 💣 🌶️ 🧦', W / 2, top + 125, 20);
          if (best) bigText(g, `Best: ${best}`, W / 2, top + 160, 18);
          if (!face) bigText(g, 'Show your face to the camera!', W / 2, top + 195, 17, '#ffe0e0');
          return;
        }
        bigText(g, String(score), W / 2, top, 48);
        g.font = '26px sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) drawEmoji(g, i < lives ? '❤️' : '🖤', 30 + i * 34, top, 28);
        if (state === 'over') {
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(0, 0, W, f.height);
          bigText(g, 'Full!', W / 2, f.height * 0.32, 56, '#ffd400');
          bigText(g, `Score ${score}  ·  Best ${best}`, W / 2, f.height * 0.32 + 60, 22);
          bigText(g, 'Open your mouth to play again', W / 2, f.height * 0.32 + 100, 17);
          again = { x: W / 2 - 90, y: f.height * 0.32 + 130, w: 180, h: 50, label: 'Play again' };
          drawButton(g, again);
        }
      },
      pointerDown(x, y, f) {
        if (state === 'ready') start();
        else if (state === 'over' && (hit(again, x, y) || f.t - overAt > 1.2)) start();
        return true;
      },
    };
  },
});
