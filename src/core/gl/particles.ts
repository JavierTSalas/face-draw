// Allocation-free particle simulation (struct-of-arrays). Rendering happens
// on the GPU in one instanced draw call per system (see renderer.ts).

export type ParticleShape = 'glow' | 'spark' | 'dot' | 'flake' | 'ring' | 'smoke' | 'star';

export const SHAPE_IDS: Record<ParticleShape, number> = {
  glow: 0,
  spark: 1,
  dot: 2,
  flake: 3,
  ring: 4,
  smoke: 5,
  star: 6,
};

export interface ParticleConfig {
  /** Capacity. Extra emits are dropped. Default 1500. */
  max?: number;
  shape?: ParticleShape;
  /** 'add' glows (fire, sparks); 'normal' covers (snow, smoke). */
  blend?: 'add' | 'normal';
  /** Downward acceleration in px/s². Negative floats up. */
  gravity?: number;
  /** Velocity damping per second (0 = none, 3 = strong). */
  drag?: number;
  /** Size multiplier reached at end of life (1 = constant). */
  endScale?: number;
  /** Fade-out curve: alpha *= remaining^fadePower. 0 = no fade. */
  fadePower?: number;
  /** Seconds to fade in. */
  fadeIn?: number;
  /** Colour reached at the end of life (hex), e.g. yellow -> red embers. */
  endColor?: number;
  /** 'spark' shape: extra length in px per px/s of speed. */
  stretch?: number;
  /** Random sideways jitter in px/s² (flicker for flames and snow). */
  turbulence?: number;
}

/** Floats per instance sent to the GPU: x, y, size, rot, r, g, b, a, vx, vy. */
export const INSTANCE_FLOATS = 10;

export class ParticleSystem {
  readonly max: number;
  readonly shape: ParticleShape;
  readonly blend: 'add' | 'normal';
  gravity: number;
  drag: number;
  endScale: number;
  fadePower: number;
  fadeIn: number;
  stretch: number;
  turbulence: number;
  private endR = -1;
  private endG = 0;
  private endB = 0;

  count = 0;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private age: Float32Array;
  private ttl: Float32Array;
  private size: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private r: Float32Array;
  private g: Float32Array;
  private b: Float32Array;
  private a: Float32Array;
  /** @internal packed GPU data, filled by pack(). */
  readonly instances: Float32Array;

  constructor(cfg: ParticleConfig = {}) {
    const n = (this.max = cfg.max ?? 1500);
    this.shape = cfg.shape ?? 'glow';
    this.blend = cfg.blend ?? 'add';
    this.gravity = cfg.gravity ?? 0;
    this.drag = cfg.drag ?? 0;
    this.endScale = cfg.endScale ?? 1;
    this.fadePower = cfg.fadePower ?? 1;
    this.fadeIn = cfg.fadeIn ?? 0;
    this.stretch = cfg.stretch ?? 0.04;
    this.turbulence = cfg.turbulence ?? 0;
    if (cfg.endColor !== undefined) this.setEndColor(cfg.endColor);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.age = new Float32Array(n);
    this.ttl = new Float32Array(n);
    this.size = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n);
    this.instances = new Float32Array(n * INSTANCE_FLOATS);
  }

  setEndColor(hex: number | null) {
    if (hex === null) {
      this.endR = -1;
      return;
    }
    this.endR = ((hex >> 16) & 255) / 255;
    this.endG = ((hex >> 8) & 255) / 255;
    this.endB = (hex & 255) / 255;
  }

  /**
   * Spawn one particle. Positions in CSS px, velocity in px/s, life in
   * seconds, size = radius in px, color as 0xRRGGBB.
   */
  emit(
    x: number,
    y: number,
    vx = 0,
    vy = 0,
    life = 1,
    size = 8,
    color = 0xffffff,
    alpha = 1,
    rotation = 0,
    spin = 0,
  ) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.ttl[i] = life;
    this.size[i] = size;
    this.rot[i] = rotation;
    this.spin[i] = spin;
    this.r[i] = ((color >> 16) & 255) / 255;
    this.g[i] = ((color >> 8) & 255) / 255;
    this.b[i] = (color & 255) / 255;
    this.a[i] = alpha;
  }

  /** Emit `n` particles in a circle burst. */
  burst(
    x: number,
    y: number,
    n: number,
    speed: number,
    life: number,
    size: number,
    color: number | (() => number),
    speedJitter = 0.5,
  ) {
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const s = speed * (1 - speedJitter + Math.random() * speedJitter);
      const c = typeof color === 'function' ? color() : color;
      this.emit(x, y, Math.cos(ang) * s, Math.sin(ang) * s, life * (0.7 + Math.random() * 0.6), size, c);
    }
  }

  clear() {
    this.count = 0;
  }

  update(dt: number) {
    const damp = this.drag > 0 ? Math.exp(-this.drag * dt) : 1;
    const gdt = this.gravity * dt;
    const turb = this.turbulence * dt;
    let i = 0;
    while (i < this.count) {
      const age = (this.age[i] += dt);
      if (age >= this.ttl[i]) {
        this.kill(i);
        continue;
      }
      let vx = this.vx[i] * damp;
      let vy = this.vy[i] * damp + gdt;
      if (turb) vx += (Math.random() - 0.5) * turb;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.x[i] += vx * dt;
      this.y[i] += vy * dt;
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
  }

  private kill(i: number) {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.age[i] = this.age[last];
    this.ttl[i] = this.ttl[last];
    this.size[i] = this.size[last];
    this.rot[i] = this.rot[last];
    this.spin[i] = this.spin[last];
    this.r[i] = this.r[last];
    this.g[i] = this.g[last];
    this.b[i] = this.b[last];
    this.a[i] = this.a[last];
  }

  /** @internal Write GPU instance data. Returns the instance count. */
  pack(): number {
    const out = this.instances;
    const hasEnd = this.endR >= 0;
    for (let i = 0, o = 0; i < this.count; i++, o += INSTANCE_FLOATS) {
      const lifeT = this.age[i] / this.ttl[i];
      const remain = 1 - lifeT;
      let alpha = this.a[i];
      if (this.fadePower > 0) alpha *= Math.pow(remain, this.fadePower);
      if (this.fadeIn > 0 && this.age[i] < this.fadeIn) alpha *= this.age[i] / this.fadeIn;
      out[o] = this.x[i];
      out[o + 1] = this.y[i];
      out[o + 2] = this.size[i] * (this.endScale + (1 - this.endScale) * remain);
      out[o + 3] = this.rot[i];
      if (hasEnd) {
        out[o + 4] = this.r[i] + (this.endR - this.r[i]) * lifeT;
        out[o + 5] = this.g[i] + (this.endG - this.g[i]) * lifeT;
        out[o + 6] = this.b[i] + (this.endB - this.b[i]) * lifeT;
      } else {
        out[o + 4] = this.r[i];
        out[o + 5] = this.g[i];
        out[o + 6] = this.b[i];
      }
      out[o + 7] = alpha;
      out[o + 8] = this.vx[i];
      out[o + 9] = this.vy[i];
    }
    return this.count;
  }
}
