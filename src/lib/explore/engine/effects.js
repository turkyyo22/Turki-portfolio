import { AdditiveBlending, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, Vector3 } from "three";

import { FOG, LIGHT_FIELD, NOISE, OUTPUT } from "./shaders";

// The air of the city: steam rising from manholes, vents and food stalls, vapour
// trailing from exhausts, water thrown up by fountains, and motes of dust that
// catch the light. Every puff and drop is placed by the graphics card from the
// clock alone, so thousands of them cost nothing to keep track of.

// A puff of steam or vapour: a soft, wispy disc that faces the camera and takes
// the colour of the lights near where it rose.
const PUFF_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec4 vTone;     // colour, opacity
varying float vSeed;
varying float vDepth;
varying float vHeight;
${FOG}
${NOISE}
void main() {
  vec2 p = vUv - 0.5;
  float round = max(0.0, 1.0 - dot(p, p) * 4.0);
  // Wisps: the disc is eaten away by slow noise.
  float wisp = noise21(vUv * 3.2 + vSeed * 17.0 + vec2(0.0, -uTime * 0.25)) * 0.65 + noise21(vUv * 7.5 + vSeed * 5.0) * 0.35;
  float alpha = round * round * smoothstep(0.18, 0.75, wisp + round * 0.35) * vTone.a * (1.0 - fogAmount(vDepth));
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(applyFog(vTone.rgb, vDepth, vHeight), alpha);
  ${OUTPUT}
}
`;

// What a puff shares whatever moves it: how it is lit, and the corner of the disc.
const PUFF_LIGHT = /* glsl */ `
vec4 puff(vec3 at, float size, float opacity) {
  vec4 mv = viewMatrix * vec4(at, 1.0);
  mv.xy += position.xy * size;
  vDepth = -mv.z;
  vHeight = at.y;
  vUv = uv;
  // Steam has no colour of its own: it shows the neon and the lamps round it.
  vec3 near = lightField(at.xz, 1.5).rgb * streetReach(at.y * 0.6);
  vTone = vec4(uSkyLight * 1.6 + uBounce * 0.8 + near * 0.75, opacity);
  return projectionMatrix * mv;
}
`;

const VENT_VERTEX = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aShape;    // height it rises to, width, strength, phase
uniform float uTime;
varying vec2 vUv;
varying vec4 vTone;
varying float vSeed;
varying float vDepth;
varying float vHeight;
${LIGHT_FIELD}
${PUFF_LIGHT}
void main() {
  float life = 3.2 + fract(aShape.w * 7.3) * 1.6;
  float age = fract(uTime / life + aShape.w);
  vSeed = aShape.w + floor(uTime / life + aShape.w) * 0.37;
  // It rises fast, slows, leans with the breeze and spreads.
  float rise = 1.0 - (1.0 - age) * (1.0 - age);
  vec3 at = aOrigin + vec3(
    (age * age * 0.9 + sin(uTime * 0.7 + aShape.w * 20.0) * 0.12 * age) * aShape.x * 0.3,
    rise * aShape.x,
    sin(aShape.w * 40.0 + uTime * 0.5) * 0.25 * age * aShape.y
  );
  float size = aShape.y * (0.55 + 1.9 * age);
  float opacity = aShape.z * sin(3.14159 * pow(age, 0.6)) * (1.0 - age * 0.4) * 0.3;
  gl_Position = puff(at, size, opacity);
}
`;

const EXHAUST_VERTEX = /* glsl */ `
attribute vec4 aLane;     // where the lane starts (x, z) and the way it runs (x, z)
attribute vec4 aRun;      // the lane's length, the vehicle's speed, its start along the lane, how far behind its middle the pipe is
attribute vec2 aPuff;     // phase, which side the pipe is on
uniform float uTime;
varying vec2 vUv;
varying vec4 vTone;
varying float vSeed;
varying float vDepth;
varying float vHeight;
${LIGHT_FIELD}
${PUFF_LIGHT}
void main() {
  const float life = 1.9;
  float turn = uTime / life + aPuff.x;
  float age = fract(turn) * life;
  vSeed = aPuff.x * 13.0 + floor(turn) * 0.61;
  // Where the vehicle was when this puff left its pipe.
  float travelled = mod(aRun.z + aRun.y * (uTime - age), aRun.x);
  vec2 road = aLane.xy + aLane.zw * (travelled - aRun.w);
  vec2 side = vec2(-aLane.w, aLane.z) * aPuff.y;
  float old = age / life;
  vec3 at = vec3(road.x + side.x, 0.3 + age * 0.5, road.y + side.y) + vec3(0.25, 0.0, 0.1) * age * age;
  // Vehicles shrink away at the ends of their stretch (see life.js); their vapour goes with them.
  float present = clamp(min(travelled, aRun.x - travelled) / 5.0, 0.0, 1.0);
  float size = 0.22 + 1.0 * old;
  float opacity = (1.0 - old) * (1.0 - old) * smoothstep(0.0, 0.12, old) * 0.34 * present;
  gl_Position = puff(at, size, opacity);
}
`;

