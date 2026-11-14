import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { ROUTE } from "@/lib/explore/plan";

import { STREET } from "./layout";
import { bright } from "./palette";
import { lerp } from "./random";
import { FOG, NOISE, OUTPUT } from "./shaders";

const UP = new Vector3(0, 1, 0);

/**
 * The ground as one big sheet. Its shader paints the wet asphalt, lane lines,
 * zebra crossings, cross streets and tiled sidewalks from the position alone.
 */
export function createGround({ scene, shared, palette, layout }) {
  const length = 320 - (layout.end - 760);
  const geometry = new PlaneGeometry(900, length);
  geometry.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    uniforms: {
      ...shared,
      uIntro: { value: ROUTE.intro },
      uLeg: { value: ROUTE.leg },
      uCrossAt: { value: ROUTE.crossAt },
      uCrossCount: { value: layout.crossings.length },
      uRoadHalf: { value: STREET.roadHalf },
      uWalk: { value: STREET.walk },
      uTierFrom: { value: layout.tierFrom },
      uTierTo: { value: layout.tierTo },
      uAsphalt: { value: palette.asphalt },
      uPavement: { value: palette.pavement },
      uLot: { value: palette.lot },
      uLineAccent: { value: palette.accent },
      uLineWarm: { value: palette.amber },
      uLineWhite: { value: palette.cool },
      uSheen: { value: palette.glowViolet.clone().lerp(palette.glowMagenta, 0.35).multiplyScalar(1.15) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntro;
      uniform float uLeg;
      uniform float uCrossAt;
      uniform float uCrossCount;
      uniform float uRoadHalf;
      uniform float uWalk;
      uniform float uTierFrom;
      uniform float uTierTo;
      uniform vec3 uAsphalt;
      uniform vec3 uPavement;
      uniform vec3 uLot;
      uniform vec3 uLineAccent;
      uniform vec3 uLineWarm;
      uniform vec3 uLineWhite;
      uniform vec3 uSheen;
      varying vec3 vWorld;
      varying float vDepth;
      ${FOG}
      ${NOISE}

      void main() {
        float x = vWorld.x;
        float z = vWorld.z;
        float ax = abs(x);
        float tier = clamp((-z - uTierFrom) / (uTierTo - uTierFrom), 0.0, 1.0);
        float pixelX = fwidth(x);
        float pixelZ = fwidth(z);

        // The nearest cross street, if this stretch has one.
        float k = (-z - uIntro) / uLeg - uCrossAt;
        float nearest = floor(k + 0.5);
        float dz = (k - nearest) * uLeg;
        float hasCross = step(-0.5, nearest) * step(nearest, uCrossCount - 0.5);

        // Distance to the edge of the asphalt: below zero on the road.
        float dMain = ax - uRoadHalf;
        float dCross = mix(1000.0, abs(dz) - uRoadHalf, hasCross);
        float dRoad = min(dMain, dCross);
        float pixelRoad = fwidth(dRoad);
        float onRoad = 1.0 - smoothstep(-pixelRoad, pixelRoad, dRoad);
        float onWalk = (1.0 - onRoad) * (1.0 - smoothstep(uWalk - pixelRoad, uWalk + pixelRoad, dRoad));

        // Asphalt
        float grain = noise21(vWorld.xz * 2.6) * 0.5 + noise21(vWorld.xz * 0.21) * 0.5;
        vec3 asphalt = uAsphalt * (0.7 + 0.6 * grain);

        // Lane markings on the main street, outside the junctions.
        float inJunction = hasCross * (1.0 - smoothstep(uRoadHalf - 0.2, uRoadHalf + 0.2, abs(dz)));
        float onMain = step(dMain, 0.0) * (1.0 - inJunction);
        vec3 lineColor = mix(uLineWarm, uLineAccent, smoothstep(0.1, 0.5, tier));
        float centre = lineAA(abs(ax - 0.22), 0.07, pixelX);
        float dash = step(0.56, fract(z / 9.0));
        float lane = lineAA(abs(ax - 3.5), 0.07, pixelX) * dash;
        float edge = lineAA(abs(ax - (uRoadHalf - 0.45)), 0.06, pixelX);
        vec3 marks = (lineColor * centre * 1.0 + uLineWhite * (lane * 0.5 + edge * 0.28)) * onMain;

        // Zebra crossings on both sides of every junction.
        float band = hasCross * smoothstep(uRoadHalf + 1.0, uRoadHalf + 1.15, abs(dz)) * (1.0 - smoothstep(uRoadHalf + 3.9, uRoadHalf + 4.05, abs(dz)));
        float stripes = smoothstep(0.5 - pixelX, 0.5 + pixelX, abs(fract(x / 1.3) - 0.5) * 2.0);
        float zebra = band * stripes * step(ax, uRoadHalf - 0.6);
        // A dashed centre line down each cross street.
        float sideLine = hasCross * step(uRoadHalf + 0.5, ax) * lineAA(abs(dz), 0.07, pixelZ) * step(0.5, fract(x / 7.0));
        marks += uLineWhite * (zebra * 0.5 + sideLine * 0.35);

        // Sidewalk: tiles, a pale kerb and a thin neon strip beside the road.
        vec2 tile = abs(fract(vWorld.xz / 1.5) - 0.5);
        float joints = smoothstep(0.46, 0.5, max(tile.x, tile.y)) * clamp(1.0 - pixelX * 1.4, 0.0, 1.0);
        vec3 walk = uPavement * (0.8 + 0.4 * hash21(floor(vWorld.xz / 1.5) + 3.0)) * (1.0 - 0.4 * joints);
        float kerb = 1.0 - smoothstep(0.24, 0.3, dRoad);
        walk = mix(walk, uPavement * 1.9, kerb);
        float strip = lineAA(abs(dRoad - 0.52), 0.07, pixelRoad);
        vec3 stripGlow = lineColor * strip * mix(0.55, 1.5, tier);

        vec3 color = mix(uLot, walk + stripGlow, onWalk);
        color = mix(color, asphalt + marks, onRoad);

        // Wet ground: puddles are darker, and at a shallow angle everything mirrors the glow on the horizon.
        vec3 toEye = normalize(cameraPosition - vWorld);
        float mirror = pow(1.0 - clamp(toEye.y, 0.0, 1.0), 4.0);
        float puddle = smoothstep(0.55, 0.75, noise21(vWorld.xz * 0.09 + 11.0));
        color *= 1.0 - 0.4 * puddle * onRoad;
        color += uSheen * mirror * (onRoad * (0.4 + 0.6 * puddle) + onWalk * 0.2);

        color = applyFog(color, vDepth, 0.0);
        gl_FragColor = vec4(color, 1.0);
        ${OUTPUT}
      }
    `,
  });
  const ground = new Mesh(geometry, material);
  ground.position.z = 320 - length / 2;
  ground.frustumCulled = false;
  scene.add(ground);
}

/**
 * Light on the ground: round pools under lamps and long streaks that look like
 * neon reflected in the wet street. All of them are one instanced mesh.
 * Add them first, then call build().
 */
export function createDecals({ scene, shared }) {
  const items = [];
  return {
    /**
     * `towardX`/`towardZ` give the direction a streak runs in, away from its light.
     * `width` is across that direction and `length` along it.
     */
    add({ x, z, width, length = width, color, strength = 1, streak = false, towardX = 0, towardZ = -1, y = 0.05 }) {
      items.push({ x, y, z, width, length, color, strength, streak, turn: Math.atan2(-towardX, -towardZ) });
    },
    build() {
      const geometry = new PlaneGeometry(1, 1);
      geometry.rotateX(-Math.PI / 2);
      const tones = new Float32Array(items.length * 4);
      const material = new ShaderMaterial({
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        uniforms: { ...shared },
        vertexShader: /* glsl */ `
          attribute vec4 aTone;   // colour, and 1 for a streak
          varying vec2 vUv;
          flat varying vec4 vTone;
          varying float vDepth;
          void main() {
            vUv = uv;
            vTone = aTone;
            vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          flat varying vec4 vTone;
          varying float vDepth;
          ${FOG}
          void main() {
            vec2 p = vUv - 0.5;
            float amount;
            if (vTone.a < 0.5) {
              amount = pow(max(0.0, 1.0 - length(p) * 2.0), 2.2);
            } else {
              // Brightest at the light (v = 0), fading out along the ground, with fine ripples.
              float across = exp(-p.x * p.x * 18.0);
              float along = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.05, vUv.y);
              amount = across * along * (0.74 + 0.26 * sin(vUv.x * 58.0));
            }
            gl_FragColor = vec4(vTone.rgb * amount * (1.0 - fogAmount(vDepth)), 1.0);
            ${OUTPUT}
          }
        `,
      });
      const mesh = new InstancedMesh(geometry, material, items.length);
      const matrix = new Matrix4();
      const rotation = new Quaternion();
      const position = new Vector3();
      const scale = new Vector3();
      items.forEach((item, index) => {
        rotation.setFromAxisAngle(UP, item.turn);
        matrix.compose(position.set(item.x, item.y, item.z), rotation, scale.set(item.width, 1, item.length));
        mesh.setMatrixAt(index, matrix);
        tones.set([item.color.r * item.strength, item.color.g * item.strength, item.color.b * item.strength, item.streak ? 1 : 0], index * 4);
      });
      geometry.setAttribute("aTone", new InstancedBufferAttribute(tones, 4));
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
    },
  };
}

/**
 * Soft dots of light: lamp halos, beacons on rooftops, bollards. Drawn as points,
 * so hundreds of them cost a single draw call. `blink` makes one flash.
 */
export function createGlows({ scene, shared }) {
  const items = [];
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute vec3 aSpark;   // size in metres, blink speed, blink phase
      uniform float uTime;
      uniform float uPointScale;
      varying vec3 vColor;
      ${FOG}
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float depth = max(0.1, -mv.z);
        float blink = aSpark.y > 0.0 ? smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(uTime * aSpark.y + aSpark.z)) : 1.0;
        vColor = aColor * blink * (1.0 - fogAmount(depth));
        gl_PointSize = clamp(aSpark.x * uPointScale / depth, 1.0, 190.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float falloff = pow(max(0.0, 1.0 - length(gl_PointCoord - 0.5) * 2.0), 2.6);
        gl_FragColor = vec4(vColor * falloff, 1.0);
        ${OUTPUT}
      }
    `,
  });
  return {
    add({ x, y, z, color, size = 2, strength = 1, blink = 0, phase = 0 }) {
      items.push({ x, y, z, color, size, strength, blink, phase });
    },
    build() {
      const positions = new Float32Array(items.length * 3);
      const colors = new Float32Array(items.length * 3);
      const sparks = new Float32Array(items.length * 3);
      items.forEach((item, index) => {
        positions.set([item.x, item.y, item.z], index * 3);
        colors.set([item.color.r * item.strength, item.color.g * item.strength, item.color.b * item.strength], index * 3);
        sparks.set([item.size, item.blink, item.phase], index * 3);
      });
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
      geometry.setAttribute("aSpark", new BufferAttribute(sparks, 3));
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 2;
      scene.add(points);
    },
  };
}

