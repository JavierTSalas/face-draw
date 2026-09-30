/// <reference lib="webworker" />
// Runs MediaPipe off the main thread so rendering never waits on inference.
import { TrackerCore } from './core';
import { emptyResult, resultTransferables, type FromWorker, type ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let core: TrackerCore | null = null;

function post(msg: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      try {
        const c = new TrackerCore(msg.init, true);
        const delegate = await c.start();
        core = c;
        post({ type: 'ready', delegate });
      } catch (err) {
        post({ type: 'error', message: String((err as Error)?.message ?? err), fatal: true });
      }
      break;
    }
    case 'frame': {
      const { bitmap } = msg;
      let result = emptyResult(bitmap.width, bitmap.height);
      if (core) {
        try {
          result = core.process(bitmap, msg.ts, msg.wantMask);
        } catch (err) {
          post({ type: 'error', message: String((err as Error)?.message ?? err), fatal: false });
        }
      }
      // Hand the frame back so the main thread can draw exactly what was analysed.
      post({ type: 'result', bitmap, result }, [bitmap, ...resultTransferables(result)]);
      break;
    }
    case 'numFaces': {
      core?.setNumFaces(msg.numFaces).catch((err) => console.warn(err));
      break;
    }
  }
};
