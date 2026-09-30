// Tiny WebAudio synth. No audio files to download.

export type SoundName =
  | 'pop'
  | 'flap'
  | 'score'
  | 'hit'
  | 'boom'
  | 'whoosh'
  | 'chime'
  | 'crunch'
  | 'shutter'
  | 'zap';

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  /** Call from a user gesture (tap) so browsers allow audio. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  play(name: SoundName, volume = 1) {
    const c = this.ctx;
    if (this.muted || !c || c.state !== 'running') return;
    const t = c.currentTime;
    switch (name) {
      case 'pop':
        return this.tone('sine', 520, 980, 0.09, 0.25 * volume, t);
      case 'flap':
        return this.tone('triangle', 330, 620, 0.1, 0.22 * volume, t);
      case 'score':
        this.tone('square', 880, 880, 0.08, 0.08 * volume, t);
        return this.tone('square', 1320, 1320, 0.12, 0.08 * volume, t + 0.08);
      case 'hit':
        this.noiseBurst(0.25, 0.4 * volume, 900, t);
        return this.tone('sawtooth', 220, 60, 0.3, 0.15 * volume, t);
      case 'boom':
        this.noiseBurst(0.6, 0.35 * volume, 400, t);
        return this.tone('sine', 120, 40, 0.5, 0.35 * volume, t);
      case 'whoosh':
        return this.noiseBurst(0.35, 0.18 * volume, 2400, t, 400);
      case 'chime':
        this.tone('sine', 1047, 1047, 0.35, 0.12 * volume, t);
        return this.tone('sine', 1568, 1568, 0.45, 0.08 * volume, t + 0.06);
      case 'crunch':
        this.noiseBurst(0.12, 0.3 * volume, 3000, t);
        return this.noiseBurst(0.1, 0.25 * volume, 1800, t + 0.07);
      case 'shutter':
        return this.noiseBurst(0.08, 0.35 * volume, 5000, t);
      case 'zap':
        return this.tone('sawtooth', 1400, 200, 0.18, 0.1 * volume, t);
    }
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, vol: number, freq: number, t: number, freqEnd = freq) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur);
  }
}
