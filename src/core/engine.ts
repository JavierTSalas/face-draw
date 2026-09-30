// The main loop: camera -> tracker (worker) -> effect -> GPU + 2D overlay.
import { Camera, type Facing } from './camera';
import type { EffectContext, EffectDefinition, EffectInstance, Frame, FrameEvents } from './effect';
import { CameraView, Face } from './face';
import { FaceStore } from './faceStore';
import { GLRenderer, type Layer } from './gl/renderer';
import { ParticleSystem, type ParticleConfig } from './gl/particles';
import { LineBatch, type LineConfig } from './gl/lines';
import { AdaptiveScale, Ema, RateMeter } from './perf';
import type { Settings } from './settings';
import { Sfx } from './sfx';
import { createTracker, type Tracker, type TrackOutput } from '../tracking/client';
import type { TrackResult } from '../tracking/protocol';

const MAX_FACES = 4;

export interface EngineStats {
  fps: number;
  trackFps: number;
  faceMs: number;
  segMs: number;
  gpuScale: number;
  delegate: string;
  mode: string;
  camera: string;
}

export interface EngineUI {
  toast(msg: string): void;
  hint(msg: string | null): void;
}

interface ActiveEffect {
  def: EffectDefinition;
  inst: EffectInstance;
  layers: Layer[];
  start: number;
}

export class Engine {
  readonly camera = new Camera();
  readonly view = new CameraView();
  readonly faces = new FaceStore();
  readonly sfx = new Sfx();
  readonly stats: EngineStats = {
    fps: 0,
    trackFps: 0,
    faceMs: 0,
    segMs: 0,
    gpuScale: 1,
    delegate: '-',
    mode: '-',
    camera: '-',
  };
  onEffectChange: (def: EffectDefinition) => void = () => {};

  private renderer: GLRenderer | null = null;
  private g: CanvasRenderingContext2D;
  private tracker: Tracker | null = null;
  private facePool: Face[] = Array.from({ length: MAX_FACES }, () => new Face());
  private activeFaces: Face[] = [];
  private active: ActiveEffect | null = null;
  private frame: Frame;
  private events: FrameEvents = blankEvents();
  private inflight = false;
  private sentFrameId = -1;
  private pending: TrackOutput | null = null;
  private shown: ImageBitmap | null = null;
  private wantMask = false;
  private numFaces = 1;
  private last = 0;
  private width = 0;
  private height = 0;
  private overlayScale = 1;
  private overlayDirty = false;
  private needsResize = true;
  private rafFps = new RateMeter();
  private trackFps = new RateMeter();
  private faceMs = new Ema(0.1);
  private segMs = new Ema(0.1);
  private adaptive = new AdaptiveScale(0.6, 1.5);
  private photoRequest: ((b: Blob | null) => void) | null = null;
  private running = false;
  private hadFace = false;

  constructor(
    private glCanvas: HTMLCanvasElement,
    private overlayCanvas: HTMLCanvasElement,
    private settings: Settings,
    private ui: EngineUI,
  ) {
    try {
      this.renderer = new GLRenderer(glCanvas);
    } catch (err) {
      console.warn('[engine] WebGL2 unavailable, using 2D fallback', err);
    }
    this.g = overlayCanvas.getContext('2d')!;
    this.frame = {
      t: 0,
      dt: 0,
      width: 0,
      height: 0,
      faces: this.activeFaces,
      face: null,
      events: this.events,
      camera: this.view,
      hasMask: false,
    };
    this.sfx.muted = settings.muted;
    this.applyQuality();
    window.addEventListener('resize', () => (this.needsResize = true));
    window.visualViewport?.addEventListener('resize', () => (this.needsResize = true));
    this.camera.onFrame = () => this.pump();
  }

  get currentEffect() {
    return this.active?.def ?? null;
  }
  get webgl() {
    return !!this.renderer;
  }

