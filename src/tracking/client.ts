// Main-thread handle to the face tracker. Prefers a module worker; falls back
// to running MediaPipe on the main thread when workers cannot host it.
import {
  emptyResult,
  type Delegate,
  type FromWorker,
  type ToWorker,
  type TrackerInit,
  type TrackResult,
} from './protocol';

export interface TrackOutput {
  bitmap: ImageBitmap;
  result: TrackResult;
}

export interface Tracker {
  readonly mode: 'worker' | 'main-thread';
  readonly delegate: Delegate;
  /** Analyse one frame. The same bitmap is returned with the result. */
  track(bitmap: ImageBitmap, ts: number, wantMask: boolean): Promise<TrackOutput>;
  setNumFaces(n: number): void;
  dispose(): void;
  /** Non-fatal tracker messages (errors, delegate switches). */
  onNotice: (msg: string) => void;
}

class WorkerTracker implements Tracker {
  readonly mode = 'worker' as const;
  delegate: Delegate = 'GPU';
  private pending: { resolve: (o: TrackOutput) => void; reject: (e: Error) => void } | null = null;
  onNotice: (msg: string) => void = () => {};

  private constructor(private worker: Worker) {}

  static create(init: TrackerInit): Promise<WorkerTracker> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'tracker' });
      } catch (err) {
        reject(err);
        return;
      }
      const t = new WorkerTracker(worker);
      const timeout = setTimeout(() => reject(new Error('Tracker worker timed out')), 60_000);
      worker.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error(e.message || 'Tracker worker failed to start'));
      };
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          t.delegate = msg.delegate;
          worker.onmessage = (ev: MessageEvent<FromWorker>) => t.handle(ev.data);
          worker.onerror = (ev) => t.fail(new Error(ev.message || 'Tracker worker crashed'));
          resolve(t);
        } else if (msg.type === 'error' && msg.fatal) {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error(msg.message));
        }
      };
      t.post({ type: 'init', init });
    });
  }

  private post(msg: ToWorker, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  private handle(msg: FromWorker) {
    if (msg.type === 'ready') {
      // The worker switched delegate at runtime (GPU -> CPU fallback).
      this.delegate = msg.delegate;
      this.onNotice(`Face tracker switched to ${msg.delegate}`);
    } else if (msg.type === 'result') {
      const p = this.pending;
      this.pending = null;
      p?.resolve({ bitmap: msg.bitmap, result: msg.result });
    } else if (msg.type === 'error') {
      this.onNotice(msg.message);
    }
  }

  /** Reject the in-flight frame so the caller's pipeline never stalls. */
  fail(err: Error) {
    const p = this.pending;
    this.pending = null;
    p?.reject(err);
  }

  track(bitmap: ImageBitmap, ts: number, wantMask: boolean): Promise<TrackOutput> {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.post({ type: 'frame', bitmap, ts, wantMask }, [bitmap]);
    });
  }

  setNumFaces(n: number) {
    this.post({ type: 'numFaces', numFaces: n });
  }

  dispose() {
    this.worker.terminate();
    this.fail(new Error('Tracker disposed'));
  }
}

class MainThreadTracker implements Tracker {
  readonly mode = 'main-thread' as const;
  delegate: Delegate = 'GPU';
  onNotice: (msg: string) => void = () => {};
  private core!: import('./core').TrackerCore;

  static async create(init: TrackerInit): Promise<MainThreadTracker> {
    const { TrackerCore } = await import('./core');
    const t = new MainThreadTracker();
    t.core = new TrackerCore(init, false);
    t.delegate = await t.core.start();
    return t;
  }

  async track(bitmap: ImageBitmap, ts: number, wantMask: boolean): Promise<TrackOutput> {
    try {
      return { bitmap, result: this.core.process(bitmap, ts, wantMask) };
    } catch (err) {
      console.warn(err);
      return { bitmap, result: emptyResult(bitmap.width, bitmap.height) };
    }
  }

  setNumFaces(n: number) {
    this.core.setNumFaces(n).catch((err) => console.warn(err));
  }

  dispose() {}
}

export async function createTracker(
  init: TrackerInit,
  prefer: 'worker' | 'main-thread' = 'worker',
): Promise<Tracker> {
  if (prefer === 'worker' && typeof Worker !== 'undefined') {
    try {
      return await WorkerTracker.create(init);
    } catch (err) {
      console.warn('[tracker] worker mode unavailable, using main thread', err);
    }
  }
  return MainThreadTracker.create({ ...init });
}
