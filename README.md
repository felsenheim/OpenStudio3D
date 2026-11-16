# Tangible Interface

A three.js viewer on GitHub Pages: turn a physical object (sensor station) or walk around a printed card (AR station), and the 3D model turns with it.

## Structure
```
index.html            landing page
shared/viewer.js      shared viewer: load GLB, center/scale, RoomEnvironment, 3 shading modes, smoothing, debug overlay
shared/mouse-input.js mouse/touch input adapter (development)
sensor/index.html     sensor station (mouse for now; game controller in phase 2)
models/head.glb       the model
```
No build step. three.js loads from jsDelivr via an import map.

## Deploy on GitHub Pages
1. Push these files to the root of a repo.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. Open `https://<user>.github.io/<repo>/sensor/`.

Local test: `npx serve` (or `python3 -m http.server`) in this folder, then open `http://localhost:3000/sensor/`. It won't work from `file://`.

## Sensor page controls (phase 1)
| Input | Action |
|---|---|
| Drag left / right | Rotation (yaw) |
| Drag up / down | Elevation (pitch), limited to ±90° |
| Arrow keys | Nudge by 15° |
| `0` | Back to front view |
| `D` | Debug overlay: angles, mode, AO / normal-map status, fps, SMOOTH slider, mode override |

URL options: `?debug` shows the overlay on load; `?model=path/to/other.glb` loads another model.

## Shading modes (by yaw, hard switch at 60° / 180° / 300°)
| Yaw | Mode |
|---|---|
| 300°–60° (around 0°) | Flat-shaded solid in deep steel blue with a raking key light, no textures (colour + light tunable in the debug overlay) |
| 60°–180° (around 120°) | Smooth off-white (`#e6e6e6`) + baked AO at strength 1.6 + normal map (used automatically once the GLB has one) |
| 180°–300° (around 240°) | Original GLB material (full PBR) |

## Settings to tune (in `sensor/index.html`)
- `frontYawDeg`: rotates the model so its front faces the screen at yaw 0.
- `flatColor`, `flatKeyLight`, `flatEnv`: look of the flat mode (default `0x2f4a6b`, 4, 0.08). Try values live in the debug overlay, then copy them here.
- `background`: circular falloff `{ center: '#ffffff', edge: '#666666', hold: 35, size: 100 }`; `hold` = how far pure white extends, `size` = where the edge colour is reached (both in % of the distance from the centre to the corners).
- `smoothColor`, `smoothAO`: look of the smooth mode (default `0xe6e6e6` = 10% grey, AO strength 1.6). Both are adjustable live in the debug overlay.
- `smooth`: SMOOTH, default 12. Higher is snappier, lower is calmer. It can also be tried live with the slider in the debug overlay.

## Updating the live site
GitHub Pages lets browsers cache files for 10 minutes. After changing `shared/*.js`, raise the `?v=` number in the imports in `sensor/index.html` so browsers load the new version at once. If a page still looks old, hard-reload it (Ctrl/Cmd + Shift + R).

## Viewer API (for the station adapters)
```js
const model = await loadTangibleModel(url, { frontYawDeg, smooth });
model.setTargetOrientation(yawDeg, pitchDeg); // or model.setTargetQuaternion(q)
model.update(dt);        // called by the viewer each frame (slerp + mode switch)
model.getAngles();       // smoothed { yaw, pitch } in degrees
model.forcedMode = 1;    // force a mode; null = automatic
model.root               // THREE.Group to add to any scene (also the AR anchor)
```
Rotation = Rx(-pitch) · Ry(yaw): the tilt always goes toward the viewer, like an orbit camera.
