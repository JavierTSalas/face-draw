// WebGL2 layer: camera pass (with optional effect shader) + GPU particles.
import type { Frame, Uniforms } from '../effect';
import { buildFragment, DEFAULT_SHADER, FULLSCREEN_VS } from './shaders';
import { INSTANCE_FLOATS, SHAPE_IDS, ParticleSystem } from './particles';
import { LINE_FLOATS, LineBatch } from './lines';

/** Things effects can create that the GPU draws above the camera layer. */
export type Layer = ParticleSystem | LineBatch;

const PARTICLE_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_psr;    // x, y, size, rotation
layout(location = 2) in vec4 a_color;  // rgb, alpha
layout(location = 3) in vec2 a_vel;
uniform vec2 u_resolution;
uniform float u_stretch;
uniform int u_shape;
out vec2 v_local;
out vec4 v_color;
void main() {
  float size = a_psr.z;
  vec2 ax, ay;
  vec2 ext = vec2(size);
  if (u_shape == 1) {
    float sp = length(a_vel);
    vec2 dir = sp > 0.001 ? a_vel / sp : vec2(1.0, 0.0);
    ax = dir;
    ay = vec2(-dir.y, dir.x);
    ext.x = size + sp * u_stretch;
  } else {
    float c = cos(a_psr.w), s = sin(a_psr.w);
    ax = vec2(c, s);
    ay = vec2(-s, c);
  }
  vec2 p = a_psr.xy + ax * a_corner.x * ext.x + ay * a_corner.y * ext.y;
  v_local = a_corner;
  v_color = a_color;
  vec2 clip = p / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const PARTICLE_FS = /* glsl */ `#version 300 es
precision mediump float;
precision highp int;
in vec2 v_local;
in vec4 v_color;
uniform int u_shape;
out vec4 outColor;
void main() {
  vec2 l = v_local;
  float r = length(l);
  float a;
  if (u_shape == 0 || u_shape == 1) {        // glow / spark
    float core = exp(-r * r * 6.0);
    float halo = max(0.0, 1.0 - r);
    a = core + halo * halo * 0.4;
  } else if (u_shape == 2) {                 // dot
    a = 1.0 - smoothstep(0.75, 1.0, r);
  } else if (u_shape == 3) {                 // snowflake
    float ang = atan(l.y, l.x);
    float d = r * abs(sin(3.0 * ang));
    float arms = (1.0 - smoothstep(0.03, 0.12, d)) * (1.0 - smoothstep(0.75, 1.0, r));
    float twig = (1.0 - smoothstep(0.02, 0.1, abs(r - 0.55))) * (1.0 - smoothstep(0.05, 0.3, d));
    a = max(arms, twig) + (1.0 - smoothstep(0.0, 0.2, r));
  } else if (u_shape == 4) {                 // ring
    a = 1.0 - smoothstep(0.0, 0.12, abs(r - 0.82));
  } else if (u_shape == 5) {                 // smoke
    a = pow(max(0.0, 1.0 - r), 1.6) * 0.7;
  } else {                                   // star (4-point twinkle)
    float cross = max(1.0 - smoothstep(0.0, 0.08, abs(l.x)) , 1.0 - smoothstep(0.0, 0.08, abs(l.y)));
    a = cross * (1.0 - r) + exp(-r * r * 20.0);
  }
  a = clamp(a, 0.0, 1.0) * v_color.a;
  if (a < 0.003) discard;
  outColor = vec4(v_color.rgb * a, a);
}
`;

const LINE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_seg;     // x0, y0, x1, y1
layout(location = 2) in float a_width;
layout(location = 3) in vec4 a_color;
uniform vec2 u_resolution;
uniform float u_glow;
out vec2 v_p;
out float v_halfLen;
out float v_halfW;
out vec4 v_color;
void main() {
  vec2 a = a_seg.xy, b = a_seg.zw;
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = a_width * 0.5;
  float ext = hw * (1.0 + u_glow) + 1.5;
  vec2 local = vec2(a_corner.x * (len * 0.5 + ext), a_corner.y * ext);
  vec2 p = (a + b) * 0.5 + dir * local.x + nrm * local.y;
  v_p = local;
  v_halfLen = len * 0.5;
  v_halfW = hw;
  v_color = a_color;
  vec2 clip = p / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const LINE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_p;
in float v_halfLen;
in float v_halfW;
in vec4 v_color;
uniform float u_glow;
uniform float u_core;
out vec4 outColor;
void main() {
  // Distance to the segment (capsule).
  float dx = max(abs(v_p.x) - v_halfLen, 0.0);
  float dist = length(vec2(dx, v_p.y));
  float core = 1.0 - smoothstep(v_halfW - 0.75, v_halfW + 0.75, dist);
  float halo = 0.0;
  if (u_glow > 0.0) {
    float r = dist / (v_halfW * (1.0 + u_glow));
    halo = exp(-r * r * 3.0) * 0.55;
  }
  float a = max(core, halo) * v_color.a;
  if (a < 0.003) discard;
  vec3 rgb = mix(v_color.rgb, vec3(1.0), core * u_core);
  outColor = vec4(rgb * a, a);
}
`;

const STD_UNIFORMS = [
  'u_camera',
  'u_mask',
  'u_resolution',
  'u_time',
  'u_uvScale',
  'u_uvOffset',
  'u_mirror',
  'u_hasMask',
  'u_hasFace',
  'u_faceCenter',
  'u_faceSize',
  'u_faceRoll',
  'u_eyeL',
  'u_eyeR',
  'u_mouth',
  'u_nose',
  'u_mouthOpen',
] as const;

interface CameraProgram {
  prog: WebGLProgram;
  std: Record<(typeof STD_UNIFORMS)[number], WebGLUniformLocation | null>;
  custom: Map<string, WebGLUniformLocation | null>;
}

interface LayerGL {
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  version: number;
}

export class GLRenderer {
  readonly gl: WebGL2RenderingContext;
  private programs = new Map<string, CameraProgram>();
  private emptyVao!: WebGLVertexArrayObject;
  private camTex!: WebGLTexture;
  private maskTex!: WebGLTexture;
  private particleProg!: WebGLProgram;
  private pLoc!: {
    res: WebGLUniformLocation | null;
    stretch: WebGLUniformLocation | null;
    shape: WebGLUniformLocation | null;
  };
  private lineProg!: WebGLProgram;
  private lLoc!: {
    res: WebGLUniformLocation | null;
    glow: WebGLUniformLocation | null;
    core: WebGLUniformLocation | null;
  };
  private quadBuf!: WebGLBuffer;
  private layers = new Map<Layer, LayerGL>();
  private lost = false;
  hasCamera = false;
  hasMask = false;
  /** Last shader compile error (shown in the HUD). */
  lastError: string | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
    });
    this.init();
  }

  private init() {
    const gl = this.gl;
    this.programs.clear();
    this.layers.clear();
    this.hasCamera = false;
    this.hasMask = false;
    this.emptyVao = gl.createVertexArray()!;
    this.camTex = this.makeTexture();
    this.maskTex = this.makeTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    this.particleProg = this.link(PARTICLE_VS, PARTICLE_FS);
    this.pLoc = {
      res: gl.getUniformLocation(this.particleProg, 'u_resolution'),
      stretch: gl.getUniformLocation(this.particleProg, 'u_stretch'),
      shape: gl.getUniformLocation(this.particleProg, 'u_shape'),
    };
    this.lineProg = this.link(LINE_VS, LINE_FS);
    this.lLoc = {
      res: gl.getUniformLocation(this.lineProg, 'u_resolution'),
      glow: gl.getUniformLocation(this.lineProg, 'u_glow'),
      core: gl.getUniformLocation(this.lineProg, 'u_core'),
    };
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.getProgram(DEFAULT_SHADER);
  }

  private makeTexture() {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private compile(type: number, src: string) {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s) ?? 'unknown error';
      gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  }

  private link(vs: string, fs: string) {
    const gl = this.gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link failed');
    return p;
  }

  /** Compile (once) and return the camera program for an effect shader. */
  getProgram(source: string = DEFAULT_SHADER): CameraProgram {
    let cp = this.programs.get(source);
    if (cp) return cp;
    const gl = this.gl;
    let prog: WebGLProgram;
    try {
      prog = this.link(FULLSCREEN_VS, buildFragment(source));
    } catch (err) {
      this.lastError = String((err as Error).message);
      console.error('[shader] compile failed:\n' + this.lastError);
      if (source === DEFAULT_SHADER) throw err;
      cp = this.getProgram(DEFAULT_SHADER);
      this.programs.set(source, cp);
      return cp;
    }
    const std = {} as CameraProgram['std'];
    for (const name of STD_UNIFORMS) std[name] = gl.getUniformLocation(prog, name);
    cp = { prog, std, custom: new Map() };
    this.programs.set(source, cp);
    return cp;
  }

  resize(pxW: number, pxH: number) {
    if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
      this.canvas.width = pxW;
      this.canvas.height = pxH;
    }
  }

  uploadCamera(src: TexImageSource) {
    if (this.lost) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.camTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    this.hasCamera = true;
  }

  uploadMask(data: Uint8Array, w: number, h: number) {
    if (this.lost) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    this.hasMask = true;
  }

  clearMask() {
    this.hasMask = false;
  }

  render(
    f: Frame,
    shader: string | undefined,
    custom: Uniforms | undefined,
    layers: readonly Layer[],
    hideCamera: boolean,
  ) {
    if (this.lost) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);

    if (hideCamera || !this.hasCamera) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
      this.drawCamera(f, shader, custom);
    }
    if (layers.length) this.drawLayers(f, layers);
  }

  private drawCamera(f: Frame, shader: string | undefined, custom: Uniforms | undefined) {
    const gl = this.gl;
    const cp = this.getProgram(shader);
    const u = cp.std;
    const cam = f.camera;
    gl.useProgram(cp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.camTex);
    gl.uniform1i(u.u_camera, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(u.u_mask, 1);
    gl.uniform2f(u.u_resolution, f.width, f.height);
    gl.uniform1f(u.u_time, f.t);
    const dw = cam.dw || 1;
    const dh = cam.dh || 1;
    gl.uniform2f(u.u_uvScale, f.width / dw, f.height / dh);
    gl.uniform2f(u.u_uvOffset, -cam.ox / dw, -cam.oy / dh);
    gl.uniform1f(u.u_mirror, cam.mirrored ? 1 : 0);
    gl.uniform1f(u.u_hasMask, this.hasMask && f.hasMask ? 1 : 0);
    const face = f.face;
    gl.uniform1f(u.u_hasFace, face ? 1 : 0);
    if (face) {
      gl.uniform2f(u.u_faceCenter, face.cx, face.cy);
      gl.uniform2f(u.u_faceSize, face.width, face.height);
      gl.uniform1f(u.u_faceRoll, face.roll);
      gl.uniform2f(u.u_eyeL, face.eyeLX, face.eyeLY);
      gl.uniform2f(u.u_eyeR, face.eyeRX, face.eyeRY);
      gl.uniform2f(u.u_mouth, face.mouthX, face.mouthY);
      gl.uniform2f(u.u_nose, face.noseX, face.noseY);
      gl.uniform1f(u.u_mouthOpen, face.mouthOpen);
    }
    if (custom) this.setCustom(cp, custom);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setCustom(cp: CameraProgram, custom: Uniforms) {
    const gl = this.gl;
    for (const name in custom) {
      let loc = cp.custom.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(cp.prog, name);
        cp.custom.set(name, loc);
      }
      if (!loc) continue;
      const v = custom[name];
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
      else if (v.length % 2 === 0) gl.uniform2fv(loc, v as Float32List);
      else gl.uniform1fv(loc, v as Float32List);
    }
  }

  private layerGL(layer: Layer): LayerGL {
    let lg = this.layers.get(layer);
    if (lg) return lg;
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const attrib = (loc: number, size: number, stride: number, offset: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    };
    if (layer instanceof ParticleSystem) {
      gl.bufferData(gl.ARRAY_BUFFER, layer.instances.byteLength, gl.DYNAMIC_DRAW);
      const stride = INSTANCE_FLOATS * 4;
      attrib(1, 4, stride, 0);
      attrib(2, 4, stride, 16);
      attrib(3, 2, stride, 32);
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, layer.data.byteLength, gl.DYNAMIC_DRAW);
      const stride = LINE_FLOATS * 4;
      attrib(1, 4, stride, 0);
      attrib(2, 1, stride, 16);
      attrib(3, 4, stride, 20);
    }
    gl.bindVertexArray(null);
    lg = { vao, buf, version: -1 };
    this.layers.set(layer, lg);
    return lg;
  }

  private drawLayers(f: Frame, layers: readonly Layer[]) {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    let current: WebGLProgram | null = null;
    for (const layer of layers) {
      const isParticles = layer instanceof ParticleSystem;
      const n = isParticles ? layer.pack() : layer.count;
      if (n === 0) continue;
      const lg = this.layerGL(layer);
      const prog = isParticles ? this.particleProg : this.lineProg;
      if (prog !== current) {
        gl.useProgram(prog);
        gl.uniform2f(isParticles ? this.pLoc.res : this.lLoc.res, f.width, f.height);
        current = prog;
      }
      gl.bindVertexArray(lg.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, lg.buf);
      gl.blendFunc(gl.ONE, layer.blend === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      if (isParticles) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, layer.instances, 0, n * INSTANCE_FLOATS);
        gl.uniform1i(this.pLoc.shape, SHAPE_IDS[layer.shape]);
        gl.uniform1f(this.pLoc.stretch, layer.stretch);
      } else {
        if (lg.version !== layer.version) {
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, layer.data, 0, n * LINE_FLOATS);
          lg.version = layer.version;
        }
        gl.uniform1f(this.lLoc.glow, layer.glow);
        gl.uniform1f(this.lLoc.core, layer.core);
      }
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  /** Free GPU buffers of layers that belong to a finished effect. */
  release(layers: readonly Layer[]) {
    const gl = this.gl;
    for (const l of layers) {
      const lg = this.layers.get(l);
      if (!lg) continue;
      gl.deleteBuffer(lg.buf);
      gl.deleteVertexArray(lg.vao);
      this.layers.delete(l);
    }
  }
}
