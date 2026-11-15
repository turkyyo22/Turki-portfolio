import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { END_PLAZA, JUNCTIONS, MAIN_STREET, RAILS, SIDE_STREETS, STREETS, facadeOf, grandnessAt, junctionById } from "@/lib/explore/city";

import { PART, STYLE } from "./kit";
import { bright } from "./palette";
import { lerp } from "./random";
import { FOG, LIGHTING, OUTPUT } from "./shaders";

// Everything that moves through the city: cars in their lanes on the main
// street and the side streets, parked cars, flying vehicles over the newer
// districts, trains on two bridges, and robot citizens on the sidewalks and
// squares. Positions are a function of time alone, so nothing is stored per
// frame. Call before the kit is built (it adds the rail bridges to it).

// How far from the end of its stretch a mover shrinks away, so it seems to turn a corner instead of vanishing.
const CAR_FADE = 5;
const FLYER_FADE = 12;
const WALKER_FADE = 2.5;
const KERB = 0.15;

/** Writes a position, a turn around the vertical axis and a uniform scale into an instance matrix. */
function writeMatrix(array, index, x, y, z, yaw, scale) {
  const o = index * 16;
  const c = Math.cos(yaw) * scale;
  const s = Math.sin(yaw) * scale;
  array[o] = c;
  array[o + 1] = 0;
  array[o + 2] = -s;
  array[o + 3] = 0;
  array[o + 4] = 0;
  array[o + 5] = scale;
  array[o + 6] = 0;
  array[o + 7] = 0;
  array[o + 8] = s;
  array[o + 9] = 0;
  array[o + 10] = c;
  array[o + 11] = 0;
  array[o + 12] = x;
  array[o + 13] = y;
  array[o + 14] = z;
  array[o + 15] = 1;
}

/** Tags every vertex of `geometry` with `values` (one number each) under `name`. */
function tag(source, name, ...values) {
  // Every piece is merged unindexed, since some shapes come with an index and others without.
  const geometry = source.index ? source.toNonIndexed() : source;
  const count = geometry.attributes.position.count;
  const data = new Float32Array(count * values.length);
  for (let index = 0; index < count; index += 1) data.set(values, index * values.length);
  geometry.setAttribute(name, new BufferAttribute(data, values.length));
  return geometry;
}

// --- Vehicles --------------------------------------------------------------------
// Vehicle parts, as the shader colours them.
const PAINT = 0;
const GLASS = 1;
const WHITE_LIGHT = 2;
const RED_LIGHT = 3;
const NEON_LIGHT = 4;

const box = (w, h, d, x, y, z, part) => tag(new BoxGeometry(w, h, d).translate(x, y, z), "aPart", part);

/** A box whose top is narrower and shorter than its base, like a car's cabin. */
function cabin(w, h, d, x, y, z, part) {
  const geometry = new BoxGeometry(w, h, d);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    if (positions.getY(index) > 0) positions.setXYZ(index, positions.getX(index) * 0.8, positions.getY(index), positions.getZ(index) * 0.68);
  }
  geometry.computeVertexNormals();
  return tag(geometry.translate(x, y, z), "aPart", part);
}

// All vehicles face +z.
function carGeometry() {
  return mergeGeometries([
    box(1.9, 0.55, 4.4, 0, 0.52, 0, PAINT),
    cabin(1.7, 0.52, 2.5, 0, 1.05, -0.2, GLASS),
    box(0.5, 0.14, 0.06, -0.6, 0.6, 2.21, WHITE_LIGHT),
    box(0.5, 0.14, 0.06, 0.6, 0.6, 2.21, WHITE_LIGHT),
    box(1.7, 0.1, 0.06, 0, 0.66, -2.21, RED_LIGHT),
    box(1.94, 0.05, 3.6, 0, 0.3, 0, NEON_LIGHT),
  ]);
}

function flyerGeometry() {
  return mergeGeometries([
    box(1.5, 0.42, 3.6, 0, 0, 0, PAINT),
    cabin(1.15, 0.36, 1.7, 0, 0.37, 0.3, GLASS),
    box(0.34, 0.3, 1.7, -1, -0.05, -0.5, PAINT),
    box(0.34, 0.3, 1.7, 1, -0.05, -0.5, PAINT),
    box(0.9, 0.08, 0.06, 0, 0.02, 1.81, WHITE_LIGHT),
    box(0.3, 0.26, 0.06, -1, -0.05, -1.36, NEON_LIGHT),
    box(0.3, 0.26, 0.06, 1, -0.05, -1.36, NEON_LIGHT),
    box(0.2, 0.05, 2.2, 0, -0.23, 0, NEON_LIGHT),
  ]);
}

