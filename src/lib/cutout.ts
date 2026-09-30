// Cut the face out of the live camera image and draw it anywhere.
import type { Frame } from '../core/effect';
import type { Face } from '../core/face';

export interface CutoutOptions {
  /** Grow the outline around the face centre (1 = tight face oval). */
  grow?: number;
  /** Sticker-style outline width in output pixels (0 = none). */
  outline?: number;
  outlineColor?: string;
  /** Keep the face's own tilt instead of drawing it upright. */
  keepRoll?: boolean;
  alpha?: number;
}

/**
 * Draw `face` from the current camera image, centred at (x, y), `height` px
 * tall (forehead to chin), rotated by `rotation` radians. By default the face
 * is drawn upright regardless of how the head is tilted.
 */
export function drawFaceCutout(
  g: CanvasRenderingContext2D,
  f: Frame,
  face: Face,
  x: number,
  y: number,
  height: number,
  rotation = 0,
  opts: CutoutOptions = {},
) {
  const cam = f.camera;
  if (!cam.source || face.height < 4) return;
  const grow = opts.grow ?? 1.08;
  const k = height / face.height;
  g.save();
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.translate(x, y);
  g.rotate(rotation - (opts.keepRoll ? 0 : face.roll));
  g.scale(k, k);
  g.translate(-face.cx, -face.cy);
  g.beginPath();
  face.traceOval(g, grow);
  if (opts.outline) {
    g.lineJoin = 'round';
    g.lineWidth = (opts.outline * 2) / k;
    g.strokeStyle = opts.outlineColor ?? '#fff';
    g.stroke();
  }
  g.clip();
  const r = Math.max(face.width, face.height) * 0.62 * grow;
  cam.drawRegion(g, face.cx - r, face.cy - r, r * 2, r * 2);
  g.restore();
}

/**
 * Snapshot the face into a new transparent canvas (upright, square). Use it
 * as a sprite in games or save it with ctx.faces.add().
 */
export function captureFace(f: Frame, face: Face, size = 224, opts: CutoutOptions = {}): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grow = opts.grow ?? 1.08;
  const outline = opts.outline ?? 0;
  // Fit the grown oval (height ~ face.height * grow * 1.05) into the canvas.
  const h = (size - outline * 2 - 4) / (grow * 1.12);
  drawFaceCutout(g, f, face, size / 2, size / 2, h, 0, { ...opts, grow, outline });
  return c;
}
