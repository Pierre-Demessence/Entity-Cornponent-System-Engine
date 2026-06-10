import type { EntityId, TagDef } from '@pierre/ecs';

import type { GameState, Portal } from './game';

import * as THREE from 'three';

import {
  CubeTag,
  DoorTag,
  PlateTag,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
} from './components';
import { PLAYER_EYE, PLAYER_H, PORTAL_H, PORTAL_W } from './game';

export interface Renderer3D {
  domElement: HTMLCanvasElement;
  dispose: () => void;
  render: (state: GameState) => void;
  resize: (w: number, h: number) => void;
}

// Scratch for the portal-view transform. Calls are strictly sequential within
// a frame, so module-level reuse is safe and avoids per-frame allocation.
const _basisSrc = new THREE.Matrix4();
const _basisDst = new THREE.Matrix4();
const _flip = new THREE.Matrix4().makeScale(-1, 1, -1);
const _trans = new THREE.Matrix4();
const _axR = new THREE.Vector3();
const _axU = new THREE.Vector3();
const _axN = new THREE.Vector3();

/**
 * World transform mapping the `src` portal frame to `dst`, rotated 180° about
 * up (front-of-src → front-of-dst). Used as
 * `virtualCam.matrixWorld = portalTransform(src,dst) · cam.matrixWorld`, which
 * poses a camera behind `dst` exactly as if you were looking through `src`.
 * The flip has determinant +1 (a rotation, not a reflection), so the view is
 * not mirrored.
 */
function portalTransform(src: Portal, dst: Portal, out: THREE.Matrix4): THREE.Matrix4 {
  _basisSrc
    .makeBasis(
      _axR.set(src.right.x, src.right.y, src.right.z),
      _axU.set(src.up.x, src.up.y, src.up.z),
      _axN.set(src.normal.x, src.normal.y, src.normal.z),
    )
    .transpose(); // orthonormal ⇒ transpose = inverse
  _basisDst.makeBasis(
    _axR.set(dst.right.x, dst.right.y, dst.right.z),
    _axU.set(dst.up.x, dst.up.y, dst.up.z),
    _axN.set(dst.normal.x, dst.normal.y, dst.normal.z),
  );
  out
    .makeTranslation(dst.center.x, dst.center.y, dst.center.z)
    .multiply(_basisDst)
    .multiply(_flip)
    .multiply(_basisSrc)
    .multiply(_trans.makeTranslation(-src.center.x, -src.center.y, -src.center.z));
  return out;
}

const PORTAL_VERT = `
  varying vec4 vClip;
  varying vec2 vLocal;
  void main() {
    vLocal = uv * 2.0 - 1.0;
    vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClip;
  }
`;

// Textured mode samples the render target by SCREEN-space UV: the target was
// drawn full-screen from the virtual camera, so the pixel under the portal quad
// already holds the see-through image. The target stores LINEAR colour, so we
// encode to sRGB here to match the canvas (otherwise the view looks too dark).
// A thin rim tints the colour so portals stay identifiable when see-through.
const PORTAL_FRAG = `
  uniform sampler2D uTex;
  uniform vec3 uColor;
  uniform float uTextured;
  varying vec4 vClip;
  varying vec2 vLocal;
  vec3 linearToSRGB(vec3 c) {
    c = max(c, vec3(0.0));
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(hi, lo, step(c, vec3(0.0031308)));
  }
  void main() {
    float rim = smoothstep(0.80, 1.0, length(vLocal));
    vec3 base = uColor;
    if (uTextured > 0.5) {
      vec2 uv = (vClip.xy / vClip.w) * 0.5 + 0.5;
      base = texture2D(uTex, uv).rgb;
    }
    gl_FragColor = vec4(linearToSRGB(mix(base, uColor, rim)), 1.0);
  }
`;

function makePortalMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fragmentShader: PORTAL_FRAG,
    side: THREE.DoubleSide,
    vertexShader: PORTAL_VERT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTex: { value: null },
      uTextured: { value: 0 },
    },
  });
}

/**
 * three.js adapter, first-person. ECS is the source of truth: every frame we
 * mirror each static + cube body's `Position3D`/`ShapeAabb3D` into a derived
 * `THREE.Mesh`, and place the camera at the player's eye, oriented by
 * `yaw`/`pitch`. The player's own body is not drawn (we're inside it).
 */