function trainGeometry() {
  return mergeGeometries([
    box(3, 3.1, 10.4, 0, 1.55, 0, PAINT),
    box(3.04, 0.9, 9.4, 0, 2.05, 0, WHITE_LIGHT),
    box(3.06, 0.14, 10.4, 0, 0.95, 0, NEON_LIGHT),
  ]);
}

// Light that vehicles throw on what is around them, drawn additively.
const HEAD_POOL = 0;
const TAIL_POOL = 1;
const UNDER_GLOW = 2;
const TRAIL = 3;

const flat = (width, length, y, z, part) => tag(new PlaneGeometry(width, length).rotateX(-Math.PI / 2).translate(0, y, z), "aPart", part);
const carLightGeometry = () => mergeGeometries([flat(3.6, 10, 0.06, 7.2, HEAD_POOL), flat(2.8, 3.4, 0.06, -3.4, TAIL_POOL), flat(3, 5.6, 0.05, 0, UNDER_GLOW)]);
const flyerLightGeometry = () => mergeGeometries([flat(0.7, 12, 0, -7.5, TRAIL)]);

// --- Robot citizens -------------------------------------------------------------------
// aBody: part (0 legs and wheels, 1 shell, 2 head, 3 light), swing direction, height of the joint.
const piece = (geometry, part, swing = 0, joint = 0) => tag(geometry, "aBody", part, swing, joint);

/** A walking robot about 1.7 m tall, facing +z. */
function walkerGeometry() {
  return mergeGeometries([
    piece(new BoxGeometry(0.15, 0.82, 0.17).translate(-0.12, 0.41, 0), 0, 1, 0.82),
    piece(new BoxGeometry(0.15, 0.82, 0.17).translate(0.12, 0.41, 0), 0, -1, 0.82),
    piece(new BoxGeometry(0.48, 0.6, 0.3).translate(0, 1.13, 0), 1),
    piece(new BoxGeometry(0.11, 0.56, 0.12).translate(-0.31, 1.12, 0), 1, -1, 1.4),
    piece(new BoxGeometry(0.11, 0.56, 0.12).translate(0.31, 1.12, 0), 1, 1, 1.4),
    piece(new IcosahedronGeometry(0.19, 1).scale(1, 0.85, 0.95).translate(0, 1.62, 0), 2),
    piece(new BoxGeometry(0.27, 0.06, 0.05).translate(0, 1.64, 0.16), 3),
    piece(new BoxGeometry(0.3, 0.05, 0.31).translate(0, 1.28, 0), 3),
    piece(new CylinderGeometry(0.012, 0.012, 0.22, 4).translate(0.08, 1.86, 0), 1),
  ]);
}

/** A hovering drone, its centre 0.3 m up: a round body, a glowing ring and an eye. */
function droneGeometry() {
  return mergeGeometries([
    piece(new IcosahedronGeometry(0.3, 1).translate(0, 0.3, 0), 1),
    piece(new TorusGeometry(0.44, 0.035, 5, 18).rotateX(Math.PI / 2).translate(0, 0.3, 0).toNonIndexed(), 3),
    piece(new BoxGeometry(0.2, 0.08, 0.06).translate(0, 0.33, 0.27), 3),
    piece(new CylinderGeometry(0.01, 0.01, 0.3, 4).translate(0, 0.66, 0), 1),
  ]);
}

/** A delivery robot on wheels, facing +z, with a lit panel. */
function courierGeometry() {
  const wheels = [];
  for (const x of [-0.3, 0.3]) for (const z of [-0.28, 0.28]) wheels.push(piece(new CylinderGeometry(0.11, 0.11, 0.08, 8).rotateZ(Math.PI / 2).translate(x, 0.11, z), 0));
  return mergeGeometries([
    ...wheels,
    piece(new BoxGeometry(0.62, 0.48, 0.78).translate(0, 0.46, 0), 1),
    piece(new BoxGeometry(0.4, 0.12, 0.04).translate(0, 0.55, 0.4), 3),
    piece(new CylinderGeometry(0.01, 0.01, 0.7, 4).translate(-0.24, 1.0, -0.3), 1),
    piece(new BoxGeometry(0.16, 0.1, 0.02).translate(-0.17, 1.3, -0.3), 3),
  ]);
}

