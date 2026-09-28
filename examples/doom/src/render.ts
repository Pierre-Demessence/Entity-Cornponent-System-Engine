import type { GameState } from './game';

import { Scene3DRenderer } from '@pierre/ecs/modules/render-scene3d';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import blasterHitscanUrl from '../../assets/kenney_blaster-kit_2.1/Models/GLB format/blaster-l.glb?url';
import blasterRocketUrl from '../../assets/kenney_blaster-kit_2.1/Models/GLB format/blaster-r.glb?url';
import blasterTexUrl from '../../assets/kenney_blaster-kit_2.1/Models/GLB format/Textures/colormap.png?url';
import enemyGreenUrl from '../../assets/kenney_tiny-dungeon/Tiles/tile_0108.png?url';
import enemyRedUrl from '../../assets/kenney_tiny-dungeon/Tiles/tile_0110.png?url';
import { BillboardDef, EnemyTag, PickupDef, PickupTag, Position3DDef, ProjectileTag, ShapeAabb3DDef, StaticBodyTag, TintDef } from './components';
import { PLAYER_EYE, PROJECTILE_SIZE } from './game';

export interface Renderer3D {
  domElement: HTMLCanvasElement;
  dispose: () => void;
  render: (state: GameState) => void;
  resize: (w: number, h: number) => void;
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
 * mirror each static body's `Position3D`/`ShapeAabb3D` into a derived
 * `THREE.Mesh`, and place the camera at the player's eye, oriented by
 * `yaw`/`pitch`. The player's own body is not drawn (we're inside it).
 */
