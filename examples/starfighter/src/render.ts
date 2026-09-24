import type { EntityId } from '@pierre/ecs';

import type { GameState } from './game';

import { vec3RandomUnit } from '@pierre/ecs/modules/math';
import * as THREE from 'three';

import { BulletTag, Position3DDef, RadiusDef, TargetTag } from './components';
import {
  BOUNDS_RADIUS,
  CAMERA_DISTANCE,
  CAMERA_HEIGHT,
  CAMERA_POS_LERP,
  CAMERA_ROT_LERP,
} from './game';

export interface Renderer3D {
  domElement: HTMLCanvasElement;
  dispose: () => void;
  render: (state: GameState) => void;
  resize: (w: number, h: number) => void;
}

const DUST_COUNT = 900;
const DUST_RANGE = 60; // half-extent of the wrap cube around the camera

/**
 * three.js adapter. ECS is the source of truth: every render frame we mirror
 * each ship / bullet / target body's `Position3D` into a derived mesh, orient
 * the ship from its quaternion, and trail a smoothed third-person chase camera
 * behind it. The dust field, boundary sphere, planet, and starfield are pure
 * presentation (no ECS entities) and give the otherwise-empty void enough
 * parallax landmarks to read the ship's motion and position.
 */
export function makeRenderer(width: number, height: number): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.setClearColor(0x05070D, 1);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1200);
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
  scene.add(camera);

  scene.add(new THREE.AmbientLight(0x8090B0, 0.7));
  const key = new THREE.DirectionalLight(0xFFF3E0, 1.1);
  key.position.set(60, 120, 40);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4060FF, 0.4);
  rim.position.set(-80, -40, -60);
  scene.add(rim);

  // Backdrop starfield.
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const s = vec3RandomUnit();
    starPos[i * 3] = s.x * 500;
    starPos[i * 3 + 1] = s.y * 500;
    starPos[i * 3 + 2] = s.z * 500;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xBFD0FF, size: 2, sizeAttenuation: false });
  const stars = new THREE.Points(starGeo, starMat);
  // World-space (not a camera child) so rotating the ship sweeps the sky; the
  // sphere is recentred on the camera each frame so you never fly out of it.
  stars.frustumCulled = false;
  scene.add(stars);

  // Near dust field: world-space points wrapped into a cube around the camera
  // each frame, so flying produces a strong streaming-parallax motion cue.
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPos[i * 3] = (Math.random() * 2 - 1) * DUST_RANGE;
    dustPos[i * 3 + 1] = (Math.random() * 2 - 1) * DUST_RANGE;
    dustPos[i * 3 + 2] = (Math.random() * 2 - 1) * DUST_RANGE;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0x6E7DA8, opacity: 0.8, size: 0.12, sizeAttenuation: true, transparent: true });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // Absolute landmark: a distant planet well outside the play boundary.
  const planetGeo = new THREE.SphereGeometry(70, 32, 24);
  const planetMat = new THREE.MeshStandardMaterial({ color: 0x3A5FB0, emissive: 0x0A1430, roughness: 0.9 });
  const planet = new THREE.Mesh(planetGeo, planetMat);
  planet.position.set(-180, -60, -240);
  scene.add(planet);

  // Spherical play boundary as a faint wireframe.
  const boundGeo = new THREE.SphereGeometry(BOUNDS_RADIUS, 24, 16);
  const boundMat = new THREE.MeshBasicMaterial({ color: 0x1E3358, opacity: 0.28, transparent: true, wireframe: true });
  const bounds = new THREE.Mesh(boundGeo, boundMat);
  scene.add(bounds);

  // Ship model — nose points -Z (local forward). Built once; only one ship.
  const ship = new THREE.Group();
  const noseGeo = new THREE.ConeGeometry(0.55, 1.9, 18);
  noseGeo.rotateX(-Math.PI / 2); // apex -> -Z
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9FB4D6, metalness: 0.5, roughness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x37E0FF, emissive: 0x0E5A70, metalness: 0.4, roughness: 0.3 });
  const nose = new THREE.Mesh(noseGeo, hullMat);
  nose.position.z = -0.5;
  const bodyGeo = new THREE.BoxGeometry(0.9, 0.5, 1.6);
  const body = new THREE.Mesh(bodyGeo, hullMat);
  const wingGeo = new THREE.BoxGeometry(2.8, 0.14, 0.9);
  const wings = new THREE.Mesh(wingGeo, accentMat);
  wings.position.z = 0.4;
  const finGeo = new THREE.BoxGeometry(0.14, 0.7, 0.8);
  const fin = new THREE.Mesh(finGeo, accentMat);
  fin.position.set(0, 0.4, 0.6);
  const glowGeo = new THREE.SphereGeometry(0.24, 12, 10);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x37E0FF });
  const thruster = new THREE.Mesh(glowGeo, glowMat);
  thruster.position.z = 0.95;
  ship.add(nose, body, wings, fin, thruster);
  scene.add(ship);

  // Reconciled meshes for bullets + targets, keyed by entity id.
  const unitSphere = new THREE.SphereGeometry(1, 12, 10);
  const targetGeo = new THREE.IcosahedronGeometry(1, 0);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0x9CF6FF });
  const targetMat = new THREE.MeshStandardMaterial({ color: 0xE8583C, emissive: 0x5A1206, metalness: 0.3, roughness: 0.5 });
  const meshes = new Map<EntityId, THREE.Mesh>();
  const touched = new Set<EntityId>();

  function ensureMesh(id: EntityId, kind: 'bullet' | 'target'): THREE.Mesh {
    let mesh = meshes.get(id);
    if (mesh)
      return mesh;
    mesh = kind === 'bullet'
      ? new THREE.Mesh(unitSphere, bulletMat)
      : new THREE.Mesh(targetGeo, targetMat);
    meshes.set(id, mesh);
    scene.add(mesh);
    return mesh;
  }

  function syncBodies(state: GameState): void {
    const posStore = state.world.getStore(Position3DDef);
    const radStore = state.world.getStore(RadiusDef);
    for (const kind of ['bullet', 'target'] as const) {
      const tag = kind === 'bullet' ? BulletTag : TargetTag;
      for (const id of state.world.getTag(tag)) {
        const p = posStore.get(id);
        const r = radStore.get(id);
        if (!p || !r)
          continue;
        const mesh = ensureMesh(id, kind);
        mesh.position.set(p.x, p.y, p.z);
        mesh.scale.setScalar(r.r);
        if (kind === 'target') {
          mesh.rotation.x += 0.01;
          mesh.rotation.y += 0.013;
        }
        touched.add(id);
      }
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

  const shipQuat = new THREE.Quaternion();
  const fwdVec = new THREE.Vector3();
  const upVec = new THREE.Vector3();
  const camTarget = new THREE.Vector3();

  function updateShipAndCamera(state: GameState): void {
    if (state.playerId == null)
      return;
    const p = state.world.getStore(Position3DDef).get(state.playerId);
    if (!p)
      return;
    const q = state.orientation;
    shipQuat.set(q.x, q.y, q.z, q.w);
    ship.position.set(p.x, p.y, p.z);
    ship.quaternion.copy(shipQuat);

    fwdVec.set(0, 0, -1).applyQuaternion(shipQuat);
    upVec.set(0, 1, 0).applyQuaternion(shipQuat);

    // Position trails behind the nose (smoothed) so the ship stays framed; the
    // camera *orientation* slerps toward the ship's, so it banks with roll and
    // eases into turns rather than snapping.
    camTarget.set(
      p.x - fwdVec.x * CAMERA_DISTANCE + upVec.x * CAMERA_HEIGHT,
      p.y - fwdVec.y * CAMERA_DISTANCE + upVec.y * CAMERA_HEIGHT,
      p.z - fwdVec.z * CAMERA_DISTANCE + upVec.z * CAMERA_HEIGHT,
    );
    camera.position.lerp(camTarget, CAMERA_POS_LERP);
    camera.quaternion.slerp(shipQuat, CAMERA_ROT_LERP);
  }

  const dustAttr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
  function updateDust(): void {
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const span = DUST_RANGE * 2;
    const arr = dustAttr.array as Float32Array;
    for (let i = 0; i < DUST_COUNT; i++) {
      const j = i * 3;
      // Wrap each axis so the point stays within ±DUST_RANGE of the camera.
      arr[j] = cx + wrap(arr[j]! - cx, span);
      arr[j + 1] = cy + wrap(arr[j + 1]! - cy, span);
      arr[j + 2] = cz + wrap(arr[j + 2]! - cz, span);
    }
    dustAttr.needsUpdate = true;
  }

  return {
    domElement: renderer.domElement,
    dispose() {
      for (const mesh of meshes.values())
        scene.remove(mesh);
      meshes.clear();
      starGeo.dispose();
      starMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      planetGeo.dispose();
      planetMat.dispose();
      boundGeo.dispose();
      boundMat.dispose();
      noseGeo.dispose();
      bodyGeo.dispose();
      wingGeo.dispose();
      finGeo.dispose();
      glowGeo.dispose();
      hullMat.dispose();
      accentMat.dispose();
      glowMat.dispose();
      unitSphere.dispose();
      targetGeo.dispose();
      bulletMat.dispose();
      targetMat.dispose();
      renderer.dispose();
    },
    render(state) {
      syncBodies(state);
      reapUntouched();
      updateShipAndCamera(state);
      stars.position.copy(camera.position);
      updateDust();
      renderer.render(scene, camera);
    },
    resize(w, h) {
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  };
}

/** Wrap `v` into the half-open interval [-span/2, span/2). */
function wrap(v: number, span: number): number {
  const half = span / 2;
  return ((((v + half) % span) + span) % span) - half;
}
