/// <reference lib="webworker" />
// Runs MediaPipe off the main thread so rendering never waits on inference.
import { TrackerCore } from './core';
import {
  emptyResult,
  resultTransferables,
  type FromWorker,
  type ToWorker,
  type TrackerInit,
} from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let core: TrackerCore | null = null;
let initMsg: TrackerInit | null = null;
let failures = 0;
let restarting = false;

/** Some GPUs initialise fine and then fail every frame: switch to CPU. */
async function fallbackToCpu() {
  if (!initMsg || restarting) return;
  restarting = true;
  try {
    const c = new TrackerCore({ ...initMsg, delegate: 'CPU' }, true);
    const delegate = await c.start();
    core = c;
    failures = 0;
    post({ type: 'ready', delegate });
  } catch (err) {
    post({ type: 'error', message: String((err as Error)?.message ?? err), fatal: false });
  } finally {
    restarting = false;
  }
}

function post(msg: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      initMsg = { ...msg.init };
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
      if (core && !restarting) {
        try {
          result = core.process(bitmap, msg.ts, msg.wantMask);
          failures = 0;
        } catch (err) {
          post({ type: 'error', message: String((err as Error)?.message ?? err), fatal: false });
          if (++failures >= 5 && core.delegate === 'GPU') fallbackToCpu();
        }
      }
      // Hand the frame back so the main thread can draw exactly what was analysed.
      post({ type: 'result', bitmap, result }, [bitmap, ...resultTransferables(result)]);
      break;
    }
    case 'preload': {
      core?.preload();
      break;
    }
    case 'numFaces': {
      core?.setNumFaces(msg.numFaces).catch((err) => console.warn(err));
      break;
    }
  }
};