/** Marks every vertex of `geometry` with how much it glows: 0 is plain metal, 1 is all light. */
export function withEmit(geometry, emit) {
  const values = new Float32Array(geometry.attributes.position.count).fill(emit);
  geometry.setAttribute("aEmit", new BufferAttribute(values, 1));
  return geometry;
}

/**
 * Many copies of one small street object (a lamp, a bollard, a tree), each with
 * its own light colour. Add them first, then call build().
 */
export function createProps({ scene, shared, palette, geometry }) {
  const items = [];
  return {
    add({ x, y = 0, z, turn = 0, scale = 1, color }) {
      items.push({ x, y, z, turn, scale, color });
    },
    build() {
      if (items.length === 0) {
        geometry.dispose();
        return;
      }
      const material = new ShaderMaterial({
        uniforms: { ...shared, uBase: { value: palette.steel } },
        vertexShader: /* glsl */ `
          attribute float aEmit;
          attribute vec3 aGlow;
          uniform vec3 uBase;
          varying vec3 vColor;
          varying float vDepth;
          varying float vHeight;
          void main() {
            vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vec3 n = normalize(mat3(instanceMatrix) * normal);
            float light = 0.5 + 0.5 * clamp(n.y * 0.7 + 0.5, 0.0, 1.0);
            vColor = uBase * light * (1.0 - aEmit) + aGlow * aEmit * mix(light, 1.0, aEmit);
            vHeight = world.y;
            vec4 mv = viewMatrix * world;
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vDepth;
          varying float vHeight;
          ${FOG}
          void main() {
            gl_FragColor = vec4(applyFog(vColor, vDepth, vHeight), 1.0);
            ${OUTPUT}
          }
        `,
      });
      const mesh = new InstancedMesh(geometry, material, items.length);
      const glow = new Float32Array(items.length * 3);
      const matrix = new Matrix4();
      const rotation = new Quaternion();
      const position = new Vector3();
      const scale = new Vector3();
      items.forEach((item, index) => {
        rotation.setFromAxisAngle(UP, item.turn);
        matrix.compose(position.set(item.x, item.y, item.z), rotation, scale.setScalar(item.scale));
        mesh.setMatrixAt(index, matrix);
        glow.set([item.color.r, item.color.g, item.color.b], index * 3);
      });
      geometry.setAttribute("aGlow", new InstancedBufferAttribute(glow, 3));
      mesh.frustumCulled = false;
      scene.add(mesh);
    },
  };
}

