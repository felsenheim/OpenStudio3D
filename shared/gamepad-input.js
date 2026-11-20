// Game-controller input adapter for the tangible controller
// (firmware/tangible_controller: ESP32-S3 + BNO085 as a USB gamepad).
//   axis 0 = yaw   (-1..1 = -180..180°)
//   axis 1 = pitch (-1..1 =  -90..90°)
//   button 0 = BOOT button = Zero (the current orientation becomes the front)
// Polls the Gamepad API every frame and feeds station.setTargetOrientation(yaw, pitch).
// Yaw is unwrapped across ±180°, so the model never spins the long way round.
// Browsers only reveal a gamepad after its first input: press the button once.

export function attachGamepadInput(station, {
  yawAxis = 0,
  pitchAxis = 1,
  flipYaw = false,
  flipPitch = false,
  zeroButton = 0,
  onStatus = () => {},   // called with 'connected' | 'disconnected'
} = {}) {
  let index = null;          // gamepad index in use
  let prevRaw = null;        // previous raw yaw, for unwrapping
  let yawCont = 0;           // continuous (unwrapped) yaw
  let zeroYaw = 0, zeroPitch = 0;
  let prevBtn = false;
  let last = { yaw: NaN, pitch: NaN };
  const state = { connected: false, id: '', axes: [], button: false, yaw: 0, pitch: 0 };

  const pick = (pads) => {
    if (index !== null && pads[index]) return pads[index];
    for (const p of pads) if (p && p.axes.length >= 2) { index = p.index; return p; }
    return null;
  };

  function zero() { zeroYaw = yawCont; zeroPitch = state.rawPitch ?? 0; }

  function poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pick(pads);
    if (!gp) {
      if (state.connected) { state.connected = false; index = null; prevRaw = null; onStatus('disconnected'); }
      requestAnimationFrame(poll);
      return;
    }

    const rawYaw = gp.axes[yawAxis] * 180 * (flipYaw ? -1 : 1);
    const rawPitch = gp.axes[pitchAxis] * 90 * (flipPitch ? -1 : 1);
    state.rawPitch = rawPitch;
    if (prevRaw === null) yawCont = rawYaw;
    else {
      let d = rawYaw - prevRaw;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      yawCont += d;
    }
    prevRaw = rawYaw;

    const btn = !!(gp.buttons[zeroButton] && gp.buttons[zeroButton].pressed);
    if (!state.connected) {             // first sight of the controller: start at the front
      state.connected = true;
      zero();
      onStatus('connected');
    } else if (btn && !prevBtn) zero();
    prevBtn = btn;

    const yaw = yawCont - zeroYaw;
    const pitch = Math.max(-90, Math.min(90, rawPitch - zeroPitch));
    if (yaw !== last.yaw || pitch !== last.pitch) {
      station.setTargetOrientation(yaw, pitch);
      last = { yaw, pitch };
    }

    Object.assign(state, { id: gp.id, axes: Array.from(gp.axes), button: btn, yaw, pitch });
    requestAnimationFrame(poll);
  }

  window.addEventListener('gamepadconnected', (e) => { if (index === null) index = e.gamepad.index; });
  requestAnimationFrame(poll);
  return { state, zero };
}
