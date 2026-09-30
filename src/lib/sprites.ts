// Cached sprites rendered once and reused every frame (drawImage is cheap).

const emojiCache = new Map<string, HTMLCanvasElement>();

/** An emoji rendered to a canvas `size` px wide (cached). */
export function emojiSprite(char: string, size = 96): HTMLCanvasElement {
  const key = `${char}@${size}`;
  let c = emojiCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.floor(size * 0.8)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(char, size / 2, size / 2 + size * 0.05);
  emojiCache.set(key, c);
  return c;
}

/** Draw a cached emoji centred at (x, y), `size` px wide, rotated. */
export function drawEmoji(g: CanvasRenderingContext2D, char: string, x: number, y: number, size: number, rot = 0) {
  const s = emojiSprite(char, size > 72 ? 128 : 72);
  if (rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.drawImage(s, -size / 2, -size / 2, size, size);
    g.restore();
  } else {
    g.drawImage(s, x - size / 2, y - size / 2, size, size);
  }
}

let softMask: HTMLCanvasElement | null = null;
/** A white ellipse with feathered edges, for soft-edged cut-outs. */
export function softEllipse(): HTMLCanvasElement {
  if (softMask) return softMask;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.72, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  softMask = c;
  return c;
}
