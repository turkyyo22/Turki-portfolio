import {
  Camera,
  Color,
  CustomBlending,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OneFactor,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  ZeroFactor,
} from "three";

// The light field: a map of the city seen from above. Its colour is the light
// that neon signs, lamps, shop windows and screens throw near the ground at each
// spot, and its fourth channel says where buildings stand. Every material reads
// it (see LIGHTING in shaders.js), so a pink sign tints the wall, the pavement,
// the puddles and whoever walks past, without a single real light. It is drawn
// once, when the city is built.

const SPOT_VERTEX = /* glsl */ `
attribute vec3 aSpot;     // x, z, radius
attribute vec3 aGlow;
uniform vec4 uArea;       // min x, min z, 1 / width, 1 / depth
varying vec2 vOffset;
varying vec3 vGlow;
void main() {
  vOffset = position.xy;
  vGlow = aGlow;
  vec2 ground = aSpot.xy + position.xy * aSpot.z;
  gl_Position = vec4((ground - uArea.xy) * uArea.zw * 2.0 - 1.0, 0.0, 1.0);
}
`;

const SPOT_FRAGMENT = /* glsl */ `
varying vec2 vOffset;
varying vec3 vGlow;
void main() {
  float fall = max(0.0, 1.0 - dot(vOffset, vOffset));
  gl_FragColor = vec4(vGlow * fall * fall, 0.0);
}
`;

const BLOCK_VERTEX = /* glsl */ `
attribute vec4 aRect;     // x, z, width, depth
attribute float aTurn;
uniform vec4 uArea;
void main() {
  vec2 local = position.xy * 0.5 * aRect.zw;
  float c = cos(aTurn);
  float s = sin(aTurn);
  vec2 ground = aRect.xy + vec2(local.x * c + local.y * s, -local.x * s + local.y * c);
  gl_Position = vec4((ground - uArea.xy) * uArea.zw * 2.0 - 1.0, 0.0, 1.0);
}
`;

const BLOCK_FRAGMENT = /* glsl */ `
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

/**
 * Collects the city's street-level lights and the footprints of its buildings,
 * then draws them into one texture with `bake`. `bounds` is the stretch of
 * ground the map covers ({ minX, maxX, minZ, maxZ }, in metres) and `size` its
 * [width, height] in pixels.
 */
export function createLightField({ bounds, size }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const area = [minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)];
  const spots = [];
  const blocks = [];
  let target = null;

  return {
    /** For the `uLightArea` uniform: where the map lies on the ground. */
    area,

    /** A light near the ground at (x, z) that reaches `radius` metres. */
    add({ x, z, radius = 6, color, strength = 1 }) {
      if (!(radius > 0) || !(strength > 0)) return;
      spots.push(x, z, radius, color.r * strength, color.g * strength, color.b * strength);
    },

    /** The footprint of something that stands on the ground and shades it: `w` across, `d` deep, turned by `turn`. */
    block({ x, z, w, d, turn = 0 }) {
      blocks.push(x, z, w, d, turn);
    },

    /** Draws the map and returns its texture. Call once, after everything has been added. */
    bake(renderer) {
      target = new WebGLRenderTarget(size[0], size[1], {
        type: HalfFloatType,
        depthBuffer: false,
        generateMipmaps: true,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
      });
      const scene = new Scene();
      const uniforms = { uArea: { value: area } };
      const quad = new PlaneGeometry(2, 2);

      if (blocks.length > 0) {
        const count = blocks.length / 5;
        const rects = new Float32Array(count * 4);
        const turns = new Float32Array(count);
        for (let i = 0; i < count; i += 1) {
          rects.set(blocks.slice(i * 5, i * 5 + 4), i * 4);
          turns[i] = blocks[i * 5 + 4];
        }
        const geometry = new InstancedBufferGeometry().copy(quad);
        geometry.instanceCount = count;
        geometry.setAttribute("aRect", new InstancedBufferAttribute(rects, 4));
        geometry.setAttribute("aTurn", new InstancedBufferAttribute(turns, 1));
        // Writes the fourth channel only, leaving the colour as it is.
        const material = new ShaderMaterial({
          uniforms,
          vertexShader: BLOCK_VERTEX,
          fragmentShader: BLOCK_FRAGMENT,
          depthTest: false,
          depthWrite: false,
          blending: CustomBlending,
          blendSrc: ZeroFactor,
          blendDst: OneFactor,
          blendSrcAlpha: OneFactor,
          blendDstAlpha: ZeroFactor,
        });
        const mesh = new Mesh(geometry, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 0;
        scene.add(mesh);
      }

      if (spots.length > 0) {
        const count = spots.length / 6;
        const places = new Float32Array(count * 3);
        const glows = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
          places.set(spots.slice(i * 6, i * 6 + 3), i * 3);
          glows.set(spots.slice(i * 6 + 3, i * 6 + 6), i * 3);
        }
        const geometry = new InstancedBufferGeometry().copy(quad);
        geometry.instanceCount = count;
        geometry.setAttribute("aSpot", new InstancedBufferAttribute(places, 3));
        geometry.setAttribute("aGlow", new InstancedBufferAttribute(glows, 3));
        // Adds its colour, leaving the fourth channel as it is.
        const material = new ShaderMaterial({
          uniforms,
          vertexShader: SPOT_VERTEX,
          fragmentShader: SPOT_FRAGMENT,
          depthTest: false,
          depthWrite: false,
          blending: CustomBlending,
          blendSrc: OneFactor,
          blendDst: OneFactor,
          blendSrcAlpha: ZeroFactor,
          blendDstAlpha: OneFactor,
        });
        const mesh = new Mesh(geometry, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        scene.add(mesh);
      }

      const clearColor = renderer.getClearColor(new Color());
      const clearAlpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, new Camera());
      renderer.setRenderTarget(null);
      renderer.setClearColor(clearColor, clearAlpha);

      scene.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
      quad.dispose();
      return target.texture;
    },

    dispose() {
      target?.dispose();
      target = null;
    },
  };
}
