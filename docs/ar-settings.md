# OpenStudio3D: AR station, all values

State as of 16 Nov 2026 (120 mm target from `ar/design.pdf`; camera FOV fix, 66° for the iPhone 16; defaults tuned on the iPhone: dead zone 3 mm / 1.5°, smooth 5, hysteresis 3°, height 150 mm). Everything needed to run, tune or rebuild the AR experience. Shared viewer values (materials, lights, modes) are in `docs/viewer-settings.md`.

## Links
| What | Where |
|---|---|
| AR page | https://felsenheim.github.io/OpenStudio3D/ar/ |
| AR page with debug overlay | https://felsenheim.github.io/OpenStudio3D/ar/?debug |
| Printable card | https://felsenheim.github.io/OpenStudio3D/ar/card.pdf |
| Repo | https://github.com/felsenheim/OpenStudio3D (branch `main`) |

## Files
```
ar/index.html              AR page (MindAR + shared viewer)
ar/design.pdf              the circular artwork (source of the target; replace it to change the design)
ar/card.pdf                A4 card to print
ar/card_preview.png        low-res preview of the card
ar/target.png              tracking image (input for the MindAR compiler)
ar/target.mind             compiled tracking data (loaded by the page)
shared/three-compat.js     three 0.187 + sRGBEncoding, for MindAR only
shared/viewer.js           loadTangibleModel(), modeForYaw(), MODES (shared with the sensor station)
models/head.glb            the model
tools/make_card.py         builds card.pdf, card_preview.png, target.png from ar/design.pdf
tools/compile-target.html  compiles ar/target.png into target.mind in the browser
```

## Libraries (no build step, all from jsDelivr)
| Library | Version | URL |
|---|---|---|
| three.js | 0.187.0 | `https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js` (+ `examples/jsm/` as `three/addons/`) |
| MindAR (image, three build) | 1.2.5 | `https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js` |

### Import map in `ar/index.html`
```json
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/",
    "mindar-image-three": "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js",
    "mindar-image": "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js"
  },
  "scopes": {
    "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/": { "three": "../shared/three-compat.js?v=1" }
  }
}
```
- MindAR 1.2.5 imports `sRGBEncoding`, which three removed in r162. Without the shim the whole MindAR module fails to load ("does not provide an export named 'sRGBEncoding'").
- `shared/three-compat.js` = `export * from 'three'; export const sRGBEncoding = 3001;`. Only MindAR gets it (via `scopes`); everything else uses plain three.
- Cache-busting: `viewer.js?v=9`, `three-compat.js?v=1`. Raise the number after changing the file.

## Card (print)
| Item | Value |
|---|---|
| Paper | A4 (210 × 297 mm), portrait, **matte** |
| Print scale | **100 % / actual size** (not "fit to page"). Black and white is fine: tracking runs in greyscale |
| Check | Artwork circle diameter = **120 mm** (with the mode ring: 132 mm) |
| Circle centre | horizontally centred, **118 mm** from the top edge |
| Circle content | your artwork from `ar/design.pdf` (shapes, letters, outline squares and circles), found automatically on the PDF page and scaled to 120 mm, unchanged otherwise; 0.5 mm black outline |
| Front marker | black triangle + "front" just below the mode ring at 6 o'clock (outside the tracking image) |
| Mode ring | **outside** the artwork, radius 61.5–66 mm, three arcs: FLAT steel blue `#2f4a6b` (300°–60°, at the front), SMOOTH grey `#969696` (60°–180°, left), PBR copper `#b06c34` (180°–300°, right) |
| QR code | 35 × 35 mm, bottom-right corner, 15 mm from the right and bottom edges, error correction M, links to `https://felsenheim.github.io/OpenStudio3D/ar/` |
| Text | title "OpenStudio3D · AR" top left; two instruction lines + "Print at 100 % on matte paper." bottom left; font Inter |
| Resolution | generated at 300 dpi |

## Tracking target
| Item | Value |
|---|---|
| Image | `ar/target.png`, **1024 × 1024 px**, square crop around the circle |
| Size on paper | **138 mm** wide (132 mm incl. mode ring + 3 mm margin on each side) → 7.42 px/mm. `TARGET_MM = 138` in `ar/index.html` |
| Compiled | `ar/target.mind`, 685,481 bytes, matching points 3,290 over 11 scales, 29 / 21 tracking points |
| Compiler | MindAR 1.2.5 `Compiler` (`tools/compile-target.html`, same as the online compiler) |

