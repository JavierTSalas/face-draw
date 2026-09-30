// Small math helpers for effects.

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
export const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach: move `a` toward `b`. */
export const approach = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);

/** HSL (h in 0..1) to a 0xRRGGBB number, for particle colors. */
export function hsl(h: number, s = 1, l = 0.5): number {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Critically damped-ish spring for bouncy motion. */
export class Spring {
  v = 0;
  constructor(
    public x = 0,
    public stiffness = 120,
    public damping = 10,
  ) {}
  update(target: number, dt: number) {
    const a = (target - this.x) * this.stiffness - this.v * this.damping;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}
