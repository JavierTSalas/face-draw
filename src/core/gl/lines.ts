// Batched GPU line segments with optional neon glow. Thousands of segments
// cost one instanced draw call (e.g. a full face-mesh wireframe).

export interface LineConfig {
  /** Capacity in segments. Default 4000. */
  max?: number;
  blend?: 'add' | 'normal';
  /** Halo size as a multiple of the line width (0 = crisp line). */
  glow?: number;
  /** How much the line centre is pushed toward white (neon core). */
  core?: number;
}

/** Floats per segment: x0, y0, x1, y1, width, r, g, b, a. */
export const LINE_FLOATS = 9;

export class LineBatch {
  readonly max: number;
  readonly blend: 'add' | 'normal';
  glow: number;
  core: number;
  count = 0;
  /** Bumped on every change so the renderer only re-uploads when needed. */
  version = 0;
  readonly data: Float32Array;

  constructor(cfg: LineConfig = {}) {
    this.max = cfg.max ?? 4000;
    this.blend = cfg.blend ?? 'add';
    this.glow = cfg.glow ?? 2;
    this.core = cfg.core ?? 0.5;
    this.data = new Float32Array(this.max * LINE_FLOATS);
  }

  clear() {
    this.count = 0;
    this.version++;
  }

  /** Add one segment. Coordinates and width in CSS px, colour 0xRRGGBB. */
  add(x0: number, y0: number, x1: number, y1: number, width = 2, color = 0xffffff, alpha = 1) {
    if (this.count >= this.max) return;
    const o = this.count++ * LINE_FLOATS;
    const d = this.data;
    d[o] = x0;
    d[o + 1] = y0;
    d[o + 2] = x1;
    d[o + 3] = y1;
    d[o + 4] = width;
    d[o + 5] = ((color >> 16) & 255) / 255;
    d[o + 6] = ((color >> 8) & 255) / 255;
    d[o + 7] = (color & 255) / 255;
    d[o + 8] = alpha;
    this.version++;
  }
}
