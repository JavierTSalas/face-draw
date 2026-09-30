// Saved face cut-outs, shared between all effects and games.

export interface SavedFace {
  id: string;
  image: HTMLCanvasElement;
  created: number;
}

const KEY = 'facedraw.faces.v1';
const MAX_FACES = 6;

export class FaceStore {
  faces: SavedFace[] = [];
  private listeners = new Set<() => void>();

  async load() {
    let list: { id: string; url: string; created: number }[] = [];
    try {
      list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      return;
    }
    const loaded = await Promise.all(
      list.map(async (e) => {
        try {
          const img = new Image();
          img.src = e.url;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d')!.drawImage(img, 0, 0);
          return { id: e.id, image: c, created: e.created } as SavedFace;
        } catch {
          return null;
        }
      }),
    );
    this.faces = loaded.filter((f): f is SavedFace => !!f);
    this.emit();
  }

  /** Most recently saved face, or null. */
  get latest(): SavedFace | null {
    return this.faces[0] ?? null;
  }

  add(image: HTMLCanvasElement): SavedFace {
    const face = { id: Math.random().toString(36).slice(2, 10), image, created: Date.now() };
    this.faces.unshift(face);
    if (this.faces.length > MAX_FACES) this.faces.length = MAX_FACES;
    this.persist();
    this.emit();
    return face;
  }

  remove(id: string) {
    this.faces = this.faces.filter((f) => f.id !== id);
    this.persist();
    this.emit();
  }

  clear() {
    this.faces = [];
    this.persist();
    this.emit();
  }

  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    this.listeners.forEach((cb) => cb());
  }

  private persist() {
    // Drop the oldest faces until the list fits in localStorage.
    for (let n = this.faces.length; n >= 0; n--) {
      try {
        const list = this.faces.slice(0, n).map((f) => ({
          id: f.id,
          url: f.image.toDataURL('image/webp', 0.85),
          created: f.created,
        }));
        localStorage.setItem(KEY, JSON.stringify(list));
        return;
      } catch {
        /* quota exceeded: try fewer */
      }
    }
  }
}
