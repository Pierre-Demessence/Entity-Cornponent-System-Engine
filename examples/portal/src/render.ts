import type { EntityId, TagDef } from '@pierre/ecs';

import type { GameState, Portal } from './game';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import blasterUrl from '../../assets/kenney_blaster-kit_2.1/Models/GLB format/blaster-l.glb?url';
import blasterTexUrl from '../../assets/kenney_blaster-kit_2.1/Models/GLB format/Textures/colormap.png?url';
import characterUrl from '../../assets/kenney_blocky-characters_20/Models/GLB format/character-a.glb?url';
import characterTexUrl from '../../assets/kenney_blocky-characters_20/Models/GLB format/Textures/texture-a.png?url';
import buttonUrl from '../../assets/kenney_prototype-kit/Models/GLB format/button-floor-square.glb?url';
import crateUrl from '../../assets/kenney_prototype-kit/Models/GLB format/crate.glb?url';
import doorUrl from '../../assets/kenney_prototype-kit/Models/GLB format/door-sliding-double-round.glb?url';
import floorUrl from '../../assets/kenney_prototype-kit/Models/GLB format/floor-thick.glb?url';
import colormapUrl from '../../assets/kenney_prototype-kit/Models/GLB format/Textures/colormap.png?url';
import wallUrl from '../../assets/kenney_prototype-kit/Models/GLB format/wall.glb?url';
import {
  CubeTag,
  DoorTag,
  FloorTag,
  PlateTag,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
  WallTag,
} from './components';
import { CUBE_SIZE, DOOR_D, DOOR_H, DOOR_W, DOOR_X, PLATE_D, PLATE_POS, PLATE_W, PLAYER_EYE, PLAYER_H, PORTAL_H, PORTAL_W } from './game';
import { transformPoint } from './systems/portal-math';

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
  uniform float uEncode;
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
    vec3 col = mix(base, uColor, rim);
    // Encode to sRGB only on the final canvas pass; render targets stay linear
    // so nested portal sampling doesn't compound the encode (which whitens out).
    if (uEncode > 0.5)
      col = linearToSRGB(col);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makePortalMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fragmentShader: PORTAL_FRAG,
    side: THREE.DoubleSide,
    vertexShader: PORTAL_VERT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uEncode: { value: 1 },
      uTex: { value: null },
      uTextured: { value: 0 },
    },
  });
}

/**
 * Recenter a loaded model on its bounding box and scale it (non-uniformly) to
 * fill a `w × h × d` box, returning a wrapper whose origin is that box centre.
 */
function fitModelToBox(model: THREE.Object3D, w: number, h: number, d: number): THREE.Group {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.scale.set(w / (size.x || 1), h / (size.y || 1), d / (size.z || 1));
  return wrapper;
}

