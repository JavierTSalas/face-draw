import { defineEffect } from '../../core/effect';
import { drawFaceCutout, drawSavedFace } from '../../lib/cutout';

// Two people: swap faces. One person: wear the face you saved in Face Grab.
export default defineEffect({
  id: 'face-swap',
  name: 'Face Swap',
  icon: '🔀',
  order: 80,
  description: 'Swap faces with a friend, or wear a face you saved with Face Grab.',
  needs: { faces: 2 },
  create(ctx) {
    let savedIndex = 0;
    let lastHint = '';
    const hint = (h: string) => {
      if (h !== lastHint) ctx.hint(h);
      lastHint = h;
    };

    return {
      update(f) {
        const n = f.faces.length;
        const saved = ctx.faces.faces.length;
        if (n >= 2) hint('Swapped! 🔀');
        else if (n === 1 && saved) hint('Wearing a saved face — tap to change, get a friend in frame to swap');
        else if (n === 1) hint('Get a friend in frame — or save a face in Face Grab ✂️');
        else hint('Looking for faces…');
      },
      draw(g, f) {
        const faces = f.faces;
        if (faces.length >= 2) {
          const [a, b] = faces;
          // Draw A where B is and B where A is, matching size and tilt.
          drawFaceCutout(g, f, a, b.cx, b.cy, b.height, b.roll, { feather: true });
          drawFaceCutout(g, f, b, a.cx, a.cy, a.height, a.roll, { feather: true });
          return;
        }
        const face = f.face;
        const list = ctx.faces.faces;
        if (face && list.length) {
          const img = list[savedIndex % list.length].image;
          drawSavedFace(g, img, face.cx, face.cy, face.height * 1.02, face.roll, 0.97);
        }
      },
      pointerDown() {
        const n = ctx.faces.faces.length;
        if (n) {
          savedIndex = (savedIndex + 1) % n;
          ctx.sfx.play('pop');
        }
        return true;
      },
    };
  },
});
