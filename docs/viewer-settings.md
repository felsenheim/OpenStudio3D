# OpenStudio3D: viewer settings and handover

State as of 16 Nov 2026 (two views: X-ray / full PBR). This file has everything needed to continue, e.g. testing the AR station on a device or starting phase 2.

## Links
| What | Where |
|---|---|
| Repo | https://github.com/felsenheim/OpenStudio3D (public, branch `main`) |
| Live site (GitHub Pages, deployed from `main` / root) | https://felsenheim.github.io/OpenStudio3D/ |
| Sensor station (mouse input for now) | https://felsenheim.github.io/OpenStudio3D/sensor/ |
| AR station (MindAR; card: `ar/card.pdf`) | https://felsenheim.github.io/OpenStudio3D/ar/ |
| Brief and plan | Claude project "VR/XR experiance": `claude/task-brief.md`, `claude/work-plan.md` |

## Files
```
index.html            landing page (links to /sensor/, /ar/ and ar/card.pdf)
shared/viewer.js      loadTangibleModel(), createScreenViewer(), createDebugOverlay(), modeForYaw(), MODES
shared/mouse-input.js attachMouseInput(element, model)
sensor/index.html     station 1 (mouse now; game controller in phase 2)
ar/index.html         station 2: MindAR image tracking (see "AR station" below)
ar/card.pdf, ar/target.png, ar/target.mind   print card + tracking image
shared/three-compat.js  three 0.187 + sRGBEncoding, for MindAR only
tools/make_card.py, tools/compile-target.html  regenerate card / target.mind
models/head.glb       test model "Gamefigure" (8.7 MB, no Draco, AO baked, no normal map yet)
README.md, CLAUDE.md  usage notes and conventions
docs/viewer-settings.md  this file
```
No build step. three.js **0.187.0** loads from jsDelivr via an import map:
```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/"
} }
</script>
```

