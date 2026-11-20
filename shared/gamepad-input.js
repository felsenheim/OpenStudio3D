// Game-controller input adapter for the tangible controller
// (firmware/tangible_controller: ESP32-S3 + BNO085 as a USB gamepad).
// The firmware sends the board's full orientation as a rotation vector
// (game rotation vector, world z = up): v = axis * angle / 180°
//   axis 0 = vx, axis 1 = vy, axis 2 = vz  (-1..1, about 1.4° per step in every pose)
//   button 0 = BOOT button = Zero
//
// The model turns exactly like the board, relative to the moment of Zero:
//   delta (world)  = q · q0⁻¹
//   model rotation = C · H · delta · H⁻¹ · C⁻¹
// C maps the sensor world (z up) to the screen (y up, z toward the viewer).
// H removes the board's heading at Zero, so the board side that faced you at
// Zero maps to the screen's "toward the viewer". Which board side that is
// (0 / 90 / 180 / 270°) is the `front` option.
// Browsers only reveal a gamepad after its first input: press the button once.

import { qMul, qConj, qNorm, qAxisAngle, qHeadingZ } from './quat.js?v=1';

const S3 = 1 / Math.sqrt(3);
const C = qAxisAngle(S3, S3, S3, -120);   // world x→screen z, y→x, z→y

export function attachGamepadInput(station, {
  axes = [0, 1, 2],       // gamepad axes carrying vx, vy, vz
  front = 0,              // which board side faces you at Zero (degrees around the vertical)
  zeroButton = 0,
  onStatus = () => {},    // called with 'connected' | 'disconnected'
} = {}) {
  let index = null;
  let q0 = [0, 0, 0, 1];
  let H = [0, 0, 0, 1];
  let prevBtn = false;
  const state = { connected: false, id: '', axes: [], button: false, q: [0, 0, 0, 1] };

  const pick = (pads) => {
    if (index !== null && pads[index]) return pads[index];
    for (const p of pads) if (p && p.axes.length >= 3) { index = p.index; return p; }
    return null;
  };

  function readQuat(gp) {
    const x = gp.axes[axes[0]] || 0, y = gp.axes[axes[1]] || 0, z = gp.axes[axes[2]] || 0;
    const n = Math.hypot(x, y, z);
    if (n < 1e-6) return [0, 0, 0, 1];
    const half = Math.min(n, 1) * Math.PI / 2, s = Math.sin(half) / n;
    return qNorm([x * s, y * s, z * s, Math.cos(half)]);
  }

  function zero() {
    q0 = state.q;
    H = qAxisAngle(0, 0, 1, -(qHeadingZ(q0) + front));
  }

  function poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pick(pads);
    if (!gp) {
      if (state.connected) { state.connected = false; index = null; onStatus('disconnected'); }
      requestAnimationFrame(poll);
      return;
    }

    state.q = readQuat(gp);
    const btn = !!(gp.buttons[zeroButton] && gp.buttons[zeroButton].pressed);
    if (!state.connected) {            // first sight of the controller: start at the front
      state.connected = true;
      zero();
      onStatus('connected');
    } else if (btn && !prevBtn) zero();
    prevBtn = btn;

    const delta = qMul(state.q, qConj(q0));
    const CH = qMul(C, H);
    station.setTargetQuaternion(qMul(qMul(CH, delta), qConj(CH)));

    Object.assign(state, { id: gp.id, axes: Array.from(gp.axes), button: btn });
    requestAnimationFrame(poll);
  }

  window.addEventListener('gamepadconnected', (e) => { if (index === null) index = e.gamepad.index; });
  requestAnimationFrame(poll);
  return { state, zero };
}
