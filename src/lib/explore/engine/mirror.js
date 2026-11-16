import { HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Matrix4, PerspectiveCamera, Vector3, WebGLRenderTarget } from "three";

// The wet road as a mirror. Before each frame the city is drawn once more, at a
// lower resolution, as seen from the camera's reflection below the ground. The
// road's material looks that picture up for every point of asphalt, blurs it
// where the surface is rough and smears it toward the eye, as wet tar does. This
// doubles the drawing work, so it is used at High quality only.

// Turns clip space (-1 to 1) into texture space (0 to 1).
const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/**
 * `scale` is the size of the mirrored picture next to the main one (0.5 is half
 * its width and height). Returns the `texture` and the `matrix` that finds a
 * point of the ground in it, `setSize` for when the view is resized, and
 * `render`, to be called before the main picture is drawn.
 */
export function createMirror({ scale = 0.5 } = {}) {
  const target = new WebGLRenderTarget(2, 2, {
    type: HalfFloatType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
  });
  const below = new PerspectiveCamera();
  const matrix = new Matrix4();
  const look = new Vector3();
  const lookAt = new Vector3();
  const up = new Vector3();

  return {
    texture: target.texture,
    matrix,

    /** `width` and `height` of the main picture, in device pixels. */
    setSize(width, height) {
      target.setSize(Math.max(2, Math.round(width * scale)), Math.max(2, Math.round(height * scale)));
    },

    /**
     * Draws the city as the ground mirrors it. `hidden` are the objects left
     * out of the reflection: the ground itself, and anything that would only
     * cost time there.
     */
    render(renderer, scene, camera, hidden = []) {
      // The camera's twin below the ground: its position, where it looks and its
      // "up", each mirrored in the plane y = 0.
      camera.getWorldDirection(look);
      lookAt.copy(camera.position).add(look);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      below.position.set(camera.position.x, -camera.position.y, camera.position.z);
      below.up.set(up.x, -up.y, up.z);
      below.lookAt(lookAt.x, -lookAt.y, lookAt.z);
      below.near = camera.near;
      below.far = camera.far;
      below.updateMatrixWorld();
      below.projectionMatrix.copy(camera.projectionMatrix);
      below.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      matrix.copy(BIAS).multiply(below.projectionMatrix).multiply(below.matrixWorldInverse);

      const shown = hidden.map((object) => object.visible);
      for (const object of hidden) object.visible = false;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, below);
      renderer.setRenderTarget(previous);
      hidden.forEach((object, index) => {
        object.visible = shown[index];
      });
    },

    dispose() {
      target.dispose();
    },
  };
}
