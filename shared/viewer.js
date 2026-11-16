// Shared viewer for both stations.
//
//   loadTangibleModel(url)   -> model controller (GLB, two views: X-ray / full PBR, smoothing)
//   createScreenViewer(...)  -> renderer + fixed camera + RoomEnvironment (sensor station)
//   createDebugOverlay(...)  -> press "D" to toggle angle / mode / SMOOTH + X-ray sliders
//   makeXrayMaterial(...)    -> fresnel "X-ray" material (rims strong, facing surfaces faint)
//
// Orientation convention (same as an orbit camera, but the model turns instead):
//   yaw   = rotation around the vertical axis, + = model turns to its left (front moves right on screen)
//   pitch = tilt toward / away from the viewer, + = front tilts up (you see more of the underside)
//   Model rotation = Rx(-pitch) * Ry(yaw), so the tilt always happens toward the viewer.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const MODES = ['X-ray', 'Full PBR'];
const DEG = Math.PI / 180;

// Two views, hard switch at 90° / 270°: front half (270°–90°, around 0°) -> X-ray,
// back half (90°–270°, around 180°) -> full PBR.
export function modeForYaw(yawDeg) {
  const y = ((yawDeg % 360) + 360) % 360;
  return y >= 90 && y < 270 ? 1 : 0;
}

// Fresnel "X-ray": surfaces facing the viewer are almost transparent, outlines and
// grazing edges are strong; overlapping parts show through each other.
// Normal blending with a dark colour reads well on the white sensor background
// (additive glow would vanish on white); additive is an option for dark backgrounds.
export function makeXrayMaterial({ color = 0x2f4a6b, power = 2.5, intensity = 2.0, base = 0.05,
                                   additive = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      power: { value: power },          // higher = thinner rim
      intensity: { value: intensity },  // rim strength
      base: { value: base },            // opacity of surfaces facing the viewer
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float power, intensity, base;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);
        gl_FragColor = vec4(color, clamp(base + f * intensity, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export async function loadTangibleModel(url, {
  frontYawDeg = 0,     // turn the model so its "front" faces the viewer at yaw 0
  size = 1,            // the model is scaled to fit a sphere of this radius
  smooth = 12,         // SMOOTH: higher = snappier, lower = calmer
  xrayColor = 0x2f4a6b,   // X-ray: rim colour (dark reads best on the white sensor background)
  xrayPower = 2.5,        // X-ray: higher = thinner rim
  xrayIntensity = 2.0,    // X-ray: rim strength
  xrayBase = 0.05,        // X-ray: opacity of surfaces facing the viewer
  xrayAdditive = false,   // X-ray: additive glow instead of normal blending (only for dark backgrounds)
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

  // --- two views, built once: 0 = X-ray (one shared material), 1 = the original GLB material ---
  const xray = makeXrayMaterial({ color: xrayColor, power: xrayPower, intensity: xrayIntensity,
                                  base: xrayBase, additive: xrayAdditive });
  const meshes = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes.push({ mesh: o, materials: [xray, o.material] });
  });

  const info = {
    hasAO: meshes.some((m) => m.materials[1].aoMap),
    hasNormalMap: meshes.some((m) => m.materials[1].normalMap),
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
    // X-ray look, adjustable live (debug overlay / AR Tune panel)
    xray,
    getXray() {
      const u = xray.uniforms;
      return { color: '#' + u.color.value.getHexString(), power: u.power.value, intensity: u.intensity.value,
               base: u.base.value, additive: xray.blending === THREE.AdditiveBlending };
    },
    setXray({ color, power, intensity, base, additive } = {}) {
      const u = xray.uniforms;
      if (color !== undefined) u.color.value.set(color);
      if (power !== undefined) u.power.value = power;
      if (intensity !== undefined) u.intensity.value = intensity;
      if (base !== undefined) u.base.value = base;
      if (additive !== undefined) {
        xray.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
        xray.needsUpdate = true;
      }
    },
    smooth,
    get mode() { return mode; },
    // Force a mode (0 = X-ray, 1 = PBR) or null for automatic (by yaw).
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
// background: { center, edge, size } -> circular falloff from the centre colour to the edge colour.
//   hold = how far the pure centre colour extends before the falloff starts (% of centre-to-corner distance).
//   size = where the edge colour is reached, in % of the distance from the centre to the farthest corner.
export function createScreenViewer(container, model, {
  background = { center: '#ffffff', edge: '#999999', hold: 5, size: 100 },
  fovDeg = 30, margin = 1.08,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);   // transparent canvas: the CSS gradient shows through
  const setBackground = ({ center, edge, hold = 0, size = 100 }) => {
    container.style.background =
      `radial-gradient(circle farthest-corner at 50% 50%, ${center} 0%, ${center} ${hold}%, ${edge} ${size}%)`;
  };
  setBackground(background);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
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

  return { renderer, scene, camera, setBackground, onFrame: (fn) => listeners.push(fn) };
}

// Small debug panel, toggled with the "D" key.
export function createDebugOverlay(model, viewer, { visible = false, extra } = {}) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:12px;left:12px;z-index:10;padding:10px 12px;
    background:rgba(0,0,0,.65);color:#eee;font:12px/1.5 ui-monospace,monospace;
    border-radius:6px;min-width:230px;user-select:none`;
  const slider = (k, label, min, max, step) => `
      <label style="display:block">${label} <span data-v="${k}"></span><br>
        <input data-k="${k}" type="range" min="${min}" max="${max}" step="${step}" style="width:100%"></label>`;
  el.innerHTML = `
    <div data-k="txt"></div>
    <label style="display:block;margin-top:6px">SMOOTH <span data-v="smooth"></span><br>
      <input data-k="smooth" type="range" min="1" max="40" step="0.5" style="width:100%"></label>
    <div style="margin-top:6px;border-top:1px solid #555;padding-top:6px">X-ray:
      <label style="display:block">colour <input data-k="color" type="color"> <span data-v="color"></span></label>
      ${slider('power', 'rim width (power)', 0.5, 6, 0.1)}
      ${slider('intensity', 'rim strength', 0, 3, 0.05)}
      ${slider('base', 'facing opacity', 0, 0.5, 0.01)}
      <label style="display:block"><input data-k="additive" type="checkbox"> additive glow (dark backgrounds only)</label>
    </div>
    <div style="margin-top:4px">Mode:
      <select data-k="m"><option value="">auto (yaw)</option>
        ${MODES.map((n, i) => `<option value="${i}">${i}: ${n}</option>`).join('')}
      </select></div>
    <div style="opacity:.6;margin-top:6px">D = hide</div>`;
  el.style.display = visible ? 'block' : 'none';
  document.body.appendChild(el);
  const q = (k) => el.querySelector(`[data-k="${k}"]`);
  const v = (k) => el.querySelector(`[data-v="${k}"]`);
  q('smooth').value = model.smooth;
  q('smooth').oninput = (e) => { model.smooth = +e.target.value; };
  const x = model.getXray();
  for (const k of ['color', 'power', 'intensity', 'base']) {
    q(k).value = x[k];
    q(k).oninput = (e) => model.setXray({ [k]: k === 'color' ? e.target.value : +e.target.value });
  }
  q('additive').checked = x.additive;
  q('additive').onchange = (e) => model.setXray({ additive: e.target.checked });
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
      `${fps.toFixed(0)} fps` + (extra ? `<br>${extra()}` : '');
    const xr = model.getXray();
    v('smooth').textContent = model.smooth;
    v('color').textContent = xr.color;
    for (const k of ['power', 'intensity', 'base']) v(k).textContent = xr[k];
  });
  return el;
}