export function makeRenderer(width: number, height: number): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.setClearColor(0x14171E, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x14171E, 32, 90);

  const camera = new THREE.PerspectiveCamera(75, width / height, 0.05, 300);
  camera.rotation.order = 'YXZ';
  scene.add(camera); // so the first-person gun viewmodel (a camera child) renders
  let disposed = false;

  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.55));
  const keyLight = new THREE.DirectionalLight(0xFFF1D0, 0.9);
  keyLight.position.set(8, 20, 6);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x88AAFF, 0.25);
  fillLight.position.set(-6, 10, -8);
  scene.add(fillLight);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const DEFAULT_COLOR = 0x6B7486;
  // One MeshStandardMaterial per distinct tint colour, reused across entities.
  const matCache = new Map<number, THREE.MeshStandardMaterial>();
  function materialFor(color: number): THREE.MeshStandardMaterial {
    let mat = matCache.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
      matCache.set(color, mat);
    }
    return mat;
  }

  // Materials are picked in `sync`, not `create`, so an object never keeps the
  // look of an earlier entity whose id a reset (`clearAll`) handed out again.
  const statics = new Scene3DRenderer({
    create: () => new THREE.Mesh(unitBox, materialFor(DEFAULT_COLOR)),
    select: world => world.query(Position3DDef, ShapeAabb3DDef).withTag(world.getTag(StaticBodyTag)),
    sync: (mesh, [id, p, a], world) => {
      mesh.material = materialFor(world.getStore(TintDef).get(id)?.color ?? DEFAULT_COLOR);
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.set(a.w, a.h, a.d);
    },
  });

  // Enemy billboards: pixel-art sprites on camera-facing quads (THREE.Sprite
  // always faces the camera — the classic Doom "2.5D" look).
  const texLoader = new THREE.TextureLoader();
  const enemyTextures = [enemyGreenUrl, enemyRedUrl].map((url) => {
    const tex = texLoader.load(url);
    tex.magFilter = THREE.NearestFilter; // crisp pixels, no blur
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
  const enemyMats = enemyTextures.map(map => new THREE.SpriteMaterial({
    alphaTest: 0.5, // discard the sprite's transparent background (crisp pixel edges, no depth halo)
    map,
    transparent: true,
  }));
  const enemies = new Scene3DRenderer({
    create: () => new THREE.Sprite(enemyMats[0]),
    select: world => world.query(Position3DDef, ShapeAabb3DDef).withTag(world.getTag(EnemyTag)),
    sync: (spr, [id, p, a], world) => {
      spr.material = enemyMats[world.getStore(BillboardDef).get(id)?.sprite ?? 0] ?? enemyMats[0]!;
      spr.position.set(p.x, p.y, p.z);
      spr.scale.set(a.h, a.h, 1);
    },
  });

  // Projectiles: small glowing spheres.
  const projGeo = new THREE.SphereGeometry(PROJECTILE_SIZE * 0.7, 8, 8);
  const projMat = new THREE.MeshStandardMaterial({ color: 0xFFD24A, emissive: 0xFFA000, emissiveIntensity: 1.3 });
  const projectiles = new Scene3DRenderer({
    create: () => new THREE.Mesh(projGeo, projMat),
    select: world => world.query(Position3DDef).withTag(world.getTag(ProjectileTag)),
    sync: (mesh, [, p]) => {
      mesh.position.set(p.x, p.y, p.z);
    },
  });

  // Pickups: small bobbing, spinning cubes coloured by kind.
  const pickupGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const pickupMats = [
    new THREE.MeshStandardMaterial({ color: 0x49D17A, emissive: 0x0E3A22 }), // 0 health
    new THREE.MeshStandardMaterial({ color: 0xE8C84A, emissive: 0x3A3010 }), // 1 hitscan ammo
    new THREE.MeshStandardMaterial({ color: 0xD1722A, emissive: 0x3A1D08 }), // 2 rocket ammo
  ];
  let pickupTime = 0;
  const pickups = new Scene3DRenderer({
    create: () => new THREE.Mesh(pickupGeo, pickupMats[0]),
    select: world => world.query(Position3DDef).withTag(world.getTag(PickupTag)),
    sync: (mesh, [id, p], world) => {
      mesh.material = pickupMats[world.getStore(PickupDef).get(id)?.kind ?? 0] ?? pickupMats[0]!;
      mesh.position.set(p.x, p.y + Math.sin(pickupTime * 2 + p.x) * 0.12, p.z);
      mesh.rotation.y = pickupTime;
    },
  });

  const passes = [statics, enemies, projectiles, pickups];

  // Hitscan tracer: one reusable 2-point line, shown the frames a shot is live.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xFFF1A0, opacity: 0.85, transparent: true });
  const tracerLine = new THREE.Line(tracerGeo, tracerMat);
  tracerLine.visible = false;
  tracerLine.frustumCulled = false;
  scene.add(tracerLine);

  function syncTracer(state: GameState): void {
    const t = state.tracer;
    if (!t) {
      tracerLine.visible = false;
      return;
    }
    const arr = tracerGeo.attributes.position.array as Float32Array;
    arr[0] = t.from.x;
    arr[1] = t.from.y;
    arr[2] = t.from.z;
    arr[3] = t.to.x;
    arr[4] = t.to.y;
    arr[5] = t.to.z;
    tracerGeo.attributes.position.needsUpdate = true;
    tracerLine.visible = true;
  }

  // First-person weapon viewmodels: one blaster per weapon, parented to the
  // camera and toggled by `state.weapon`. The blaster kit ships its own
  // colormap.png, so it gets its own loader/manager.
  const gunManager = new THREE.LoadingManager();
  gunManager.setURLModifier(url => (url.includes('colormap.png') ? blasterTexUrl : url));
  const gunLoader = new GLTFLoader(gunManager);
  const guns: Array<THREE.Object3D | null> = [null, null];
  const loadGun = (url: string, slot: number): void => {
    gunLoader.load(
      url,
      (gltf) => {
        if (disposed)
          return;
        const gun = gltf.scene;
        gun.scale.setScalar(1.3);
        gun.position.set(0.24, -0.26, -0.55); // lower-right, barrel into the screen (-Z)
        gun.visible = false;
        camera.add(gun);
        guns[slot] = gun;
      },
      undefined,
      err => console.warn('Doom: failed to load gun model', err),
    );
  };
  loadGun(blasterHitscanUrl, 0);
  loadGun(blasterRocketUrl, 1);

  function syncGuns(state: GameState): void {
    if (guns[0])
      guns[0].visible = state.weapon === 0;
    if (guns[1])
      guns[1].visible = state.weapon === 1;
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

  return {
    domElement: renderer.domElement,
    dispose() {
      disposed = true;
      for (const pass of passes)
        pass.dispose(scene);
      unitBox.dispose();
      for (const mat of matCache.values())
        mat.dispose();
      matCache.clear();
      for (const mat of enemyMats)
        mat.dispose();
      for (const tex of enemyTextures)
        tex.dispose();
      projGeo.dispose();
      projMat.dispose();
      tracerGeo.dispose();
      tracerMat.dispose();
      pickupGeo.dispose();
      for (const mat of pickupMats)
        mat.dispose();
      for (const gun of guns) {
        if (gun) {
          camera.remove(gun);
          disposeModel(gun);
        }
      }
      renderer.dispose();
    },
    render(state) {
      pickupTime = performance.now() / 1000;
      for (const pass of passes)
        pass.render({ graph: scene, world: state.world });
      syncTracer(state);
      syncGuns(state);
      updateCamera(state);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
    },
    resize(w, h) {
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  };
}
