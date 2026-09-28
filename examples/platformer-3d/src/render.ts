import type { EcsWorld, TagDef } from '@pierre/ecs';
import type { Scene3DEntry } from '@pierre/ecs/modules/render-scene3d';

import type { Position3D, ShapeAabb3D } from './components';
import type { GameState } from './game';

import { Scene3DRenderer } from '@pierre/ecs/modules/render-scene3d';
import * as THREE from 'three';

import {
  CoinTag,
  PlayerTag,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
} from './components';
import { CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_LERP, CAMERA_LOOK_OFFSET_Y } from './game';

export interface Renderer3D {
  domElement: HTMLCanvasElement;
  dispose: () => void;
  render: (state: GameState) => void;
  resize: (w: number, h: number) => void;
}

/**
 * three.js adapter. Owns the scene graph; reconciles every render
 * frame by walking player + static + coin tags and mirroring their
 * Position3D/ShapeAabb3D into a matching `THREE.Mesh`. ECS is the
 * source of truth; meshes are purely derived.
 */
export function makeRenderer(width: number, height: number): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.setClearColor(0x0B0D10, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0B0D10, 20, 50);

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);

  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.55));
  const dir = new THREE.DirectionalLight(0xFFFFFF, 0.9);
  dir.position.set(6, 12, 4);
  scene.add(dir);

  // Soft ground grid for spatial reference
  const grid = new THREE.GridHelper(40, 40, 0x3A4150, 0x222832);
  grid.position.y = -0.99;
  scene.add(grid);

  // Reusable shared geometry (each mesh still gets its own scaled transform)
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitSphere = new THREE.SphereGeometry(0.5, 20, 14);

  const playerMat = new THREE.MeshStandardMaterial({ color: 0x58C4FF, metalness: 0.1, roughness: 0.4 });
  const staticMat = new THREE.MeshStandardMaterial({ color: 0x5A6577, roughness: 0.9 });
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xF4C542, emissive: 0x664A00, roughness: 0.3 });

  const boxOf = (material: THREE.Material) => (): THREE.Mesh => new THREE.Mesh(unitBox, material);
  const syncBox = (mesh: THREE.Mesh, [, p, a]: Scene3DEntry<[Position3D, ShapeAabb3D]>): void => {
    mesh.position.set(p.x, p.y, p.z);
    mesh.scale.set(a.w, a.h, a.d);
  };
  const bodiesTagged = (tag: TagDef) => (world: EcsWorld) =>
    world.query(Position3DDef, ShapeAabb3DDef).withTag(world.getTag(tag));

  const passes = [
    new Scene3DRenderer({ create: boxOf(playerMat), select: bodiesTagged(PlayerTag), sync: syncBox }),
    new Scene3DRenderer({ create: boxOf(staticMat), select: bodiesTagged(StaticBodyTag), sync: syncBox }),
    new Scene3DRenderer({
      select: bodiesTagged(CoinTag),
      create: () => new THREE.Mesh(unitSphere, coinMat),
      sync: (mesh, [, p, a]) => {
        mesh.position.set(p.x, p.y, p.z);
        mesh.scale.setScalar(a.w);
        mesh.rotation.y += 0.03;
      },
    }),
  ];

  function updateCamera(state: GameState): void {
    if (state.playerId == null)
      return;
    const p = state.world.getStore(Position3DDef).get(state.playerId);
    if (!p)
      return;
    const sin = Math.sin(state.cameraYaw);
    const cos = Math.cos(state.cameraYaw);
    // Camera orbits the player around Y at yaw radians, offset forward by CAMERA_DISTANCE.
    const targetX = p.x + sin * CAMERA_DISTANCE;
    const targetZ = p.z + cos * CAMERA_DISTANCE;
    const targetY = p.y + CAMERA_HEIGHT;
    camera.position.x += (targetX - camera.position.x) * CAMERA_LERP;
    camera.position.y += (targetY - camera.position.y) * CAMERA_LERP;
    camera.position.z += (targetZ - camera.position.z) * CAMERA_LERP;
    camera.lookAt(p.x, p.y + CAMERA_LOOK_OFFSET_Y, p.z);
  }

  return {
    domElement: renderer.domElement,
    dispose() {
      // Meshes are not disposed individually; they share the unitBox / unitSphere
      // geometries and the three *Mat materials, all disposed below.
      for (const pass of passes)
        pass.dispose(scene);
      scene.remove(grid);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      unitBox.dispose();
      unitSphere.dispose();
      playerMat.dispose();
      staticMat.dispose();
      coinMat.dispose();
      renderer.dispose();
    },
    render(state) {
      for (const pass of passes)
        pass.render({ graph: scene, world: state.world });
      updateCamera(state);
      renderer.render(scene, camera);
    },
    resize(w, h) {
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  };
}

// Re-export the tag refs used above so consumers can import them from here if they want;
// the renderer itself walks the tags directly.
export { CoinTag, PlayerTag, StaticBodyTag };
