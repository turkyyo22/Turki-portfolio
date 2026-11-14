import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { STYLE } from "./buildings";
import { STREET } from "./layout";
import { bright } from "./palette";
import { lerp } from "./random";
import { FOG, OUTPUT } from "./shaders";

// How far from the end of its stretch a car, flyer or walker shrinks away, so it
// seems to turn the corner instead of vanishing.
const CAR_FADE = 5;
const FLYER_FADE = 12;
const WALKER_FADE = 2.5;

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
function tag(geometry, name, ...values) {
  const count = geometry.attributes.position.count;
  const data = new Float32Array(count * values.length);
  for (let index = 0; index < count; index += 1) data.set(values, index * values.length);
  geometry.setAttribute(name, new BufferAttribute(data, values.length));
  return geometry;
}

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

/** A person about 1.75 m tall, facing +z. Legs and arms are tagged so the shader can swing them. */
function personGeometry() {
  // aBody: part (0 legs, 1 torso and arms, 2 head, 3 glowing stripe), swing direction, height of the joint
  const piece = (geometry, part, swing, joint) => tag(geometry, "aBody", part, swing, joint);
  return mergeGeometries([
    piece(new BoxGeometry(0.15, 0.84, 0.18).translate(-0.11, 0.42, 0), 0, 1, 0.84),
    piece(new BoxGeometry(0.15, 0.84, 0.18).translate(0.11, 0.42, 0), 0, -1, 0.84),
    piece(new BoxGeometry(0.46, 0.62, 0.27).translate(0, 1.15, 0), 1, 0, 0),
    piece(new BoxGeometry(0.11, 0.58, 0.13).translate(-0.3, 1.13, 0), 1, -1, 1.42),
    piece(new BoxGeometry(0.11, 0.58, 0.13).translate(0.3, 1.13, 0), 1, 1, 1.42),
    piece(new SphereGeometry(0.15, 10, 8).translate(0, 1.63, 0), 2, 0, 0),
    piece(new BoxGeometry(0.48, 0.07, 0.29).translate(0, 1.3, 0), 3, 0, 0),
  ]);
}

/**
 * Everything that moves through the city: cars on the road, flying vehicles over
 * the newer districts, trains on two bridges, and people on the sidewalks and
 * squares. Positions are a function of time alone, so nothing needs to be stored
 * per frame. Call before the shared `blocks` are built (it adds the bridges).
 */