/** Dispose every geometry/material/texture under a loaded model. */
function disposeModel(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh)
      return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
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
  scene.add(camera); // so the first-person gun viewmodel (a camera child) renders

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

  // Portal rims — thin unlit rings shown in BOTH the main and portal (RTT)
  // passes. The see-through fill is hidden during RTT (it would occlude the
  // view), so the rings are what make the other portal visible *through* a
  // portal, and make a body crossing a portal enter a ring rather than a wall.
  const ringGeo = new THREE.RingGeometry(0.4, 0.5, 48);
  const blueRingMat = new THREE.MeshBasicMaterial({ color: 0x6CC4FF, side: THREE.DoubleSide });
  const orangeRingMat = new THREE.MeshBasicMaterial({ color: 0xFFB066, side: THREE.DoubleSide });
  const blueRing = new THREE.Mesh(ringGeo, blueRingMat);
  const orangeRing = new THREE.Mesh(ringGeo, orangeRingMat);
  blueRing.visible = false;
  orangeRing.visible = false;
  blueRing.frustumCulled = false;
  orangeRing.frustumCulled = false;
  scene.add(blueRing, orangeRing);

  // See-through plumbing: a virtual camera + one render target per portal.
  const dpr = renderer.getPixelRatio();
  const makeTarget = (): THREE.WebGLRenderTarget =>
    new THREE.WebGLRenderTarget(Math.floor(width * dpr), Math.floor(height * dpr), {
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    });
  // Two targets per portal for a fixed 2-level, SINGLE-FRAME recursion (near +
  // deep). Single-frame (not temporal/ping-pong) so moving doesn't smear old
  // frames into the recursion.
  const rtBlue = makeTarget();
  const rtBlue2 = makeTarget();
  const rtOrange = makeTarget();
  const rtOrange2 = makeTarget();
  const virtualCam = new THREE.PerspectiveCamera();
  virtualCam.matrixAutoUpdate = false;
  virtualCam.matrixWorldAutoUpdate = false;
  const clipPlane = new THREE.Plane();
  const oneClip: THREE.Plane[] = [clipPlane]; // reused each RTT pass (avoids a per-pass array alloc)
  const viewXform = new THREE.Matrix4();
  const camM1 = new THREE.Matrix4();
  const camM2 = new THREE.Matrix4();
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

  // Swap the capsule placeholder for the Kenney blocky character once it loads.
  // The GLB references its texture by an external relative URI, so a
  // LoadingManager URL modifier redirects that to the Vite-bundled texture.
  let characterModel: THREE.Object3D | null = null;
  let doorModel: THREE.Object3D | null = null;
  let crateModel: THREE.Object3D | null = null;
  let crateCloneModel: THREE.Object3D | null = null;
  let plateModel: THREE.Object3D | null = null;
  const plateMats: THREE.MeshStandardMaterial[] = [];
  let floorTiles: THREE.InstancedMesh | null = null;
  let wallTiles: THREE.InstancedMesh | null = null;
  let viewGun: THREE.Object3D | null = null;
  let worldGun: THREE.Object3D | null = null;
  let disposed = false;
  // One manager/loader for every Kenney GLB; each GLB references its texture by
  // a relative URI, so redirect those to the Vite-bundled asset URLs.
  const kenneyManager = new THREE.LoadingManager();
  kenneyManager.setURLModifier((url) => {
    if (url.includes('texture-a.png'))
      return characterTexUrl;
    if (url.includes('colormap.png'))
      return colormapUrl;
    return url;
  });
  const gltfLoader = new GLTFLoader(kenneyManager);
  gltfLoader.load(
    characterUrl,
    (gltf) => {
      if (disposed)
        return;
      const model = gltf.scene;
      const size = new THREE.Vector3();
      new THREE.Box3().setFromObject(model).getSize(size);
      model.scale.setScalar(PLAYER_H / (size.y || 1));
      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.y = -PLAYER_H / 2 - scaledBox.min.y; // feet to the AABB bottom
      model.rotation.y = Math.PI; // face the look direction (-Z); flip if wrong
      playerBody.remove(bodyCapsule, bodyNose);
      bodyGeo.dispose();
      noseGeo.dispose();
      bodyMat.dispose();
      noseMat.dispose();
      playerBody.add(model);
      characterModel = model;
    },
    undefined,
    err => console.warn('Portal: failed to load character model', err),
  );
  gltfLoader.load(
    doorUrl,
    (gltf) => {
      if (disposed)
        return;
      doorModel = fitModelToBox(gltf.scene, DOOR_W, DOOR_H, DOOR_D);
      scene.add(doorModel);
    },
    undefined,
    err => console.warn('Portal: failed to load door model', err),
  );
  gltfLoader.load(
    crateUrl,
    (gltf) => {
      if (disposed)
        return;
      const cloneSource = gltf.scene.clone();
      crateModel = fitModelToBox(gltf.scene, CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
      crateModel.visible = false;
      scene.add(crateModel);
      crateCloneModel = fitModelToBox(cloneSource, CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
      crateCloneModel.visible = false;
      scene.add(crateCloneModel);
    },
    undefined,
    err => console.warn('Portal: failed to load crate model', err),
  );
  gltfLoader.load(
    buttonUrl,
    (gltf) => {
      if (disposed)
        return;
      plateModel = fitModelToBox(gltf.scene, PLATE_W, 0.25, PLATE_D);
      plateModel.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh)
          return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          plateMats.push(m as THREE.MeshStandardMaterial);
      });
      scene.add(plateModel);
    },
    undefined,
    err => console.warn('Portal: failed to load plate model', err),
  );
  gltfLoader.load(
    floorUrl,
    (gltf) => {
      if (disposed)
        return;
      gltf.scene.updateMatrixWorld(true);
      let geo: THREE.BufferGeometry | null = null;
      let mat: THREE.Material | null = null;
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || geo)
          return;
        geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      });
      if (!geo || !mat)
        return;
      // 1×1 tiles cover each 8×12 slab; one InstancedMesh = one draw call.
      const cells: Array<[number, number]> = [];
      for (const [x0, x1] of [[-10, -2], [2, 10]] as const) {
        for (let gx = x0 + 0.5; gx < x1; gx += 1) {
          for (let gz = -5.5; gz < 6; gz += 1)
            cells.push([gx, gz]);
        }
      }
      floorTiles = new THREE.InstancedMesh(geo, mat, cells.length);
      const tm = new THREE.Matrix4();
      cells.forEach(([gx, gz], i) => {
        tm.makeTranslation(gx, -0.2, gz); // tile top (y=0.2 local) sits at floor y=0
        floorTiles!.setMatrixAt(i, tm);
      });
      floorTiles.instanceMatrix.needsUpdate = true;
      floorTiles.frustumCulled = false;
      scene.add(floorTiles);
    },
    undefined,
    err => console.warn('Portal: failed to load floor model', err),
  );
  gltfLoader.load(
    wallUrl,
    (gltf) => {
      if (disposed)
        return;
      gltf.scene.updateMatrixWorld(true);
      let geo: THREE.BufferGeometry | null = null;
      let mat: THREE.Material | null = null;
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || geo)
          return;
        geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      });
      if (!geo || !mat)
        return;
      // wall.glb is a 1×1 panel, 0.2 thick, front face toward +X. tileRegion
      // lays panels over a flat rectangular wall face, rotating about Y so the
      // front points into the room and scaling so a whole number of panels
      // fills the region exactly (the panel front sits flush with the face).
      const yAxis = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      const s = new THREE.Vector3();
      const tiles: THREE.Matrix4[] = [];
      // faceAxis = the wall-normal axis; dir = ±1 along it (pointing into the
      // room). u0..u1 = the along-wall span (Z when faceAxis is 'x', else X);
      // y0..y1 = the height span.
      const tileRegion = (
        faceAxis: 'x' | 'z',
        facePos: number,
        dir: 1 | -1,
        u0: number,
        u1: number,
        y0: number,
        y1: number,
      ) => {
        const cols = Math.max(1, Math.round(u1 - u0));
        const rows = Math.max(1, Math.round(y1 - y0));
        const tw = (u1 - u0) / cols;
        const th = (y1 - y0) / rows;
        const rotY = faceAxis === 'x'
          ? (dir > 0 ? 0 : Math.PI)
          : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        q.setFromAxisAngle(yAxis, rotY);
        s.set(1, th, tw); // local Z = panel width → u; local Y = height
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const u = u0 + (c + 0.5) * tw;
            const yy = y0 + r * th; // panel origin is its bottom edge
            if (faceAxis === 'x')
              p.set(facePos - dir * 0.1, yy, u);
            else
              p.set(u, yy, facePos - dir * 0.1);
            tiles.push(new THREE.Matrix4().compose(p, q, s));
          }
        }
      };
      // Perimeter interior faces.
      tileRegion('x', -10, 1, -6, 6, 0, 6); // left → faces +X
      tileRegion('x', 10, -1, -6, 6, 0, 6); // right → faces -X
      tileRegion('z', -6, 1, -10, 10, 0, 6); // back → faces +Z
      tileRegion('z', 6, -1, -10, 10, 0, 6); // front → faces -Z
      // Dividing wall (0.5 thick) at x=DOOR_X: tile both faces around the
      // doorway opening (the door panel fills the gap).
      for (const [fx, dir] of [[DOOR_X - 0.25, -1], [DOOR_X + 0.25, 1]] as const) {
        tileRegion('x', fx, dir, -6, -1.5, 0, 6); // left of doorway
        tileRegion('x', fx, dir, 1.5, 6, 0, 6); // right of doorway
        tileRegion('x', fx, dir, -1.5, 1.5, DOOR_H, 6); // header above doorway
      }
      wallTiles = new THREE.InstancedMesh(geo, mat, tiles.length);
      tiles.forEach((m, i) => wallTiles!.setMatrixAt(i, m));
      wallTiles.instanceMatrix.needsUpdate = true;
      wallTiles.frustumCulled = false;
      scene.add(wallTiles);
    },
    undefined,
    err => console.warn('Portal: failed to load wall model', err),
  );

  // Portal gun: one chunky blaster shown two ways — a first-person viewmodel
  // (child of the camera, drawn in the main pass only) and a world copy in the
  // character's hands (child of playerBody, so you see yourself holding it
  // through portals). The blaster kit ships its OWN colormap.png, so it needs a
  // separate loader — the shared one routes colormap.png to the prototype-kit
  // palette.
  const blasterManager = new THREE.LoadingManager();
  blasterManager.setURLModifier(url => (url.includes('colormap.png') ? blasterTexUrl : url));
  new GLTFLoader(blasterManager).load(
    blasterUrl,
    (gltf) => {
      if (disposed)
        return;
      const gun = gltf.scene;
      const held = gun.clone(); // clone before applying viewmodel transforms
      // Viewmodel: barrel points -Z (model local) = camera forward; nudge it
      // right/down so it sits in the lower-right like a typical FPS viewmodel.
      gun.scale.setScalar(1.2);
      gun.position.set(0.22, -0.2, -0.45);
      camera.add(gun);
      viewGun = gun;
      // World copy in the character's right hand (the character faces -Z, so
      // the gun's -Z barrel points the same way the player looks).
      held.scale.setScalar(1.2);
      held.position.set(0.28, 0.15, -0.4);
      playerBody.add(held);
      worldGun = held;
    },
    undefined,
    err => console.warn('Portal: failed to load blaster model', err),
  );

  // Cube "ghost" rendered emerging from the destination portal while the held
  // cube straddles the source, so pushing the cube into a portal shows it
  // coming out the other side (its real far half is hidden behind the window).
  const cubeClone = new THREE.Mesh(unitBox, cubeMat);
  cubeClone.scale.setScalar(CUBE_SIZE);
  cubeClone.visible = false;
  cubeClone.frustumCulled = false;
  scene.add(cubeClone);

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

  function placeRing(mesh: THREE.Mesh, portal: Portal | null): void {
    if (!portal) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    // Nudge a touch further off the wall than the fill so the frame reads clean.
    mesh.position.set(
      portal.center.x + portal.normal.x * 0.02,
      portal.center.y + portal.normal.y * 0.02,
      portal.center.z + portal.normal.z * 0.02,
    );
    vRight.set(portal.right.x, portal.right.y, portal.right.z);
    vUp.set(portal.up.x, portal.up.y, portal.up.z);
    vNormal.set(portal.normal.x, portal.normal.y, portal.normal.z);
    portalBasis.makeBasis(vRight, vUp, vNormal);
    mesh.quaternion.setFromRotationMatrix(portalBasis);
    mesh.scale.set(PORTAL_W, PORTAL_H, 1);
  }

  /**
   * Position the cube clone at the cube's image through `src → dst` when the
   * cube is straddling the source portal's opening. Returns whether it should
   * be shown for this pass.
   */
  function placeCubeClone(state: GameState, src: Portal, dst: Portal, target: THREE.Object3D): boolean {
    if (state.cubeId == null)
      return false;
    const cp = state.world.getStore(Position3DDef).get(state.cubeId);
    const ca = state.world.getStore(ShapeAabb3DDef).get(state.cubeId);
    if (!cp || !ca)
      return false;
    const dx = cp.x - src.center.x;
    const dy = cp.y - src.center.y;
    const dz = cp.z - src.center.z;
    const lx = dx * src.right.x + dy * src.right.y + dz * src.right.z;
    const ly = dx * src.up.x + dy * src.up.y + dz * src.up.z;
    const lz = dx * src.normal.x + dy * src.normal.y + dz * src.normal.z;
    // Near the plane and roughly in front of the opening.
    if (Math.abs(lz) > 1.2 || Math.abs(lx) > PORTAL_W / 2 + ca.w || Math.abs(ly) > PORTAL_H / 2 + ca.h)
      return false;
    const tp = transformPoint(cp, src, dst);
    target.position.set(tp.x, tp.y, tp.z);
    return true;
  }

  function renderToTarget(rt: THREE.WebGLRenderTarget, camMatrix: THREE.Matrix4, dst: Portal): void {
    virtualCam.matrixWorld.copy(camMatrix);
    virtualCam.matrixWorldInverse.copy(camMatrix).invert();
    virtualCam.projectionMatrix.copy(camera.projectionMatrix);
    virtualCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    // Clip everything behind the destination portal so its host wall and the
    // void beyond don't occlude the view out of it.
    clipPlane.setFromNormalAndCoplanarPoint(
      _axN.set(dst.normal.x, dst.normal.y, dst.normal.z),
      _axR.set(dst.center.x, dst.center.y, dst.center.z),
    );
    renderer.clippingPlanes = oneClip;
    renderer.setRenderTarget(rt);
    renderer.render(scene, virtualCam);
  }

  return {
    domElement: renderer.domElement,
    dispose() {
      disposed = true;
      for (const mesh of meshes.values())
        scene.remove(mesh);
      meshes.clear();
      scene.remove(bluePortal, orangePortal);
      scene.remove(playerBody);
      scene.remove(cubeClone);
      scene.remove(blueRing, orangeRing);
      unitBox.dispose();
      staticMat.dispose();
      cubeMat.dispose();
      plateMat.dispose();
      doorMat.dispose();
      portalGeo.dispose();
      blueMat.dispose();
      orangeMat.dispose();
      ringGeo.dispose();
      blueRingMat.dispose();
      orangeRingMat.dispose();
      if (characterModel) {
        disposeModel(characterModel);
      }
      else {
        bodyGeo.dispose();
        noseGeo.dispose();
        bodyMat.dispose();
        noseMat.dispose();
      }
      if (doorModel)
        disposeModel(doorModel);
      if (crateModel)
        disposeModel(crateModel);
      if (crateCloneModel)
        disposeModel(crateCloneModel);
      if (plateModel)
        disposeModel(plateModel);
      if (floorTiles) {
        floorTiles.geometry.dispose();
        const m = floorTiles.material as THREE.MeshStandardMaterial;
        m.map?.dispose();
        m.dispose();
      }
      if (wallTiles) {
        wallTiles.geometry.dispose();
        const m = wallTiles.material as THREE.MeshStandardMaterial;
        m.map?.dispose();
        m.dispose();
      }
      if (viewGun)
        disposeModel(viewGun);
      if (worldGun)
        disposeModel(worldGun);
      rtBlue.dispose();
      rtBlue2.dispose();
      rtOrange.dispose();
      rtOrange2.dispose();
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

      // Swap the door box for the loaded sliding-door model (slides with it).
      if (doorModel && state.doorId != null) {
        const dp = state.world.getStore(Position3DDef).get(state.doorId);
        if (dp)
          doorModel.position.set(dp.x, dp.y, dp.z);
        const doorMesh = meshes.get(state.doorId);
        if (doorMesh)
          doorMesh.visible = false;
      }

      // Swap the cube box for the loaded crate model (follows the cube).
      if (crateModel && state.cubeId != null) {
        const cp = state.world.getStore(Position3DDef).get(state.cubeId);
        if (cp) {
          crateModel.position.set(cp.x, cp.y, cp.z);
          crateModel.visible = true;
        }
        const cubeMesh = meshes.get(state.cubeId);
        if (cubeMesh)
          cubeMesh.visible = false;
      }

      // Swap the plate box for the floor-button model; depress + tint it green
      // while powered.
      if (plateModel) {
        plateModel.position.set(PLATE_POS.x, 0.125 - (state.platePressed ? 0.05 : 0), PLATE_POS.z);
        for (const mat of plateMats)
          mat.color.setHex(state.platePressed ? 0x49D17A : 0xFFFFFF);
        for (const id of state.world.getTag(PlateTag)) {
          const m = meshes.get(id);
          if (m)
            m.visible = false;
        }
      }
      placePortal(bluePortal, state.portals.blue);
      placePortal(orangePortal, state.portals.orange);
      placeRing(blueRing, state.portals.blue);
      placeRing(orangeRing, state.portals.orange);
      updateCamera(state);
      updatePlayerBody(state);
      camera.updateMatrixWorld();

      // Hide the floor slab boxes once the tiled floor is shown.
      if (floorTiles) {
        for (const id of state.world.getTag(FloorTag)) {
          const m = meshes.get(id);
          if (m)
            m.visible = false;
        }
      }
      // Hide the perimeter wall boxes once the tiled walls are shown.
      if (wallTiles) {
        for (const id of state.world.getTag(WallTag)) {
          const m = meshes.get(id);
          if (m)
            m.visible = false;
        }
      }

      const { blue, orange } = state.portals;
      if (blue && orange) {
        playerBody.visible = true;
        if (viewGun)
          viewGun.visible = false; // viewmodel never appears inside portal views
        const cubeVisual: THREE.Object3D | undefined = crateModel ?? (state.cubeId == null ? undefined : meshes.get(state.cubeId));
        const cloneVisual: THREE.Object3D = crateCloneModel ?? cubeClone;
        // Fills write LINEAR into the targets (encode once on the canvas), or
        // nested recursion levels compound the sRGB encode and wash to white.
        blueMat.uniforms.uEncode.value = 0;
        orangeMat.uniforms.uEncode.value = 0;

        // --- Blue's chain (views out of orange), deepest level first. Each
        // level's camera is one more portal-hop back; clip stays at orange. ---
        portalTransform(blue, orange, viewXform);
        camM1.multiplyMatrices(viewXform, camera.matrixWorld);
        camM2.multiplyMatrices(viewXform, camM1);
        orangePortal.visible = false; // destination sits at the virtual camera
        bluePortal.visible = true;
        blueMat.uniforms.uTextured.value = 0; // deepest: flat (end of the hall)
        renderToTarget(rtBlue2, camM2, orange);
        blueMat.uniforms.uTextured.value = 1; // near: shows the deeper level
        blueMat.uniforms.uTex.value = rtBlue2.texture;
        const cloneInBlue = placeCubeClone(state, blue, orange, cloneVisual);
        cloneVisual.visible = cloneInBlue;
        if (cloneInBlue && cubeVisual)
          cubeVisual.visible = false;
        renderToTarget(rtBlue, camM1, orange);
        if (cubeVisual)
          cubeVisual.visible = true;

        // --- Orange's chain (views out of blue). ---
        portalTransform(orange, blue, viewXform);
        camM1.multiplyMatrices(viewXform, camera.matrixWorld);
        camM2.multiplyMatrices(viewXform, camM1);
        bluePortal.visible = false;
        orangePortal.visible = true;
        orangeMat.uniforms.uTextured.value = 0;
        renderToTarget(rtOrange2, camM2, blue);
        orangeMat.uniforms.uTextured.value = 1;
        orangeMat.uniforms.uTex.value = rtOrange2.texture;
        const cloneInOrange = placeCubeClone(state, orange, blue, cloneVisual);
        cloneVisual.visible = cloneInOrange;
        if (cloneInOrange && cubeVisual)
          cubeVisual.visible = false;
        renderToTarget(rtOrange, camM1, blue);
        if (cubeVisual)
          cubeVisual.visible = true;

        // --- Main pass: both fills textured with their near targets, encoded. ---
        cloneVisual.visible = false;
        bluePortal.visible = true;
        orangePortal.visible = true;
        blueMat.uniforms.uEncode.value = 1;
        blueMat.uniforms.uTextured.value = 1;
        blueMat.uniforms.uTex.value = rtBlue.texture;
        orangeMat.uniforms.uEncode.value = 1;
        orangeMat.uniforms.uTextured.value = 1;
        orangeMat.uniforms.uTex.value = rtOrange.texture;
      }
      else {
        blueMat.uniforms.uEncode.value = 1;
        orangeMat.uniforms.uEncode.value = 1;
        blueMat.uniforms.uTextured.value = 0;
        orangeMat.uniforms.uTextured.value = 0;
      }

      // First-person main pass: hide our own body so we're not inside it.
      playerBody.visible = false;
      if (viewGun)
        viewGun.visible = true;
      renderer.clippingPlanes = noClip;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    resize(w, h) {
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const r = renderer.getPixelRatio();
      const tw = Math.floor(w * r);
      const th = Math.floor(h * r);
      rtBlue.setSize(tw, th);
      rtBlue2.setSize(tw, th);
      rtOrange.setSize(tw, th);
      rtOrange2.setSize(tw, th);
    },
  };
}
