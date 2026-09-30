# 🎭 Face Draw

Snapchat-style face filters and face-controlled games that run **entirely in your
browser**, tuned for phones. No app, no server, no uploads: the camera image never
leaves your device.

**Live:** https://javiertsalas.github.io/face-draw/ (open it on your phone)

| Filters | | Games |
| --- | --- | --- |
| ✂️ **Face Grab**: cut out your face and keep it | 🔥 **On Fire**: flames rise off your silhouette, breathe fire | 🐦 **Flappy Face**: you are the bird; open your mouth to flap |
| 🎆 **Fireworks**: a show around your head, mouth-launched volleys | 🧊 **Freeze**: ice creeps up your body, icy breath, tap to shatter | 🍔 **Munch**: catch falling food in your mouth, dodge the bombs |
| 🕸️ **Neon Mesh**: 468-point glowing wireframe | 👀 **Laser Eyes**: aim by turning your head | |
| 🤪 **Face Warp**: bobble head, anime eyes, tiny face, alien | 🪐 **Head Orbit**: copies of your face orbit your head | |
| 🔀 **Face Swap**: with a friend, or wear a saved face | 📺 **Glitch** · 💥 **Comic / Sketch / Pop Art** | |

Swipe the carousel to change effects, tap the ring to take a photo, tap the
screen for each effect's action. Faces you save in **Face Grab** show up in
Flappy Face, Face Swap and Head Orbit.

## Built for frame rate

- **Tracking runs off the main thread.** MediaPipe Face Landmarker (478 landmarks,
  52 blendshapes) runs in a Web Worker on the GPU, with a CPU fallback. The main
  thread only renders, so a slow inference never drops a display frame.
- **Zero-copy frames, perfect alignment.** Each camera frame is sent to the worker
  as a transferable `ImageBitmap` and handed back with its landmarks. The frame
  drawn on screen is the exact frame that was analysed, so effects never lag
  behind your face.
- **GPU everything.** The camera pass is a single WebGL2 fragment shader. Particles
  and line segments are instanced: thousands of them cost one draw call each.
- **Adaptive resolution.** In *Auto* quality the GPU canvas resolution drops when
  frames run long and climbs back when there is headroom.
- **Only pay for what you use.** Person segmentation (for Fire and Freeze) and
  multi-face tracking are switched on only by effects that ask for them.
- **Small and cached.** ~40 KB of gzipped app code. The models (4 MB) and wasm
  runtime are self-hosted and cached by a service worker, so the second visit
  starts instantly and works offline. Installable as a PWA.

In our tests, main-thread work stays under 1 ms per frame for every effect. Turn on the
performance overlay (tap the fps pill, or add `?hud` to the URL) to see render
fps, tracking fps and latency, and the current GPU resolution on your device.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (camera works on localhost)
npm run dev:phone    # HTTPS on your LAN so your phone can use the camera
npm run build        # static site in dist/
```

With `dev:phone`, open the `https://<your-computer-ip>:5173` URL it prints on your
phone (same Wi-Fi) and accept the self-signed certificate warning.

Handy URL flags: `?hud` (perf overlay), `?delegate=CPU`, `?quality=low|medium|high`,
`#flappy-face` (open a given effect).

## Add your own effect

Create `src/effects/<name>/index.ts`. It is picked up automatically:

```ts
import { defineEffect } from '../../core/effect';

export default defineEffect({
  id: 'sparkle-nose',
  name: 'Sparkle Nose',
  icon: '✨',
  create(ctx) {
    const sparks = ctx.particles({ shape: 'star', gravity: 200 });
    return {
      update(f) {
        if (f.face) sparks.emit(f.face.noseX, f.face.noseY, Math.random() * 200 - 100, -150, 1, 6, 0xffe066);
      },
    };
  },
});
```

Shaders, landmarks, gestures, face cut-outs and games are covered in
**[docs/ADDING_EFFECTS.md](docs/ADDING_EFFECTS.md)**.

## Deploy

- **GitHub Pages:** already wired up in `.github/workflows/deploy.yml`. One-time
  step: repo *Settings → Pages → Build and deployment → Source: GitHub Actions*.
  Every push to the default branch then publishes the site.
- **Vercel / Netlify / any static host:** import the repo; build command
  `npm run build`, output `dist/`. `vercel.json` sets cache headers.

The camera needs HTTPS, which all of these provide.

## Project layout

```
src/
  core/          engine loop, camera, WebGL2 renderer, particles, lines, UI glue
  tracking/      MediaPipe wrapper, worker, main-thread client
  effects/*/     one folder per filter (auto-discovered)
  games/*/       one folder per game (auto-discovered)
  lib/           helpers for effect authors (cut-outs, sprites, math, game UI)
  ui/            carousel
public/models/   self-hosted MediaPipe models (Apache-2.0)
```

## Credits

Face tracking and segmentation by [MediaPipe](https://ai.google.dev/edge/mediapipe)
(Apache-2.0). Everything else is MIT, see [LICENSE](LICENSE).
