// Camera capture with frame notifications.

export type Facing = 'user' | 'environment';

export class Camera {
  readonly video: HTMLVideoElement;
  facing: Facing = 'user';
  /** Increments whenever the video presents a new frame. */
  frameId = 0;
  private stream: MediaStream | null = null;
  private lastTime = -1;
  private usingRvfc = false;
  onFrame: () => void = () => {};

  constructor() {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    this.video = v;
  }

  get ready() {
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  }
  get mirrored() {
    return this.facing === 'user';
  }

  async start(facing: Facing = this.facing, fps = 30) {
    this.stop();
    this.facing = facing;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: facing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: fps, max: fps },
      },
    });
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    this.watchFrames();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private watchFrames() {
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof v.requestVideoFrameCallback === 'function') {
      this.usingRvfc = true;
      const tick = () => {
        this.frameId++;
        this.onFrame();
        v.requestVideoFrameCallback!(tick);
      };
      v.requestVideoFrameCallback(tick);
    }
  }

  /** Fallback frame detection for browsers without requestVideoFrameCallback. */
  poll() {
    if (this.usingRvfc) return;
    const t = this.video.currentTime;
    if (t !== this.lastTime) {
      this.lastTime = t;
      this.frameId++;
      this.onFrame();
    }
  }
}
