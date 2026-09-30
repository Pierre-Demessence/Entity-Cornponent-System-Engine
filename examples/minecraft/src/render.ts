import type { GameState } from './game';

import { Camera3DDef, getCameraPose } from '@pierre/ecs/modules/camera-3d';
import { radToDeg } from '@pierre/ecs/modules/math';
import { Scene3DRenderer } from '@pierre/ecs/modules/render-scene3d';
import * as THREE from 'three';

import { ChunkDef, ChunkTag } from './components';
import { meshChunk } from './mesher';

export interface Renderer3D {
  domElement: HTMLCanvasElement;
  dispose: () => void;
  render: (state: GameState) => void;
  /** Drop every chunk mesh; call after `resetGame`, whose entity ids restart. */
  reset: () => void;
}

const SKY = 0x8EC5F0;

/**
 * three.js adapter. Each chunk entity gets one `THREE.Mesh`; its geometry is
 * rebuilt only when the entity's `Chunk.version` moves past the version last
 * meshed, and the mesh is hidden when the frustum cull marked it out of view.
 */
export function makeRenderer(width: number, height: number): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.setClearColor(SKY, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY, 50, 130);
  const camera = new THREE.PerspectiveCamera(70, width / height, 0.05, 220);

  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const meshVersion = new WeakMap<THREE.Mesh, number>();

  const chunks = new Scene3DRenderer({
    create: () => new THREE.Mesh(new THREE.BufferGeometry(), material),
    select: world => world.query(ChunkDef).withTag(world.getTag(ChunkTag)),
    remove: (mesh) => {
      mesh.geometry.dispose();
    },
    sync: (mesh, [, chunk], world) => {
      mesh.visible = chunk.visible === 1;
      if (meshVersion.get(mesh) === chunk.version || !mesh.visible)
        return;
      const data = meshChunk((world as GameState['world']).grid, chunk.cx, chunk.cz);
      mesh.geometry.dispose();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geo.computeBoundingSphere();
      mesh.geometry = geo;
      mesh.frustumCulled = false; // the ECS cull already decided
      meshVersion.set(mesh, chunk.version);
    },
  });

  // Wireframe cube around the targeted block.
  const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
  const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const outline = new THREE.LineSegments(outlineGeo, outlineMat);
  outline.visible = false;
  scene.add(outline);

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

  return {
    domElement: renderer.domElement,
    dispose() {
      chunks.dispose(scene);
      material.dispose();
      outlineGeo.dispose();
      outlineMat.dispose();
      renderer.dispose();
    },
    render(state) {
      chunks.render({ graph: scene, world: state.world });
      const t = state.target;
      outline.visible = t != null;
      if (t)
        outline.position.set(t.cell.x + 0.5, t.cell.y + 0.5, t.cell.z + 0.5);
      updateCamera(state);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
    },
    reset() {
      chunks.dispose(scene);
    },
  };
}
