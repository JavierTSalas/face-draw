import { defineEffect } from '../../core/effect';

// Toon shading: ink edges (Sobel), posterized colour and halftone dots.
const shader = /* glsl */ `
uniform float u_style; // 0 comic, 1 sketch, 2 pop art

float lumAt(vec2 uv) { return luma(camera(uv)); }

vec4 mainImage(vec2 uv) {
  vec2 e = 1.4 / u_resolution;
  float tl = lumAt(uv + vec2(-e.x, -e.y)), t = lumAt(uv + vec2(0.0, -e.y)), tr = lumAt(uv + vec2(e.x, -e.y));
  float l = lumAt(uv + vec2(-e.x, 0.0)), r = lumAt(uv + vec2(e.x, 0.0));
  float bl = lumAt(uv + vec2(-e.x, e.y)), b = lumAt(uv + vec2(0.0, e.y)), br = lumAt(uv + vec2(e.x, e.y));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = smoothstep(0.18, 0.45, length(vec2(gx, gy)));

  vec3 c = camera(uv);
  float lum = luma(c);
  vec2 px = toPx(uv);

  if (u_style < 0.5) {
    // Comic: saturated, posterized, halftone in the shadows, black ink.
    vec3 sat = mix(vec3(lum), c, 1.6);
    vec3 post = floor(clamp(sat, 0.0, 1.0) * 4.0 + 0.5) / 4.0;
    float cell = 7.0;
    vec2 g = mod(px, cell) - cell * 0.5;
    float dotR = (1.0 - lum) * cell * 0.55;
    float dots = 1.0 - smoothstep(dotR - 0.8, dotR + 0.8, length(g));
    post *= 1.0 - dots * 0.35 * smoothstep(0.65, 0.2, lum);
    return vec4(mix(post, vec3(0.05), edge), 1.0);
  } else if (u_style < 1.5) {
    // Pencil sketch on paper.
    float hatch = 0.5 + 0.5 * sin((px.x + px.y) * 1.3);
    float shade = smoothstep(0.55, 0.15, lum) * hatch * 0.5;
    vec3 paper = vec3(0.97, 0.95, 0.9) - fbm(px * 0.08) * 0.05;
    return vec4(paper * (1.0 - edge * 0.85) - shade * 0.6, 1.0);
  }
  // Pop art: four-tone Warhol palette, shifts over time.
  float k = floor(lum * 4.0);
  float hue = fract(k * 0.23 + u_time * 0.05);
  vec3 pop = hsv2rgb(vec3(hue, 0.85, 0.35 + k * 0.2));
  return vec4(mix(pop, vec3(0.0), edge), 1.0);
}
`;

const STYLES = ['Comic', 'Sketch', 'Pop Art'];

export default defineEffect({
  id: 'comic',
  name: 'Comic',
  icon: '💥',
  order: 100,
  description: 'Comic book, pencil sketch and pop art looks. Tap to switch.',
  hint: 'Tap to switch style 💥',
  shader,
  create(ctx) {
    let style = ctx.store.get('style', 0) % STYLES.length;
    const u = { u_style: style };
    return {
      uniforms: () => u,
      pointerDown() {
        style = (style + 1) % STYLES.length;
        u.u_style = style;
        ctx.store.set('style', style);
        ctx.toast(STYLES[style]);
        return true;
      },
    };
  },
});
