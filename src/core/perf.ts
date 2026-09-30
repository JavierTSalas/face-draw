// Frame-rate measurement and adaptive render resolution.

export class RateMeter {
  private count = 0;
  private start = performance.now();
  rate = 0;
  tick(now = performance.now()) {
    this.count++;
    const el = now - this.start;
    if (el >= 500) {
      this.rate = (this.count * 1000) / el;
      this.count = 0;
      this.start = now;
    }
  }
}

/** Exponential moving average. */
export class Ema {
  value = 0;
  private init = false;
  constructor(private k = 0.1) {}
  push(v: number) {
    if (!this.init) {
      this.value = v;
      this.init = true;
    } else this.value += (v - this.value) * this.k;
    return this.value;
  }
}

/**
 * Lowers the GPU canvas resolution when frames take too long and raises it
 * again when there is headroom. Frame rate beats sharpness.
 */
export class AdaptiveScale {
  scale: number;
  private frameMs = new Ema(0.05);
  private refreshMs = 1000 / 60;
  private lastChange = 0;

  constructor(
    public min: number,
    public max: number,
  ) {
    this.scale = max;
  }

  setRange(min: number, max: number) {
    this.min = min;
    this.max = max;
    this.scale = Math.min(Math.max(this.scale, min), max);
  }

  /** Feed the time between frames. Returns true when the scale changed. */
  push(dtMs: number, now: number): boolean {
    if (dtMs <= 0 || dtMs > 250) return false;
    // Track the display refresh interval (fastest sustained frame time).
    if (dtMs < this.refreshMs) this.refreshMs = this.refreshMs * 0.9 + dtMs * 0.1;
    else this.refreshMs += (Math.min(dtMs, 1000 / 30) - this.refreshMs) * 0.001;
    const avg = this.frameMs.push(dtMs);
    if (now - this.lastChange < 1500) return false;
    const budget = this.refreshMs;
    if (avg > budget * 1.3 && this.scale > this.min) {
      this.scale = Math.max(this.min, this.scale - 0.15);
      this.lastChange = now;
      return true;
    }
    if (avg < budget * 1.08 && this.scale < this.max && now - this.lastChange > 6000) {
      this.scale = Math.min(this.max, this.scale + 0.1);
      this.lastChange = now;
      return true;
    }
    return false;
  }
}