// A drop of a fountain's jet: thrown up from the nozzle, pulled back down, lit from the pool.
const JET_VERTEX = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aThrow;    // the velocity it leaves with (x, y, z), phase
attribute vec3 aTint;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying float vDepth;
${FOG}
void main() {
  // The time the drop is in the air, there and back.
  float flight = 2.0 * aThrow.y / 9.8;
  float t = fract(uTime / flight + aThrow.w) * flight;
  vec3 at = aOrigin + aThrow.xyz * t + vec3(0.0, -4.9 * t * t, 0.0);
  vec4 mv = viewMatrix * vec4(at, 1.0);
  // Drawn out along its way: a short streak, not a dot.
  float speed = abs(aThrow.y - 9.8 * t);
  mv.xy += position.xy * vec2(0.05, 0.05 + 0.03 * speed);
  vDepth = -mv.z;
  vUv = uv;
  vColor = aTint * (0.35 + 0.65 * (1.0 - t / flight)) * (1.0 - fogAmount(vDepth));
  gl_Position = projectionMatrix * mv;
}
`;

const JET_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vDepth;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float soft = max(0.0, 1.0 - dot(p, p));
  gl_FragColor = vec4(vColor * soft * soft, 1.0);
  ${OUTPUT}
}
`;

// Dust and mist in the air round the camera, drifting, showing only where light falls on it.
const MOTE_VERTEX = /* glsl */ `
attribute vec4 aMote;     // a place in a box round the camera (0 to 1 each way), size
uniform float uTime;
uniform vec3 uEye;
varying vec2 vUv;
varying vec3 vColor;
varying float vDepth;
${FOG}
${LIGHT_FIELD}
void main() {
  const vec3 box = vec3(46.0, 14.0, 46.0);
  vec3 drift = vec3(uTime * 0.22, sin(uTime * 0.3 + aMote.x * 40.0) * 0.4 - uTime * 0.05, uTime * 0.09);
  // The box of motes travels with the camera; each mote stays where it is until it leaves the box.
  vec3 at = uEye + (fract(aMote.xyz + (drift - uEye) / box) - 0.5) * box;
  at.y = uEye.y - 6.0 + fract(aMote.y + (drift.y - uEye.y) / box.y) * box.y;
  vec4 mv = viewMatrix * vec4(at, 1.0);
  mv.xy += position.xy * aMote.w;
  vDepth = -mv.z;
  vUv = uv;
  float near = smoothstep(0.6, 2.5, vDepth) * (1.0 - smoothstep(14.0, 23.0, vDepth));
  vColor = lightField(at.xz, 1.0).rgb * streetReach(at.y) * near * step(0.0, at.y) * 0.55;
  gl_Position = projectionMatrix * mv;
}
`;

function quads(count) {
  const geometry = new InstancedBufferGeometry().copy(new PlaneGeometry(1, 1));
  geometry.instanceCount = count;
  return geometry;
}

/**
 * Collects steam vents, exhausts, fountain jets and dust, then builds them with
 * `build`. At `low` quality there are fewer puffs and no dust.
 */
