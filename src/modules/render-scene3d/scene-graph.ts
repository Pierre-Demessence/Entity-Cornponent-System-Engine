/**
 * The minimal surface of a scene graph: attach and detach one object. A
 * three.js `Scene` (or any `Object3D` parent) satisfies
 * `SceneGraph<Object3D>` structurally and is passed in directly.
 */
export interface SceneGraph<TObject> {
  add: (object: TObject) => void;
  remove: (object: TObject) => void;
}