export function lampGeometry() {
  return mergeGeometries([
    withEmit(new CylinderGeometry(0.07, 0.11, 6.4, 6).translate(0, 3.2, 0), 0),
    withEmit(new BoxGeometry(1.7, 0.09, 0.09).translate(0.85, 6.36, 0), 0),
    withEmit(new BoxGeometry(0.78, 0.1, 0.32).translate(1.55, 6.27, 0), 1),
  ]);
}

export function bollardGeometry() {
  return mergeGeometries([
    withEmit(new CylinderGeometry(0.11, 0.11, 0.9, 6).translate(0, 0.45, 0), 0),
    withEmit(new CylinderGeometry(0.14, 0.14, 0.16, 6).translate(0, 0.94, 0), 1),
  ]);
}

export function treeGeometry() {
  return mergeGeometries([
    withEmit(new CylinderGeometry(0.1, 0.16, 2.4, 5).translate(0, 1.2, 0).toNonIndexed(), 0),
    withEmit(new IcosahedronGeometry(1.25, 1).scale(1, 0.85, 1).translate(0, 3.2, 0), 0.42),
    withEmit(new IcosahedronGeometry(0.8, 1).translate(0.55, 4.1, 0.2), 0.5),
  ]);
}

/** Street lamps down both sidewalks, each with a halo and a pool of light on the road. */
export function layStreetLamps({ layout, palette, lamps, glows, decals }) {
  const spacing = 24;
  let index = 0;
  for (let z = layout.startZ - 8; z > layout.finishZ; z -= spacing / 2) {
    const side = index % 2 === 0 ? 1 : -1;
    index += 1;
    // Keep junctions and the end plaza clear.
    if (layout.crossingDistance(z) < STREET.roadHalf + 2) continue;
    if (Math.abs(z - layout.plaza.z) < layout.plaza.radius + 4) continue;
    const tier = layout.tierAt(z);
    // Warm bulbs in the old town, cool light tinted with the accent further on.
    const light = palette.warm.clone().lerp(palette.cool.clone().lerp(palette.accent, 0.3), tier);
    const x = side * (STREET.roadHalf + 0.9);
    lamps.add({ x, z, turn: side > 0 ? Math.PI : 0, color: bright(light, 2.4) });
    const headX = side * (STREET.roadHalf - 0.65);
    glows.add({ x: headX, y: 6.2, z, color: light, size: 3.4, strength: lerp(0.5, 0.7, tier) });
    decals.add({ x: side * (STREET.roadHalf - 1.6), z, width: 13, color: light, strength: 0.16 });
  }
}
