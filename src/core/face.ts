// Screen-space face model built from one tracking result.
import { FACE_OVAL, LM } from './landmarks';
import {
  BLENDSHAPE_INDEX,
  NUM_BLENDSHAPES,
  NUM_LANDMARKS,
  type BlendshapeName,
} from '../tracking/protocol';

/**
 * How the camera image is laid out on screen ("object-fit: cover", optionally
 * mirrored). All values are CSS pixels.
 */
export class CameraView {
  /** Current camera image (the exact frame the landmarks came from). */
  source: CanvasImageSource | null = null;
  srcW = 0;
  srcH = 0;
  mirrored = true;
  /** Drawn image rectangle on screen (may extend beyond the viewport). */
  ox = 0;
  oy = 0;
  dw = 0;
  dh = 0;
  /** Viewport size. */
  width = 0;
  height = 0;

  layout(srcW: number, srcH: number, width: number, height: number, mirrored: boolean) {
    this.srcW = srcW;
    this.srcH = srcH;
    this.width = width;
    this.height = height;
    this.mirrored = mirrored;
    if (!srcW || !srcH) return;
    const s = Math.max(width / srcW, height / srcH);
    this.dw = srcW * s;
    this.dh = srcH * s;
    this.ox = (width - this.dw) / 2;
    this.oy = (height - this.dh) / 2;
  }

  /** Normalised image x (0..1) to screen x. */
  sx(nx: number) {
    return this.ox + (this.mirrored ? 1 - nx : nx) * this.dw;
  }
  sy(ny: number) {
    return this.oy + ny * this.dh;
  }
  /** Screen point to normalised image coordinates. */
  toImage(x: number, y: number): [number, number] {
    const nx = (x - this.ox) / this.dw;
    return [this.mirrored ? 1 - nx : nx, (y - this.oy) / this.dh];
  }

  /**
   * Draw the camera image as it appears on screen. Use with a clip path to
   * cut regions out of the live video.
   */
  draw(g: CanvasRenderingContext2D) {
    if (!this.source) return;
    g.save();
    if (this.mirrored) {
      g.translate(this.ox * 2 + this.dw, 0);
      g.scale(-1, 1);
    }
    g.drawImage(this.source, this.ox, this.oy, this.dw, this.dh);
    g.restore();
  }

  /**
   * Draw only the part of the camera image under the screen rect (x, y, w, h).
   * Much cheaper than draw() when you only need a small area.
   */
  drawRegion(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    if (!this.source || !this.dw) return;
    const kx = this.srcW / this.dw;
    const ky = this.srcH / this.dh;
    let sx = (x - this.ox) * kx;
    const sy = (y - this.oy) * ky;
    const sw = w * kx;
    const sh = h * ky;
    g.save();
    if (this.mirrored) {
      sx = this.srcW - sx - sw;
      g.translate(x * 2 + w, 0);
      g.scale(-1, 1);
    }
    g.drawImage(this.source, sx, sy, sw, sh, x, y, w, h);
    g.restore();
  }
}

export class Face {
  /** Index of this face in the tracker output (0 = most prominent). */
  index = 0;
  /** 478 x (x, y, z) in CSS pixels. z < 0 is towards the camera. */
  readonly p = new Float32Array(NUM_LANDMARKS * 3);
  /** Raw normalised landmarks straight from the tracker. */
  readonly n = new Float32Array(NUM_LANDMARKS * 3);
  /** Blendshape scores 0..1, see BLENDSHAPES. */
  readonly blend = new Float32Array(NUM_BLENDSHAPES);
  /** Facial transformation matrix (column-major 4x4). */
  readonly matrix = new Float32Array(16);

  /** Face centre (between forehead top and chin), CSS px. */
  cx = 0;
  cy = 0;
  /** Cheek-to-cheek width and forehead-to-chin height, CSS px. */
  width = 0;
  height = 0;
  /** Screen rotation of the face in radians (0 = upright, + = clockwise). */
  roll = 0;
  /** Approximate head turn, -1 (nose to screen-left) .. 1 (screen-right). */
  yaw = 0;
  /** Approximate head tilt, -1 (looking up) .. 1 (looking down). */
  pitch = 0;
  /** Distance between the pupils, CSS px. Good unit for sizing things. */
  eyeDist = 0;

  /** Screen-left / screen-right pupil, mouth centre and nose tip (CSS px). */
  eyeLX = 0;
  eyeLY = 0;
  eyeRX = 0;
  eyeRY = 0;
  mouthX = 0;
  mouthY = 0;
  noseX = 0;
  noseY = 0;

  /** Gesture state with hysteresis (set by the engine). */
  mouthIsOpen = false;
  eyesClosed = false;
  browsUp = false;

  private oval: Path2D | null = null;
  private mirrored = true;

  x(i: number) {
    return this.p[i * 3];
  }
  y(i: number) {
    return this.p[i * 3 + 1];
  }
  z(i: number) {
    return this.p[i * 3 + 2];
  }

