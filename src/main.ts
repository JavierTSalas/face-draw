import './styles.css';
import { Engine } from './core/engine';
import { EFFECTS, findEffect } from './core/registry';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { Carousel } from './ui/carousel';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const settings = loadSettings();
const ui = $('ui');
const hintEl = $('hint');
const toastEl = $('toast');
const hudEl = $('hud');
const fpsEl = $('fps');
const nameEl = $('effect-name');
const startEl = $('start');
const startBtn = $<HTMLButtonElement>('btn-start');
const startStatus = $('start-status');

let toastTimer = 0;
function toast(msg: string, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), ms);
}
let hintTimer = 0;
/** Show a hint for a few seconds (null hides it). */
function hint(msg: string | null, ms = 4500) {
  clearTimeout(hintTimer);
  hintEl.hidden = !msg;
  if (!msg) return;
  hintEl.textContent = msg;
  hintTimer = window.setTimeout(() => (hintEl.hidden = true), ms);
}

const engine = new Engine($<HTMLCanvasElement>('gl'), $<HTMLCanvasElement>('overlay'), settings, { toast, hint });
engine.faces.load();

// Start loading the tracker immediately, while the user reads the start screen.
let trackerReady = false;
const trackerPromise = engine
  .startTracker()
  .then(() => {
    trackerReady = true;
    startStatus.textContent = `Face tracker ready (${engine.stats.delegate})`;
  })
  .catch((err) => {
    console.error(err);
    startStatus.textContent = 'Face tracker failed to load. Effects will not follow your face.';
    startStatus.classList.add('error');
  });

// ---- Effect carousel ------------------------------------------------------

const carousel = new Carousel($('carousel'), EFFECTS);
carousel.onPreview = (def) => (nameEl.textContent = def.name);
carousel.onSelect = (def) => {
  nameEl.textContent = def.name;
  engine.setEffect(def);
  history.replaceState(null, '', `#${def.id}`);
};
carousel.onShutter = () => shutter();

function initialEffectIndex() {
  const def = findEffect(location.hash.slice(1));
  return def ? EFFECTS.indexOf(def) : 0;
}

// ---- Stage input ------------------------------------------------------------

$('stage').addEventListener('pointerdown', (e) => {
  engine.pointerDown(e.clientX, e.clientY);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') carousel.step(1);
  else if (e.key === 'ArrowLeft') carousel.step(-1);
  else if (e.key === ' ') {
    e.preventDefault();
    engine.pointerDown(window.innerWidth / 2, window.innerHeight / 2);
  }
});

// ---- Photo --------------------------------------------------------------------

const photoEl = $('photo');
const photoImg = $<HTMLImageElement>('photo-img');
const photoSave = $<HTMLAnchorElement>('photo-save');
const photoShare = $<HTMLButtonElement>('photo-share');
let photoBlob: Blob | null = null;

async function shutter() {
  if (engine.shutter()) return;
  const flash = $('flash');
  flash.classList.remove('on');
  void flash.offsetWidth;
  flash.classList.add('on');
  engine.sfx.play('shutter');
  const blob = await engine.takePhoto();
  if (!blob) return;
  photoBlob = blob;
  if (photoImg.src) URL.revokeObjectURL(photoImg.src);
  const url = URL.createObjectURL(blob);
  photoImg.src = url;
  photoSave.href = url;
  photoSave.download = `face-draw-${Date.now()}.jpg`;
  const file = new File([blob], 'face-draw.jpg', { type: 'image/jpeg' });
  photoShare.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  photoEl.hidden = false;
}
$('photo-close').addEventListener('click', () => (photoEl.hidden = true));
photoShare.addEventListener('click', async () => {
  if (!photoBlob) return;
  try {
    await navigator.share({ files: [new File([photoBlob], 'face-draw.jpg', { type: 'image/jpeg' })] });
  } catch {
    /* cancelled */
  }
});

// ---- Top bar ------------------------------------------------------------------

const muteBtn = $('btn-mute');
function renderMute() {
  muteBtn.textContent = settings.muted ? '🔇' : '🔊';
}
renderMute();
muteBtn.addEventListener('click', () => {
  settings.muted = !settings.muted;
  engine.sfx.muted = settings.muted;
  engine.sfx.unlock();
  saveSettings(settings);
  renderMute();
});

