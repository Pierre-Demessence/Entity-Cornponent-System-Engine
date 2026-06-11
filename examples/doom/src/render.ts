import type { EntityId } from '@pierre/ecs';

import type { GameState } from './game';

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

  function syncStatics(state: GameState): void {
    const posStore = state.world.getStore(Position3DDef);
    const aabbStore = state.world.getStore(ShapeAabb3DDef);
    const tintStore = state.world.getStore(TintDef);
    // Statics are rebuilt deterministically on reset (clearAll rewinds entity
    // ids), so a reused id keeps its tint — ensureMesh sets the material once.
    for (const id of state.world.getTag(StaticBodyTag)) {
      if (touched.has(id))
        continue;
      const p = posStore.get(id);
      const a = aabbStore.get(id);
      if (!p || !a)
        continue;
      const tint = tintStore.get(id);
      const mesh = ensureMesh(id, materialFor(tint?.color ?? DEFAULT_COLOR));
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
  const enemySprites = new Map<EntityId, THREE.Sprite>();
  const enemyTouched = new Set<EntityId>();

  function syncEnemies(state: GameState): void {
    const posStore = state.world.getStore(Position3DDef);
    const aabbStore = state.world.getStore(ShapeAabb3DDef);
    const bbStore = state.world.getStore(BillboardDef);
    for (const id of state.world.getTag(EnemyTag)) {
      const p = posStore.get(id);
      const a = aabbStore.get(id);
      if (!p || !a)
        continue;
      let spr = enemySprites.get(id);
      if (!spr) {
        const bb = bbStore.get(id);
        spr = new THREE.Sprite(enemyMats[bb?.sprite ?? 0] ?? enemyMats[0]);
        enemySprites.set(id, spr);
        scene.add(spr);
      }
      spr.position.set(p.x, p.y, p.z);
      spr.scale.set(a.h, a.h, 1);
      enemyTouched.add(id);
    }
    for (const [id, spr] of enemySprites) {
      if (enemyTouched.has(id))
        continue;
      scene.remove(spr);
      enemySprites.delete(id);
    }
    enemyTouched.clear();
  }

  // Projectiles: small glowing spheres.
  const projGeo = new THREE.SphereGeometry(PROJECTILE_SIZE * 0.7, 8, 8);
  const projMat = new THREE.MeshStandardMaterial({ color: 0xFFD24A, emissive: 0xFFA000, emissiveIntensity: 1.3 });
  const projMeshes = new Map<EntityId, THREE.Mesh>();
  const projTouched = new Set<EntityId>();

  function syncProjectiles(state: GameState): void {
    const posStore = state.world.getStore(Position3DDef);
    for (const id of state.world.getTag(ProjectileTag)) {
      const p = posStore.get(id);
      if (!p)
        continue;
      let mesh = projMeshes.get(id);
      if (!mesh) {
        mesh = new THREE.Mesh(projGeo, projMat);
        projMeshes.set(id, mesh);
        scene.add(mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
      projTouched.add(id);
    }
    for (const [id, mesh] of projMeshes) {
      if (projTouched.has(id))
        continue;
      scene.remove(mesh);
      projMeshes.delete(id);
    }
    projTouched.clear();
  }

  // Pickups: small bobbing, spinning cubes coloured by kind.
  const pickupGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const pickupMats = [
    new THREE.MeshStandardMaterial({ color: 0x49D17A, emissive: 0x0E3A22 }), // 0 health
    new THREE.MeshStandardMaterial({ color: 0xE8C84A, emissive: 0x3A3010 }), // 1 hitscan ammo
    new THREE.MeshStandardMaterial({ color: 0xD1722A, emissive: 0x3A1D08 }), // 2 rocket ammo
  ];
  const pickupMeshes = new Map<EntityId, THREE.Mesh>();
  const pickupTouched = new Set<EntityId>();

  function syncPickups(state: GameState): void {
    const posStore = state.world.getStore(Position3DDef);
    const pickupStore = state.world.getStore(PickupDef);
    const t = performance.now() / 1000;
    for (const id of state.world.getTag(PickupTag)) {
      const p = posStore.get(id);
      if (!p)
        continue;
      let mesh = pickupMeshes.get(id);
      if (!mesh) {
        const pk = pickupStore.get(id);
        mesh = new THREE.Mesh(pickupGeo, pickupMats[pk?.kind ?? 0] ?? pickupMats[0]);
        pickupMeshes.set(id, mesh);
        scene.add(mesh);
      }
      mesh.position.set(p.x, p.y + Math.sin(t * 2 + p.x) * 0.12, p.z);
      mesh.rotation.y = t;
      pickupTouched.add(id);
    }
    for (const [id, mesh] of pickupMeshes) {
      if (pickupTouched.has(id))
        continue;
      scene.remove(mesh);
      pickupMeshes.delete(id);
    }
    pickupTouched.clear();
  }

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
      for (const mesh of meshes.values())
        scene.remove(mesh);
      meshes.clear();
      unitBox.dispose();
      for (const mat of matCache.values())
        mat.dispose();
      matCache.clear();
      for (const spr of enemySprites.values())
        scene.remove(spr);
      enemySprites.clear();
      for (const mat of enemyMats)
        mat.dispose();
      for (const tex of enemyTextures)
        tex.dispose();
      projGeo.dispose();
      projMat.dispose();
      for (const mesh of projMeshes.values())
        scene.remove(mesh);
      projMeshes.clear();
      tracerGeo.dispose();
      tracerMat.dispose();
      pickupGeo.dispose();
      for (const mat of pickupMats)
        mat.dispose();
      for (const mesh of pickupMeshes.values())
        scene.remove(mesh);
      pickupMeshes.clear();
      for (const gun of guns) {
        if (gun) {
          camera.remove(gun);
          disposeModel(gun);
        }
      }
      renderer.dispose();
    },
    render(state) {
      syncStatics(state);
      reapUntouched();
      syncEnemies(state);
      syncProjectiles(state);
      syncPickups(state);
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
