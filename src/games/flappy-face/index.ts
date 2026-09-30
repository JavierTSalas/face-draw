import { defineEffect, type Frame } from '../../core/effect';
import { drawFaceCutout, drawSavedFace } from '../../lib/cutout';
import { bigText, drawButton, FONT, hit, roundRect, type Button } from '../../lib/game';
import { clamp, rand } from '../../lib/math';

interface Pipe {
  x: number;
  gapY: number;
  gap: number;
  scored: boolean;
}

type State = 'ready' | 'play' | 'dead';

const TOP = 70; // below the top bar
const BOTTOM_UI = 165; // carousel + shutter area

export default defineEffect({
  id: 'flappy-face',
  name: 'Flappy Face',
  icon: '🐦',
  kind: 'game',
  order: 10,
  description: 'Flappy Bird where the bird is your face. Open your mouth (or raise your eyebrows, or tap) to flap.',
  hideCamera: true,
  create(ctx) {
    const puffs = ctx.particles({ max: 400, shape: 'dot', blend: 'normal', gravity: 200, drag: 3, fadePower: 1, endScale: 1.8 });
    const stars = ctx.particles({ max: 400, shape: 'star', gravity: 300, drag: 1, fadePower: 1 });

    let state: State = 'ready';
    let pipes: Pipe[] = [];
    let y = 0;
    let vy = 0;
    let score = 0;
    let best = ctx.store.get('best', 0);
    let deadAt = 0;
    let flapT = 0;
    let scroll = 0;
    let useSaved = ctx.store.get('useSaved', false);
    let playAgain: Button | null = null;
    let birdBtn: Button | null = null;
    let lastW = 0;
    let lastH = 0;
    let sky: CanvasGradient | null = null;
    const clouds = Array.from({ length: 6 }, () => ({ x: rand(0, 1), y: rand(0.05, 0.6), s: rand(0.6, 1.4) }));

    // Sizes scale with the play area so it feels the same on any screen.
    const dims = (f: Frame) => {
      const playH = f.height - TOP - BOTTOM_UI;
      const s = Math.max(0.6, playH / 620);
      return {
        s,
        playTop: TOP,
        ground: f.height - BOTTOM_UI,
        birdX: f.width * 0.3,
        r: 30 * s,
        gravity: 1500 * s,
        flapV: -520 * s,
        pipeW: 74 * s,
        speed: (160 + Math.min(score, 30) * 3) * s,
        spacing: Math.max(220 * s, f.width * 0.55),
        gap: Math.max(150, (205 - Math.min(score, 25) * 1.6) * s),
      };
    };

    const reset = (f: Frame) => {
      const d = dims(f);
      state = 'ready';
      pipes = [];
      y = (d.playTop + d.ground) / 2;
      vy = 0;
      score = 0;
      playAgain = birdBtn = null;
    };

    const flap = (f: Frame) => {
      const d = dims(f);
      if (state === 'ready') {
        state = 'play';
        pipes = [];
      }
      if (state !== 'play') return;
      vy = d.flapV;
      flapT = 0;
      ctx.sfx.play('flap');
      for (let i = 0; i < 6; i++) puffs.emit(d.birdX - d.r * 0.6, y + d.r * 0.3, rand(-120, -40), rand(-20, 80), rand(0.3, 0.5), rand(3, 6) * d.s, 0xffffff, 0.8);
    };

    const die = (f: Frame) => {
      if (state !== 'play') return;
      const d = dims(f);
      state = 'dead';
      deadAt = f.t;
      ctx.sfx.play('hit');
      for (let i = 0; i < 40; i++) {
        const a = rand(0, Math.PI * 2);
        stars.emit(d.birdX, y, Math.cos(a) * rand(100, 400), Math.sin(a) * rand(100, 400) - 200, rand(0.6, 1.2), rand(4, 8), i % 2 ? 0xffe066 : 0xffffff);
      }
      if (score > best) {
        best = score;
        ctx.store.set('best', best);
      }
    };

    const drawBird = (g: CanvasRenderingContext2D, f: Frame, x: number, by: number, r: number, rot: number) => {
      const face = f.face;
      const wing = Math.sin(flapT * 28) * (state === 'play' && flapT < 0.4 ? 1 : 0.25);
      // Wings behind the head.
      g.save();
      g.translate(x, by);
      g.rotate(rot);
      g.fillStyle = '#fff';
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 2;
      for (const side of [-1, 1]) {
        g.save();
        g.translate(side * r * 0.85, r * 0.1);
        g.rotate(side * (0.5 + wing * 0.7));
        g.beginPath();
        g.ellipse(side * r * 0.45, 0, r * 0.55, r * 0.28, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
      }
      g.restore();

      const saved = ctx.faces.latest;
      if (useSaved && saved) {
        g.save();
        g.translate(x, by);
        g.rotate(rot);
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(0, 0, r * 0.98, r * 1.14, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
        drawSavedFace(g, saved.image, x, by, r * 2, rot);
      } else if (face) {
        drawFaceCutout(g, f, face, x, by, r * 2, rot, { outline: 3 * (r / 30) });
      } else {
        // No face yet: a classic yellow bird.
        g.save();
        g.translate(x, by);
        g.rotate(rot);
        g.fillStyle = '#ffd400';
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(r * 0.35, -r * 0.25, r * 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#111';
        g.beginPath();
        g.arc(r * 0.45, -r * 0.25, r * 0.12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ff7a00';
        g.beginPath();
        g.ellipse(r * 0.85, r * 0.15, r * 0.35, r * 0.18, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    };

    return {
      update(f) {
        const { dt, width: W, height: H, events } = f;
        if (W !== lastW || H !== lastH) {
          lastW = W;
          lastH = H;
          sky = null;
          reset(f);
        }
        const d = dims(f);
        flapT += dt;
        if (events.mouthOpened || events.browsRaised) {
          if (state === 'dead') {
            if (f.t - deadAt > 1) reset(f);
          } else flap(f);
        }
        if (state === 'ready') {
          y = (d.playTop + d.ground) / 2 + Math.sin(f.t * 3) * 10 * d.s;
          scroll += dt * d.speed;
          return;
        }
        // Physics
        vy += d.gravity * dt;
        y += vy * dt;
        if (y + d.r > d.ground) {
          y = d.ground - d.r;
          if (state === 'play') die(f);
          vy = 0;
        }
        if (y - d.r < d.playTop) {
          y = d.playTop + d.r;
          vy = Math.max(vy, 0);
        }
        if (state !== 'play') return;
        scroll += dt * d.speed;
        // Pipes
        const last = pipes[pipes.length - 1];
        if (!last || last.x < W - d.spacing) {
          const margin = 40 * d.s;
          const gapY = rand(d.playTop + d.gap / 2 + margin, d.ground - d.gap / 2 - margin);
          pipes.push({ x: W + d.pipeW, gapY, gap: d.gap, scored: false });
        }
        const hr = d.r * 0.82; // forgiving hitbox
        for (const p of pipes) {
          p.x -= d.speed * dt;
          if (!p.scored && p.x + d.pipeW / 2 < d.birdX) {
            p.scored = true;
            score++;
            ctx.sfx.play('score');
            for (let i = 0; i < 12; i++) stars.emit(d.birdX, y, rand(-150, 150), rand(-250, -50), rand(0.4, 0.8), rand(3, 6), 0xffe066);
          }
          // Circle vs the two pipe rectangles.
          const left = p.x - d.pipeW / 2;
          const right = p.x + d.pipeW / 2;
          const cx = clamp(d.birdX, left, right);
          if (Math.abs(cx - d.birdX) < hr) {
            const topEnd = p.gapY - p.gap / 2;
            const botStart = p.gapY + p.gap / 2;
            const dyTop = y - clamp(y, -1e9, topEnd);
            const dyBot = y - clamp(y, botStart, 1e9);
            const dx = d.birdX - cx;
            if (dx * dx + dyTop * dyTop < hr * hr || dx * dx + dyBot * dyBot < hr * hr) die(f);
          }
        }
        pipes = pipes.filter((p) => p.x > -d.pipeW);
      },
      draw(g, f) {
        const { width: W, height: H } = f;
        const d = dims(f);
        // Sky
        if (!sky) {
          sky = g.createLinearGradient(0, 0, 0, H);
          sky.addColorStop(0, '#4ec0ff');
          sky.addColorStop(0.7, '#bfe9ff');
          sky.addColorStop(1, '#e8f7ff');
        }
        g.fillStyle = sky;
        g.fillRect(0, 0, W, H);
        // Clouds (parallax)
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (const c of clouds) {
          const cw = 90 * c.s * d.s;
          const x = ((((c.x * (W + cw * 2) - scroll * 0.2 * c.s) % (W + cw * 2)) + W + cw * 2) % (W + cw * 2)) - cw;
          const cy = d.playTop + c.y * (d.ground - d.playTop);
          g.beginPath();
          g.ellipse(x, cy, cw * 0.5, cw * 0.22, 0, 0, Math.PI * 2);
          g.ellipse(x + cw * 0.25, cy - cw * 0.12, cw * 0.3, cw * 0.2, 0, 0, Math.PI * 2);
          g.ellipse(x - cw * 0.2, cy - cw * 0.08, cw * 0.25, cw * 0.16, 0, 0, Math.PI * 2);
          g.fill();
        }
        // Pipes
        for (const p of pipes) {
          const left = p.x - d.pipeW / 2;
          const topEnd = p.gapY - p.gap / 2;
          const botStart = p.gapY + p.gap / 2;
          const lip = 26 * d.s;
          g.fillStyle = '#5cd65c';
          g.fillRect(left, 0, d.pipeW, topEnd);
          g.fillRect(left, botStart, d.pipeW, d.ground - botStart);
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(left + d.pipeW * 0.15, 0, d.pipeW * 0.12, topEnd);
          g.fillRect(left + d.pipeW * 0.15, botStart, d.pipeW * 0.12, d.ground - botStart);
          g.fillStyle = 'rgba(0,0,0,0.15)';
          g.fillRect(left + d.pipeW * 0.8, 0, d.pipeW * 0.2, topEnd);
          g.fillRect(left + d.pipeW * 0.8, botStart, d.pipeW * 0.2, d.ground - botStart);
          g.fillStyle = '#3fb43f';
          roundRect(g, left - 5 * d.s, topEnd - lip, d.pipeW + 10 * d.s, lip, 6);
          g.fill();
          roundRect(g, left - 5 * d.s, botStart, d.pipeW + 10 * d.s, lip, 6);
          g.fill();
        }
        // Ground
        g.fillStyle = '#ded895';
        g.fillRect(0, d.ground, W, H - d.ground);
        g.fillStyle = '#73bf2e';
        g.fillRect(0, d.ground, W, 14 * d.s);
        g.fillStyle = 'rgba(0,0,0,0.08)';
        const stripe = 24 * d.s;
        for (let x = -((scroll % (stripe * 2)) + stripe * 2); x < W; x += stripe * 2) {
          g.beginPath();
          g.moveTo(x, d.ground + 14 * d.s);
          g.lineTo(x + stripe, d.ground + 14 * d.s);
          g.lineTo(x + stripe * 2, d.ground + 40 * d.s);
          g.lineTo(x + stripe, d.ground + 40 * d.s);
          g.fill();
        }

        const rot = state === 'ready' ? 0 : clamp(vy / (900 * d.s), -0.45, 1.3);
        drawBird(g, f, d.birdX, y, d.r, rot);

        // HUD
        if (state !== 'ready') bigText(g, String(score), W / 2, d.playTop + 50 * d.s, 56 * d.s);
        if (state === 'ready') {
          bigText(g, 'Flappy Face', W / 2, d.playTop + 70 * d.s, 44 * d.s, '#ffd400');
          const mid = (d.playTop + d.ground) / 2;
          bigText(g, 'Open your mouth to flap', W / 2, mid + 80 * d.s, 20 * d.s);
          bigText(g, 'or raise your eyebrows, or tap', W / 2, mid + 108 * d.s, 15 * d.s);
          if (best) bigText(g, `Best: ${best}`, W / 2, d.playTop + 115 * d.s, 20 * d.s);
          if (!f.face && !(useSaved && ctx.faces.latest)) bigText(g, 'Show your face to the camera!', W / 2, d.playTop + 150 * d.s, 17 * d.s, '#ffe0e0');
          birdBtn = drawBirdToggle(g, W, d.ground - 30 * d.s, d.s);
        }
        if (state === 'dead' && f.t - deadAt > 0.5) {
          const pw = Math.min(W - 40, 300);
          const ph = 230 * d.s;
          const px = (W - pw) / 2;
          const py = (d.playTop + d.ground) / 2 - ph / 2 - 20;
          g.fillStyle = 'rgba(255,248,225,0.95)';
          roundRect(g, px, py, pw, ph, 20);
          g.fill();
          g.lineWidth = 4;
          g.strokeStyle = '#c9a227';
          g.stroke();
          bigText(g, 'Game Over', W / 2, py + 38 * d.s, 32 * d.s, '#ff7a00');
          g.fillStyle = '#6b5b2a';
          g.font = `700 ${Math.round(18 * d.s)}px ${FONT}`;
          g.textAlign = 'center';
          g.fillText(`Score ${score}   ·   Best ${best}`, W / 2, py + 85 * d.s);
          if (score >= best && score > 0) bigText(g, 'NEW BEST! 🎉', W / 2, py + 118 * d.s, 20 * d.s, '#ffd400');
          playAgain = { x: W / 2 - 90, y: py + ph - 70 * d.s, w: 180, h: 50 * d.s, label: 'Play again' };
          drawButton(g, playAgain);
          birdBtn = drawBirdToggle(g, W, py + ph + 40 * d.s, d.s);
        }
      },
      pointerDown(x, yy, f) {
        if (hit(birdBtn, x, yy) && state !== 'play') {
          if (!ctx.faces.latest) {
            ctx.toast('Save a face in Face Grab ✂️ first');
          } else {
            useSaved = !useSaved;
            ctx.store.set('useSaved', useSaved);
            ctx.sfx.play('pop');
          }
          return true;
        }
        if (state === 'dead') {
          if (hit(playAgain, x, yy) || f.t - deadAt > 1) reset(f);
          return true;
        }
        flap(f);
        return true;
      },
      shutter(f) {
        flap(f);
        return true;
      },
    };

    function drawBirdToggle(g: CanvasRenderingContext2D, W: number, cy: number, s: number): Button {
      const label = useSaved && ctx.faces.latest ? '🐦 Bird: saved face' : '🐦 Bird: live face';
      const b = { x: W / 2 - 110, y: cy - 20 * s, w: 220, h: 40 * s, label };
      drawButton(g, b, 'rgba(0,0,0,0.55)', '#fff');
      return b;
    }
  },
});