## MindAR settings
| Setting | Value | URL override |
|---|---|---|
| `imageTargetSrc` | `./target.mind` | |
| `maxTrack` | 1 | |
| `filterMinCF` | **0.0005** (lower = calmer when holding still) | `?cf=` |
| `filterBeta` | **10** (higher = less lag when moving) | `?beta=` |
| `uiLoading` / `uiScanning` / `uiError` | `no` (the page shows its own messages) | |
| Camera | rear camera (`facingMode: environment`), chosen by MindAR | |
| Camera field of view | **66°** across the video's long side (patched, see below) | `?fov=` |

## Camera field of view (why the model could lean)
MindAR 1.2.5 hard-codes the camera's field of view as **45° across the video height**. Phone cameras see more (iPhone 16 main camera, 26 mm equivalent: about 63–67° across the long side of the video, about 50° across the short side). With a too-small value MindAR misjudges how the card is tilted: the card itself still lines up (it's drawn with the same wrong camera), but anything standing up from the card **leans**, and a tall model shows it most. A small card viewed from close up makes it worse.

- Fix in `ar/index.html`: `Controller.prototype.addImageTargetsFromBuffer` is wrapped so the camera geometry is recomputed from `tune.fov` (focal length = (long side / 2) / tan(fov / 2), the same for portrait and landscape) just before the target is loaded; `mindar.resize()` then applies it to the three.js camera. `Controller` is imported from `mindar-image.prod.js`, which shares its module with the three build.
- Default **66°** (iPhone 16 main camera). Other phones may need 60–75°.
- Simulated check (camera with 77° on the long side, true elevation 45°): MindAR's 45° → elevation read as 36°; `fov=55` → 35°; correct `fov=77` → 45.1°.
- **Calibrating:** open `?debug`, stand a pen upright on the "front" arrow. A red 100 mm check pole is drawn there. Walk around: if the pole and the pen part ways, move the **Camera FOV** slider (the camera restarts after you let go) until they stay together from every side.

## Pose smoothing (on top of the MindAR filter)
MindAR writes the raw card pose into `anchor.group.matrix`. The model hangs on a separate group (`card`) that follows it:
1. **Dead zone:** a new pose is only accepted once it differs from the last accepted one by more than **3 mm** or **1.5°**. With a still camera the model stays completely still.
2. **Easing:** `card` moves toward the accepted pose with `lerp` / `slerp`, factor `1 − exp(−SMOOTH · dt)`, **SMOOTH = 5** (frame-rate independent, same as the sensor station).
3. When the card is found again after being lost, the pose snaps (no easing from the old position).

| Setting | Default | URL override |
|---|---|---|
| SMOOTH | 5 (higher = snappier, 0 = off) | `?smooth=` |
| Dead zone, position | 3 mm | `?dpos=` |
| Dead zone, rotation | 1.5° | `?drot=` |

Measured with a simulated, slightly shaking camera (±1.5 mm, ±0.4°): jitter at the top of the model 2.1 px → 0.4 px on average; biggest single jump 8.7 px → 1.2 px. A dead zone of 2 mm / 1° only gave about 20 % less, so 3 mm / 1.5° is the default. Confirmed by testing on the iPhone, together with SMOOTH 5. Trade-off: during slow movement the model can sit up to 3 mm / 1.5° off before catching up.

## Placement of the model
| Item | Value |
|---|---|
| Anchor space | origin = card (circle) centre, 1 unit = target width = 138 mm, x right, y toward the top of the card, z up out of the paper |
| Orientation | model group rotated **Rx(+90°)**: model up (y) → card up (z), model front (+z) → card −y = toward the "front" arrow |
| Base | model shifted so the bottom of its bounding box sits on the card plane |
| Height | **150 mm** (scale = (150 / 138) / model height). On the 120 mm card the model's base covers almost the whole card on screen; this doesn't affect tracking (it uses the camera image) |
| Height override | `?height=` in mm, e.g. `?height=90` |
| Model orientation | fixed (yaw 0, pitch 0); the viewer walks around it |
| `frontYawDeg` | 0 (front of the test model not yet calibrated) |
| Other model | `?model=path/to.glb` |

## Shading mode from the viewing angle
- Each frame the camera position is transformed into card space (inverse anchor matrix).
- **Azimuth** = `atan2(−x, −y)` in degrees, 0–360: **0° = standing at the front arrow**, increasing **clockwise seen from above** (= walking to your left). Same sense as yaw on the sensor station.
- **Elevation** = `atan2(z, √(x² + y²))` (shown in the debug overlay only).
- The azimuth is read from the smoothed pose.
- `model.forcedMode = modeForYaw(azimuth)` with **hysteresis of 3°** (`?hyst=`): the mode only changes once the azimuth is 3° past a border, so jitter at a border can't make the shading flicker. Zones:

| Azimuth | Where you stand | Mode |
|---|---|---|
| 300°–60° | at the front arrow | 0: Flat solid (steel blue, flat-shaded, key light 4) |
| 60°–180° | to the left | 1: Smooth + AO + normal (grey `#d9d9d9`, AO 1.6) |
| 180°–300° | to the right | 2: Full PBR (original GLB material) |