$('btn-flip').addEventListener('click', () => {
  engine.flipCamera().catch(() => toast('Could not switch camera'));
});

$('btn-hud').addEventListener('click', () => {
  settings.hud = !settings.hud;
  saveSettings(settings);
  hudEl.hidden = !settings.hud;
});
hudEl.hidden = !settings.hud;

setInterval(() => {
  const s = engine.stats;
  fpsEl.textContent = String(Math.round(s.fps));
  if (!settings.hud) return;
  hudEl.textContent =
    `render  ${s.fps.toFixed(0)} fps  cpu ${s.cpuMs.toFixed(1)} ms\n` +
    `track   ${s.trackFps.toFixed(0)} fps  ${s.faceMs.toFixed(1)} ms\n` +
    (s.segMs ? `segment ${s.segMs.toFixed(1)} ms\n` : '') +
    `tracker ${s.delegate} / ${s.mode}\n` +
    `camera  ${s.camera}\n` +
    `gpu res ${s.gpuScale.toFixed(2)}x${engine.webgl ? '' : ' (no WebGL2)'}`;
}, 500);

// ---- Settings dialog --------------------------------------------------------------

const dialog = $<HTMLDialogElement>('settings');
const form = dialog.querySelector('form')!;
$('btn-settings').addEventListener('click', () => {
  (form.elements.namedItem('quality') as HTMLSelectElement).value = settings.quality;
  (form.elements.namedItem('cameraFps') as HTMLSelectElement).value = String(settings.cameraFps);
  (form.elements.namedItem('delegate') as HTMLSelectElement).value = settings.delegate;
  (form.elements.namedItem('sync') as HTMLInputElement).checked = settings.sync;
  (form.elements.namedItem('hud') as HTMLInputElement).checked = settings.hud;
  dialog.showModal();
});
form.addEventListener('change', async () => {
  const prev: Settings = { ...settings };
  settings.quality = (form.elements.namedItem('quality') as HTMLSelectElement).value as Settings['quality'];
  settings.cameraFps = Number((form.elements.namedItem('cameraFps') as HTMLSelectElement).value) as 30 | 60;
  settings.delegate = (form.elements.namedItem('delegate') as HTMLSelectElement).value as Settings['delegate'];
  settings.sync = (form.elements.namedItem('sync') as HTMLInputElement).checked;
  settings.hud = (form.elements.namedItem('hud') as HTMLInputElement).checked;
  saveSettings(settings);
  hudEl.hidden = !settings.hud;
  engine.applyQuality();
  if (prev.cameraFps !== settings.cameraFps) engine.startCamera().catch(() => toast('Camera restart failed'));
  if (prev.delegate !== settings.delegate) {
    toast('Restarting face tracker…');
    engine.startTracker().then(
      () => toast(`Tracker on ${engine.stats.delegate}`),
      () => toast('Tracker failed to restart'),
    );
  }
});
$('btn-clear-faces').addEventListener('click', () => {
  engine.faces.clear();
  toast('Saved faces deleted');
});

// ---- Start ----------------------------------------------------------------------------

async function start() {
  startBtn.disabled = true;
  engine.sfx.unlock();
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    startStatus.textContent = 'Camera needs HTTPS. Open this page over https:// or localhost.';
    startStatus.classList.add('error');
    startBtn.disabled = false;
    return;
  }
  startStatus.textContent = 'Starting camera…';
  try {
    await engine.startCamera('user');
  } catch (err) {
    console.error(err);
    const name = (err as DOMException)?.name;
    startStatus.textContent =
      name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
        : `Could not start the camera (${name ?? err}).`;
    startStatus.classList.add('error');
    startBtn.disabled = false;
    return;
  }
  startEl.hidden = true;
  ui.hidden = false;
  carousel.select(initialEffectIndex());
  if (!trackerReady) {
    hint('Loading face tracker…', 60_000);
    await trackerPromise;
    hint(engine.currentEffect?.hint ?? null);
  }
}

startBtn.addEventListener('click', start);
if (new URLSearchParams(location.search).has('autostart')) start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Handy for debugging from the browser console: faceDraw.engine.stats
Object.assign(window, { faceDraw: { engine, effects: EFFECTS, carousel } });
