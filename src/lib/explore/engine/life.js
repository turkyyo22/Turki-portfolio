import { AdditiveBlending, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, NormalBlending, ShaderMaterial, Vector2 } from "three";

import { END_PLAZA, JUNCTIONS, MAIN_STREET, RAILS, SIDE_STREETS, STREETS, facadeOf, grandnessAt, junctionById, placeById, roundaboutOf, sideStreetById } from "@/lib/explore/city";

import { MASONRY, METAL, PART, STYLE } from "./kit";
import { BEAM, BODY, CAR, blobGeometry, carLightGeometry, courierGeometry, droneGeometry, flyerGeometry, flyerLightGeometry, roadVehicles, shadowGeometry, trainGeometry, walkerGeometry } from "./models";
import { bright } from "./palette";
import { lerp } from "./random";
import { FOG, LIGHTING, NOISE, OUTPUT } from "./shaders";

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

const VEHICLE_VERTEX = /* glsl */ `
attribute float aPart;
attribute vec3 aPaint;
attribute vec3 aNeon;
attribute float aLit;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
flat varying float vPart;
flat varying vec3 vPaint;
flat varying vec3 vNeon;
flat varying float vLit;
varying float vDepth;
void main() {
  vLocal = position;
  vPart = aPart;
  vPaint = aPaint;
  vNeon = aNeon;
  vLit = aLit;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const VEHICLE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uHead;
uniform vec3 uTail;
uniform vec3 uSign;
uniform vec2 uCabin;      // where the cabin starts and ends along the vehicle
uniform float uBelt;      // the height of the line under the windows
uniform float uBays;      // the spacing of window pillars on a bus or a train; 0 on a car
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
flat varying float vPart;
flat varying vec3 vPaint;
flat varying vec3 vNeon;
flat varying float vLit;
varying float vDepth;
${FOG}
${NOISE}
${LIGHTING}
void main() {
  int part = int(vPart + 0.5);
  vec3 n = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 color;
  float pixel = fwidth(vLocal.z) + fwidth(vLocal.y) + 1e-4;
  float bayPixel = fwidth(vLocal.z) / max(uBays, 0.1);
  float linePixel = fwidth(vLocal.x) * 9.0;
  if (part == ${CAR.head}) {
    color = uHead * mix(0.03, 1.0, vLit);
  } else if (part == ${CAR.tail}) {
    color = uTail * mix(0.04, 1.0, vLit);
  } else if (part == ${CAR.neon}) {
    color = vNeon * vLit;
  } else if (part == ${CAR.sign}) {
    // A lit sign: a taxi's roof light, a bus's destination, a train's windows.
    float bays = uBays > 0.0 ? stripes(vLocal.z / max(uBays, 0.1), 0.82, bayPixel) : 0.75 + 0.25 * stripes(vLocal.x * 9.0, 0.5, linePixel);
    color = uSign * bays * mix(0.05, 1.0, vLit);
  } else if (part == ${CAR.plate}) {
    color = vec3(0.75, 0.78, 0.8) * mix(0.04, 0.5, vLit);
  } else {
    vec3 albedo = vPaint;
    float roughness = 0.22;
    float metal = 0.5;
    vec3 inner = vec3(0.0);
    bool flank = abs(n.x) > 0.55;
    if (part == ${CAR.paint}) {
      // Lacquer with a fine flake in it; the gaps round the doors, and their handles.
      albedo *= 0.94 + 0.12 * noise21(vLocal.zy * 240.0);
      if (flank && uBays == 0.0 && vLocal.y < uBelt - 0.02) {
        float middle = (uCabin.x + uCabin.y) * 0.5 + 0.08;
        float gap = min(min(abs(vLocal.z - uCabin.x - 0.5), abs(vLocal.z - middle)), abs(vLocal.z - uCabin.y + 0.35));
        float seam = (1.0 - smoothstep(0.004, 0.004 + pixel, gap)) * step(0.36, vLocal.y);
        float handle = boxMask(vec2(vLocal.z, vLocal.y), vec2(middle + 0.12, uBelt - 0.13), vec2(middle + 0.3, uBelt - 0.1), vec2(pixel))
          + boxMask(vec2(vLocal.z, vLocal.y), vec2(uCabin.y - 0.2, uBelt - 0.13), vec2(uCabin.y - 0.02, uBelt - 0.1), vec2(pixel));
        albedo *= 1.0 - 0.8 * clamp(seam + handle, 0.0, 1.0);
      }
    } else if (part == ${CAR.glass}) {
      albedo = vec3(0.006, 0.008, 0.012);
      roughness = 0.04;
      metal = 0.0;
      // The pillars between the windows, and the glow of the dashboard through the glass.
      if (flank) {
        float pillar = uBays > 0.0
          ? 1.0 - stripes(vLocal.z / max(uBays, 0.1), 0.9, bayPixel)
          : 1.0 - smoothstep(0.035, 0.035 + pixel, abs(vLocal.z - (uCabin.x + uCabin.y) * 0.5 - 0.08));
        albedo = mix(albedo, vPaint * 0.5, pillar);
        roughness = mix(roughness, 0.3, pillar);
      }
      inner = (uBays > 0.0 ? vec3(0.9, 0.8, 0.6) * 0.5 : vec3(0.05, 0.1, 0.14)) * vLit * (1.0 - smoothstep(uBelt, uBelt + 0.6, vLocal.y) * 0.6);
    } else if (part == ${CAR.trim}) {
      albedo = vec3(0.018);
      roughness = 0.6;
      metal = 0.0;
    } else if (part == ${CAR.tyre}) {
      albedo = vec3(0.012);
      roughness = 0.92;
      metal = 0.0;
    } else {
      albedo = vec3(0.62, 0.64, 0.68);
      roughness = 0.24;
      metal = 1.0;
    }
    // Under the body it is dark: the car hides the sky and the lamps.
    float under = 0.35 + 0.65 * smoothstep(0.1, 0.7, vLocal.y);
    color = shade(albedo, n, vWorld, view, roughness, metal, under) + inner;
  }
  gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
  ${OUTPUT}
}
`;