## Model (test GLB)
- Exported from Blender (Metashape scan): 1 mesh, about 93,500 triangles and 63,665 vertices. Attributes: POSITION, NORMAL, TEXCOORD_0.
- Material: base colour texture (JPEG) + occlusion texture (PNG, baked AO), metallic 0.1, roughness 0.3, double-sided, `KHR_materials_specular` (specularFactor 0).
- No Draco (removed on purpose, so there's no DRACOLoader). No normal map (not needed: the views are X-ray and the original PBR material).
- The node has a 180° rotation around Y. The model's front is not yet calibrated (`frontYawDeg` = 0; the face shows at about yaw 120°).

## Model settings: `loadTangibleModel(url, options)`
| Option | Value | Meaning |
|---|---|---|
| `frontYawDeg` | `0` | Turns the model so its front faces the viewer at yaw 0 (still to calibrate) |
| `size` | `1` | The model is centred on its bounding-sphere centre and scaled to this sphere radius |
| `smooth` | `12` | SMOOTH: `slerp(target, 1 - exp(-SMOOTH * dt))` |
| `xrayColor` | `0x2f4a6b` | X-ray colour: deep steel blue (dark rims on the white background, like an x-ray negative) |
| `xrayPower` | `2.5` | X-ray rim width: higher = thinner rim |
| `xrayIntensity` | `2.0` | X-ray rim strength |
| `xrayBase` | `0.05` | X-ray: opacity of surfaces facing the viewer |
| `xrayAdditive` | `false` | Additive glow instead of normal blending (invisible on white; only for dark backgrounds) |

## Views (from yaw; hard switch at 90° / 270°)
| Mode | Yaw range | Material |
|---|---|---|
| 0: X-ray | 270°–90° (front half, around 0°) | `makeXrayMaterial()`: `ShaderMaterial`, fresnel `f = pow(1 − |n·v|, power)`, alpha = `clamp(base + f · intensity, 0, 1)`, colour `#2f4a6b`, power 2.5, intensity 2.0, base 0.05, `transparent`, `depthWrite: false`, `DoubleSide`, normal blending (additive optional). One shared material for all meshes |
| 1: Full PBR | 90°–270° (back half, around 180°) | The original GLB material, unchanged |

- `modeForYaw(y)` returns 1 for `90 ≤ y < 270`, otherwise 0. `MODES = ['X-ray', 'Full PBR']`.
- X-ray defaults chosen from screenshots on the white sensor background (variants compared: 2 / 1 / 0.04 too faint; 1.5 / 1.4 / 0.06 and 1.2 / 1.2 / 0.1 muddy; 2.5 / 2 / 0.05 crisp outlines with see-through). Colours compared: steel blue, near-black `#111111`, teal `#0b5d73`; steel blue kept.
- `model.setXray({ color, power, intensity, base, additive })` / `model.getXray()` change and read the look live.

- The yaw that selects the mode is read back from the **smoothed** orientation, so the mode matches what's on screen.
- No key light any more (it was only for the old flat mode). `RoomEnvironment` lights the PBR view.

## Screen viewer: `createScreenViewer(container, model, options)`
| Setting | Value |
|---|---|
| Renderer | `WebGLRenderer({ antialias: true, alpha: true })`, clear colour transparent, `setPixelRatio(min(devicePixelRatio, 2))` |
| Tone mapping | `THREE.NeutralToneMapping` |
| Environment | `RoomEnvironment` through `PMREMGenerator.fromScene(…, 0.04)`; no other lights |
| Camera | `PerspectiveCamera`, fov **30°**, fixed on the +Z axis looking at the origin; no zoom or pan |
| Framing | distance = `radius × margin / sin(min(vertical, horizontal) half-fov)`, `margin = 1.08`, so the model fits at every orientation and aspect ratio |
| Background | CSS radial gradient behind the transparent canvas (see below) |
| Frame loop | `renderer.setAnimationLoop` with `THREE.Timer`; `dt` capped at 0.1 s |

### Background (set in `sensor/index.html`)
```js
background: { center: '#ffffff', edge: '#666666', hold: 35, size: 100 }
// → radial-gradient(circle farthest-corner at 50% 50%, #ffffff 0%, #ffffff 35%, #666666 100%)
```
- `hold`: pure white up to 35% of the distance from the centre to the corners.
- `size`: the edge colour `#666666` (40% brightness) is reached at the corners.
- The page `body` background is `#666666` too.

## Orientation convention
- `model.setTargetOrientation(yawDeg, pitchDeg)` → rotation = **Rx(−pitch) · Ry(yaw)** (three.js Euler order `'XYZ'`).
  - yaw + = the model turns so its front moves to the right on screen.
  - pitch + = the front tilts up, so you see more of the underside. The tilt always goes toward the viewer, like an orbit camera.
- `model.setTargetQuaternion(q)` sets a full orientation directly (e.g. for AR or the sensor).
- `model.getAngles()` returns the smoothed `{ yaw, pitch }` in degrees: yaw = `atan2(m[8], m[0])` (independent of pitch), pitch = `−atan2(m[6], m[5])`.
- `model.root` is the `THREE.Group` that receives the orientation. Add it to any scene; for AR, add it to the MindAR anchor group.
- `model.update(dt)` runs the slerp and the mode switch. `createScreenViewer` calls it each frame; an AR page must call it itself.
- `model.forcedMode = 0 | 1 | null` forces a view (0 = X-ray, 1 = PBR; null = automatic from yaw).

## Mouse input (`attachMouseInput`)
| Input | Effect |
|---|---|
| Drag horizontally | yaw, **0.4° per pixel** |
| Drag vertically | pitch (drag up = +), clamped to **±90°** |
| Arrow keys | ±15° |
| `0` | back to yaw 0 / pitch 0 |

## Debug overlay (`D` key, or `?debug` in the URL)
Shows yaw, pitch, mode and fps. Live controls: SMOOTH, X-ray colour, rim width (power), rim strength, facing opacity, additive glow, and a mode override.
URL option: `?model=path/to.glb` loads another model.

## Cache-busting
GitHub Pages lets browsers cache files for 10 minutes. The imports in `sensor/index.html` and `ar/index.html` carry `?v=10`: raise the number after every change to `shared/*.js`, and use it in `ar/index.html` too. If a page still looks old, hard-reload (Ctrl/Cmd + Shift + R).

## AR station (`/ar/`)
| Item | Value |
|---|---|
| Library | MindAR **1.2.5** (`mindar-image-three.prod.js` from jsDelivr), image tracking, `maxTrack: 1` |
| three compatibility | MindAR imports `sRGBEncoding` (removed in three r162). `shared/three-compat.js` re-exports three and adds it; the import map's `scopes` entry gives only MindAR this file |
| Target | `ar/target.png` (1024 px square = 138 mm on paper: 120 mm artwork + mode ring to 132 mm + 3 mm margin), compiled to `ar/target.mind`. All AR values: `docs/ar-settings.md` |
| Card | `ar/card.pdf`, A4: 120 mm artwork from `ar/design.pdf`, X-RAY / PBR ring outside it, "front" arrow below, QR code to `/ar/` bottom right. Generated by `tools/make_card.py` |
| Placement | Anchor space: card centre = origin, card width = 1, z up. The model gets `Rx(+90°)`, its base is shifted to the card plane and it's scaled to **150 mm** high (`?height=`). Front faces the "front" arrow |
| Filter | `filterMinCF 0.0005`, `filterBeta 10` (`?cf=`, `?beta=`) |
| Renderer | MindAR's renderer, `setPixelRatio(min(dpr, 2))`, `NeutralToneMapping`, `RoomEnvironment` PMREM |
| Mode | Camera position in card space → azimuth = `atan2(-x, -y)`: 0° at the front arrow, clockwise seen from above (= walking to your left, same sense as sensor yaw). `model.forcedMode = modeForYaw(azimuth)` |
| Messages | Loading %, "Point the camera at the round card", camera-denied text with a Reload button. MindAR's own UI is off |

Tested in headless Chrome with a simulated camera orbiting the printed card at 50°: card found from all sides, elevation read back as ~50°, views switch at 90° / 270° (X-ray front half, PBR back half), model stands on the card. Full AR values: `docs/ar-settings.md`.
