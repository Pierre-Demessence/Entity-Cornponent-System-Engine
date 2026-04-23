import type { EntityId, TagDef } from '@pierre/ecs';

import type { GameState } from './game';

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

  const meshes = new Map<EntityId, THREE.Mesh>();
  const touched = new Set<EntityId>();

  function ensureMesh(id: EntityId, kind: 'player' | 'static' | 'coin'): THREE.Mesh {
    let mesh = meshes.get(id);
    if (mesh)
      return mesh;
    if (kind === 'coin') {
      mesh = new THREE.Mesh(unitSphere, coinMat);
    }
    else if (kind === 'player') {
      mesh = new THREE.Mesh(unitBox, playerMat);
    }
    else {
      mesh = new THREE.Mesh(unitBox, staticMat);
    }
    meshes.set(id, mesh);
    scene.add(mesh);
    return mesh;
  }

  function syncFromTag(state: GameState, tag: TagDef, kind: 'player' | 'static' | 'coin'): void {
    const posStore = state.world.getStore(Position3DDef);
    const aabbStore = state.world.getStore(ShapeAabb3DDef);
    for (const id of state.world.getTag(tag)) {
      const p = posStore.get(id);
      const a = aabbStore.get(id);
      if (!p || !a)
        continue;
      const mesh = ensureMesh(id, kind);
      mesh.position.set(p.x, p.y, p.z);
      if (kind === 'coin') {
        mesh.scale.setScalar(a.w);
        mesh.rotation.y += 0.03;
      }
      else {
        mesh.scale.set(a.w, a.h, a.d);
      }
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
      for (const mesh of meshes.values())
        scene.remove(mesh);
      meshes.clear();
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
      syncFromTag(state, PlayerTag, 'player');
      syncFromTag(state, StaticBodyTag, 'static');
      syncFromTag(state, CoinTag, 'coin');
      reapUntouched();
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