  /** Apply settings that affect rendering. */
  applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const q = this.settings.quality;
    const max = q === 'low' ? 0.75 : q === 'medium' ? 1.25 : q === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1.5);
    const min = q === 'auto' ? 0.6 : max;
    this.adaptive.setRange(min, max);
    this.adaptive.scale = max;
    this.overlayScale = q === 'low' ? 1 : Math.min(dpr, 2);
    this.sfx.muted = this.settings.muted;
    this.needsResize = true;
  }

  async startCamera(facing: Facing = this.camera.facing) {
    await this.camera.start(facing, this.settings.cameraFps);
    const v = this.camera.video;
    this.stats.camera = `${v.videoWidth}x${v.videoHeight}`;
    this.needsResize = true;
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.tick);
    }
  }

  async flipCamera() {
    await this.startCamera(this.camera.facing === 'user' ? 'environment' : 'user');
  }

  async startTracker() {
    const base = new URL(import.meta.env.BASE_URL, location.href);
    this.tracker?.dispose();
    this.tracker = null;
    const tracker = await createTracker({
      wasmBase: new URL('mediapipe', base).href,
      faceModel: new URL('models/face_landmarker.task', base).href,
      segModel: new URL('models/selfie_segmenter.tflite', base).href,
      delegate: this.settings.delegate,
      numFaces: this.numFaces,
    });
    this.tracker = tracker;
    this.stats.delegate = tracker.delegate;
    this.stats.mode = tracker.mode;
    this.pump();
  }

  setEffect(def: EffectDefinition) {
    this.disposeEffect();
    const layers: Layer[] = [];
    const id = def.id;
    const ctx: EffectContext = {
      particles: (cfg?: ParticleConfig) => {
        const s = new ParticleSystem(cfg);
        layers.push(s);
        return s;
      },
      lines: (cfg?: LineConfig) => {
        const l = new LineBatch(cfg);
        layers.push(l);
        return l;
      },
      faces: this.faces,
      sfx: this.sfx,
      toast: (m) => this.ui.toast(m),
      hint: (m) => this.ui.hint(m),
      store: {
        get<T>(key: string, fallback: T): T {
          try {
            const v = localStorage.getItem(`facedraw.${id}.${key}`);
            return v === null ? fallback : (JSON.parse(v) as T);
          } catch {
            return fallback;
          }
        },
        set<T>(key: string, value: T) {
          try {
            localStorage.setItem(`facedraw.${id}.${key}`, JSON.stringify(value));
          } catch {
            /* ignore */
          }
        },
      },
    };
    this.ui.hint(def.hint ?? null);
    let inst: EffectInstance;
    try {
      inst = def.create(ctx);
    } catch (err) {
      console.error(`[effect ${id}] create failed`, err);
      this.ui.toast(`${def.name} failed to start`);
      inst = {};
    }
    this.active = { def, inst, layers, start: performance.now() };
    this.wantMask = !!def.needs?.segmentation;
    const nf = Math.min(MAX_FACES, Math.max(1, def.needs?.faces ?? 1));
    if (nf !== this.numFaces) {
      this.numFaces = nf;
      this.tracker?.setNumFaces(nf);
    }
    if (!this.wantMask) this.renderer?.clearMask();
    // Compile the shader now rather than on the first frame.
    if (def.shader) this.renderer?.getProgram(def.shader);
    this.overlayDirty = true;
    this.onEffectChange(def);
  }

  private disposeEffect() {
    const a = this.active;
    if (!a) return;
    try {
      a.inst.dispose?.();
    } catch (err) {
      console.error(err);
    }
    this.renderer?.release(a.layers);
    this.active = null;
  }

  pointerDown(x: number, y: number) {
    this.sfx.unlock();
    const a = this.active;
    if (!a?.inst.pointerDown) return false;
    return !!a.inst.pointerDown(x, y, this.frame);
  }

  /** Returns true if the effect handled the shutter itself. */
  shutter() {
    this.sfx.unlock();
    return !!this.active?.inst.shutter?.(this.frame);
  }

  /** Render the next frame into a PNG/JPEG blob. */
  takePhoto(): Promise<Blob | null> {
    return new Promise((resolve) => (this.photoRequest = resolve));
  }

  // ---- Tracking pipeline --------------------------------------------------

  private async pump() {
    const tracker = this.tracker;
    if (!tracker || this.inflight || !this.camera.ready || document.hidden) return;
    if (this.camera.frameId === this.sentFrameId) return;
    this.sentFrameId = this.camera.frameId;
    this.inflight = true;
    try {
      const bitmap = await createImageBitmap(this.camera.video);
      const out = await tracker.track(bitmap, performance.now(), this.wantMask);
      if (tracker !== this.tracker) {
        out.bitmap.close();
      } else {
        if (this.pending) this.pending.bitmap.close();
        this.pending = out;
      }
    } catch (err) {
      console.warn('[engine] tracking failed', err);
    } finally {
      this.inflight = false;
    }
    if (this.camera.frameId !== this.sentFrameId) this.pump();
  }

  private applyResult(out: TrackOutput) {
    const { bitmap, result } = out;
    const sync = this.settings.sync;
    if (sync) {
      this.shown?.close();
      this.shown = bitmap;
      this.renderer?.uploadCamera(bitmap);
      this.view.source = bitmap;
      this.view.layout(bitmap.width, bitmap.height, this.width, this.height, this.camera.mirrored);
    } else {
      bitmap.close();
    }
    if (result.mask && this.renderer) {
      this.renderer.uploadMask(result.mask, result.maskWidth, result.maskHeight);
      this.frame.hasMask = true;
    } else if (!this.wantMask) {
      this.frame.hasMask = false;
    }
    this.updateFaces(result);
    this.trackFps.tick();
    this.faceMs.push(result.faceMs);
    if (result.segMs) this.segMs.push(result.segMs);
    this.events.tracked = true;
  }

  private updateFaces(result: TrackResult) {
    const faces = this.activeFaces;
    faces.length = 0;
    const n = Math.min(result.numFaces, MAX_FACES);
    for (let i = 0; i < n; i++) {
      const face = this.facePool[i];
      face.update(result.landmarks, result.blendshapes, result.matrices, i, this.view);
      faces.push(face);
    }
    const f = faces[0] ?? null;
    const ev = this.events;
    if (f && !this.hadFace) ev.faceFound = true;
    if (!f && this.hadFace) ev.faceLost = true;
    this.hadFace = !!f;
    if (!f) return;
    // Gestures with hysteresis so noise does not retrigger them.
    const mo = f.mouthOpen;
    if (!f.mouthIsOpen && mo > 0.38) {
      f.mouthIsOpen = true;
      ev.mouthOpened = true;
    } else if (f.mouthIsOpen && mo < 0.18) {
      f.mouthIsOpen = false;
      ev.mouthClosed = true;
    }
    const bl = f.blink;
    if (!f.eyesClosed && bl > 0.55) {
      f.eyesClosed = true;
      ev.blinked = true;
    } else if (f.eyesClosed && bl < 0.3) f.eyesClosed = false;
    const br = f.browRaise;
    if (!f.browsUp && br > 0.55) {
      f.browsUp = true;
      ev.browsRaised = true;
    } else if (f.browsUp && br < 0.3) f.browsUp = false;
  }

  // ---- Render loop --------------------------------------------------------

  private resize() {
    this.needsResize = false;
    const w = Math.max(1, Math.round(window.innerWidth));
    const h = Math.max(1, Math.round(window.innerHeight));
    this.width = w;
    this.height = h;
    const gs = this.adaptive.scale;
    this.stats.gpuScale = gs;
    if (this.renderer) this.renderer.resize(Math.round(w * gs), Math.round(h * gs));
    else {
      this.glCanvas.width = 1;
      this.glCanvas.height = 1;
    }
    this.overlayCanvas.width = Math.round(w * this.overlayScale);
    this.overlayCanvas.height = Math.round(h * this.overlayScale);
    this.overlayDirty = true;
    const v = this.view;
    if (v.srcW) v.layout(v.srcW, v.srcH, w, h, this.camera.mirrored);
    for (const f of this.activeFaces) f.relayout(v);
  }

  private tick = (now: number) => {
    requestAnimationFrame(this.tick);
    const dtMs = now - this.last;
    this.last = now;
    const dt = Math.min(Math.max(dtMs / 1000, 0), 0.1);
    this.rafFps.tick(now);
    if (this.settings.quality === 'auto' && this.adaptive.push(dtMs, now)) this.needsResize = true;

    this.camera.poll();
    if (this.needsResize) this.resize();

    const r = this.renderer;
    const pending = this.pending;
    if (pending) {
      this.pending = null;
      this.applyResult(pending);
    }
    // Live video when not synced, or until the tracker delivers frames.
    const live = !this.settings.sync || !this.shown;
    if (live && this.camera.ready) {
      const v = this.camera.video;
      this.view.source = v;
      if (this.view.srcW !== v.videoWidth || this.view.srcH !== v.videoHeight || this.view.width !== this.width) {
        this.view.layout(v.videoWidth, v.videoHeight, this.width, this.height, this.camera.mirrored);
      }
      r?.uploadCamera(v);
    }
    this.view.mirrored = this.camera.mirrored;

    const f = this.frame;
    const a = this.active;
    f.dt = dt;
    f.width = this.width;
    f.height = this.height;
    f.face = this.activeFaces[0] ?? null;
    f.t = a ? (now - a.start) / 1000 : 0;

    if (a) {
      try {
        a.inst.update?.(f);
      } catch (err) {
        console.error(`[effect ${a.def.id}] update`, err);
      }
      for (const l of a.layers) if (l instanceof ParticleSystem) l.update(dt);
    }

    // GPU layer
    if (r) {
      let custom;
      try {
        custom = a?.inst.uniforms?.(f);
      } catch (err) {
        console.error(err);
      }
      r.render(f, a?.def.shader, custom, a?.layers ?? [], !!a?.def.hideCamera);
    }

    // 2D overlay
    const g = this.g;
    const drawFn = a?.inst.draw;
    const fallback = !r;
    if (drawFn || fallback || this.overlayDirty) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      g.setTransform(this.overlayScale, 0, 0, this.overlayScale, 0, 0);
      if (fallback && !a?.def.hideCamera) this.view.draw(g);
      if (fallback && a) drawLayers2D(g, a.layers);
      if (drawFn) {
        try {
          drawFn.call(a!.inst, g, f);
        } catch (err) {
          console.error(`[effect ${a!.def.id}] draw`, err);
        }
      }
      this.overlayDirty = false;
    }

    if (this.photoRequest) this.capturePhoto();

    // Reset one-frame events.
    const ev = this.events;
    ev.tracked = ev.faceFound = ev.faceLost = ev.mouthOpened = ev.mouthClosed = ev.blinked = ev.browsRaised = false;

    this.stats.fps = this.rafFps.rate;
    this.stats.trackFps = this.trackFps.rate;
    this.stats.faceMs = this.faceMs.value;
    this.stats.segMs = this.wantMask ? this.segMs.value : 0;
  };

  private capturePhoto() {
    const done = this.photoRequest!;
    this.photoRequest = null;
    const c = document.createElement('canvas');
    const scale = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(this.width * scale);
    c.height = Math.round(this.height * scale);
    const g = c.getContext('2d')!;
    // Must run in the same task as the GL draw (preserveDrawingBuffer=false).
    if (this.renderer) g.drawImage(this.glCanvas, 0, 0, c.width, c.height);
    g.drawImage(this.overlayCanvas, 0, 0, c.width, c.height);
    c.toBlob((b) => done(b), 'image/jpeg', 0.92);
  }
}