export function createLife({ scene, shared, palette, random, layout, settings, blocks, decals }) {
  const paints = ["#1b2a4a", "#4a1626", "#0f3d3e", "#23272f", "#aab3c2", "#b58a00", "#33204f"].map((hex) => new Color(hex));

  const vehicleMaterial = new ShaderMaterial({
    uniforms: {
      ...shared,
      uGlass: { value: palette.glass },
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

  const none = new Color(0, 0, 0);

  // --- Cars: four lanes, driving on the right, between the junctions ---
  const junctions = [...layout.crossings.map((z) => ({ z, half: STREET.roadHalf + 1 })), { z: layout.plaza.z, half: layout.plaza.radius + 3 }].sort((a, b) => b.z - a.z);
  const stretches = [];
  let from = layout.startZ + 60;
  for (const junction of junctions) {
    stretches.push({ from, to: junction.z + junction.half });
    from = junction.z - junction.half;
  }
  stretches.push({ from, to: layout.finishZ + 20 });

  const cars = [];
  for (const stretch of stretches) {
    const length = stretch.from - stretch.to;
    if (length < 20) continue;
    const tier = layout.tierAt((stretch.from + stretch.to) / 2);
    for (const x of [-5.25, -1.75, 1.75, 5.25]) {
      const count = Math.round(length * lerp(0.006, 0.014, tier) * settings.traffic + random());
      for (let index = 0; index < count; index += 1) {
        cars.push({
          x,
          // On the right-hand lanes cars travel with the tour (toward -z); on the left they come toward it.
          heading: x > 0 ? -1 : 1,
          from: stretch.from,
          to: stretch.to,
          length,
          speed: random.range(8, 14),
          offset: random.range(0, length),
          paint: random.pick(paints),
          neon: random.chance(0.15 + 0.5 * tier) ? bright(random.pick(palette.neon), 1.6) : none,
        });
      }
    }
  }
  const carFleet = createFleet(carGeometry(), carLightGeometry(), cars);

  // --- Flying vehicles: over the street in the newer districts, across it at junctions, and around the last tower ---
  const flyers = [];
  const skyFrom = -(layout.tierFrom + 0.3 * (layout.tierTo - layout.tierFrom));
  const skyTo = layout.plaza.z + layout.plaza.radius + 10;
  if (skyFrom - skyTo > 80) {
    const count = Math.round(((skyFrom - skyTo) / 22) * settings.traffic);
    for (let index = 0; index < count; index += 1) {
      const x = random.pick([-10, -6, 6, 10]);
      flyers.push({
        kind: "along",
        x,
        y: random.range(15, 40),
        heading: x > 0 ? -1 : 1,
        from: skyFrom,
        to: skyTo,
        length: skyFrom - skyTo,
        speed: random.range(18, 30),
        offset: random.range(0, skyFrom - skyTo),
        phase: random.range(0, 6),
        paint: random.pick(paints),
        neon: bright(random.pick(palette.neon), 2.2),
      });
    }
  }
  for (const crossing of layout.crossings) {
    if (layout.tierAt(crossing) < 0.25) continue;
    const count = Math.round(3 * settings.traffic);
    for (let index = 0; index < count; index += 1) {
      const heading = index % 2 === 0 ? 1 : -1;
      flyers.push({
        kind: "across",
        z: crossing + heading * 3,
        y: random.range(13, 30),
        heading,
        length: 360,
        speed: random.range(16, 26),
        offset: random.range(0, 360),
        phase: random.range(0, 6),
        paint: random.pick(paints),
        neon: bright(random.pick(palette.neon), 2.2),
      });
    }
  }
  const tower = layout.stations.find((station) => station.kind === "coop");
  if (tower) {
    for (let index = 0; index < 3; index += 1) {
      flyers.push({
        kind: "orbit",
        x: tower.x,
        z: tower.z,
        y: tower.height - 22 + index * 7,
        radius: 24 + index * 4,
        speed: (index % 2 === 0 ? 1 : -1) * random.range(0.25, 0.4),
        offset: random.range(0, 6),
        phase: random.range(0, 6),
        paint: random.pick(paints),
        neon: bright(tower.color, 2.2),
      });
    }
  }
  const flyerFleet = createFleet(flyerGeometry(), flyerLightGeometry(), flyers);

  // --- Trains: a bridge over the street at up to two junctions, each with a train ---
  const bridges = layout.crossings.filter((z) => layout.tierAt(z) >= 0.3);
  const railZ = (bridges.length > 2 ? [bridges[0], bridges[bridges.length - 1]] : bridges).map((z) => z + STREET.roadHalf + 2.5);
  const trainCars = [];
  railZ.forEach((z, index) => {
    blocks.add({ x: 0, y: 13.4, z, w: 560, h: 1.1, d: 2.4, style: STYLE.plain, tint: palette.steel, lit: 1 });
    blocks.add({ x: 0, y: 13.2, z, w: 560, h: 0.14, d: 0.3, style: STYLE.neon, tint: palette.accent, lit: 1.2 });
    for (const x of [-250, -210, -170, -130, -90, -50, -9.6, 9.6, 50, 90, 130, 170, 210, 250]) {
      blocks.add({ x, z, w: 1.3, h: 13.4, d: 1.3, style: STYLE.plain, tint: palette.steel, lit: 1 });
    }
    decals.add({ x: 0, z, width: 16, color: palette.accent, strength: 0.1 });
    const heading = index % 2 === 0 ? 1 : -1;
    const neon = bright(random.pick(palette.neon), 1.8);
    for (let car = 0; car < 5; car += 1) {
      trainCars.push({ z, heading, lag: car * 11, speed: 26, offset: index * 170, paint: palette.steel.clone().multiplyScalar(1.6), neon });
    }
  });
  const trainFleet = createFleet(trainGeometry(), null, trainCars);

  // --- People ---
  const people = [];
  const cloths = ["#1c2436", "#2a1e33", "#16292c", "#2c2a26", "#3a2330", "#1f2a44"].map((hex) => new Color(hex));
  const person = (extra) => ({
    cloth: random.pick(cloths),
    glow: bright(random.pick(palette.neon), random.range(0.9, 1.7)),
    size: random.range(0.92, 1.08),
    phase: random.range(0, 6),
    ...extra,
  });

  // Walkers on both sidewalks, between the cross streets.
  const blocksOfStreet = [];
  let walkFrom = layout.startZ - 6;
  for (const crossing of [...layout.crossings].sort((a, b) => b - a)) {
    blocksOfStreet.push({ from: walkFrom, to: crossing + STREET.roadHalf + 0.5 });
    walkFrom = crossing - STREET.roadHalf - 0.5;
  }
  blocksOfStreet.push({ from: walkFrom, to: layout.finishZ + 30 });
  for (const stretch of blocksOfStreet) {
    const length = stretch.from - stretch.to;
    if (length < 12) continue;
    const tier = layout.tierAt((stretch.from + stretch.to) / 2);
    for (const side of [-1, 1]) {
      const count = Math.round(length * lerp(0.03, 0.085, tier) * settings.crowd + random());
      for (let index = 0; index < count; index += 1) {
        const speed = random.range(1.1, 1.7);
        people.push(
          person({
            walking: true,
            x: side * random.range(STREET.roadHalf + 1.3, STREET.roadHalf + STREET.walk - 0.5),
            heading: random.chance(0.5) ? 1 : -1,
            from: stretch.from,
            to: stretch.to,
            length,
            speed,
            pace: speed / 1.4,
            offset: random.range(0, length),
          })
        );
      }
    }
  }
  const walkerCount = people.length;

  // Small groups standing on each stop's square, looking at the building or chatting.
  for (const station of layout.stations) {
    const count = Math.round((3 + 3 * station.tier) * settings.crowd);
    for (let index = 0; index < count; index += 1) {
      const angle = ((random.chance(0.5) ? 1 : -1) * random.range(45, 140) * Math.PI) / 180;
      const radius = random.range(6.4, 8.4);
      const spot = station.toWorld(Math.sin(angle) * radius, station.plazaOffset + Math.cos(angle) * radius);
      people.push(person({ ...spot, yaw: Math.atan2(station.x - spot.x, station.z - spot.z) + random.range(-0.5, 0.5) }));
      if (random.chance(0.45)) {
        // A friend facing them.
        const friend = { x: spot.x + random.range(-0.5, 0.5), z: spot.z + 0.9 };
        people.push(person({ ...friend, yaw: Math.atan2(spot.x - friend.x, spot.z - friend.z) }));
      }
    }
    if (station.kind === "graduation") {
      // A crowd in front of the steps on graduation day.
      for (let index = 0; index < Math.round(9 * settings.crowd); index += 1) {
        const spot = station.toWorld(random.range(-10, 10), station.depth / 2 + station.apron + random.range(0.8, 3.4));
        people.push(person({ ...spot, yaw: Math.atan2(station.x - spot.x, station.z - spot.z) + random.range(-0.3, 0.3) }));
      }
    }
  }

  const peopleGeometry = personGeometry();
  const cloth = new Float32Array(people.length * 3);
  const glow = new Float32Array(people.length * 3);
  const walk = new Float32Array(people.length * 2);
  people.forEach((one, index) => {
    cloth.set([one.cloth.r, one.cloth.g, one.cloth.b], index * 3);
    glow.set([one.glow.r, one.glow.g, one.glow.b], index * 3);
    walk.set([one.phase, one.walking ? one.pace : 0], index * 2);
  });
  peopleGeometry.setAttribute("aCloth", new InstancedBufferAttribute(cloth, 3));
  peopleGeometry.setAttribute("aGlow", new InstancedBufferAttribute(glow, 3));
  peopleGeometry.setAttribute("aWalk", new InstancedBufferAttribute(walk, 2));
  const crowd = new InstancedMesh(
    peopleGeometry,
    new ShaderMaterial({
      uniforms: { ...shared, uSkin: { value: new Color("#8a6a58") }, uSky: { value: palette.glowViolet } },
      vertexShader: /* glsl */ `
        attribute vec3 aBody;    // part, swing direction, height of the joint
        attribute vec3 aCloth;
        attribute vec3 aGlow;
        attribute vec2 aWalk;    // phase, pace (0 when standing)
        uniform float uTime;
        uniform vec3 uSkin;
        uniform vec3 uSky;
        varying vec3 vColor;
        varying float vDepth;
        varying float vHeight;
        void main() {
          vec3 p = position;
          float moving = step(0.01, aWalk.y);
          float stride = uTime * 7.0 * aWalk.y + aWalk.x;
          // Legs and arms swing from their joints; the body bobs with each step.
          p.z += aBody.y * sin(stride) * max(0.0, aBody.z - p.y) * 0.55 * moving;
          p.y += abs(cos(stride)) * 0.04 * moving;
          // Someone standing sways a little.
          p.x += sin(uTime * 0.8 + aWalk.x) * 0.03 * (1.0 - moving) * p.y;

          vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vec3 n = normalize(mat3(instanceMatrix) * normal);
          float light = 0.45 + 0.4 * max(n.y, 0.0) + 0.15 * abs(n.x);
          vec3 color = aBody.x < 0.5 ? aCloth * 0.6 : (aBody.x < 1.5 ? aCloth : uSkin);
          vColor = aBody.x > 2.5 ? aGlow : color * light + uSky * 0.05;
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
    }),
    people.length
  );
  crowd.instanceMatrix.setUsage(DynamicDrawUsage);
  crowd.frustumCulled = false;
  scene.add(crowd);
  const crowdMatrices = crowd.instanceMatrix.array;
  // The people who stand still are placed once.
  for (let index = walkerCount; index < people.length; index += 1) {
    const one = people[index];
    writeMatrix(crowdMatrices, index, one.x, 0, one.z, one.yaw, one.size);
  }

  const fade = (travelled, length, margin) => Math.max(0, Math.min(1, travelled / margin, (length - travelled) / margin));

  return {
    update(time) {
      if (carFleet) {
        const matrices = carFleet.instanceMatrix.array;
        for (let index = 0; index < cars.length; index += 1) {
          const car = cars[index];
          const travelled = (car.offset + car.speed * time) % car.length;
          const z = car.heading < 0 ? car.from - travelled : car.to + travelled;
          writeMatrix(matrices, index, car.x, 0, z, car.heading < 0 ? Math.PI : 0, fade(travelled, car.length, CAR_FADE));
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
          const scale = fade(travelled, flyer.length, FLYER_FADE);
          if (flyer.kind === "along") {
            const z = flyer.heading < 0 ? flyer.from - travelled : flyer.to + travelled;
            writeMatrix(matrices, index, flyer.x, flyer.y + bob, z, flyer.heading < 0 ? Math.PI : 0, scale);
          } else {
            const x = flyer.heading * (travelled - flyer.length / 2);
            writeMatrix(matrices, index, x, flyer.y + bob, flyer.z, flyer.heading > 0 ? Math.PI / 2 : -Math.PI / 2, scale);
          }
        }
        flyerFleet.instanceMatrix.needsUpdate = true;
      }

      if (trainFleet) {
        const matrices = trainFleet.instanceMatrix.array;
        const span = 620;
        for (let index = 0; index < trainCars.length; index += 1) {
          const car = trainCars[index];
          const travelled = (car.offset + car.speed * time - car.lag + span * 4) % span;
          const x = car.heading * (travelled - span / 2);
          writeMatrix(matrices, index, x, 14.5, car.z, car.heading > 0 ? Math.PI / 2 : -Math.PI / 2, 1);
        }
        trainFleet.instanceMatrix.needsUpdate = true;
      }

      for (let index = 0; index < walkerCount; index += 1) {
        const one = people[index];
        const travelled = (one.offset + one.speed * time) % one.length;
        const z = one.heading < 0 ? one.from - travelled : one.to + travelled;
        writeMatrix(crowdMatrices, index, one.x, 0, z, one.heading < 0 ? Math.PI : 0, one.size * fade(travelled, one.length, WALKER_FADE));
      }
      crowd.instanceMatrix.needsUpdate = true;
    },
  };
}
