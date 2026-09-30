import { defineEffect } from '../../core/effect';
import { drawFaceCutout, drawSavedFace } from '../../lib/cutout';
import { TAU } from '../../lib/math';

// Live cut-outs of your own face orbit your head like moons.
export default defineEffect({
  id: 'head-clones',
  name: 'Head Orbit',
  icon: '🪐',
  order: 70,
  description: 'Copies of your live face orbit your head. Tap to use your saved faces instead.',
  hint: 'Tap to switch between live and saved faces 🪐',
  create(ctx) {
    const N = 6;
    let useSaved = false;
    const order: { i: number; depth: number }[] = Array.from({ length: N }, (_, i) => ({ i, depth: 0 }));
    const trail = ctx.particles({ max: 600, shape: 'glow', fadePower: 1, endScale: 0.2 });
    const pos = new Float32Array(N * 3);

    return {
      update(f) {
        const face = f.face;
        if (!face) return;
        const tilt = face.roll - 0.25;
        const c = Math.cos(tilt);
        const s = Math.sin(tilt);
        for (let i = 0; i < N; i++) {
          const a = f.t * 1.4 + (i / N) * TAU;
          const ex = Math.cos(a) * face.width * 1.35;
          const ey = Math.sin(a) * face.height * 0.28;
          const x = face.cx + ex * c - ey * s;
          const y = face.cy - face.height * 0.1 + ex * s + ey * c;
          pos[i * 3] = x;
          pos[i * 3 + 1] = y;
          pos[i * 3 + 2] = Math.sin(a); // > 0: in front of the head
          order[i].i = i;
          order[i].depth = pos[i * 3 + 2];
          if (Math.random() < 0.5) trail.emit(x, y, 0, 0, 0.4, face.eyeDist * 0.12, 0x99ccff, 0.35);
        }
        order.sort((p, q) => p.depth - q.depth);
      },
      draw(g, f) {
        const face = f.face;
        if (!face) return;
        const saved = ctx.faces.faces;
        for (const { i, depth } of order) {
          const x = pos[i * 3];
          const y = pos[i * 3 + 1];
          const front = depth > 0;
          const size = face.height * (0.3 + 0.14 * (depth + 1) / 2);
          const rot = Math.sin(f.t * 2 + i) * 0.3;
          g.save();
          if (!front) {
            // Behind the head: hide the part that overlaps your face.
            const clip = new Path2D();
            clip.rect(0, 0, f.width, f.height);
            face.traceOval(clip, 1.05);
            g.clip(clip, 'evenodd');
          }
          const alpha = front ? 1 : 0.85;
          if (useSaved && saved.length) {
            drawSavedFace(g, saved[i % saved.length].image, x, y, size, rot, alpha);
          } else {
            drawFaceCutout(g, f, face, x, y, size, rot, { outline: 2.5, alpha });
          }
          g.restore();
        }
      },
      pointerDown() {
        if (!ctx.faces.faces.length) {
          ctx.toast('No saved faces yet — use Face Grab ✂️');
          return true;
        }
        useSaved = !useSaved;
        ctx.toast(useSaved ? 'Saved faces' : 'Live face');
        return true;
      },
    };
  },
});