function blankEvents(): FrameEvents {
  return {
    tracked: false,
    faceFound: false,
    faceLost: false,
    mouthOpened: false,
    mouthClosed: false,
    blinked: false,
    browsRaised: false,
  };
}

/** Minimal particle/line drawing for devices without WebGL2. */
function drawLayers2D(g: CanvasRenderingContext2D, layers: Layer[]) {
  g.save();
  for (const s of layers) {
    if (s instanceof LineBatch) {
      g.globalCompositeOperation = s.blend === 'add' ? 'lighter' : 'source-over';
      const d = s.data;
      for (let i = 0; i < s.count; i++) {
        const o = i * 9;
        g.globalAlpha = d[o + 8];
        g.strokeStyle = `rgb(${(d[o + 5] * 255) | 0},${(d[o + 6] * 255) | 0},${(d[o + 7] * 255) | 0})`;
        g.lineWidth = d[o + 4];
        g.beginPath();
        g.moveTo(d[o], d[o + 1]);
        g.lineTo(d[o + 2], d[o + 3]);
        g.stroke();
      }
      continue;
    }
    const n = s.pack();
    const d = s.instances;
    g.globalCompositeOperation = s.blend === 'add' ? 'lighter' : 'source-over';
    for (let i = 0; i < n; i++) {
      const o = i * 10;
      g.globalAlpha = Math.min(1, d[o + 7]);
      g.fillStyle = `rgb(${(d[o + 4] * 255) | 0},${(d[o + 5] * 255) | 0},${(d[o + 6] * 255) | 0})`;
      g.beginPath();
      g.arc(d[o], d[o + 1], Math.max(0.5, d[o + 2] * 0.5), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}