const BEAM_VERTEX = /* glsl */ `
attribute float aPart;
attribute vec3 aNeon;
attribute float aLit;
varying vec2 vUv;
flat varying float vPart;
flat varying vec3 vNeon;
flat varying float vLit;
varying float vDepth;
void main() {
  vUv = uv;
  vPart = aPart;
  vNeon = aNeon;
  vLit = aLit;
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uHead;
uniform vec3 uTail;
varying vec2 vUv;
flat varying float vPart;
flat varying vec3 vNeon;
flat varying float vLit;
varying float vDepth;
${FOG}
void main() {
  int part = int(vPart + 0.5);
  vec2 p = vUv - 0.5;
  float round = max(0.0, 1.0 - length(p) * 2.0);
  vec3 color;
  if (part == ${BEAM.headPool}) {
    // Headlamps on the road: two beams that widen and fade, brightest a few metres ahead.
    float aside = abs(p.x) * 2.0;
    float spread = 0.22 + vUv.y * 0.42;
    float beam = pow(clamp(vUv.y, 0.0, 1.0), 0.7) * pow(1.0 - vUv.y, 1.8) * 3.2 * (1.0 - smoothstep(spread, spread + 0.3, aside));
    color = uHead * beam * 0.14;
  } else if (part == ${BEAM.tailPool}) {
    color = uTail * round * round * 0.22;
  } else if (part == ${BEAM.underGlow}) {
    color = vNeon * pow(round, 1.5) * 0.45;
  } else if (part == ${BEAM.trail}) {
    // The streak a flying vehicle leaves behind.
    color = vNeon * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.8) * max(0.0, 1.0 - abs(p.x) * 2.0) * 0.8;
  } else {
    // Glare round a lamp: a bright core and a streak to either side.
    float core = exp(-dot(p, p) * 60.0);
    float streak = exp(-p.y * p.y * 900.0) * exp(-p.x * p.x * 9.0);
    color = (part == ${BEAM.headFlare} ? uHead : uTail) * (core * 1.5 + streak * 0.45);
  }
  gl_FragColor = vec4(color * vLit * (1.0 - fogAmount(vDepth)), 1.0);
  ${OUTPUT}
}
`;

