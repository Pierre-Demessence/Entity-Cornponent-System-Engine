import type { EcsWorld, TagDef } from '@pierre/ecs';

import type { GameState } from './game';

import { Camera3DDef, getCameraPose } from '@pierre/ecs/modules/camera-3d';
import { radToDeg, vec3RandomUnit } from '@pierre/ecs/modules/math';
import { Scene3DRenderer } from '@pierre/ecs/modules/render-scene3d';
import * as THREE from 'three';

import { BulletTag, Position3DDef, Rotation3DDef, ShapeSphere3Def, TargetTag } from './components';
import { BOUNDS_RADIUS } from './game';

export interface Renderer3D {
  domElement: HTMLCanvasElement;
  dispose: () => void;
  render: (state: GameState) => void;
  /** Resize the drawing buffer. The aspect follows the camera's `Camera3D` viewport — update that too. */
  resize: (w: number, h: number) => void;
}

const DUST_COUNT = 900;
const DUST_RANGE = 60; // half-extent of the wrap cube around the camera

/**
 * three.js adapter. ECS is the source of truth: every render frame we mirror
 * each ship / bullet / target body's `Position3D` into a derived mesh, orient
 * the ship from its `Rotation3D`, and copy the chase camera entity's pose and
 * `Camera3D` lens onto the three.js camera. The dust field, boundary sphere, planet, and starfield are pure
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
  const bodiesTagged = (tag: TagDef) => (world: EcsWorld) =>
    world.query(Position3DDef, ShapeSphere3Def).withTag(world.getTag(tag));
  const passes = [
    new Scene3DRenderer({
      select: bodiesTagged(BulletTag),
      create: () => new THREE.Mesh(unitSphere, bulletMat),
      sync: (mesh, [, p, r]) => {
        mesh.position.set(p.x, p.y, p.z);
        mesh.scale.setScalar(r.radius);
      },
    }),
    new Scene3DRenderer({
      select: bodiesTagged(TargetTag),
      create: () => new THREE.Mesh(targetGeo, targetMat),
      sync: (mesh, [, p, r]) => {
        mesh.position.set(p.x, p.y, p.z);
        mesh.scale.setScalar(r.radius);
        mesh.rotation.x += 0.01;
        mesh.rotation.y += 0.013;
      },
    }),
  ];

  function updateShip(state: GameState): void {
    if (state.playerId == null)
      return;
    const p = state.world.getStore(Position3DDef).get(state.playerId);
    const q = state.world.getStore(Rotation3DDef).get(state.playerId);
    if (!p || !q)
      return;
    ship.position.set(p.x, p.y, p.z);
    ship.quaternion.set(q.x, q.y, q.z, q.w);
  }

  function updateCamera(state: GameState): void {
    if (state.cameraId == null)
      return;
    const lens = state.world.getStore(Camera3DDef).get(state.cameraId);
    if (!lens)
      return;
    const { position: p, rotation: q } = getCameraPose(state.world, state.cameraId);
    camera.position.set(p.x, p.y, p.z);
    camera.quaternion.set(q.x, q.y, q.z, q.w);
    camera.fov = radToDeg(lens.fovY);
    camera.aspect = lens.viewportW / lens.viewportH;
    camera.near = lens.near;
    camera.far = lens.far;
    camera.updateProjectionMatrix();
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
      for (const pass of passes)
        pass.dispose(scene);
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
      for (const pass of passes)
        pass.render({ graph: scene, world: state.world });
      updateShip(state);
      updateCamera(state);
      stars.position.copy(camera.position);
      updateDust();
      renderer.render(scene, camera);
    },
    resize(w, h) {
      renderer.setSize(w, h);
    },
  };
}

/** Wrap `v` into the half-open interval [-span/2, span/2). */
function wrap(v: number, span: number): number {
  const half = span / 2;
  return ((((v + half) % span) + span) % span) - half;
}
