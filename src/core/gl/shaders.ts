// GLSL shared by every camera-pass shader. Effect shaders only write
// `vec4 mainImage(vec2 uv)`; this prelude supplies inputs and helpers.

export const FULLSCREEN_VS = /* glsl */ `#version 300 es
out vec2 v_uv;
void main() {
  // One oversized triangle covers the screen.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  // Screen uv with (0,0) at the TOP-left, matching the 2D canvas.
  v_uv = vec2(p.x, 1.0 - p.y);
}
`;

export const PRELUDE = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

// ---- Inputs -------------------------------------------------------------
uniform sampler2D u_camera;   // camera frame
uniform sampler2D u_mask;     // person mask (r channel), if requested
uniform vec2  u_resolution;   // viewport in CSS px
uniform float u_time;         // seconds since the effect started
uniform vec2  u_uvScale;      // screen uv -> camera uv (cover fit)
uniform vec2  u_uvOffset;
uniform float u_mirror;       // 1.0 when the camera is mirrored
uniform float u_hasMask;      // 1.0 when u_mask holds a real mask
uniform float u_hasFace;      // 1.0 when a face is tracked
uniform vec2  u_faceCenter;   // CSS px
uniform vec2  u_faceSize;     // width, height in CSS px
uniform float u_faceRoll;     // radians
uniform vec2  u_eyeL;         // screen-left pupil, CSS px
uniform vec2  u_eyeR;         // screen-right pupil, CSS px
uniform vec2  u_mouth;        // mouth centre, CSS px
uniform vec2  u_nose;         // nose tip, CSS px
uniform float u_mouthOpen;    // 0..1

// ---- Helpers ------------------------------------------------------------
vec2 toPx(vec2 uv) { return uv * u_resolution; }
vec2 toUV(vec2 px) { return px / u_resolution; }

vec2 camUV(vec2 uv) {
  vec2 t = u_uvOffset + uv * u_uvScale;
  if (u_mirror > 0.5) t.x = 1.0 - t.x;
  return t;
}
vec3 camera(vec2 uv) { return texture(u_camera, camUV(uv)).rgb; }

// Normalised distance from the face ellipse centre: 0 = centre, 1 = outline.
float faceDist(vec2 px) {
  vec2 d = px - u_faceCenter;
  float c = cos(-u_faceRoll), s = sin(-u_faceRoll);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  vec2 r = max(u_faceSize * vec2(0.5, 0.55), vec2(1.0));
  return length(d / r);
}

// 0..1 how much of "the person" is at uv. Uses the segmentation mask when
// available, otherwise a soft ellipse around the head.
float personMask(vec2 uv) {
  if (u_hasMask > 0.5) return texture(u_mask, camUV(uv)).r;
  if (u_hasFace < 0.5) return 0.0;
  return 1.0 - smoothstep(0.85, 1.05, faceDist(toPx(uv)));
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n));
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1, 0));
  float c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`;

export const DEFAULT_SHADER = /* glsl */ `
vec4 mainImage(vec2 uv) { return vec4(camera(uv), 1.0); }
`;

export function buildFragment(effectSource: string) {
  return `${PRELUDE}\n#line 1\n${effectSource}\nvoid main() { outColor = mainImage(v_uv); }\n`;
}
