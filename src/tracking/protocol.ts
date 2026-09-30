// Messages and data shared between the main thread and the tracking worker.

export const NUM_LANDMARKS = 478;

/** ARKit-style blendshape names, in the order we pack them. */
export const BLENDSHAPES = [
  '_neutral',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
] as const;

export type BlendshapeName = (typeof BLENDSHAPES)[number];
export const NUM_BLENDSHAPES = BLENDSHAPES.length;
export const BLENDSHAPE_INDEX: Record<BlendshapeName, number> = Object.fromEntries(
  BLENDSHAPES.map((n, i) => [n, i]),
) as Record<BlendshapeName, number>;

export type Delegate = 'GPU' | 'CPU';

export interface TrackerInit {
  /** Absolute URL of the folder that holds the MediaPipe wasm files. */
  wasmBase: string;
  faceModel: string;
  segModel: string;
  delegate: Delegate;
  numFaces: number;
}

export interface TrackResult {
  /** Size of the analysed image in pixels. */
  width: number;
  height: number;
  numFaces: number;
  /** numFaces * 478 * 3 floats: x, y in [0,1] image space, z relative depth. */
  landmarks: Float32Array;
  /** numFaces * 52 floats in BLENDSHAPES order. */
  blendshapes: Float32Array;
  /** numFaces * 16 floats, column-major facial transformation matrices. */
  matrices: Float32Array;
  /** Person mask (0..255), or null when segmentation is off or still loading. */
  mask: Uint8Array | null;
  maskWidth: number;
  maskHeight: number;
  faceMs: number;
  segMs: number;
}

export type ToWorker =
  | { type: 'init'; init: TrackerInit }
  | { type: 'frame'; bitmap: ImageBitmap; ts: number; wantMask: boolean }
  | { type: 'numFaces'; numFaces: number }
  | { type: 'preload' };

export type FromWorker =
  | { type: 'ready'; delegate: Delegate }
  | { type: 'error'; message: string; fatal: boolean }
  | { type: 'result'; bitmap: ImageBitmap; result: TrackResult };

export function emptyResult(width = 0, height = 0): TrackResult {
  return {
    width,
    height,
    numFaces: 0,
    landmarks: new Float32Array(0),
    blendshapes: new Float32Array(0),
    matrices: new Float32Array(0),
    mask: null,
    maskWidth: 0,
    maskHeight: 0,
    faceMs: 0,
    segMs: 0,
  };
}

export function resultTransferables(r: TrackResult): Transferable[] {
  const t: Transferable[] = [r.landmarks.buffer, r.blendshapes.buffer, r.matrices.buffer];
  if (r.mask) t.push(r.mask.buffer);
  return t;
}