  /** Blendshape score by name, e.g. face.bs('jawOpen'). */
  bs(name: BlendshapeName) {
    return this.blend[BLENDSHAPE_INDEX[name]];
  }
  /** 0 (closed) .. 1 (wide open). */
  get mouthOpen() {
    return this.blend[BLENDSHAPE_INDEX.jawOpen];
  }
  get smile() {
    return (this.blend[BLENDSHAPE_INDEX.mouthSmileLeft] + this.blend[BLENDSHAPE_INDEX.mouthSmileRight]) * 0.5;
  }
  get blink() {
    return (this.blend[BLENDSHAPE_INDEX.eyeBlinkLeft] + this.blend[BLENDSHAPE_INDEX.eyeBlinkRight]) * 0.5;
  }
  get browRaise() {
    return this.blend[BLENDSHAPE_INDEX.browInnerUp];
  }
  get pucker() {
    return this.blend[BLENDSHAPE_INDEX.mouthPucker];
  }

  /** Unit vector pointing "up" out of the top of the head, on screen. */
  get upX() {
    return Math.sin(this.roll);
  }
  get upY() {
    return -Math.cos(this.roll);
  }

  /** Ordered face outline as a Path2D (cached until the next update). */
  get ovalPath(): Path2D {
    if (!this.oval) {
      const path = new Path2D();
      for (let k = 0; k < FACE_OVAL.length; k++) {
        const i = FACE_OVAL[k];
        if (k === 0) path.moveTo(this.x(i), this.y(i));
        else path.lineTo(this.x(i), this.y(i));
      }
      path.closePath();
      this.oval = path;
    }
    return this.oval;
  }

  /** Trace a (optionally scaled) face outline into the current path. */
  traceOval(g: CanvasRenderingContext2D | Path2D, scale = 1) {
    for (let k = 0; k < FACE_OVAL.length; k++) {
      const i = FACE_OVAL[k];
      const x = this.cx + (this.x(i) - this.cx) * scale;
      const y = this.cy + (this.y(i) - this.cy) * scale;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  }

  /** @internal Fill from packed tracker output. */
  update(
    landmarks: Float32Array,
    blend: Float32Array,
    matrices: Float32Array,
    index: number,
    view: CameraView,
  ) {
    this.index = index;
    this.mirrored = view.mirrored;
    const base = index * NUM_LANDMARKS * 3;
    this.n.set(landmarks.subarray(base, base + NUM_LANDMARKS * 3));
    this.blend.set(blend.subarray(index * NUM_BLENDSHAPES, (index + 1) * NUM_BLENDSHAPES));
    if (matrices.length >= (index + 1) * 16) this.matrix.set(matrices.subarray(index * 16, index * 16 + 16));
    this.relayout(view);
  }

  /** @internal Recompute screen positions (after a resize, for example). */
  relayout(view: CameraView) {
    const n = this.n;
    const p = this.p;
    const { ox, oy, dw, dh } = view;
    const m = view.mirrored;
    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const j = i * 3;
      p[j] = ox + (m ? 1 - n[j] : n[j]) * dw;
      p[j + 1] = oy + n[j + 1] * dh;
      p[j + 2] = n[j + 2] * dw;
    }
    this.oval = null;
    this.mirrored = m;
    this.derive();
  }

  private derive() {
    const m = this.mirrored;
    const eyeL = m ? LM.irisLeft : LM.irisRight;
    const eyeR = m ? LM.irisRight : LM.irisLeft;
    const cheekL = m ? LM.cheekLeft : LM.cheekRight;
    const cheekR = m ? LM.cheekRight : LM.cheekLeft;

    this.eyeLX = this.x(eyeL);
    this.eyeLY = this.y(eyeL);
    this.eyeRX = this.x(eyeR);
    this.eyeRY = this.y(eyeR);
    this.mouthX = (this.x(LM.upperLipInner) + this.x(LM.lowerLipInner)) * 0.5;
    this.mouthY = (this.y(LM.upperLipInner) + this.y(LM.lowerLipInner)) * 0.5;
    this.noseX = this.x(LM.noseTip);
    this.noseY = this.y(LM.noseTip);

    const tx = this.x(LM.foreheadTop);
    const ty = this.y(LM.foreheadTop);
    const bx = this.x(LM.chin);
    const by = this.y(LM.chin);
    this.cx = (tx + bx) * 0.5;
    this.cy = (ty + by) * 0.5;
    this.height = Math.hypot(bx - tx, by - ty);
    const clx = this.x(cheekL);
    const cly = this.y(cheekL);
    const crx = this.x(cheekR);
    const cry = this.y(cheekR);
    this.width = Math.hypot(crx - clx, cry - cly);

    const ex = this.eyeRX - this.eyeLX;
    const ey = this.eyeRY - this.eyeLY;
    this.eyeDist = Math.hypot(ex, ey);
    this.roll = Math.atan2(ey, ex);

    // Yaw: where the nose sits between the cheeks along the face's x axis.
    const ux = Math.cos(this.roll);
    const uy = Math.sin(this.roll);
    const span = (crx - clx) * ux + (cry - cly) * uy || 1;
    const t = ((this.noseX - clx) * ux + (this.noseY - cly) * uy) / span;
    this.yaw = clamp((t - 0.5) * 2.2, -1, 1);

    // Pitch: where the nose sits between the eye line and the chin.
    const vx = -uy;
    const vy = ux;
    const emx = (this.eyeLX + this.eyeRX) * 0.5;
    const emy = (this.eyeLY + this.eyeRY) * 0.5;
    const down = (bx - emx) * vx + (by - emy) * vy || 1;
    const s = ((this.noseX - emx) * vx + (this.noseY - emy) * vy) / down;
    this.pitch = clamp((s - 0.34) * 4, -1, 1);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