export function makeRenderer(width: number, height: number): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.setClearColor(0x0A0C10, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0A0C10, 26, 64);

  const camera = new THREE.PerspectiveCamera(75, width / height, 0.05, 200);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.6));
  const keyLight = new THREE.DirectionalLight(0xFFFFFF, 0.85);
  keyLight.position.set(6, 16, 4);
  scene.add(keyLight);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const staticMat = new THREE.MeshStandardMaterial({ color: 0x6B7486, roughness: 0.95 });
  const cubeMat = new THREE.MeshStandardMaterial({
    color: 0xE8E2D0,
    emissive: 0x1A140C,
    metalness: 0.1,
    roughness: 0.5,
  });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xD15A49, emissive: 0x200804, roughness: 0.5 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xB0703A, emissive: 0x1A0E04, metalness: 0.3, roughness: 0.6 });

  // Portals: oriented oval quads. With a linked pair they show a live
  // see-through view (rendered from a virtual camera into a per-portal target);
  // a lone portal shows its flat colour.
  const portalGeo = new THREE.CircleGeometry(0.5, 48);
  const blueMat = makePortalMaterial(0x3AA6FF);
  const orangeMat = makePortalMaterial(0xFF9A3A);
  const bluePortal = new THREE.Mesh(portalGeo, blueMat);
  const orangePortal = new THREE.Mesh(portalGeo, orangeMat);
  bluePortal.visible = false;
  orangePortal.visible = false;
  bluePortal.frustumCulled = false;
  orangePortal.frustumCulled = false;
  scene.add(bluePortal, orangePortal);

  // See-through plumbing: a virtual camera + one render target per portal.
  const dpr = renderer.getPixelRatio();
  const makeTarget = (): THREE.WebGLRenderTarget =>
    new THREE.WebGLRenderTarget(Math.floor(width * dpr), Math.floor(height * dpr), {
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    });
  const rtBlue = makeTarget();
  const rtOrange = makeTarget();
  const virtualCam = new THREE.PerspectiveCamera();
  virtualCam.matrixAutoUpdate = false;
  virtualCam.matrixWorldAutoUpdate = false;
  const clipPlane = new THREE.Plane();
  const viewXform = new THREE.Matrix4();
  const noClip: THREE.Plane[] = [];

  // Simple player body — shown only in the portal (RTT) passes so you can see
  // yourself through a linked pair; hidden in the first-person main pass.
  const playerBody = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x46C7B0, roughness: 0.6 });
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xFFE08A, roughness: 0.5 });
  const bodyGeo = new THREE.CapsuleGeometry(0.32, PLAYER_H - 0.64, 6, 14);
  const noseGeo = new THREE.BoxGeometry(0.18, 0.18, 0.26);
  const bodyCapsule = new THREE.Mesh(bodyGeo, bodyMat);
  const bodyNose = new THREE.Mesh(noseGeo, noseMat);
  bodyNose.position.set(0, 0.35, -0.34);
  playerBody.add(bodyCapsule, bodyNose);
  playerBody.visible = false;
  scene.add(playerBody);

  const meshes = new Map<EntityId, THREE.Mesh>();
  const touched = new Set<EntityId>();

  function ensureMesh(id: EntityId, material: THREE.Material): THREE.Mesh {
    let mesh = meshes.get(id);
    if (mesh)
      return mesh;
    mesh = new THREE.Mesh(unitBox, material);
    meshes.set(id, mesh);
    scene.add(mesh);
    return mesh;
  }

  function syncTag(state: GameState, tag: TagDef, material: THREE.Material): void {
    const posStore = state.world.getStore(Position3DDef);
    const aabbStore = state.world.getStore(ShapeAabb3DDef);
    for (const id of state.world.getTag(tag)) {
      if (touched.has(id))
        continue; // already drawn by a higher-priority tag this frame
      const p = posStore.get(id);
      const a = aabbStore.get(id);
      if (!p || !a)
        continue;
      const mesh = ensureMesh(id, material);
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.set(a.w, a.h, a.d);
      touched.add(id);
    }
  }

  function reapUntouched(): void {
    for (const [id, mesh] of meshes) {
      if (touched.has(id))
        continue;
      scene.remove(mesh);
      meshes.delete(id);
    }
    touched.clear();
  }

  function updateCamera(state: GameState): void {
    if (state.playerId == null)
      return;
    const p = state.world.getStore(Position3DDef).get(state.playerId);
    if (!p)
      return;
    camera.position.set(p.x, p.y + PLAYER_EYE, p.z);
    camera.rotation.set(state.pitch, state.yaw, 0);
  }

  function updatePlayerBody(state: GameState): void {
    if (state.playerId == null)
      return;
    const p = state.world.getStore(Position3DDef).get(state.playerId);
    if (!p)
      return;
    playerBody.position.set(p.x, p.y, p.z);
    playerBody.rotation.y = state.yaw;
  }

  const portalBasis = new THREE.Matrix4();
  const vRight = new THREE.Vector3();
  const vUp = new THREE.Vector3();
  const vNormal = new THREE.Vector3();
  function placePortal(mesh: THREE.Mesh, portal: Portal | null): void {
    if (!portal) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.set(portal.center.x, portal.center.y, portal.center.z);
    vRight.set(portal.right.x, portal.right.y, portal.right.z);
    vUp.set(portal.up.x, portal.up.y, portal.up.z);
    vNormal.set(portal.normal.x, portal.normal.y, portal.normal.z);
    portalBasis.makeBasis(vRight, vUp, vNormal);
    mesh.quaternion.setFromRotationMatrix(portalBasis);
    mesh.scale.set(PORTAL_W, PORTAL_H, 1);
  }

  function renderPortalView(rt: THREE.WebGLRenderTarget, src: Portal, dst: Portal): void {
    portalTransform(src, dst, viewXform);
    virtualCam.matrixWorld.multiplyMatrices(viewXform, camera.matrixWorld);
    virtualCam.matrixWorldInverse.copy(virtualCam.matrixWorld).invert();
    virtualCam.projectionMatrix.copy(camera.projectionMatrix);
    virtualCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    // Clip everything behind the destination portal so its host wall and the
    // void beyond don't occlude the view out of it. (If the view shows the wall
    // instead of the room, flip this normal.)
    clipPlane.setFromNormalAndCoplanarPoint(
      _axN.set(dst.normal.x, dst.normal.y, dst.normal.z),
      _axR.set(dst.center.x, dst.center.y, dst.center.z),
    );
    renderer.clippingPlanes = [clipPlane];
    renderer.setRenderTarget(rt);
    renderer.render(scene, virtualCam);
  }

  return {
    domElement: renderer.domElement,
    dispose() {
      for (const mesh of meshes.values())
        scene.remove(mesh);
      meshes.clear();
      scene.remove(bluePortal, orangePortal);
      scene.remove(playerBody);
      unitBox.dispose();
      staticMat.dispose();
      cubeMat.dispose();
      plateMat.dispose();
      doorMat.dispose();
      portalGeo.dispose();
      blueMat.dispose();
      orangeMat.dispose();
      bodyGeo.dispose();
      noseGeo.dispose();
      bodyMat.dispose();
      noseMat.dispose();
      rtBlue.dispose();
      rtOrange.dispose();
      renderer.dispose();
    },
    render(state) {
      // Specific tags first so the door (also a static body) and plate draw with
      // their own materials; syncTag skips ids already drawn this frame.
      plateMat.color.set(state.platePressed ? 0x49D17A : 0xD15A49);
      syncTag(state, DoorTag, doorMat);
      syncTag(state, PlateTag, plateMat);
      syncTag(state, CubeTag, cubeMat);
      syncTag(state, StaticBodyTag, staticMat);
      reapUntouched();
      placePortal(bluePortal, state.portals.blue);
      placePortal(orangePortal, state.portals.orange);
      updateCamera(state);
      updatePlayerBody(state);
      camera.updateMatrixWorld();

      const { blue, orange } = state.portals;
      if (blue && orange) {
        // Render each portal's see-through view with the portal quads hidden,
        // but the player body shown so you can see yourself through the pair.
        bluePortal.visible = false;
        orangePortal.visible = false;
        playerBody.visible = true;
        renderPortalView(rtBlue, blue, orange);
        renderPortalView(rtOrange, orange, blue);
        bluePortal.visible = true;
        orangePortal.visible = true;
        blueMat.uniforms.uTextured.value = 1;
        blueMat.uniforms.uTex.value = rtBlue.texture;
        orangeMat.uniforms.uTextured.value = 1;
        orangeMat.uniforms.uTex.value = rtOrange.texture;
      }
      else {
        blueMat.uniforms.uTextured.value = 0;
        orangeMat.uniforms.uTextured.value = 0;
      }

      // First-person main pass: hide our own body so we're not inside it.
      playerBody.visible = false;
      renderer.clippingPlanes = noClip;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    resize(w, h) {
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const r = renderer.getPixelRatio();
      rtBlue.setSize(Math.floor(w * r), Math.floor(h * r));
      rtOrange.setSize(Math.floor(w * r), Math.floor(h * r));
    },
  };
}
