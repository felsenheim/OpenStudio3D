// Mouse / touch input adapter (for development).
// Drag left/right = yaw, drag up/down = pitch. Arrow keys nudge by 15°.
// Feeds model.setTargetOrientation(yaw, pitch); the viewer smooths it.

export function attachMouseInput(element, model, {
  degPerPixel = 0.4,
  pitchLimit = 90,   // ±90° lets you look straight down and straight up at the model
} = {}) {
  let yaw = 0, pitch = 0, last = null;
  const apply = () => {
    pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));
    model.setTargetOrientation(yaw, pitch);
  };

  element.style.touchAction = 'none';
  element.addEventListener('pointerdown', (e) => {
    last = { x: e.clientX, y: e.clientY };
    element.setPointerCapture(e.pointerId);
  });
  element.addEventListener('pointermove', (e) => {
    if (!last) return;
    yaw += (e.clientX - last.x) * degPerPixel;
    pitch -= (e.clientY - last.y) * degPerPixel;   // drag up = front tilts up
    last = { x: e.clientX, y: e.clientY };
    apply();
  });
  const end = () => { last = null; };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);

  window.addEventListener('keydown', (e) => {
    const step = 15;
    if (e.key === 'ArrowLeft') yaw -= step;
    else if (e.key === 'ArrowRight') yaw += step;
    else if (e.key === 'ArrowUp') pitch += step;
    else if (e.key === 'ArrowDown') pitch -= step;
    else if (e.key === '0') { yaw = 0; pitch = 0; }
    else return;
    apply();
  });

  return {
    set(y, p) { yaw = y; pitch = p; apply(); },
    get() { return { yaw, pitch }; },
  };
}
