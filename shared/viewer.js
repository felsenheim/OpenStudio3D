// Shared viewer for both stations.
//
//   loadTangibleModel(url)   -> model controller (GLB, shading modes, smoothing)
//   createScreenViewer(...)  -> renderer + fixed camera + RoomEnvironment (sensor station)
//   createDebugOverlay(...)  -> press "D" to toggle angle / mode / SMOOTH slider
//
// Orientation convention (same as an orbit camera, but the model turns instead):
//   yaw   = rotation around the vertical axis, + = model turns to its left (front moves right on screen)
//   pitch = tilt toward / away from the viewer, + = front tilts up (you see more of the underside)
//   Model rotation = Rx(-pitch) * Ry(yaw), so the tilt always happens toward the viewer.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const MODES = ['Flat solid', 'Smooth + AO + normal', 'Full PBR'];
const DEG = Math.PI / 180;

// Hard switch at 60° / 180° / 300°: 0° -> flat, 120° -> smooth, 240° -> PBR.
export function modeForYaw(yawDeg) {
  const y = ((yawDeg % 360) + 360) % 360;
  if (y >= 60 && y < 180) return 1;
  if (y >= 180 && y < 300) return 2;
  return 0;
}

export async function loadTangibleModel(url, {
  frontYawDeg = 0,     // turn the model so its "front" faces the viewer at yaw 0
  size = 1,            // the model is scaled to fit a sphere of this radius
  smooth = 12,         // SMOOTH: higher = snappier, lower = calmer
  onProgress,
} = {}) {
  const gltf = await new GLTFLoader().loadAsync(url, onProgress);
  const scene = gltf.scene;

  // --- center and scale (bounding sphere, so it fits at every angle) ---
  const box = new THREE.Box3().setFromObject(scene);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const fit = new THREE.Group();               // scale + centering
  fit.add(scene);
  scene.position.sub(sphere.center);
  fit.scale.setScalar(size / sphere.radius);

  const front = new THREE.Group();             // fixed "front" offset
  front.rotation.y = frontYawDeg * DEG;
  front.add(fit);

  const root = new THREE.Group();              // this one gets the orientation
  root.add(front);

  // --- three shading modes, built once ---
  const meshes = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const pbr = o.material;
    const flat = new THREE.MeshStandardMaterial({
      color: 0xc8c8c8, roughness: 0.65, metalness: 0, flatShading: true, side: pbr.side,
    });
    const smoothMat = new THREE.MeshStandardMaterial({
      color: 0xc8c8c8, roughness: 0.55, metalness: 0, side: pbr.side,
      aoMap: pbr.aoMap || null, aoMapIntensity: pbr.aoMapIntensity ?? 1,
      normalMap: pbr.normalMap || null,
    });
    if (pbr.normalMap) smoothMat.normalScale.copy(pbr.normalScale);
    meshes.push({ mesh: o, materials: [flat, smoothMat, pbr] });
  });

  const info = {
    hasAO: meshes.some((m) => m.materials[2].aoMap),
    hasNormalMap: meshes.some((m) => m.materials[2].normalMap),
  };

  let mode = -1;
  let forcedMode = null;
  function setMode(i) {
    if (i === mode) return;
    mode = i;
    for (const m of meshes) m.mesh.material = m.materials[i];
  }

  // --- orientation + smoothing ---
  const target = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const mat = new THREE.Matrix4();
  let initialised = false;

  const ctrl = {
    root,
    info,
    size,
    smooth,
    get mode() { return mode; },
    // Force a mode (0/1/2) or null for automatic (by yaw).
    set forcedMode(v) { forcedMode = v; },
    get forcedMode() { return forcedMode; },

    setTargetOrientation(yawDeg, pitchDeg) {
      euler.set(-pitchDeg * DEG, yawDeg * DEG, 0, 'XYZ');
      target.setFromEuler(euler);
      if (!initialised) { root.quaternion.copy(target); initialised = true; }
    },
    setTargetQuaternion(q) {
      target.copy(q);
      if (!initialised) { root.quaternion.copy(target); initialised = true; }
    },
    // Current (smoothed) angles in degrees, read back from the model.
    getAngles() {
      const e = mat.makeRotationFromQuaternion(root.quaternion).elements;
      const yaw = Math.atan2(e[8], e[0]) / DEG;          // independent of pitch
      const pitch = -Math.atan2(e[6], e[5]) / DEG;
      return { yaw: (yaw + 360) % 360, pitch };
    },
    update(dt) {
      root.quaternion.slerp(target, 1 - Math.exp(-ctrl.smooth * dt));
      setMode(forcedMode ?? modeForYaw(ctrl.getAngles().yaw));
    },
  };
  ctrl.setTargetOrientation(0, 0);
  ctrl.update(0);
  return ctrl;
}

