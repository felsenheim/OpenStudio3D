// Minimal quaternion helpers. A quaternion is [x, y, z, w].

export const qIdentity = () => [0, 0, 0, 1];

export function qMul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const qConj = ([x, y, z, w]) => [-x, -y, -z, w];

export function qNorm(q) {
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
}

export function qAxisAngle(ax, ay, az, deg) {
  const h = deg * Math.PI / 360, s = Math.sin(h);
  return [ax * s, ay * s, az * s, Math.cos(h)];
}

export function qSlerp(a, b, t) {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }   // shortest way
  if (cos > 0.9995) {
    return qNorm([a[0] + t * (bx - a[0]), a[1] + t * (by - a[1]),
                  a[2] + t * (bz - a[2]), a[3] + t * (bw - a[3])]);
  }
  const th = Math.acos(cos), s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return [ka * a[0] + kb * bx, ka * a[1] + kb * by, ka * a[2] + kb * bz, ka * a[3] + kb * bw];
}

// Heading (rotation about z, degrees) of a z-up quaternion
export function qHeadingZ([x, y, z, w]) {
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180 / Math.PI;
}

// Yaw (about y) and pitch (front up = +) of a y-up screen quaternion, for display
export function qYawPitch([x, y, z, w]) {
  // the model's front (+z) after rotation
  const fx = 2 * (x * z + w * y), fy = 2 * (y * z - w * x), fz = 1 - 2 * (x * x + y * y);
  return {
    yaw: Math.atan2(fx, fz) * 180 / Math.PI,
    pitch: Math.atan2(fy, Math.hypot(fx, fz)) * 180 / Math.PI,
  };
}
