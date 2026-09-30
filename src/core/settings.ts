// User settings, persisted in localStorage.
import type { Delegate } from '../tracking/protocol';

export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  /** Show the performance overlay. */
  hud: boolean;
  muted: boolean;
  delegate: Delegate;
  cameraFps: 30 | 60;
  quality: Quality;
  /**
   * Draw the exact camera frame the landmarks were computed from. Perfect
   * alignment; the video updates at the tracking rate.
   */
  sync: boolean;
}

const KEY = 'facedraw.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  hud: false,
  muted: false,
  delegate: 'GPU',
  cameraFps: 30,
  quality: 'auto',
  sync: true,
};

export function loadSettings(): Settings {
  let s: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch {
    /* private mode or corrupt data */
  }
  // URL overrides, handy for testing: ?hud&delegate=CPU&quality=low
  const q = new URLSearchParams(location.search);
  if (q.has('hud')) s.hud = true;
  const d = q.get('delegate');
  if (d === 'CPU' || d === 'GPU') s.delegate = d;
  const quality = q.get('quality');
  if (quality === 'auto' || quality === 'low' || quality === 'medium' || quality === 'high') s.quality = quality;
  return s;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