## Rendering
| Item | Value |
|---|---|
| Renderer | MindAR's `WebGLRenderer` (antialias, alpha), `setPixelRatio(min(devicePixelRatio, 2))` |
| Tone mapping | `THREE.NeutralToneMapping` |
| Environment | `RoomEnvironment` through `PMREMGenerator.fromScene(…, 0.04)` |
| Key light | `model.keyLight` (directional, position (4, 2.5, 0.8), camera-relative); intensity 4 in flat mode, 0 otherwise |
| Background | the camera image (MindAR video, `z-index: -2` inside `#ar`, which has its own stacking context) |
| Frame loop | `renderer.setAnimationLoop` + `THREE.Timer`, `dt` capped at 0.1 s; `model.update(dt)` each frame |

## Messages on screen
| Situation | Text |
|---|---|
| Loading the GLB | "Loading model… NN%" |
| Camera starting | "Starting camera…" |
| Card not (or no longer) visible | "Point the camera at the round card." |
| Card found | message hidden |
| Camera denied / unavailable | "No camera access. Allow the camera for this site (Settings › Safari/Chrome › Camera), then reload." + Reload button |
| No getUserMedia at all | "This browser has no camera access. Open the page over https in Safari or Chrome." |

## URL options
| Option | Default | Effect |
|---|---|---|
| `?debug` | off | overlay (card found, azimuth, elevation, mode, % of frames held by the dead zone in the last 0.5 s, fps) + **Tune** button |
| `?smooth=` | 5 | easing speed of the pose (0 = off) |
| `?dpos=` | 3 | dead zone for position (mm) |
| `?drot=` | 1.5 | dead zone for rotation (°) |
| `?hyst=` | 3 | mode-border hysteresis (°) |
| `?height=` | 150 | model height on the card in mm |
| `?fov=` | 66 | camera field of view across the video's long side (°) |
| `?cf=` | 0.0005 | MindAR `filterMinCF` |
| `?beta=` | 10 | MindAR `filterBeta` |
| `?model=` | `../models/head.glb` | another GLB |

Example: `…/ar/?debug&height=90&dpos=4&drot=2&smooth=6`

### Tune panel (`?debug`, then the **Tune** button)
Live sliders, no reload needed: dead zone mm (0–10), dead zone ° (0–5), smooth (0–30), mode hysteresis ° (0–20), model height mm (40–180), camera FOV ° (40–90; restarts the camera ~0.6 s after the last change). With `?debug` a red 100 mm check pole stands on the "front" arrow for calibrating the FOV. **Copy link with these values** puts the current settings into a URL (also shown under the buttons); **Reset** returns to the defaults. The MindAR filter (`cf`, `beta`) is set when the camera starts, so it stays a URL option.

## Devices
- iPhone / iPad: Safari or Chrome (both use WebKit on iOS). Android: Chrome.
- HTTPS is required for the camera (GitHub Pages provides it). No app install, no WebXR needed.
- Viewing angle: works best from above to about 30° above the table; flatter angles lose tracking. The underside of the model can't be seen.
- Lighting: even light, no glare on the card.

## Rebuilding the card and target
1. `pip install pillow numpy opencv-python qrcode`
2. Replace `ar/design.pdf` with the new artwork (one circle anywhere on the page; size doesn't matter, it's scaled to 120 mm). Needs poppler (`pdftoppm`).
3. From the repo root: `python3 tools/make_card.py`. Writes `ar/card.pdf`, `ar/card_preview.png`, `ar/target.png` and prints `TARGET_MM` (138 unless the sizes in the script change; then update `ar/index.html`).
4. Serve the repo locally (`npx serve` or `python3 -m http.server`) and open `tools/compile-target.html` → Compile → save the downloaded `target.mind` into `ar/`.
5. Commit everything. Reprint the card: an old printout won't match a new `target.mind`.

## Test status
- 120 mm card (current), headless Chrome, simulated phone camera with noise and blur, 35° above the table: card found from all sides, modes switch correctly, model stands on the card. Raw pose shake about 1 mm at 30–40 cm (absorbed by the 3 mm dead zone); **not found from 60 cm** in poor image conditions. Use the station from about 25–45 cm.
- Comparison (same test, 60 cm): the earlier 184 mm scan-texture card shook 1.4 mm; smaller targets need the camera closer.
- iPhone 16 with the 120 mm card: the model leaned relative to the card → MindAR's fixed 45° FOV; now 66° and adjustable.
- Tested on the iPhone with the previous 184 mm card: smoothing defaults confirmed. **Still to do:** iPhone test with the new 120 mm card.