// Full-window viewer with a fixed camera (no zoom, no pan).
export function createScreenViewer(container, model, { background = 0x2a2a2a, fovDeg = 30, margin = 1.08 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(model.root);

  const camera = new THREE.PerspectiveCamera(fovDeg, 1, 0.01, 100);
  const radius = model.size; // the model fits a sphere of this radius at any orientation

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // Fit the bounding sphere in whichever direction is tighter.
    const vHalf = (camera.fov * DEG) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = (radius * margin) / Math.sin(Math.min(vHalf, hHalf));
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const timer = new THREE.Timer();
  const listeners = [];
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    for (const fn of listeners) fn(dt);
    model.update(dt);
    renderer.render(scene, camera);
  });

  return { renderer, scene, camera, onFrame: (fn) => listeners.push(fn) };
}

// Small debug panel, toggled with the "D" key.
export function createDebugOverlay(model, viewer, { visible = false, extra } = {}) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:12px;left:12px;z-index:10;padding:10px 12px;
    background:rgba(0,0,0,.65);color:#eee;font:12px/1.5 ui-monospace,monospace;
    border-radius:6px;min-width:230px;user-select:none`;
  el.innerHTML = `
    <div data-k="txt"></div>
    <label style="display:block;margin-top:6px">SMOOTH <span data-k="sv"></span><br>
      <input data-k="s" type="range" min="1" max="40" step="0.5" style="width:100%"></label>
    <div style="margin-top:4px">Mode:
      <select data-k="m"><option value="">auto (yaw)</option>
        ${MODES.map((n, i) => `<option value="${i}">${i}: ${n}</option>`).join('')}
      </select></div>
    <div style="opacity:.6;margin-top:6px">D = hide</div>`;
  el.style.display = visible ? 'block' : 'none';
  document.body.appendChild(el);
  const q = (k) => el.querySelector(`[data-k="${k}"]`);
  const s = q('s');
  s.value = model.smooth;
  s.oninput = () => { model.smooth = +s.value; };
  q('m').onchange = (e) => { model.forcedMode = e.target.value === '' ? null : +e.target.value; };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') el.style.display = el.style.display === 'none' ? 'block' : 'none';
  });

  let acc = 0, frames = 0, fps = 0;
  viewer.onFrame((dt) => {
    acc += dt; frames++;
    if (acc > 0.5) { fps = frames / acc; acc = 0; frames = 0; }
    if (el.style.display === 'none') return;
    const a = model.getAngles();
    q('txt').innerHTML =
      `yaw   ${a.yaw.toFixed(1).padStart(6)}°<br>` +
      `pitch ${a.pitch.toFixed(1).padStart(6)}°<br>` +
      `mode  ${model.mode}: ${MODES[model.mode]}<br>` +
      `AO ${model.info.hasAO ? 'yes' : 'no'} · normal map ${model.info.hasNormalMap ? 'yes' : 'no'}<br>` +
      `${fps.toFixed(0)} fps` + (extra ? `<br>${extra()}` : '');
    q('sv').textContent = model.smooth;
  });
  return el;
}
