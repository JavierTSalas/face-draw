// Drawing helpers shared by the games.

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Big outlined text, centred at (x, y). */
export function bigText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill = '#fff',
  stroke = 'rgba(0,0,0,0.85)',
) {
  g.font = `900 ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(3, size * 0.16);
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export function drawButton(g: CanvasRenderingContext2D, b: Button, fill = '#ffd400', color = '#111') {
  roundRect(g, b.x, b.y, b.w, b.h, b.h / 2);
  g.fillStyle = fill;
  g.fill();
  g.font = `800 ${Math.round(b.h * 0.42)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
}

export const hit = (b: Button | null, x: number, y: number) =>
  !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Floating "+1" style labels. */
export class Popups {
  private items: { text: string; x: number; y: number; t: number; color: string }[] = [];
  add(text: string, x: number, y: number, color = '#fff') {
    this.items.push({ text, x, y, t: 0, color });
  }
  update(dt: number) {
    for (const p of this.items) {
      p.t += dt;
      p.y -= 60 * dt;
    }
    this.items = this.items.filter((p) => p.t < 0.9);
  }
  draw(g: CanvasRenderingContext2D) {
    for (const p of this.items) {
      g.globalAlpha = 1 - p.t / 0.9;
      bigText(g, p.text, p.x, p.y, 28 + p.t * 10, p.color);
    }
    g.globalAlpha = 1;
  }
}
