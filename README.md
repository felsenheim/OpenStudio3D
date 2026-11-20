# Tangible Interface

> **New: model-viewer version** in `mv/` (full PBR only). `mv/sensor/index.html` (default model `models/flower_03.glb`; the figure: `?model=../../models/head.glb`): `<model-viewer>` 4.4.0 without camera-controls; yaw / pitch set `camera-orbit` (theta = −(yaw + FRONT_YAW_DEG), phi = 90° + pitch), smoothing via `interpolation-decay` (100 ms), `environment-image="neutral"`, `tone-mapping="neutral"`, `field-of-view="30deg"`, same background gradient and mouse input as below. Debug overlay: `D` / `?debug`. `mv/ar/index.html`: model-viewer AR (`ar-modes="webxr scene-viewer quick-look"`, `ar-scale="fixed"` so the flower shows at its real size, about 60 cm, `ar-placement="floor"`), 3D preview with drag-to-orbit; printable QR sheet `mv/ar/card.pdf` (rebuild: `python3 tools/make_mv_card.py`, needs `pillow qrcode`). The three.js version described below stays live; snapshot in branch `threejs-v1`.

## Tangible controller (phase 2, `firmware/tangible_controller/`)
Adafruit Feather ESP32-S3 No PSRAM (5323) + BNO085 (4754) via STEMMA QT, wired USB. The board is a USB game controller: axis 0 = yaw (±180°), axis 1 = pitch (±90°), Z = roll (unused), button 0 = BOOT = Zero. The BNO085 uses its game rotation vector (no magnetometer) at 100 Hz; I2C runs at 400 kHz and the sketch restarts the sensor if no data arrives for 1 s (the BNO085 sometimes drops off the ESP32-S3's I2C bus). Serial (115200) prints yaw / pitch / roll, data rate and restarts.

Arduino IDE Tools: Board *Adafruit Feather ESP32-S3 No PSRAM*, USB Mode *USB-OTG (TinyUSB)*, USB CDC On Boot *Enabled*, USB DFU On Boot *Disabled*. Library *Adafruit BNO08x* (1.2.7), esp32 core 3.3.12. arduino-cli FQBN: `esp32:esp32:adafruit_feather_esp32s3_nopsram:USBMode=default,CDCOnBoot=cdc,DFUOnBoot=default`.

`mv/sensor/` reads it with `shared/gamepad-input.js`: press the board's button once (browsers only reveal a gamepad after its first input); the first sight of the controller and every button press set the current orientation as the front. Yaw is unwrapped across ±180°. The mouse still works without a controller. URL options: `?flipyaw`, `?flippitch` (reverse a direction), `?yawaxis=`, `?pitchaxis=` (other axes). The debug overlay (`D` / `?debug`) shows the controller name, raw axes and button.

A three.js viewer on GitHub Pages: turn a physical object (sensor station) or walk around a printed card (AR station), and the 3D model turns with it.

## Structure
```
index.html            landing page
shared/viewer.js      shared viewer: load GLB, center/scale, RoomEnvironment, 3 shading modes, smoothing, debug overlay
shared/mouse-input.js mouse/touch input adapter (development)
sensor/index.html     sensor station (mouse for now; game controller in phase 2)
ar/index.html         AR station (MindAR image tracking)
ar/design.pdf         circular artwork (source of the target)
ar/card.pdf           printable A4 card; ar/target.png + ar/target.mind = tracking image
shared/three-compat.js lets MindAR 1.2.5 load with three 0.187
tools/                make_card.py (card + target from ar/design.pdf), compile-target.html (target.mind)
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
| `D` | Debug overlay: angles, mode, fps, SMOOTH slider, X-ray colour / rim width / rim strength / facing opacity / additive, mode override |

URL options: `?debug` shows the overlay on load; `?model=path/to/other.glb` loads another model.

## AR station
1. Print `ar/card.pdf` at 100 % (actual size) on matte paper; the artwork circle must measure 120 mm. Use the station from about 25–45 cm.
2. Scan the QR code (it opens `/ar/`), allow the camera, point at the circle.
3. Walk around the card: the half you stand on picks the view (front half, at the arrow = X-ray; back half = full PBR). The ring on the card shows the two halves.

URL options: `?debug` (azimuth, elevation, mode, fps), `?height=150` (model height on the card in mm), `?cf=0.0005&beta=10` (MindAR filter: lower `cf` = calmer when still, higher `beta` = less lag when moving), `?smooth=5&dpos=3&drot=1.5` (own pose smoothing: easing speed, dead zone in mm and degrees), `?hyst=3` (degrees past a mode border before switching), `?xcolor=2f4a6b&xpower=2.5&xint=2&xbase=0.05&xadd=0` (X-ray look). `?fov=66` (camera field of view across the video's long side; MindAR's built-in 45° makes tall models lean). With `?debug` a red check pole stands on the front arrow: stand a pen there and adjust Camera FOV in the Tune panel until they match.

After changing the artwork (replace `ar/design.pdf`): `python3 tools/make_card.py`, then open `tools/compile-target.html` (local server) to get a new `ar/target.mind`.

## Views (by yaw, hard switch at 90° / 270°)
| Yaw | View |
|---|---|
| 270°–90° (front half, around 0°) | **X-ray**: fresnel shader, outlines and grazing edges strong, surfaces facing you almost transparent, overlapping parts show through. Steel blue `#2f4a6b`, normal blending (tunable in the debug overlay) |
| 90°–270° (back half, around 180°) | **Full PBR**: the original GLB material |

## Settings to tune (in `sensor/index.html`)
- `frontYawDeg`: rotates the model so its front faces the screen at yaw 0.
- `xrayColor`, `xrayPower`, `xrayIntensity`, `xrayBase`, `xrayAdditive`: look of the X-ray view (default `0x2f4a6b`, 2.5, 2.0, 0.05, false). Try values live in the debug overlay, then copy them here.
- `background`: circular falloff `{ center: '#ffffff', edge: '#666666', hold: 35, size: 100 }`; `hold` = how far pure white extends, `size` = where the edge colour is reached (both in % of the distance from the centre to the corners).
- `smooth`: SMOOTH, default 12. Higher is snappier, lower is calmer. It can also be tried live with the slider in the debug overlay.

## Updating the live site
GitHub Pages lets browsers cache files for 10 minutes. After changing `shared/*.js`, raise the `?v=` number in the imports in `sensor/index.html` so browsers load the new version at once. If a page still looks old, hard-reload it (Ctrl/Cmd + Shift + R).

## Viewer API (for the station adapters)
```js
const model = await loadTangibleModel(url, { frontYawDeg, smooth });
model.setTargetOrientation(yawDeg, pitchDeg); // or model.setTargetQuaternion(q)
model.update(dt);        // called by the viewer each frame (slerp + mode switch)
model.getAngles();       // smoothed { yaw, pitch } in degrees
model.forcedMode = 1;    // force a view (0 = X-ray, 1 = PBR); null = automatic
model.setXray({ color, power, intensity, base, additive }); // change the X-ray look live
model.root               // THREE.Group to add to any scene (also the AR anchor)
```
Rotation = Rx(-pitch) · Ry(yaw): the tilt always goes toward the viewer, like an orbit camera.
