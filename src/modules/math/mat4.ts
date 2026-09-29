import type { Quat } from './quat';
import type { Vec3 } from './vec3';

/**
 * 4×4 matrices for affine transforms and projections — the `Mat4` block of this
 * module. A plain `number[]` of 16 entries in **column-major** order, the
 * WebGL / three.js `Matrix4.elements` layout: entry `(row, col)` sits at index
 * `col * 4 + row`, and the translation is `m[12], m[13], m[14]`. A matrix built
 * here can be handed to three.js with `matrix.fromArray(m)` and to WebGL with
 * `uniformMatrix4fv(loc, false, m)`, no transposing.
 *
 * Every function returns a new array. Projections map to the WebGL clip space:
 * NDC `x, y, z ∈ [-1, 1]`, camera looking down `-Z`.
 */
export type Mat4 = number[];

/** The identity matrix. */
export function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * The product `a·b`: the transform that applies `b` **first**, then `a` — the
 * same order as `quatMul`. A view-projection is `mat4Multiply(projection, view)`.
 */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = Array.from<number>({ length: 16 });
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row]
        = a[row]! * b[col * 4]!
          + a[4 + row]! * b[col * 4 + 1]!
          + a[8 + row]! * b[col * 4 + 2]!
          + a[12 + row]! * b[col * 4 + 3]!;
    }
  }
  return out;
}

/** Rows become columns. The inverse of a pure rotation matrix. */
export function mat4Transpose(m: Mat4): Mat4 {
  const out = Array.from<number>({ length: 16 });
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++)
      out[row * 4 + col] = m[col * 4 + row]!;
  }
  return out;
}

/**
 * The inverse of `m`, or `null` when `m` is singular (determinant `0`) — a
 * zero scale, or a projection collapsed by `near === far`.
 */
export function mat4Invert(m: Mat4): Mat4 | null {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (det === 0)
    return null;
  const inv = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * inv,
    (a02 * b10 - a01 * b11 - a03 * b09) * inv,
    (a31 * b05 - a32 * b04 + a33 * b03) * inv,
    (a22 * b04 - a21 * b05 - a23 * b03) * inv,
    (a12 * b08 - a10 * b11 - a13 * b07) * inv,
    (a00 * b11 - a02 * b08 + a03 * b07) * inv,
    (a32 * b02 - a30 * b05 - a33 * b01) * inv,
    (a20 * b05 - a22 * b02 + a23 * b01) * inv,
    (a10 * b10 - a11 * b08 + a13 * b06) * inv,
    (a01 * b08 - a00 * b10 - a03 * b06) * inv,
    (a30 * b04 - a31 * b02 + a33 * b00) * inv,
    (a21 * b02 - a20 * b04 - a23 * b00) * inv,
    (a11 * b07 - a10 * b09 - a12 * b06) * inv,
    (a00 * b09 - a01 * b07 + a02 * b06) * inv,
    (a31 * b01 - a30 * b03 - a32 * b00) * inv,
    (a20 * b03 - a21 * b01 + a22 * b00) * inv,
  ];
}

/**
 * The transform that scales by `scale`, then rotates by the **unit** quaternion
 * `rotation`, then translates by `translation` — an object's local-to-world
 * matrix (three.js `Matrix4.compose`). `scale` defaults to `1` on every axis.
 */
export function mat4Compose(translation: Vec3, rotation: Quat, scale: Vec3 = { x: 1, y: 1, z: 1 }): Mat4 {
  const { w, x, y, z } = rotation;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * scale.x,
    (xy + wz) * scale.x,
    (xz - wy) * scale.x,
    0,
    (xy - wz) * scale.y,
    (1 - (xx + zz)) * scale.y,
    (yz + wx) * scale.y,
    0,
    (xz + wy) * scale.z,
    (yz - wx) * scale.z,
    (1 - (xx + yy)) * scale.z,
    0,
    translation.x,
    translation.y,
    translation.z,
    1,
  ];
}

/**
 * Perspective projection: `fovY` is the **vertical** field of view in radians,
 * `aspect` is width / height, and `near` / `far` are positive distances in front
 * of the camera. Maps the view frustum to NDC `[-1, 1]` on every axis.
 */
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ];
}

/**
 * Orthographic projection of the view-space box `[left, right] × [bottom, top]`,
 * `near` to `far` in front of the camera, onto NDC `[-1, 1]` on every axis.
 */
export function mat4Orthographic(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  return [
    -2 * lr,
    0,
    0,
    0,
    0,
    -2 * bt,
    0,
    0,
    0,
    0,
    2 * nf,
    0,
    (left + right) * lr,
    (top + bottom) * bt,
    (far + near) * nf,
    1,
  ];
}

/**
 * The **view** matrix of a camera at `eye` looking at `target` — world to camera
 * space, with the camera's `-Z` toward `target` and `+Y` as close to `up` as the
 * view direction allows (gl-matrix `lookAt`; three.js `Matrix4.lookAt` returns
 * only the rotation, the other way round).
 *
 * `eye === target` has no view direction and yields the identity. An `up`
 * parallel to the view direction falls back to world `+Z`, then `+X`.
 */
export function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3 = { x: 0, y: 1, z: 0 }): Mat4 {
  let zx = eye.x - target.x;
  let zy = eye.y - target.y;
  let zz = eye.z - target.z;
  const zLen = Math.hypot(zx, zy, zz);
  if (zLen === 0)
    return mat4Identity();
  zx /= zLen;
  zy /= zLen;
  zz /= zLen;

  const { x: xx, y: xy, z: xz } = crossNormalized(up, zx, zy, zz)
    ?? crossNormalized({ x: 0, y: 0, z: 1 }, zx, zy, zz)
    ?? crossNormalized({ x: 1, y: 0, z: 0 }, zx, zy, zz)!;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return [
    xx,
    yx,
    zx,
    0,
    xy,
    yy,
    zy,
    0,
    xz,
    yz,
    zz,
    0,
    -(xx * eye.x + xy * eye.y + xz * eye.z),
    -(yx * eye.x + yy * eye.y + yz * eye.z),
    -(zx * eye.x + zy * eye.y + zz * eye.z),
    1,
  ];
}

function crossNormalized(up: Vec3, zx: number, zy: number, zz: number): Vec3 | null {
  const x = up.y * zz - up.z * zy;
  const y = up.z * zx - up.x * zz;
  const z = up.x * zy - up.y * zx;
  const len = Math.hypot(x, y, z);
  if (len < 1e-9)
    return null;
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * Transform the point `p` (`w = 1`) by `m`, then divide by the resulting `w` —
 * so a projection matrix yields NDC directly. Points on the camera plane
 * (`w = 0`) divide to `±Infinity`; check `w` via {@link mat4TransformVec4} first
 * when that matters.
 */
export function mat4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z, w] = mat4TransformVec4(m, p.x, p.y, p.z, 1);
  return { x: x / w, y: y / w, z: z / w };
}

/**
 * Transform the direction `v` (`w = 0`) by `m`: rotation and scale apply,
 * translation does not. The result is not normalised.
 */
export function mat4TransformDirection(m: Mat4, v: Vec3): Vec3 {
  const [x, y, z] = mat4TransformVec4(m, v.x, v.y, v.z, 0);
  return { x, y, z };
}

/** Transform the homogeneous vector `(x, y, z, w)` by `m`, with no divide. */
export function mat4TransformVec4(
  m: Mat4,
  x: number,
  y: number,
  z: number,
  w: number,
): [number, number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]! * w,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]! * w,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]! * w,
    m[3]! * x + m[7]! * y + m[11]! * z + m[15]! * w,
  ];
}