// A soft dark patch under something that stands on the ground.
const SHADOW_VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
uniform vec2 uShape;     // 1 for a rounded box, 0 for a disc; darkness
varying vec2 vUv;
varying float vDepth;
${FOG}
void main() {
  vec2 p = abs(vUv - 0.5) * 2.0;
  float box = (1.0 - smoothstep(0.55, 1.0, p.x)) * (1.0 - smoothstep(0.7, 1.0, p.y));
  float disc = 1.0 - smoothstep(0.2, 1.0, length(p));
  float dark = mix(disc * disc, box, uShape.x) * uShape.y * (1.0 - fogAmount(vDepth));
  gl_FragColor = vec4(0.0, 0.0, 0.0, dark);
}
`;

const ROBOT_VERTEX = /* glsl */ `
attribute vec4 aBody;    // part, limb (±1 a leg, ±2 an arm), top joint, middle joint
attribute vec3 aShell;
attribute vec3 aGlow;
attribute vec3 aAccent;
attribute vec3 aWalk;    // phase, pace (0 when standing), hover (drones)
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
flat varying vec3 vShell;
flat varying vec3 vGlow;
flat varying vec3 vAccent;
flat varying float vPart;
varying float vDepth;

vec2 turned(vec2 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

void main() {
  vec3 p = position;
  vec3 n = normal;
  float moving = step(0.01, aWalk.y);
  float stride = uTime * 6.2 * aWalk.y + aWalk.x;
  float limb = aBody.y;
  if (limb != 0.0 && p.y < aBody.z + 0.03) {
    // A limb swings from its top joint and bends at its middle one: legs at
    // the knee as they come forward, arms a little at the elbow all the time.
    bool leg = abs(limb) < 1.5;
    float side = sign(limb);
    float swing = sin(stride) * side * (leg ? 0.52 : -0.4) * moving;
    float bend = leg ? max(0.0, -cos(stride) * side) * 0.85 * moving : -(0.25 + 0.2 * moving);
    vec2 d = vec2(p.y - aBody.z, p.z);
    vec2 m = n.yz;
    if (p.y < aBody.w) {
      vec2 below = turned(vec2(p.y - aBody.w, p.z), bend);
      d = vec2(aBody.w - aBody.z, 0.0) + below;
      m = turned(m, bend);
    }
    d = turned(d, swing);
    m = turned(m, swing);
    p.y = aBody.z + d.x;
    p.z = d.y;
    n = vec3(n.x, m);
  }
  // The body rises and falls with each step, and leans into its walk.
  p.y += abs(cos(stride)) * 0.03 * moving;
  p.z += (p.y - 0.9) * 0.04 * moving;
  // Drones float, and someone standing sways a little.
  p.y += aWalk.z * (1.7 + sin(uTime * 1.6 + aWalk.x) * 0.18);
  p.x += sin(uTime * 0.8 + aWalk.x) * 0.012 * (1.0 - moving) * p.y;
  vShell = aShell;
  vGlow = aGlow;
  vAccent = aAccent;
  vPart = aBody.x;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const ROBOT_FRAGMENT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
flat varying vec3 vShell;
flat varying vec3 vGlow;
flat varying vec3 vAccent;
flat varying float vPart;
varying float vDepth;
${FOG}
${LIGHTING}
void main() {
  int part = int(vPart + 0.5);
  vec3 n = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 color;
  if (part == ${BODY.light}) {
    color = vGlow;
  } else if (part == ${BODY.dark}) {
    // Joints and soles: dark rubber and steel.
    color = shade(vec3(0.03, 0.032, 0.04), n, vWorld, view, 0.55, 0.4, 1.0);
  } else if (part == ${BODY.accent}) {
    color = shade(vAccent, n, vWorld, view, 0.4, 0.3, 1.0);
  } else {
    // The shell: enamel over metal, with a soft shine.
    color = shade(vShell, n, vWorld, view, 0.3, 0.35, 1.0);
  }
  gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
  ${OUTPUT}
}
`;

/**
 * Builds the moving life of the city. `sites` and `stops` (in route order) place
 * the groups standing before each stop's building. `air` takes the exhausts' vapour.
 */
export function createLife({ scene, shared, palette, random, settings, kit, sites, stops, air }) {
  const low = !settings.detail;
  const paints = ["#16294f", "#5a1424", "#0d4443", "#1c2028", "#9aa3b2", "#b08a12", "#33204f", "#0b0c10", "#6f7682", "#7a1f1a", "#e6e2d8"].map((hex) => new Color(hex));
  const taxiPaint = new Color("#d9a406");
  const busPaint = new Color("#13806f");
  const none = new Color(0, 0, 0);
  const defines = low ? { LOW: "" } : {};

  const vehicleUniforms = {
    ...shared,
    uHead: { value: bright(palette.headlight, 2.6) },
    uTail: { value: bright(palette.red, 2.3) },
    uSign: { value: bright(palette.amber, 1.5) },
  };
  /** The vehicle material for one kind of vehicle. */
  const vehicleMaterial = ({ cabin = [0, 0], belt = 0.9, bays = 0, sign }) =>
    new ShaderMaterial({
      defines,
      uniforms: { ...vehicleUniforms, uCabin: { value: new Vector2(cabin[0], cabin[1]) }, uBelt: { value: belt }, uBays: { value: bays }, ...(sign ? { uSign: { value: sign } } : {}) },
      vertexShader: VEHICLE_VERTEX,
      fragmentShader: VEHICLE_FRAGMENT,
    });

  const beamMaterial = new ShaderMaterial({
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared, uHead: { value: palette.headlight }, uTail: { value: palette.red } },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
  });

  const shadowMaterial = (box, darkness) =>
    new ShaderMaterial({
      blending: NormalBlending,
      transparent: true,
      depthWrite: false,
      uniforms: { ...shared, uShape: { value: new Vector2(box ? 1 : 0, darkness) } },
      vertexShader: SHADOW_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
    });
  const carShadow = shadowMaterial(true, 0.82);
  const blobShadow = shadowMaterial(false, 0.6);

  /**
   * One instanced mesh of vehicles, with two more that move with it: the light
   * they throw (when `beams` is given) and the shadow under them (`shadow`).
   */
  const createFleet = (list, { geometry, material, beams, shadow }) => {
    if (list.length === 0) {
      geometry.dispose();
      beams?.dispose();
      shadow?.dispose();
      return null;
    }
    const paint = new Float32Array(list.length * 3);
    const neon = new Float32Array(list.length * 3);
    const lit = new Float32Array(list.length);
    list.forEach((item, index) => {
      paint.set([item.paint.r, item.paint.g, item.paint.b], index * 3);
      neon.set([item.neon.r, item.neon.g, item.neon.b], index * 3);
      lit[index] = item.lit ?? 1;
    });
    geometry.setAttribute("aPaint", new InstancedBufferAttribute(paint, 3));
    geometry.setAttribute("aNeon", new InstancedBufferAttribute(neon, 3));
    geometry.setAttribute("aLit", new InstancedBufferAttribute(lit, 1));
    const body = new InstancedMesh(geometry, material, list.length);
    body.instanceMatrix.setUsage(DynamicDrawUsage);
    body.frustumCulled = false;
    scene.add(body);
    // The other meshes read the same matrices, so light and shadow always sit under their vehicle.
    if (shadow) {
      const under = new InstancedMesh(shadow, carShadow, list.length);
      under.instanceMatrix = body.instanceMatrix;
      under.frustumCulled = false;
      under.renderOrder = 0.5;
      scene.add(under);
    }
    if (beams) {
      beams.setAttribute("aNeon", new InstancedBufferAttribute(neon, 3));
      beams.setAttribute("aLit", new InstancedBufferAttribute(lit, 1));
      const lights = new InstancedMesh(beams, beamMaterial, list.length);
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
  const kinds = roadVehicles();
  const moving = Object.fromEntries(Object.keys(kinds).map((kind) => [kind, []]));
  const parked = Object.fromEntries(Object.keys(kinds).map((kind) => [kind, []]));
  const pickKind = (tier, wide) => {
    const roll = random();
    if (wide && roll < 0.05) return "bus";
    if (roll < 0.14) return "taxi";
    if (roll < 0.36) return "hatch";
    if (roll < 0.52) return "suv";
    if (roll < 0.62) return "van";
    if (roll < 0.62 + 0.14 * tier) return "sports";
    return "sedan";
  };
  const paintOf = (kind) => (kind === "taxi" ? taxiPaint : kind === "bus" ? busPaint : random.pick(paints));
  const addCars = (stretch, density, tier, wide) => {
    const count = Math.round(stretch.length * density * settings.traffic + random());
    for (let index = 0; index < count; index += 1) {
      const kind = pickKind(tier, wide);
      const car = {
        ...stretch,
        speed: kind === "bus" ? random.range(7, 9) : random.range(8, 14),
        offset: random.range(0, stretch.length),
        paint: paintOf(kind),
        neon: kind !== "bus" && random.chance(0.12 + 0.45 * tier) ? bright(random.pick(palette.neon), 1.6) : none,
      };
      moving[kind].push(car);
      air?.exhaust({ ...car, back: kinds[kind].length / 2 - 0.1 });
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
      for (const x of [1.75, 5.25]) addCars(lane(x, from, 0, -1, length), lerp(0.006, 0.014, tier), tier, x > 3);
      for (const x of [-1.75, -5.25]) addCars(lane(x, to, 0, 1, length), lerp(0.006, 0.014, tier), tier, x < -3);
    }
    from = cut.z - cut.half;
  }
  // Side streets: two lanes each way on the avenues, one each way elsewhere, and parked cars along the kerbs.
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const start = STREETS.main.half + 2;
    const end = street.end === "stub" ? street.reach - 1 : street.reach - roundaboutOf(street).outer - 1;
    const length = end - start;
    if (length < 15) continue;
    const tier = grandnessAt(z);
    const offsets = road.half >= 7 ? [1.75, 5.25] : [2.5];
    for (const offset of offsets) {
      // Heading out on the right-hand lane, coming back on the other.
      addCars(lane(street.side * start, z + street.side * offset, street.side, 0, length), 0.008, tier, false);
      addCars(lane(street.side * end, z - street.side * offset, -street.side, 0, length), 0.008, tier, false);
    }
    if (road.half < 7) {
      for (const edge of [-1, 1]) {
        for (let along = facadeOf("main") + 4; along < end - 3; along += 6.5) {
          if (!random.chance(0.5)) continue;
          const kind = random.pick(["sedan", "hatch", "suv", "van", "sedan", "taxi"]);
          parked[kind].push({ x: street.side * along, z: z + edge * (road.half - 1.2), yaw: street.side > 0 ? Math.PI / 2 : -Math.PI / 2, paint: paintOf(kind), neon: none, lit: 0 });
        }
      }
    }
  }

  const fleets = [];
  for (const [kind, model] of Object.entries(kinds)) {
    const width = kind === "bus" ? 3.2 : 2.6;
    const material = vehicleMaterial({ cabin: model.cabin, belt: model.belt, bays: kind === "bus" ? 1.45 : 0 });
    const list = moving[kind];
    const fleet = createFleet(list, { geometry: model.geometry.clone(), material, beams: carLightGeometry(model.length), shadow: shadowGeometry(width, model.length + 1) });
    if (fleet) fleets.push({ fleet, list });
    const still = parked[kind];
    const lot = createFleet(still, { geometry: model.geometry, material, shadow: shadowGeometry(width, model.length + 1) });
    if (lot) {
      still.forEach((car, index) => writeMatrix(lot.instanceMatrix.array, index, car.x, 0, car.z, car.yaw, 1));
      lot.instanceMatrix.needsUpdate = true;
    } else if (!fleet) {
      material.dispose();
    }
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
  const flyerFleet = createFleet(flyers, { geometry: flyerGeometry(), material: vehicleMaterial({ cabin: [0.45, -0.5], belt: 0.22, bays: 0 }), beams: flyerLightGeometry() });

  // --- Trains on bridges over the main street ---
  const trainCars = [];
  RAILS.forEach((rail, index) => {
    // The viaduct: a deck on a box girder, a parapet each side, piers with a wider head, and a strip of light under the deck.
    kit.add(PART.box, { y: 12.6, z: rail.z, w: 600, h: 0.9, d: 2.2, style: STYLE.plain, pattern: MASONRY.concrete, color: palette.concrete });
    kit.add(PART.box, { y: 13.5, z: rail.z, w: 600, h: 0.28, d: 4.4, style: STYLE.plain, pattern: MASONRY.concrete, color: palette.concrete });
    for (const edge of [-1, 1]) kit.add(PART.box, { y: 13.78, z: rail.z + edge * 2.1, w: 600, h: 0.75, d: 0.14, style: STYLE.metal, pattern: METAL.zinc, color: palette.steel });
    for (const edge of [-0.72, 0.72]) kit.add(PART.box, { y: 13.78, z: rail.z + edge, w: 600, h: 0.14, d: 0.09, style: STYLE.metal, pattern: METAL.chrome, color: palette.steel });
    kit.add(PART.box, { y: 12.52, z: rail.z, w: 600, h: 0.07, d: 0.3, style: STYLE.neon, lit: 1, color: palette.accent });
    for (const x of [-250, -190, -130, -95, -10.4, 10.4, 95, 130, 190, 250]) {
      kit.add(PART.cylinder, { x, z: rail.z, w: 1.5, h: 11.4, d: 1.5, style: STYLE.plain, pattern: MASONRY.concrete, color: palette.concrete });
      kit.add(PART.box, { x, y: 11.4, z: rail.z, w: 1.8, h: 1.2, d: 3.6, style: STYLE.plain, pattern: MASONRY.concrete, color: palette.concrete });
    }
    const heading = index % 2 === 0 ? 1 : -1;
    const neon = bright(random.pick(palette.neon), 1.8);
    for (let car = 0; car < 5; car += 1) trainCars.push({ z: rail.z, heading, lag: car * 10.7, speed: 26, offset: index * 170, paint: new Color("#c7ccd6"), neon });
  });
  const trainFleet = createFleet(trainCars, { geometry: trainGeometry(), material: vehicleMaterial({ cabin: [5, -5], belt: 1.5, bays: 1.3, sign: bright(palette.warm, 1.25) }) });

  // --- Robot citizens ---
  const shells = ["#d9dee8", "#9aa3b5", "#2a3142", "#c9b28a", "#5a6478", "#e8e4da", "#3d4a66", "#8d5f3c"].map((hex) => new Color(hex));
  const accents = ["#1c2230", "#b0452a", "#1f6f6a", "#c99a1e", "#5a4a9a", "#2a3142", "#a8323a"].map((hex) => new Color(hex));
  const crowd = { walker: [], heavy: [], drone: [], courier: [] };
  const robot = (extra) => {
    const roll = random();
    const kind = roll < 0.58 ? "walker" : roll < 0.74 ? "heavy" : roll < 0.87 ? "drone" : "courier";
    const item = { shell: random.pick(shells), accent: random.pick(accents), glow: bright(random.pick(palette.neon), random.range(1.2, 1.9)), size: random.range(0.92, 1.08), phase: random.range(0, 6), ...extra };
    if (kind === "courier") item.speed = (item.speed ?? 0) * 0.7;
    crowd[kind].push(item);
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
        // The middle of the sidewalk: clear of the lamps and bins at the kerb and the tables against the buildings.
        const x = side * random.range(STREETS.main.half + 2.4, STREETS.main.half + STREETS.main.walk - 1.5);
        const heading = random.chance(0.5) ? 1 : -1;
        sidewalk(lane(x, heading < 0 ? walkFrom : to, 0, heading, length), tier);
        const x2 = side * random.range(STREETS.main.half + 2.4, STREETS.main.half + STREETS.main.walk - 1.5);
        sidewalk(lane(x2, -heading < 0 ? walkFrom : to, 0, -heading, length), tier);
      }
    }
    walkFrom = cut.z - cut.half - 4;
  }
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const start = facadeOf("main") + 1;
    const end = street.end === "stub" ? street.reach - 2 : street.reach - roundaboutOf(street).outer + 1;
    const length = end - start;
    for (const edge of [-1, 1]) {
      const offset = z + edge * (road.half + 1.5 + random() * (road.walk - 2.2));
      const outward = random.chance(0.5);
      sidewalk(lane(street.side * (outward ? start : end), offset, outward ? street.side : -street.side, 0, length), grandnessAt(z) * 0.8);
    }
  }

  // Small groups standing before each stop's building, looking at it or chatting.
  stops.forEach((stop, index) => {
    const site = sites[index];
    const cos = Math.cos(site.turn);
    const sin = Math.sin(site.turn);
    const toWorld = (lx, lz) => ({ x: site.x + lx * cos + lz * sin, z: site.z - lx * sin + lz * cos });
    const front = site.footprint.depth / 2 + site.footprint.apron;
    const place = placeById(stop.place);
    // On a square they keep to the paved ring before the building; on the main street, to its forecourt.
    const ring = place.at === "main" ? null : roundaboutOf(sideStreetById(place.at));
    const depth = ring ? ring.square + 1.5 - ring.outer - 1.8 : 8;
    const count = Math.round((3 + 3 * stop.grandness) * settings.crowd);
    for (let n = 0; n < count; n += 1) {
      const spot = toWorld(random.range(-1, 1) * (site.footprint.width / 2 + 3), front + 0.9 + random() * Math.max(1, depth));
      robot({ ...spot, yaw: Math.atan2(site.x - spot.x, site.z - spot.z) + random.range(-0.5, 0.5) });
    }
    if (stop.kind === "graduation") {
      for (let n = 0; n < Math.round(10 * settings.crowd); n += 1) {
        const spot = toWorld(random.range(-10, 10), front + random.range(0.8, 3.4));
        robot({ ...spot, yaw: Math.atan2(site.x - spot.x, site.z - spot.z) + random.range(-0.3, 0.3) });
      }
    }
  });

  const robotMaterial = new ShaderMaterial({ defines, uniforms: { ...shared }, vertexShader: ROBOT_VERTEX, fragmentShader: ROBOT_FRAGMENT });
  const crowds = [];
  const shapes = { walker: () => walkerGeometry(0, low), heavy: () => walkerGeometry(1, low), drone: droneGeometry, courier: courierGeometry };
  for (const [kind, list] of Object.entries(crowd)) {
    if (list.length === 0) continue;
    // Walking ones first, so they can be moved without touching the others.
    list.sort((a, b) => (b.walking ? 1 : 0) - (a.walking ? 1 : 0));
    const geometry = shapes[kind]();
    const shell = new Float32Array(list.length * 3);
    const glow = new Float32Array(list.length * 3);
    const accent = new Float32Array(list.length * 3);
    const walk = new Float32Array(list.length * 3);
    const legged = kind === "walker" || kind === "heavy";
    list.forEach((one, index) => {
      shell.set([one.shell.r, one.shell.g, one.shell.b], index * 3);
      glow.set([one.glow.r, one.glow.g, one.glow.b], index * 3);
      accent.set([one.accent.r, one.accent.g, one.accent.b], index * 3);
      walk.set([one.phase, legged && one.walking ? one.pace : 0, kind === "drone" ? 1 : 0], index * 3);
    });
    geometry.setAttribute("aShell", new InstancedBufferAttribute(shell, 3));
    geometry.setAttribute("aGlow", new InstancedBufferAttribute(glow, 3));
    geometry.setAttribute("aAccent", new InstancedBufferAttribute(accent, 3));
    geometry.setAttribute("aWalk", new InstancedBufferAttribute(walk, 3));
    const mesh = new InstancedMesh(geometry, robotMaterial, list.length);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const under = new InstancedMesh(blobGeometry(kind === "courier" ? 1.5 : 1.25), blobShadow, list.length);
    under.instanceMatrix = mesh.instanceMatrix;
    under.frustumCulled = false;
    under.renderOrder = 0.5;
    scene.add(under);
    const walkers = list.filter((one) => one.walking).length;
    list.forEach((one, index) => {
      if (!one.walking) writeMatrix(mesh.instanceMatrix.array, index, one.x, KERB, one.z, one.yaw, one.size);
    });
    crowds.push({ mesh, list, walkers });
  }

  const fade = (travelled, length, margin) => Math.max(0, Math.min(1, travelled / margin, (length - travelled) / margin));

  return {
    update(time) {
      for (const { fleet, list } of fleets) {
        const matrices = fleet.instanceMatrix.array;
        for (let index = 0; index < list.length; index += 1) {
          const car = list[index];
          const travelled = (car.offset + car.speed * time) % car.length;
          writeMatrix(matrices, index, car.x + car.dx * travelled, 0, car.z + car.dz * travelled, car.yaw, fade(travelled, car.length, CAR_FADE));
        }
        fleet.instanceMatrix.needsUpdate = true;
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
          writeMatrix(matrices, index, car.heading * (travelled - span / 2), 13.75, car.z, car.heading > 0 ? Math.PI / 2 : -Math.PI / 2, 1);
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