export function createAir({ scene, shared, random, low = false }) {
  const vents = [];
  const pipes = [];
  const jets = [];
  let motes = null;

  const add = (mesh, order) => {
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    scene.add(mesh);
    return mesh;
  };

  return {
    /** Steam rising `height` metres from (x, y, z), `width` metres across where it starts. */
    vent({ x, y = 0.05, z, height = 4, width = 0.9, strength = 1 }) {
      const puffs = low ? 3 : 6;
      for (let i = 0; i < puffs; i += 1) vents.push(x, y, z, height, width, strength, (i + random()) / puffs);
    },

    /**
     * Vapour trailing from a vehicle that drives a lane: from (x, z) along
     * (dx, dz) for `length` metres at `speed`, starting `offset` along it.
     * `back` is how far behind its middle the exhaust is.
     */
    exhaust({ x, z, dx, dz, length, speed, offset, back }) {
      const puffs = low ? 2 : 4;
      const side = random.chance(0.5) ? 0.45 : -0.45;
      const phase = random();
      for (let i = 0; i < puffs; i += 1) pipes.push(x, z, dx, dz, length, speed, offset, back, phase + i / puffs, side);
    },

    /** A jet of a fountain: `drops` drops thrown from (x, y, z) at about (vx, vy, vz) metres a second. */
    jet({ x, y, z, vx = 0, vy = 6, vz = 0, spread = 0.25, drops = 24, color }) {
      const count = low ? Math.ceil(drops / 2) : drops;
      for (let i = 0; i < count; i += 1) {
        jets.push(x, y, z, vx + random.range(-spread, spread), vy * random.range(0.9, 1.05), vz + random.range(-spread, spread), random(), color.r, color.g, color.b);
      }
    },

    build() {
      if (vents.length > 0) {
        const count = vents.length / 7;
        const origin = new Float32Array(count * 3);
        const shape = new Float32Array(count * 4);
        for (let i = 0; i < count; i += 1) {
          origin.set(vents.slice(i * 7, i * 7 + 3), i * 3);
          shape.set(vents.slice(i * 7 + 3, i * 7 + 7), i * 4);
        }
        const geometry = quads(count);
        geometry.setAttribute("aOrigin", new InstancedBufferAttribute(origin, 3));
        geometry.setAttribute("aShape", new InstancedBufferAttribute(shape, 4));
        add(new Mesh(geometry, new ShaderMaterial({ uniforms: { ...shared }, vertexShader: VENT_VERTEX, fragmentShader: PUFF_FRAGMENT, transparent: true, depthWrite: false, blending: NormalBlending })), 4);
      }

      if (pipes.length > 0) {
        const count = pipes.length / 10;
        const lane = new Float32Array(count * 4);
        const run = new Float32Array(count * 4);
        const puff = new Float32Array(count * 2);
        for (let i = 0; i < count; i += 1) {
          lane.set(pipes.slice(i * 10, i * 10 + 4), i * 4);
          run.set(pipes.slice(i * 10 + 4, i * 10 + 8), i * 4);
          puff.set(pipes.slice(i * 10 + 8, i * 10 + 10), i * 2);
        }
        const geometry = quads(count);
        geometry.setAttribute("aLane", new InstancedBufferAttribute(lane, 4));
        geometry.setAttribute("aRun", new InstancedBufferAttribute(run, 4));
        geometry.setAttribute("aPuff", new InstancedBufferAttribute(puff, 2));
        add(new Mesh(geometry, new ShaderMaterial({ uniforms: { ...shared }, vertexShader: EXHAUST_VERTEX, fragmentShader: PUFF_FRAGMENT, transparent: true, depthWrite: false, blending: NormalBlending })), 4);
      }

      if (jets.length > 0) {
        const count = jets.length / 10;
        const origin = new Float32Array(count * 3);
        const thrown = new Float32Array(count * 4);
        const tint = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
          origin.set(jets.slice(i * 10, i * 10 + 3), i * 3);
          thrown.set(jets.slice(i * 10 + 3, i * 10 + 7), i * 4);
          tint.set(jets.slice(i * 10 + 7, i * 10 + 10), i * 3);
        }
        const geometry = quads(count);
        geometry.setAttribute("aOrigin", new InstancedBufferAttribute(origin, 3));
        geometry.setAttribute("aThrow", new InstancedBufferAttribute(thrown, 4));
        geometry.setAttribute("aTint", new InstancedBufferAttribute(tint, 3));
        add(new Mesh(geometry, new ShaderMaterial({ uniforms: { ...shared }, vertexShader: JET_VERTEX, fragmentShader: JET_FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending })), 2);
      }

      if (!low) {
        const count = 420;
        const mote = new Float32Array(count * 4);
        for (let i = 0; i < count; i += 1) mote.set([random(), random(), random(), random.range(0.025, 0.07)], i * 4);
        const geometry = quads(count);
        geometry.setAttribute("aMote", new InstancedBufferAttribute(mote, 4));
        const material = new ShaderMaterial({
          uniforms: { ...shared, uEye: { value: new Vector3() } },
          vertexShader: MOTE_VERTEX,
          fragmentShader: JET_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        });
        motes = add(new Mesh(geometry, material), 2);
      }
      vents.length = 0;
      pipes.length = 0;
      jets.length = 0;
    },

    /** Keeps the dust round the camera. */
    update(camera) {
      if (motes) motes.material.uniforms.uEye.value.copy(camera.position);
    },
  };
}
