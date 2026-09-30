import { defineEffect } from '../../core/effect';
import type { Face } from '../../core/face';
import {
  FACE_OVAL_EDGES,
  LEFT_EYE_EDGES,
  LEFT_EYEBROW_EDGES,
  LIPS_EDGES,
  RIGHT_EYE_EDGES,
  RIGHT_EYEBROW_EDGES,
  TESSELATION_EDGES,
} from '../../core/topology';
import { hsl, rand } from '../../lib/math';
import type { LineBatch } from '../../core/gl/lines';

// Dark cyberpunk grade with scanlines so the mesh pops.
const shader = /* glsl */ `
uniform vec3 u_tint;
vec4 mainImage(vec2 uv) {
  vec3 c = camera(uv);
  float l = luma(c);
  c = mix(vec3(l), c, 0.4) * 0.38 + u_tint * l * 0.25;
  c *= 0.92 + 0.08 * sin(toPx(uv).y * 2.2 + u_time * 8.0);
  return vec4(c, 1.0);
}
`;

/** The tessellation lists shared triangle edges twice; draw each once. */
function uniqueEdges(edges: Uint16Array) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    const a = Math.min(edges[i], edges[i + 1]);
    const b = Math.max(edges[i], edges[i + 1]);
    const key = a * 1024 + b;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a, b);
  }
  return new Uint16Array(out);
}
const MESH = uniqueEdges(TESSELATION_EDGES);

const FEATURES = [FACE_OVAL_EDGES, LIPS_EDGES, LEFT_EYE_EDGES, RIGHT_EYE_EDGES, LEFT_EYEBROW_EDGES, RIGHT_EYEBROW_EDGES];

const THEMES = [
  { name: 'Synthwave', base: 0.83, spread: 0.12 },
  { name: 'Matrix', base: 0.33, spread: 0.02 },
  { name: 'Ice', base: 0.55, spread: 0.05 },
  { name: 'Rainbow', base: 0, spread: 1 },
];

export default defineEffect({
  id: 'neon-mesh',
  name: 'Neon Mesh',
  icon: '🕸️',
  order: 40,
  description: 'Your face as a glowing 468-point wireframe, drawn on the GPU. Tap to change colours.',
  hint: 'Tap to change colours ✨',
  shader,
  create(ctx) {
    // Thousands of segments in a single GPU draw call.
    const mesh = ctx.lines({ max: 2556 * 2, glow: 1.6, core: 0.3 });
    const features = ctx.lines({ max: 600 * 2, glow: 3, core: 0.7 });
    const sparkles = ctx.particles({ max: 400, shape: 'star', fadePower: 1, endScale: 0.2 });
    let theme = ctx.store.get('theme', 0) % THEMES.length;
    const tint = [0, 0, 0];

    const addEdges = (batch: LineBatch, face: Face, edges: Uint16Array, width: number, color: number, alpha: number) => {
      for (let i = 0; i < edges.length; i += 2) {
        const a = edges[i];
        const b = edges[i + 1];
        batch.add(face.x(a), face.y(a), face.x(b), face.y(b), width, color, alpha);
      }
    };

    return {
      update(f) {
        const th = THEMES[theme];
        const hue = th.base + Math.sin(f.t * 0.7) * th.spread + (th.spread === 1 ? f.t * 0.1 : 0);
        const c = hsl(hue, 1, 0.55);
        tint[0] = ((c >> 16) & 255) / 255;
        tint[1] = ((c >> 8) & 255) / 255;
        tint[2] = (c & 255) / 255;
        // Rebuild lines when landmarks change (tracking rate) or colours drift.
        if (f.events.tracked || f.faces.length === 0) {
          mesh.clear();
          features.clear();
          for (const face of f.faces) {
            const w = Math.max(0.6, face.eyeDist / 90);
            addEdges(mesh, face, MESH, 0.8 * w, hsl(hue, 1, 0.5), 0.45);
            const fc = hsl(hue + 0.15, 1, 0.6);
            for (const e of FEATURES) addEdges(features, face, e, 2.2 * w, fc, 1);
          }
        }
        for (const face of f.faces) {
          for (let k = 0; k < 2; k++) {
            const i = (Math.random() * 468) | 0;
            sparkles.emit(face.x(i), face.y(i), 0, rand(-10, 10), rand(0.3, 0.7), rand(3, 7), hsl(hue + 0.1, 0.6, 0.8));
          }
        }
      },
      uniforms: () => ({ u_tint: tint }),
      pointerDown() {
        theme = (theme + 1) % THEMES.length;
        ctx.store.set('theme', theme);
        ctx.toast(THEMES[theme].name);
        return true;
      },
    };
  },
});
