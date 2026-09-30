// Cut the face out of the live camera image and draw it anywhere.
import type { Frame } from '../core/effect';
import type { Face } from '../core/face';
import { softEllipse } from './sprites';

export interface CutoutOptions {
  /** Grow the outline around the face centre (1 = tight face oval). */
  grow?: number;
  /** Sticker-style outline width in output pixels (0 = none). */
  outline?: number;
  outlineColor?: string;
  /** Keep the face's own tilt instead of drawing it upright. */
  keepRoll?: boolean;
  /** Soft, blended edge instead of a crisp outline (for face swaps). */
  feather?: boolean;
  alpha?: number;
}

/** Oval growth used for saved faces (see captureFace). */
const CAPTURE_GROW = 1.08;
/** Face height (forehead to chin) as a fraction of a saved face image's size. */
export const SAVED_FACE_HEIGHT = 1 / (CAPTURE_GROW * 1.14);

let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(size: number) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== size) scratch.width = scratch.height = size;
  return scratch;
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
  if (opts.feather) {
    // Render upright into a scratch canvas, soften the edge, then place it.
    const size = 256;
    const c = scratchCanvas(size);
    const sg = c.getContext('2d')!;
    sg.clearRect(0, 0, size, size);
    const h = size * SAVED_FACE_HEIGHT;
    drawFaceCutout(sg, f, face, size / 2, size / 2, h, 0, { grow: opts.grow ?? 1.04 });
    sg.globalCompositeOperation = 'destination-in';
    const ew = (face.width / face.height) * h * 1.02;
    sg.drawImage(softEllipse(), size / 2 - ew / 2, size / 2 - h * 0.6, ew, h * 1.15);
    sg.globalCompositeOperation = 'source-over';
    drawSavedFace(g, c, x, y, height, rotation + (opts.keepRoll ? face.roll : 0), opts.alpha);
    return;
  }
  const grow = opts.grow ?? CAPTURE_GROW;
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
 * Draw a saved face image (from captureFace / ctx.faces) so that the face is
 * `height` px tall, centred at (x, y).
 */
export function drawSavedFace(
  g: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  height: number,
  rotation = 0,
  alpha?: number,
) {
  const size = height / SAVED_FACE_HEIGHT;
  g.save();
  if (alpha !== undefined) g.globalAlpha = alpha;
  g.translate(x, y);
  if (rotation) g.rotate(rotation);
  g.drawImage(image, -size / 2, -size / 2, size, size);
  g.restore();
}

/**
 * Snapshot the face into a new transparent, upright, square canvas. The face
 * is `size * SAVED_FACE_HEIGHT` px tall. Save it with ctx.faces.add().
 */
export function captureFace(f: Frame, face: Face, size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  drawFaceCutout(g, f, face, size / 2, size / 2, size * SAVED_FACE_HEIGHT, 0, { grow: CAPTURE_GROW });
  return c;
}
