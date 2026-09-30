# Adding effects and games

Every effect is one folder with an `index.ts` that default-exports
`defineEffect({...})`. Folders in `src/effects/` are filters and folders in
`src/games/` are games. Both are discovered automatically; there is no list to
edit. Run `npm run dev`, open http://localhost:5173/#your-id and your effect is
selected.

- [The smallest effect](#the-smallest-effect)
- [Lifecycle](#lifecycle)
- [Coordinates and the face](#coordinates-and-the-face)
- [Gestures and events](#gestures-and-events)
- [Drawing: pick the right layer](#drawing-pick-the-right-layer)
- [Camera shaders](#camera-shaders)
- [Particles](#particles)
- [Lines](#lines)
- [Face cut-outs and saved faces](#face-cut-outs-and-saved-faces)
- [Games](#games)
- [Performance rules](#performance-rules)
- [Checklist for a pull request](#checklist-for-a-pull-request)

## The smallest effect

```ts
// src/effects/clown-nose/index.ts
import { defineEffect } from '../../core/effect';

export default defineEffect({
  id: 'clown-nose',          // unique, used in the URL: #clown-nose
  name: 'Clown Nose',
  icon: '🤡',
  order: 200,                // position in the carousel (lower = earlier)
  hint: 'Honk honk!',        // shown briefly when the effect starts
  create(ctx) {
    return {
      draw(g, f) {
        const face = f.face;
        if (!face) return;
        g.fillStyle = '#ff2a2a';
        g.beginPath();
        g.arc(face.noseX, face.noseY, face.eyeDist * 0.28, 0, Math.PI * 2);
        g.fill();
      },
    };
  },
});
```

## Lifecycle

`create(ctx)` runs when the user selects the effect. Keep your state in the
closure. It returns an object with optional hooks:

| Hook | When | Use it for |
| --- | --- | --- |
| `update(f)` | every display frame | simulation, spawning particles |
| `draw(g, f)` | every display frame | Canvas 2D overlay (already cleared, CSS px) |
| `uniforms(f)` | every display frame | values for your shader's custom uniforms |
| `pointerDown(x, y, f)` | tap on the stage | switch modes, launch things |
| `shutter(f)` | the ring button | return `true` to replace "take photo" |
| `dispose()` | effect is switched away | stop timers, release resources |

Particle systems and line batches created through `ctx` are updated, drawn and
freed for you.

`ctx` also gives you `ctx.sfx.play('pop')` (synthesised sounds),
`ctx.toast(msg)`, `ctx.hint(msg)`, `ctx.store.get/set` (per-effect
localStorage) and `ctx.faces` (saved face cut-outs).

## Coordinates and the face

Everything is in **CSS pixels** with (0, 0) at the top-left of the screen, the
same space as `f.width` × `f.height` and pointer events. The camera is already
mirrored for selfies and cover-fitted to the screen; landmarks are mapped into
the same space.

`f.face` is the most prominent face (or `null`); `f.faces` lists all tracked
faces (1 unless you ask for more with `needs: { faces: 2 }`).

| Property | Meaning |
| --- | --- |
| `cx, cy, width, height` | face centre and size |
| `roll` | screen rotation in radians (0 = upright) |
| `yaw`, `pitch` | head turn / tilt, roughly -1..1 |
| `eyeDist` | distance between pupils, a good unit for sizing |
| `eyeLX/eyeLY`, `eyeRX/eyeRY` | screen-left / screen-right pupils |
| `mouthX/mouthY`, `noseX/noseY` | mouth centre, nose tip |
| `x(i), y(i), z(i)` | any of the 478 landmarks ([map](https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png)) |
| `mouthOpen`, `smile`, `blink`, `browRaise`, `pucker` | 0..1 expression scores |
| `bs('cheekPuff')` | any of the 52 ARKit blendshapes |
| `ovalPath`, `traceOval(g, scale)` | the face outline, for clipping |

Named landmark indices and contours live in `src/core/landmarks.ts`; mesh edge
lists in `src/core/topology.ts`.

## Gestures and events

`f.events` holds one-frame flags with hysteresis, so they fire once per gesture:
`mouthOpened`, `mouthClosed`, `blinked`, `browsRaised`, `faceFound`,
`faceLost`, and `tracked` (new landmarks arrived this frame).

```ts
update(f) {
  if (f.events.mouthOpened) launchSomething(f.face!.mouthX, f.face!.mouthY);
}
```

Tracking usually runs at camera rate (30 fps) while rendering runs at display
rate (60-120 fps). Work that only depends on landmarks, such as rebuilding a
mesh, can run only when `f.events.tracked` is true.

## Drawing: pick the right layer

Layers from bottom to top:

1. **Camera shader** (`shader`): full-screen GLSL. Colour grades, warps,
   fire, ice. Runs on the GPU for every pixel.
2. **GPU particles and lines** (`ctx.particles()`, `ctx.lines()`): thousands of
   sprites or segments in one draw call each.
3. **Canvas 2D** (`draw(g, f)`): text, emoji, images, face cut-outs, game UI.

Use Canvas 2D for tens of things, and the GPU layers for hundreds or thousands.

## Camera shaders

Write `vec4 mainImage(vec2 uv)`. `uv` is screen space, (0,0) top-left.

```ts
shader: /* glsl */ `
uniform float u_amount;            // your own uniform
vec4 mainImage(vec2 uv) {
  vec3 c = camera(uv);             // camera colour at this screen point
  float person = personMask(uv);   // 1 on the person, 0 on the background
  return vec4(mix(vec3(luma(c)), c, person * u_amount), 1.0);
}`,
create() {
  const u = { u_amount: 1 };
  return { uniforms: () => u };    // reuse the object: no garbage per frame
},
```

Built-in uniforms: `u_time`, `u_resolution` (CSS px), `u_hasFace`,
`u_faceCenter`, `u_faceSize`, `u_faceRoll`, `u_eyeL`, `u_eyeR`, `u_mouth`,
`u_nose`, `u_mouthOpen` (positions in CSS px).
Helpers: `camera(uv)`, `camUV(uv)`, `personMask(uv)`, `faceDist(px)`,
`toPx(uv)`, `toUV(px)`, `luma(c)`, `hash21`, `hash22`, `vnoise`, `fbm`,
`hsv2rgb`. Full source: `src/core/gl/shaders.ts`.

`personMask()` uses the segmentation model when your effect declares
`needs: { segmentation: true }`, and otherwise falls back to a soft ellipse around
the head. Segmentation costs a few ms per frame on the GPU, so only request it
when you need the body outline.

Custom uniform values can be a number (`float`), or arrays of length 2, 3, 4
(`vec2`, `vec3`, `vec4`). If your shader fails to compile, the error is logged
to the console and the plain camera is shown.

## Particles

```ts
const sparks = ctx.particles({
  shape: 'spark',      // glow | spark | dot | flake | ring | smoke | star
  blend: 'add',        // 'add' glows, 'normal' covers
  gravity: 300,        // px/s², negative floats up
  drag: 1,             // velocity damping per second
  endScale: 0.3,       // size multiplier at end of life
  endColor: 0xff2200,  // colour fades toward this
  fadePower: 1,        // alpha *= remaining ^ fadePower
  turbulence: 0,       // random sideways jitter
  max: 2000,
});
sparks.emit(x, y, vx, vy, lifeSeconds, radiusPx, 0xRRGGBB, alpha, rotation, spin);
sparks.burst(x, y, count, speed, life, size, color);
```

## Lines

```ts
const wire = ctx.lines({ glow: 2, core: 0.5 });
update(f) {
  wire.clear();
  wire.add(x0, y0, x1, y1, widthPx, 0x33ddff, 1);
}
```

Lines keep their content until you `clear()` them, and are only re-uploaded to
the GPU when they change. See `src/effects/neon-mesh` for 1,300 segments.

## Face cut-outs and saved faces

`src/lib/cutout.ts`:

```ts
// The live face, cut out of the camera and drawn anywhere, any size, any angle.
drawFaceCutout(g, f, face, x, y, heightPx, rotation, { outline: 3 });
drawFaceCutout(g, f, face, x, y, heightPx, rotation, { feather: true }); // soft edges

// Snapshot the face to a canvas and keep it for other effects and games.
const img = captureFace(f, face);
ctx.faces.add(img);

// Use saved faces.
const saved = ctx.faces.latest;             // or ctx.faces.faces[]
if (saved) drawSavedFace(g, saved.image, x, y, heightPx, rotation);
```

## Games

A game is an effect with `kind: 'game'` in `src/games/`. Games usually:

- set `hideCamera: true` if they paint their own background,
- keep a `state` (`'ready' | 'play' | 'over'`),
- use `f.events.mouthOpened` / `browsRaised` and `pointerDown` as controls,
- implement `shutter()` so the ring button is a game button,
- store high scores with `ctx.store`.

`src/lib/game.ts` has outlined text, buttons with hit tests, and score popups.
`src/games/flappy-face` is a complete example in ~350 lines.

## Performance rules

The target is a steady 60 fps on a mid-range phone.

1. **Allocate nothing per frame in hot loops.** Reuse arrays and uniform
   objects. Particles are pooled for you.
2. **Rebuild on `f.events.tracked`**, not every frame, when a result only
   depends on landmarks.
3. **Many things → GPU layers.** Stroking thousands of Canvas 2D paths is slow on
   phones; a line batch is not.
4. **Draw regions, not frames.** `drawFaceCutout` copies only the face area of
   the camera image.
5. **Ask for what you use.** `needs.segmentation` and `needs.faces` cost real
   GPU time.
6. **Measure.** Add `?hud` to the URL. `cpu` is the main-thread time per frame
   for the whole app.

## Checklist for a pull request

- [ ] `npm run build` passes (type check + build).
- [ ] Works with no face in view, one face, and (if relevant) two faces.
- [ ] Holds frame rate with `?hud` on your phone.
- [ ] The `hint` says how to interact in a few words.
