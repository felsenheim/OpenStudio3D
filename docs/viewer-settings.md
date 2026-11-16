# OpenStudio3D: viewer settings and handover

State as of 16 Nov 2026 (phase 3 built). This file has everything needed to continue, e.g. testing the AR station on a device or starting phase 2.

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
- No Draco (removed on purpose, so there's no DRACOLoader). No normal map yet: the final model will have one, and the smooth mode uses it automatically.
- The node has a 180° rotation around Y. The model's front is not yet calibrated (`frontYawDeg` = 0; the face shows at about yaw 120°).

## Model settings: `loadTangibleModel(url, options)`
| Option | Value | Meaning |
|---|---|---|
| `frontYawDeg` | `0` | Turns the model so its front faces the viewer at yaw 0 (still to calibrate) |
| `size` | `1` | The model is centred on its bounding-sphere centre and scaled to this sphere radius |
| `smooth` | `12` | SMOOTH: `slerp(target, 1 - exp(-SMOOTH * dt))` |
| `flatColor` | `0x2f4a6b` | Flat mode colour: deep steel blue |
| `flatKeyLight` | `4` | Flat mode: intensity of the directional key light |
| `flatEnv` | `0.08` | Flat mode: `envMapIntensity` (room light kept) |
| `smoothColor` | `0xd9d9d9` | Smooth mode colour: 15% grey |
| `smoothAO` | `1.6` | Smooth mode: `aoMapIntensity` |

## Shading modes (from yaw; hard switch at 60° / 180° / 300°)
| Mode | Yaw range | Material |
|---|---|---|
| 0: Flat solid | 300°–60° (around 0°) | `MeshStandardMaterial` color `#2f4a6b`, roughness 0.75, metalness 0, `flatShading: true`, envMapIntensity 0.08, no maps |
| 1: Smooth + AO + normal | 60°–180° (around 120°) | `MeshStandardMaterial` color `#d9d9d9`, roughness 0.55, metalness 0, `aoMap` from the GLB at intensity 1.6, `normalMap` from the GLB if present (with its `normalScale`) |
| 2: Full PBR | 180°–300° (around 240°) | The original GLB material, unchanged |

- The yaw that selects the mode is read back from the **smoothed** orientation, so the mode matches what's on screen.
- Key light: `DirectionalLight(0xffffff)` at position `(4, 2.5, 0.8)` (side and above, raking). Intensity is 4 in mode 0 and 0 in the other modes. It stays in the scene at all times, so mode switches cause no shader recompile.

## Screen viewer: `createScreenViewer(container, model, options)`
| Setting | Value |
|---|---|
| Renderer | `WebGLRenderer({ antialias: true, alpha: true })`, clear colour transparent, `setPixelRatio(min(devicePixelRatio, 2))` |
| Tone mapping | `THREE.NeutralToneMapping` |
| Environment | `RoomEnvironment` through `PMREMGenerator.fromScene(…, 0.04)`; no other lights except the flat-mode key light |
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
- `model.forcedMode = 0 | 1 | 2 | null` forces a mode (null = automatic from yaw).

## Mouse input (`attachMouseInput`)
| Input | Effect |
|---|---|
| Drag horizontally | yaw, **0.4° per pixel** |
| Drag vertically | pitch (drag up = +), clamped to **±90°** |
| Arrow keys | ±15° |
| `0` | back to yaw 0 / pitch 0 |

## Debug overlay (`D` key, or `?debug` in the URL)
Shows yaw, pitch, mode, AO / normal-map status and fps. Live controls: SMOOTH, flat colour, key light, room light, smooth colour, AO strength, and a mode override.
URL option: `?model=path/to.glb` loads another model.

## Cache-busting
GitHub Pages lets browsers cache files for 10 minutes. The imports in `sensor/index.html` carry `?v=9`: raise the number after every change to `shared/*.js`, and use it in `ar/index.html` too. If a page still looks old, hard-reload (Ctrl/Cmd + Shift + R).

## AR station (`/ar/`)
| Item | Value |
|---|---|
| Library | MindAR **1.2.5** (`mindar-image-three.prod.js` from jsDelivr), image tracking, `maxTrack: 1` |
| three compatibility | MindAR imports `sRGBEncoding` (removed in three r162). `shared/three-compat.js` re-exports three and adds it; the import map's `scopes` entry gives only MindAR this file |
| Target | `ar/target.png` (1024 px square = 190 mm on paper: 184 mm circle + 3 mm margin), compiled to `ar/target.mind` (about 400 matching points per scale) |
| Card | `ar/card.pdf`, A4: circle with the model's scan texture (contrast-boosted), white centre (60 mm) with cross and "front" arrow, FLAT / SMOOTH / PBR ring, QR code to `/ar/` bottom right. Generated by `tools/make_card.py` from `models/head.glb` |
| Placement | Anchor space: card centre = origin, card width = 1, z up. The model gets `Rx(+90°)`, its base is shifted to the card plane and it's scaled to **120 mm** high (`?height=`). Front faces the "front" arrow |
| Filter | `filterMinCF 0.0005`, `filterBeta 10` (`?cf=`, `?beta=`) |
| Renderer | MindAR's renderer, `setPixelRatio(min(dpr, 2))`, `NeutralToneMapping`, `RoomEnvironment` PMREM, `model.keyLight` in the scene |
| Mode | Camera position in card space → azimuth = `atan2(-x, -y)`: 0° at the front arrow, clockwise seen from above (= walking to your left, same sense as sensor yaw). `model.forcedMode = modeForYaw(azimuth)` |
| Messages | Loading %, "Point the camera at the round card", camera-denied text with a Reload button. MindAR's own UI is off |

Tested in headless Chrome with a simulated camera orbiting the printed card at 50°: card found from all sides, elevation read back as ~50°, modes switch at 60° / 180° / 300°, model stands on the card. Still to do: the test on a real iPhone.
