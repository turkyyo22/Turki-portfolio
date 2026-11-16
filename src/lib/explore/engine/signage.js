import { InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from "three";

import { sideStreetById } from "@/lib/explore/city";

import { FOG, NOISE, OUTPUT } from "./shaders";
import { ATLAS, canvasTexture, drawSignAtlas } from "./signs";

const UP = new Vector3(0, 1, 0);

/**
 * Vertical neon signs sticking out from shop fronts, as in any busy street.
 * Their words are the skills from the portfolio (see signWords in plan.js), and
 * all of them share one texture, so they cost a single draw call. On the main
 * street they face the visitor driving down it; on a side street they face the
 * main street, so they are seen on the way in.
 */
export function createStreetSigns({ scene, shared, palette, random, fronts, words, family, lights }) {
  const list = words.length > 0 ? words : ["OPEN", "CODE", "DATA", "24H", "LAB", "AI"];
  const { canvas, count } = drawSignAtlas({ words: list, colors: palette.neon, family });
  const texture = canvasTexture(canvas);

  const signs = [];
  for (const front of fronts) {
    const share = front.street === "main" ? (front.district === "old" ? 0.6 : 0.72) : 0.45;
    if (front.height < 7 || !random.chance(share)) continue;
    const cell = random.int(0, count - 1);
    const height = Math.min(random.range(4.4, 6.4), front.height - 2.5);
    if (height < 3) continue;
    const width = height / 4;
    const y = Math.max(3.2, Math.min(front.height - height - 0.8, random.range(3.6, 7.5)));
    const along = random.range(-0.35, 0.35) * front.along;
    let x;
    let z;
    let turn;
    if (front.street === "main") {
      x = front.x - front.side * (width / 2 + 0.2);
      z = front.z + along;
      turn = 0;
      lights.add({ x: x - front.side * 1.4, z, radius: 6.5, color: palette.neon[cell % palette.neon.length], strength: 0.8 });
    } else {
      const street = sideStreetById(front.street);
      x = front.x + along;
      z = front.z - front.side * (width / 2 + 0.2);
      turn = -street.side * (Math.PI / 2);
      lights.add({ x, z: z - front.side * 1.4, radius: 6, color: palette.neon[cell % palette.neon.length], strength: 0.7 });
    }
    signs.push({ x, y, z, width, height, turn, cell, flicker: random.chance(front.district === "old" ? 0.45 : 0.15) ? 1 : 0, seed: random.range(0, 50) });
  }
  if (signs.length === 0) {
    texture.dispose();
    return;
  }

  const geometry = new PlaneGeometry(1, 1);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared, uMap: { value: texture }, uGrid: { value: [ATLAS.cols, ATLAS.rows] } },
    vertexShader: /* glsl */ `
      attribute vec3 aSign;   // atlas cell, flicker (0 or 1), seed
      uniform vec2 uGrid;
      varying vec2 vUv;
      flat varying vec2 vSign;
      varying float vDepth;
      varying float vHeight;
      void main() {
        float column = mod(aSign.x, uGrid.x);
        float row = floor(aSign.x / uGrid.x);
        vUv = vec2((column + uv.x) / uGrid.x, 1.0 - (row + 1.0 - uv.y) / uGrid.y);
        vSign = aSign.yz;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vHeight = world.y;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uMap;
      varying vec2 vUv;
      flat varying vec2 vSign;
      varying float vDepth;
      varying float vHeight;
      ${FOG}
      ${NOISE}
      void main() {
        vec4 texel = texture2D(uMap, vUv);
        // Old tubes stutter now and then.
        float stutter = step(0.9, hash21(vec2(floor(uTime * 9.0), vSign.y)));
        float power = 1.0 - vSign.x * stutter * 0.65;
        vec3 color = applyFog(texel.rgb * 1.45 * power, vDepth, vHeight);
        gl_FragColor = vec4(color, texel.a * (1.0 - fogAmount(vDepth) * 0.6));
        ${OUTPUT}
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, signs.length);
  const data = new Float32Array(signs.length * 3);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  signs.forEach((sign, index) => {
    rotation.setFromAxisAngle(UP, sign.turn);
    matrix.compose(position.set(sign.x, sign.y + sign.height / 2, sign.z), rotation, scale.set(sign.width, sign.height, 1));
    mesh.setMatrixAt(index, matrix);
    data.set([sign.cell, sign.flicker, sign.seed], index * 3);
  });
  geometry.setAttribute("aSign", new InstancedBufferAttribute(data, 3));
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
}
