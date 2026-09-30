// MediaPipe wrapper. Runs inside the tracking worker, or on the main thread as
// a fallback on browsers that cannot run it in a worker.
import {
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import {
  BLENDSHAPE_INDEX,
  NUM_BLENDSHAPES,
  NUM_LANDMARKS,
  type BlendshapeName,
  type Delegate,
  type TrackerInit,
  type TrackResult,
} from './protocol';

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
type ImageInput = ImageBitmap | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas;

function makeCanvas(): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1);
  return document.createElement('canvas');
}

/** Blend between frames to hide segmentation flicker (0 = no smoothing). */
const MASK_SMOOTHING = 0.35;

export class TrackerCore {
  delegate: Delegate = 'GPU';
  private fileset!: Fileset;
  private landmarker!: FaceLandmarker;
  private segmenter: ImageSegmenter | null = null;
  private segLoading = false;
  private lastTs = 0;
  private maskAccum: Float32Array | null = null;
  private blendMap: number[] | null = null;

  constructor(
    private init: TrackerInit,
    /** Use the ES-module wasm loader (required inside module workers). */
    private useModuleLoader: boolean,
  ) {}

  async start(): Promise<Delegate> {
    this.fileset = await FilesetResolver.forVisionTasks(this.init.wasmBase, this.useModuleLoader);
    const order: Delegate[] = this.init.delegate === 'GPU' ? ['GPU', 'CPU'] : ['CPU'];
    let lastErr: unknown;
    for (const d of order) {
      try {
        this.landmarker = await this.createLandmarker(d);
        this.delegate = d;
        return d;
      } catch (err) {
        lastErr = err;
        console.warn(`[tracker] ${d} delegate failed`, err);
      }
    }
    throw lastErr;
  }

  private createLandmarker(delegate: Delegate) {
    return FaceLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: this.init.faceModel, delegate },
      canvas: delegate === 'GPU' ? makeCanvas() : undefined,
      runningMode: 'VIDEO',
      numFaces: this.init.numFaces,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  }

  async setNumFaces(n: number) {
    if (n === this.init.numFaces) return;
    this.init.numFaces = n;
    await this.landmarker.setOptions({ numFaces: n });
  }

  private loadSegmenter() {
    if (this.segLoading || this.segmenter) return;
    this.segLoading = true;
    ImageSegmenter.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: this.init.segModel, delegate: this.delegate },
      canvas: this.delegate === 'GPU' ? makeCanvas() : undefined,
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    })
      .then((s) => (this.segmenter = s))
      .catch((err) => console.warn('[tracker] segmenter failed to load', err))
      .finally(() => (this.segLoading = false));
  }

  process(image: ImageInput, ts: number, wantMask: boolean): TrackResult {
    // MediaPipe requires strictly increasing timestamps in VIDEO mode.
    ts = Math.max(ts, this.lastTs + 1);
    this.lastTs = ts;
    const width = 'videoWidth' in image ? image.videoWidth : image.width;
    const height = 'videoHeight' in image ? image.videoHeight : image.height;

    const t0 = performance.now();
    const res = this.landmarker.detectForVideo(image, ts);
    const t1 = performance.now();
    const out = this.pack(res, width, height);
    out.faceMs = t1 - t0;

    if (wantMask) {
      if (!this.segmenter) this.loadSegmenter();
      else {
        const s0 = performance.now();
        this.segment(image, ts, out);
        out.segMs = performance.now() - s0;
      }
    } else {
      this.maskAccum = null;
    }
    return out;
  }

  private pack(res: FaceLandmarkerResult, width: number, height: number): TrackResult {
    const n = res.faceLandmarks.length;
    const landmarks = new Float32Array(n * NUM_LANDMARKS * 3);
    const blendshapes = new Float32Array(n * NUM_BLENDSHAPES);
    const matrices = new Float32Array(n * 16);
    for (let f = 0; f < n; f++) {
      const lms = res.faceLandmarks[f];
      const base = f * NUM_LANDMARKS * 3;
      const count = Math.min(lms.length, NUM_LANDMARKS);
      for (let i = 0; i < count; i++) {
        const p = lms[i];
        landmarks[base + i * 3] = p.x;
        landmarks[base + i * 3 + 1] = p.y;
        landmarks[base + i * 3 + 2] = p.z;
      }
      const cats = res.faceBlendshapes?.[f]?.categories;
      if (cats) {
        if (!this.blendMap) {
          this.blendMap = cats.map((c) => BLENDSHAPE_INDEX[c.categoryName as BlendshapeName] ?? -1);
        }
        for (let i = 0; i < cats.length; i++) {
          const j = this.blendMap[i];
          if (j >= 0) blendshapes[f * NUM_BLENDSHAPES + j] = cats[i].score;
        }
      }
      const m = res.facialTransformationMatrixes?.[f];
      if (m && m.data.length >= 16) matrices.set(m.data.slice(0, 16), f * 16);
    }
    return {
      width,
      height,
      numFaces: n,
      landmarks,
      blendshapes,
      matrices,
      mask: null,
      maskWidth: 0,
      maskHeight: 0,
      faceMs: 0,
      segMs: 0,
    };
  }

  private segment(image: ImageInput, ts: number, out: TrackResult) {
    const res = this.segmenter!.segmentForVideo(image, ts);
    try {
      const masks = res.confidenceMasks;
      if (!masks || masks.length === 0) return;
      // Selfie segmenter: one "person" mask. Multi-class models: last is person-ish.
      const m = masks[masks.length - 1];
      const src = m.getAsFloat32Array();
      const len = m.width * m.height;
      if (!this.maskAccum || this.maskAccum.length !== len) this.maskAccum = new Float32Array(src);
      const acc = this.maskAccum;
      const bytes = new Uint8Array(len);
      const k = MASK_SMOOTHING;
      for (let i = 0; i < len; i++) {
        const v = acc[i] * k + src[i] * (1 - k);
        acc[i] = v;
        bytes[i] = v * 255;
      }
      out.mask = bytes;
      out.maskWidth = m.width;
      out.maskHeight = m.height;
    } finally {
      res.close();
    }
  }
}
