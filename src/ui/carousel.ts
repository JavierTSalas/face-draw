// Snapchat-style effect picker: swipe, the item under the ring is active,
// tapping the active item is the shutter.
import type { EffectDefinition } from '../core/effect';

export class Carousel {
  private items: HTMLButtonElement[] = [];
  private selected = -1;
  private settleTimer = 0;
  private scrolling = false;
  onSelect: (def: EffectDefinition) => void = () => {};
  onPreview: (def: EffectDefinition) => void = () => {};
  onShutter: () => void = () => {};

  constructor(
    private el: HTMLElement,
    private effects: EffectDefinition[],
  ) {
    let lastKind = effects[0]?.kind ?? 'filter';
    effects.forEach((def, i) => {
      if ((def.kind ?? 'filter') !== lastKind) {
        const sep = document.createElement('div');
        sep.className = 'fx-sep';
        el.appendChild(sep);
        lastKind = def.kind ?? 'filter';
      }
      const b = document.createElement('button');
      b.className = 'fx-item' + (def.kind === 'game' ? ' game' : '');
      b.textContent = def.icon;
      b.title = def.name;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', def.name);
      b.addEventListener('click', () => {
        if (i === this.selected && !this.scrolling) this.onShutter();
        else this.scrollTo(i, true);
      });
      el.appendChild(b);
      this.items.push(b);
    });
    el.addEventListener('scroll', () => this.onScroll(), { passive: true });
    window.addEventListener('resize', () => this.selected >= 0 && this.scrollTo(this.selected, false));
  }

  get current() {
    return this.effects[this.selected];
  }

  /** Select by index without animation (initial state, URL hash). */
  select(i: number) {
    this.scrollTo(i, false);
    this.commit(i);
  }

  step(delta: number) {
    const i = Math.min(this.items.length - 1, Math.max(0, this.selected + delta));
    this.scrollTo(i, true);
  }

  private scrollTo(i: number, smooth: boolean) {
    const b = this.items[i];
    if (!b) return;
    const left = b.offsetLeft + b.offsetWidth / 2 - this.el.clientWidth / 2;
    this.el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }

  private nearest() {
    const mid = this.el.scrollLeft + this.el.clientWidth / 2;
    let best = 0;
    let bestD = Infinity;
    this.items.forEach((b, i) => {
      const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private onScroll() {
    this.scrolling = true;
    const i = this.nearest();
    this.items.forEach((b, k) => b.classList.toggle('selected', k === i));
    this.onPreview(this.effects[i]);
    clearTimeout(this.settleTimer);
    // Switch effects once the swipe settles, not on every item passed.
    this.settleTimer = window.setTimeout(() => {
      this.scrolling = false;
      this.commit(this.nearest());
    }, 140);
  }

  private commit(i: number) {
    this.items.forEach((b, k) => b.classList.toggle('selected', k === i));
    if (i === this.selected) return;
    this.selected = i;
    this.onSelect(this.effects[i]);
  }
}
