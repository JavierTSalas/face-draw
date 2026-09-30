// Public effect API. Everything an effect author needs is typed here.
// See docs/ADDING_EFFECTS.md for a walkthrough.
import type { CameraView, Face } from './face';
import type { ParticleConfig, ParticleSystem } from './gl/particles';
import type { FaceStore } from './faceStore';
import type { Sfx } from './sfx';

export type UniformValue = number | readonly number[] | Float32Array;
export type Uniforms = Record<string, UniformValue>;

/** One-frame events, true only on the frame they happen. */
export interface FrameEvents {
  /** A new tracking result arrived this frame. */
  tracked: boolean;
  faceFound: boolean;
  faceLost: boolean;
  mouthOpened: boolean;
  mouthClosed: boolean;
  blinked: boolean;
  browsRaised: boolean;
}

/** Everything that changes per frame. Passed to update() and draw(). */
export interface Frame {
  /** Seconds since this effect started. */
  t: number;
  /** Seconds since the last frame (clamped to 0.1 to survive tab switches). */
  dt: number;
  /** Viewport size in CSS pixels. All coordinates use CSS pixels. */
  width: number;
  height: number;
  /** All tracked faces, most prominent first. */
  faces: readonly Face[];
  /** faces[0] or null. */
  face: Face | null;
  events: FrameEvents;
  /** The camera image and how it maps to the screen (for cut-outs). */
  camera: CameraView;
  /** True when the person segmentation mask is available to shaders. */
  hasMask: boolean;
}

export interface EffectContext {
  /** Create a GPU particle system that is drawn above the camera layer. */
  particles(config?: ParticleConfig): ParticleSystem;
  /** Faces the user cut out and saved (shared by all effects and games). */
  faces: FaceStore;
  /** Tiny synth for game sounds. */
  sfx: Sfx;
  /** Show a short message. */
  toast(message: string): void;
  /** Show or clear the persistent hint at the top of the screen. */
  hint(message: string | null): void;
  /** Per-effect persistent storage (localStorage, namespaced by effect id). */
  store: {
    get<T>(key: string, fallback: T): T;
    set<T>(key: string, value: T): void;
  };
}

export interface EffectInstance {
  /** Advance simulation. Called once per display frame. */
  update?(f: Frame): void;
  /** Draw on the 2D overlay canvas (already cleared and scaled to CSS px). */
  draw?(g: CanvasRenderingContext2D, f: Frame): void;
  /** Values for custom uniforms declared in the effect's shader. */
  uniforms?(f: Frame): Uniforms;
  /** Tap / click on the stage, in CSS px. Return true to consume it. */
  pointerDown?(x: number, y: number, f: Frame): boolean | void;
  /** The shutter button was pressed. Return true to replace the photo action. */
  shutter?(f: Frame): boolean | void;
  dispose?(): void;
}

export interface EffectDefinition {
  /** Unique, URL-safe id. Used in the URL hash (#fireworks). */
  id: string;
  name: string;
  /** An emoji is enough. */
  icon: string;
  kind?: 'filter' | 'game';
  /** Sort order in the carousel (lower comes first). */
  order?: number;
  /** One-line description for the README / tooltips. */
  description?: string;
  /** Shown at the top of the screen when the effect starts. */
  hint?: string;
  /** Ask the tracker for extra work. Only request what you use. */
  needs?: {
    /** Person segmentation mask (enables personMask() in shaders). */
    segmentation?: boolean;
    /** Number of faces to track (default 1). */
    faces?: number;
  };
  /** Skip drawing the camera (games with their own background). */
  hideCamera?: boolean;
  /**
   * GLSL ES 3.0 source defining `vec4 mainImage(vec2 uv)`. It replaces the
   * camera pass. Helpers such as camera(uv), personMask(uv), faceDist(px),
   * fbm(p) are available; see src/core/gl/shaders.ts.
   */
  shader?: string;
  create(ctx: EffectContext): EffectInstance;
}

/** Identity helper that gives you type checking and autocompletion. */
export function defineEffect(def: EffectDefinition): EffectDefinition {
  return def;
}