/**
 * Builds the moving life of the city. `sites` and `stops` (in route order) place
 * the groups standing on each stop's square.
 */
export function createLife({ scene, shared, palette, random, settings, kit, sites, stops }) {
  const paints = ["#1b2a4a", "#4a1626", "#0f3d3e", "#23272f", "#aab3c2", "#b58a00", "#33204f"].map((hex) => new Color(hex));
  const none = new Color(0, 0, 0);

  const vehicleMaterial = new ShaderMaterial({
    uniforms: {
      ...shared,
      uGlass: { value: new Color("#0a1324") },
      uSky: { value: palette.glowViolet },
      uHead: { value: bright(palette.headlight, 2.3) },
      uTail: { value: bright(palette.red, 2.1) },
    },
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute vec3 aPaint;
      attribute vec3 aNeon;
      uniform vec3 uGlass;
      uniform vec3 uSky;
      uniform vec3 uHead;
      uniform vec3 uTail;
      varying vec3 vColor;
      varying float vDepth;
      varying float vHeight;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(instanceMatrix) * normal);
        float top = max(n.y, 0.0);
        // Paint and glass catch a little of the sky's glow on top.
        vec3 color = aPaint * (0.3 + 0.45 * top + 0.2 * abs(n.x)) + uSky * top * 0.3;
        if (aPart > 3.5) color = aNeon;
        else if (aPart > 2.5) color = uTail;
        else if (aPart > 1.5) color = uHead;
        else if (aPart > 0.5) color = uGlass + uSky * (0.15 + 0.5 * top);
        vColor = color;
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

  const lightMaterial = new ShaderMaterial({
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared, uHead: { value: palette.headlight }, uTail: { value: palette.red } },
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute vec3 aNeon;
      varying vec2 vUv;
      flat varying float vPart;
      flat varying vec3 vNeon;
      varying float vDepth;
      void main() {
        vUv = uv;
        vPart = aPart;
        vNeon = aNeon;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHead;
      uniform vec3 uTail;
      varying vec2 vUv;
      flat varying float vPart;
      flat varying vec3 vNeon;
      varying float vDepth;
      ${FOG}
      void main() {
        float round = max(0.0, 1.0 - length(vUv - 0.5) * 2.0);
        vec3 color;
        if (vPart < 0.5) {
          // Headlights: a beam on the road, brightest just ahead of the car.
          float aside = (vUv.x - 0.5) * 3.2;
          float beam = pow(clamp(vUv.y, 0.0, 1.0), 1.5) * (1.0 - smoothstep(0.9, 1.0, vUv.y)) * exp(-aside * aside);
          color = uHead * beam * 0.36;
        } else if (vPart < 1.5) {
          color = uTail * round * round * 0.3;
        } else if (vPart < 2.5) {
          color = vNeon * pow(round, 1.5) * 0.5;
        } else {
          // The streak a flying vehicle leaves behind.
          color = vNeon * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.8) * max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0) * 0.8;
        }
        gl_FragColor = vec4(color * (1.0 - fogAmount(vDepth)), 1.0);
        ${OUTPUT}
      }
    `,
  });

  /** One instanced mesh of vehicles, with an optional second one for their light, moving together. */
  const createFleet = (bodyGeometry, lightGeometry, list) => {
    if (list.length === 0) {
      bodyGeometry.dispose();
      lightGeometry?.dispose();
      return null;
    }
    const paint = new Float32Array(list.length * 3);
    const neon = new Float32Array(list.length * 3);
    list.forEach((item, index) => {
      paint.set([item.paint.r, item.paint.g, item.paint.b], index * 3);
      neon.set([item.neon.r, item.neon.g, item.neon.b], index * 3);
    });
    bodyGeometry.setAttribute("aPaint", new InstancedBufferAttribute(paint, 3));
    bodyGeometry.setAttribute("aNeon", new InstancedBufferAttribute(neon, 3));
    const body = new InstancedMesh(bodyGeometry, vehicleMaterial, list.length);
    body.instanceMatrix.setUsage(DynamicDrawUsage);
    body.frustumCulled = false;
    scene.add(body);
    if (lightGeometry) {
      lightGeometry.setAttribute("aNeon", new InstancedBufferAttribute(neon, 3));
      const lights = new InstancedMesh(lightGeometry, lightMaterial, list.length);
      // Both meshes read the same matrices, so the light always sits under its vehicle.
      lights.instanceMatrix = body.instanceMatrix;
      lights.frustumCulled = false;
      lights.renderOrder = 1;
      scene.add(lights);
    }
    return body;
  };

  // A stretch of road a mover travels along, from (x, z) in direction (dx, dz).
  const lane = (x, z, dx, dz, length) => ({ x, z, dx, dz, length, yaw: Math.atan2(dx, dz) });

  // --- Cars ---
  const cars = [];
  const addCars = (stretch, density, tier) => {
    const count = Math.round(stretch.length * density * settings.traffic + random());
    for (let index = 0; index < count; index += 1) {
      cars.push({
        ...stretch,
        speed: random.range(8, 14),
        offset: random.range(0, stretch.length),
        paint: random.pick(paints),
        neon: random.chance(0.15 + 0.5 * tier) ? bright(random.pick(palette.neon), 1.6) : none,
      });
    }
  };
  const junctionHalf = (junction) => Math.max(...SIDE_STREETS.filter((street) => street.junction === junction.id).map((street) => STREETS[street.street].half)) + 1;
  const cuts = [...JUNCTIONS.map((junction) => ({ z: junction.z, half: junctionHalf(junction) })), { z: END_PLAZA.z, half: END_PLAZA.radius + 3 }].sort((a, b) => b.z - a.z);
  let from = MAIN_STREET.fromZ;
  for (const cut of cuts) {
    const to = cut.z + cut.half;
    const length = from - to;
    if (length > 20) {
      const tier = grandnessAt((from + to) / 2);
      // Driving on the right: lanes right of the centre line head down the street (-z).
      for (const x of [1.75, 5.25]) addCars(lane(x, from, 0, -1, length), lerp(0.006, 0.014, tier), tier);
      for (const x of [-1.75, -5.25]) addCars(lane(x, to, 0, 1, length), lerp(0.006, 0.014, tier), tier);
    }
    from = cut.z - cut.half;
  }
  // Side streets: two lanes each way on the avenues, one each way elsewhere, and parked cars along the kerbs.
  const parked = [];
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const start = STREETS.main.half + 2;
    const end = street.end === "stub" ? street.reach - 1 : street.reach - street.square - 1;
    const length = end - start;
    if (length < 15) continue;
    const tier = grandnessAt(z);
    const offsets = road.half >= 7 ? [1.75, 5.25] : [2.5];
    for (const offset of offsets) {
      // Heading out on the right-hand lane, coming back on the other.
      addCars(lane(street.side * start, z + street.side * offset, street.side, 0, length), 0.008, tier);
      addCars(lane(street.side * end, z - street.side * offset, -street.side, 0, length), 0.008, tier);
    }
    if (road.half < 7) {
      for (const edge of [-1, 1]) {
        for (let along = facadeOf("main") + 4; along < end - 3; along += 6.5) {
          if (!random.chance(0.5)) continue;
          parked.push({ x: street.side * along, z: z + edge * (road.half - 1.15), yaw: street.side > 0 ? Math.PI / 2 : -Math.PI / 2, paint: random.pick(paints), neon: none });
        }
      }
    }
  }
  const carFleet = createFleet(carGeometry(), carLightGeometry(), cars);
  const parkedFleet = createFleet(carGeometry(), null, parked);
  if (parkedFleet) {
    parked.forEach((car, index) => writeMatrix(parkedFleet.instanceMatrix.array, index, car.x, 0, car.z, car.yaw, 1));
    parkedFleet.instanceMatrix.needsUpdate = true;
  }

  // --- Flying vehicles: above the main street from midtown on, across it at junctions, and round the tallest tower ---
  const flyers = [];
  const skyFrom = -200;
  const skyTo = END_PLAZA.z + END_PLAZA.radius + 10;
  const skyLength = skyFrom - skyTo;
  for (let index = 0; index < Math.round((skyLength / 22) * settings.traffic); index += 1) {
    const x = random.pick([-10, -6, 6, 10]);
    const heading = x > 0 ? -1 : 1;
    flyers.push({ kind: "along", ...lane(x, heading < 0 ? skyFrom : skyTo, 0, heading, skyLength), y: random.range(16, 42), speed: random.range(18, 30), offset: random.range(0, skyLength), phase: random.range(0, 6), paint: random.pick(paints), neon: bright(random.pick(palette.neon), 2.2) });
  }
  for (const junction of JUNCTIONS) {
    if (grandnessAt(junction.z) < 0.4) continue;
    for (let index = 0; index < Math.round(3 * settings.traffic); index += 1) {
      const heading = index % 2 === 0 ? 1 : -1;
      flyers.push({ kind: "along", ...lane(-heading * 200, junction.z + heading * 3, heading, 0, 400), y: random.range(18, 34), speed: random.range(16, 26), offset: random.range(0, 400), phase: random.range(0, 6), paint: random.pick(paints), neon: bright(random.pick(palette.neon), 2.2) });
    }
  }
  const towerIndex = stops.findIndex((stop) => stop.kind === "coop");
  if (towerIndex >= 0) {
    const tower = sites[towerIndex];
    for (let index = 0; index < 3; index += 1) {
      flyers.push({ kind: "orbit", x: tower.x, z: tower.z, y: 82 + index * 7, radius: 24 + index * 4, speed: (index % 2 === 0 ? 1 : -1) * random.range(0.25, 0.4), offset: random.range(0, 6), phase: random.range(0, 6), paint: random.pick(paints), neon: bright(palette.emerald, 2.2) });
    }
  }
  const flyerFleet = createFleet(flyerGeometry(), flyerLightGeometry(), flyers);

  // --- Trains on bridges over the main street ---
  const trainCars = [];
  RAILS.forEach((rail, index) => {
    kit.add(PART.box, { y: 13.4, z: rail.z, w: 600, h: 1.1, d: 2.6, style: STYLE.plain, color: palette.steel });
    kit.add(PART.box, { y: 13.2, z: rail.z, w: 600, h: 0.12, d: 0.3, style: STYLE.neon, lit: 1, color: palette.accent });
    for (const x of [-250, -190, -130, -95, -10.4, 10.4, 95, 130, 190, 250]) kit.add(PART.box, { x, z: rail.z, w: 1.2, h: 13.4, d: 1.2, style: STYLE.plain, color: palette.steel });
    const heading = index % 2 === 0 ? 1 : -1;
    const neon = bright(random.pick(palette.neon), 1.8);
    for (let car = 0; car < 5; car += 1) trainCars.push({ z: rail.z, heading, lag: car * 11, speed: 26, offset: index * 170, paint: palette.steel.clone().multiplyScalar(1.6), neon });
  });
  const trainFleet = createFleet(trainGeometry(), null, trainCars);

  // --- Robot citizens ---
  const shells = ["#d9dee8", "#9aa3b5", "#2a3142", "#c9b28a", "#5a6478"].map((hex) => new Color(hex));
  const kinds = { walker: [], drone: [], courier: [] };
  const robot = (extra) => {
    const roll = random();
    const kind = roll < 0.72 ? "walker" : roll < 0.86 ? "drone" : "courier";
    const item = { shell: random.pick(shells), glow: bright(random.pick(palette.neon), random.range(1.1, 1.8)), size: random.range(0.92, 1.08), phase: random.range(0, 6), ...extra };
    if (kind === "courier") item.speed = (item.speed ?? 0) * 0.7;
    kinds[kind].push(item);
  };

  // Walkers on the sidewalks of the main street and the side streets.
  const sidewalk = (stretch, tier) => {
    const count = Math.round(stretch.length * lerp(0.03, 0.08, tier) * settings.crowd + random());
    for (let index = 0; index < count; index += 1) {
      const speed = random.range(1.1, 1.6);
      robot({ walking: true, ...stretch, speed, pace: speed / 1.4, offset: random.range(0, stretch.length) });
    }
  };
  let walkFrom = MAIN_STREET.fromZ - 6;
  for (const cut of cuts) {
    const to = cut.z + cut.half + 4;
    const length = walkFrom - to;
    if (length > 12) {
      const tier = grandnessAt((walkFrom + to) / 2);
      for (const side of [-1, 1]) {
        const x = side * random.range(STREETS.main.half + 1.4, STREETS.main.half + STREETS.main.walk - 0.6);
        const heading = random.chance(0.5) ? 1 : -1;
        sidewalk(lane(x, heading < 0 ? walkFrom : to, 0, heading, length), tier);
        const x2 = side * random.range(STREETS.main.half + 1.4, STREETS.main.half + STREETS.main.walk - 0.6);
        sidewalk(lane(x2, -heading < 0 ? walkFrom : to, 0, -heading, length), tier);
      }
    }
    walkFrom = cut.z - cut.half - 4;
  }
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const start = facadeOf("main") + 1;
    const end = street.end === "stub" ? street.reach - 2 : street.reach - street.square + 2;
    const length = end - start;
    for (const edge of [-1, 1]) {
      const offset = z + edge * (road.half + 1.2 + random() * (road.walk - 1.6));
      const outward = random.chance(0.5);
      sidewalk(lane(street.side * (outward ? start : end), offset, outward ? street.side : -street.side, 0, length), grandnessAt(z) * 0.8);
    }
  }

  // Small groups standing on each stop's square, looking at the building or chatting.
  stops.forEach((stop, index) => {
    const site = sites[index];
    const cos = Math.cos(site.turn);
    const sin = Math.sin(site.turn);
    const toWorld = (lx, lz) => ({ x: site.x + lx * cos + lz * sin, z: site.z - lx * sin + lz * cos });
    const plaza = site.footprint.depth / 2 + site.footprint.apron + 5.5;
    const count = Math.round((3 + 3 * stop.grandness) * settings.crowd);
    for (let n = 0; n < count; n += 1) {
      const angle = ((random.chance(0.5) ? 1 : -1) * random.range(45, 140) * Math.PI) / 180;
      const radius = random.range(6.4, 8.4);
      const spot = toWorld(Math.sin(angle) * radius, plaza + Math.cos(angle) * radius);
      robot({ ...spot, yaw: Math.atan2(site.x - spot.x, site.z - spot.z) + random.range(-0.5, 0.5) });
    }
    if (stop.kind === "graduation") {
      for (let n = 0; n < Math.round(10 * settings.crowd); n += 1) {
        const spot = toWorld(random.range(-10, 10), site.footprint.depth / 2 + site.footprint.apron + random.range(0.8, 3.4));
        robot({ ...spot, yaw: Math.atan2(site.x - spot.x, site.z - spot.z) + random.range(-0.3, 0.3) });
      }
    }
  });

  const robotMaterial = new ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      attribute vec3 aBody;    // part, swing direction, height of the joint
      attribute vec3 aShell;
      attribute vec3 aGlow;
      attribute vec3 aWalk;    // phase, pace (0 when standing), hover (drones)
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      flat varying vec3 vShell;
      flat varying vec3 vGlow;
      flat varying float vPart;
      varying float vDepth;
      void main() {
        vec3 p = position;
        float moving = step(0.01, aWalk.y);
        float stride = uTime * 7.0 * aWalk.y + aWalk.x;
        // Legs and arms swing from their joints; the body bobs with each step.
        p.z += aBody.y * sin(stride) * max(0.0, aBody.z - p.y) * 0.55 * moving;
        p.y += abs(cos(stride)) * 0.04 * moving;
        // Drones float, and someone standing sways a little.
        p.y += aWalk.z * (1.7 + sin(uTime * 1.6 + aWalk.x) * 0.18);
        p.x += sin(uTime * 0.8 + aWalk.x) * 0.03 * (1.0 - moving) * p.y;
        vShell = aShell;
        vGlow = aGlow;
        vPart = aBody.x;
        vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      flat varying vec3 vShell;
      flat varying vec3 vGlow;
      flat varying float vPart;
      varying float vDepth;
      ${FOG}
      ${LIGHTING}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 color;
        if (vPart > 2.5) {
          color = vGlow;
        } else {
          vec3 albedo = vPart < 0.5 ? vShell * 0.35 : (vPart > 1.5 ? vShell * 1.1 : vShell);
          color = shade(albedo, n, vWorld, view, 1.0);
          vec3 reflected = reflect(-view, n);
          color += uMoonColor * pow(max(dot(reflected, uMoonDir), 0.0), 18.0) * 1.6;
        }
        gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
        ${OUTPUT}
      }
    `,
  });

  const crowds = [];
  const shapes = { walker: walkerGeometry, drone: droneGeometry, courier: courierGeometry };
  for (const [kind, list] of Object.entries(kinds)) {
    if (list.length === 0) continue;
    // Walking ones first, so they can be moved without touching the others.
    list.sort((a, b) => (b.walking ? 1 : 0) - (a.walking ? 1 : 0));
    const geometry = shapes[kind]();
    const shell = new Float32Array(list.length * 3);
    const glow = new Float32Array(list.length * 3);
    const walk = new Float32Array(list.length * 3);
    list.forEach((one, index) => {
      shell.set([one.shell.r, one.shell.g, one.shell.b], index * 3);
      glow.set([one.glow.r, one.glow.g, one.glow.b], index * 3);
      walk.set([one.phase, kind === "walker" && one.walking ? one.pace : 0, kind === "drone" ? 1 : 0], index * 3);
    });
    geometry.setAttribute("aShell", new InstancedBufferAttribute(shell, 3));
    geometry.setAttribute("aGlow", new InstancedBufferAttribute(glow, 3));
    geometry.setAttribute("aWalk", new InstancedBufferAttribute(walk, 3));
    const mesh = new InstancedMesh(geometry, robotMaterial, list.length);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const walkers = list.filter((one) => one.walking).length;
    list.forEach((one, index) => {
      if (!one.walking) writeMatrix(mesh.instanceMatrix.array, index, one.x, KERB, one.z, one.yaw, one.size);
    });
    crowds.push({ mesh, list, walkers });
  }

  const fade = (travelled, length, margin) => Math.max(0, Math.min(1, travelled / margin, (length - travelled) / margin));

  return {
    update(time) {
      if (carFleet) {
        const matrices = carFleet.instanceMatrix.array;
        for (let index = 0; index < cars.length; index += 1) {
          const car = cars[index];
          const travelled = (car.offset + car.speed * time) % car.length;
          writeMatrix(matrices, index, car.x + car.dx * travelled, 0, car.z + car.dz * travelled, car.yaw, fade(travelled, car.length, CAR_FADE));
        }
        carFleet.instanceMatrix.needsUpdate = true;
      }

      if (flyerFleet) {
        const matrices = flyerFleet.instanceMatrix.array;
        for (let index = 0; index < flyers.length; index += 1) {
          const flyer = flyers[index];
          const bob = Math.sin(time * 1.3 + flyer.phase) * 0.45;
          if (flyer.kind === "orbit") {
            const angle = flyer.offset + flyer.speed * time;
            const yaw = angle + (flyer.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
            writeMatrix(matrices, index, flyer.x + Math.sin(angle) * flyer.radius, flyer.y + bob, flyer.z + Math.cos(angle) * flyer.radius, yaw, 1);
            continue;
          }
          const travelled = (flyer.offset + flyer.speed * time) % flyer.length;
          writeMatrix(matrices, index, flyer.x + flyer.dx * travelled, flyer.y + bob, flyer.z + flyer.dz * travelled, flyer.yaw, fade(travelled, flyer.length, FLYER_FADE));
        }
        flyerFleet.instanceMatrix.needsUpdate = true;
      }

      if (trainFleet) {
        const matrices = trainFleet.instanceMatrix.array;
        const span = 620;
        for (let index = 0; index < trainCars.length; index += 1) {
          const car = trainCars[index];
          const travelled = (car.offset + car.speed * time - car.lag + span * 4) % span;
          writeMatrix(matrices, index, car.heading * (travelled - span / 2), 14.5, car.z, car.heading > 0 ? Math.PI / 2 : -Math.PI / 2, 1);
        }
        trainFleet.instanceMatrix.needsUpdate = true;
      }

      for (const { mesh, list, walkers } of crowds) {
        const matrices = mesh.instanceMatrix.array;
        for (let index = 0; index < walkers; index += 1) {
          const one = list[index];
          const travelled = (one.offset + one.speed * time) % one.length;
          writeMatrix(matrices, index, one.x + one.dx * travelled, KERB, one.z + one.dz * travelled, one.yaw, one.size * fade(travelled, one.length, WALKER_FADE));
        }
        if (walkers > 0) mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
