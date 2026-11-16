import { Color, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

import { ALLEYS, END_PLAZA, GATE_Z, JUNCTIONS, MAIN_STREET, RAILS, SIDE_STREETS, STREETS, districtAt, facadeOf, grandnessAt, junctionById, roundaboutOf } from "@/lib/explore/city";

import { bench, bin, busShelter, cabinet, cafeSet, crates, drain, dumpster, fountain, hydrant, manhole, newsRack, planterBox, standing, trafficLight, vending } from "./furniture";
import { MASONRY, PART, PAVING, PLANTING, STYLE, ringShape } from "./kit";
import { bright } from "./palette";
import { canvasTexture, drawHoloText } from "./signs";

// The streets, built from the map in city.js: raised sidewalks with kerbs along
// every road, a roundabout with a fountain at the end of each side street, road
// paint, street lamps, traffic lights, the furniture of the sidewalks, the
// covers and steam of the road, and the gate over the start of the main street.
// The roads themselves are the asphalt ground (ground.js).

const KERB = 0.15;
const PAINT_Y = 0.02;
const MAIN = STREETS.main;
const HALF_PI = Math.PI / 2;
// How far a traffic light's arm reaches over the road: to the outer lane only.
// The tour's camera flies down the middle of the street at about the height of
// the signal heads, and must never brush past the back of one.
const SIGNAL_ARM = 2.6;
// Along each side of the main street, every SLOT metres: a lamp, something at
// the kerb, a tree, something at the kerb, and round again.
const SLOT = 6.5;
const RHYTHM = ["lamp", "kerb", "tree", "kerb"];

/** Where the main street's side roads cross its sidewalks, on one side. */
function crossingsOn(side) {
  return SIDE_STREETS.filter((street) => street.side === side).map((street) => ({ z: junctionById(street.junction).z, half: STREETS[street.street].half }));
}

/** Stretches of the main street between `from` and `to` (from > to) that avoid the given cuts ({ z, half }). */
function between(from, to, cuts) {
  const stretches = [];
  let cursor = from;
  for (const cut of [...cuts].sort((a, b) => b.z - a.z)) {
    if (cut.z + cut.half < cursor) stretches.push([cursor, cut.z + cut.half]);
    cursor = Math.min(cursor, cut.z - cut.half);
  }
  if (cursor > to) stretches.push([cursor, to]);
  return stretches.filter(([a, b]) => a - b > 0.5);
}

/**
 * What stands along the kerb of the main street, in order down each side:
 * [{ side, z, kind: "lamp" | "kerb" | "tree" }]. The two sides are out of step,
 * so a lamp on one faces a tree on the other. Junctions, the railway bridges
 * and the end plaza are left clear.
 */
export function kerbSlots() {
  const slots = [];
  const clear = (z) =>
    JUNCTIONS.every((junction) => Math.abs(z - junction.z) > 15) && RAILS.every((rail) => Math.abs(z - rail.z) > 5) && z > END_PLAZA.z + END_PLAZA.radius + 5 && Math.abs(z - GATE_Z) > 3;
  for (const side of [-1, 1]) {
    let index = side > 0 ? 0 : 2;
    for (let z = MAIN_STREET.fromZ - 10; z > END_PLAZA.z + END_PLAZA.radius; z -= SLOT) {
      if (clear(z)) slots.push({ side, z, kind: RHYTHM[index % RHYTHM.length] });
      index += 1;
    }
  }
  return slots;
}

/**
 * True when something tall at the kerb on `side` of the main street at `z`
 * would stand between the tour's camera and one of the stops' buildings
 * (`sites`, see siteOf in city.js): beside the building, or on the stretch
 * before it from which the camera looks across at it.
 */
export function blocksView(sites, side, z) {
  return sites.some((site) => Math.sign(site.x) === side && Math.abs(site.x) < 45 && z > site.z - site.footprint.width / 2 - 2 && z < site.z + 26);
}

/**
 * `sites` are the stops' buildings (see siteOf in city.js), kept clear of
 * furniture; `squareColors` maps a side street's id to the colour of the stop
 * at its end, which its fountain is lit in.
 */
export function buildStreets({ scene, kit, palette, random, lamps, glows, lights, air, text, sites = [], squareColors = {}, detail = true }) {
  const pavement = palette.pavement;
  const white = bright(palette.white, 0.75);
  const yellow = palette.amber.clone().multiplyScalar(0.8);
  const endZ = END_PLAZA.z + END_PLAZA.radius - 1;
  const walk = MAIN.walk + 0.6;
  const props = { palette, random, lights, glows, air };
  const nearStop = (x, z, margin = 6) => sites.some((site) => Math.hypot(site.x - x, site.z - z) < Math.max(site.footprint.width, site.footprint.depth) * 0.75 + margin);

  // --- Sidewalks along the main street, broken where side roads cross them ---
  for (const side of [-1, 1]) {
    for (const [from, to] of between(MAIN_STREET.fromZ, endZ, crossingsOn(side))) {
      kit.add(PART.box, { x: side * (MAIN.half + walk / 2), z: (from + to) / 2, w: walk, h: KERB, d: from - to, style: STYLE.pavement, color: pavement });
    }
  }

  const paint = (x, z, w, d, color, turn = 0) => kit.add(PART.flat, { x, y: PAINT_Y, z, w, h: 1, d, turn, style: STYLE.paint, color });
  const lampAt = (x, z, turn, color) => {
    // The lamp's head hangs at the end of its arm, 1.77 m out.
    const head = { x: x + Math.cos(turn) * 1.77, z: z - Math.sin(turn) * 1.77 };
    lamps.add({ x, y: KERB, z, turn, color: bright(color, 2.4) });
    glows.add({ ...head, y: 6.72, color, size: 3.4, strength: 0.6 });
    lights.add({ x: head.x, z: head.z, radius: 11, color, strength: 0.85 });
  };
  const lampColor = (z) => {
    const grandness = grandnessAt(z);
    return palette.warm.clone().lerp(palette.cool.clone().lerp(palette.accent, 0.3), districtAt(z) === "old" ? grandness * 0.4 : 0.55 + grandness * 0.45);
  };

  // --- Side streets: sidewalks on both edges, and a roundabout at the end ---
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const start = facadeOf("main");
    const ring = street.end === "stub" ? null : roundaboutOf(street);
    // The sidewalks run on until their inner corners meet the roundabout's paved ring.
    const end = ring ? street.reach - Math.sqrt(ring.outer ** 2 - road.half ** 2) : street.reach;
    const width = road.walk + 0.6;
    for (const edge of [-1, 1]) {
      kit.add(PART.box, { x: (street.side * (start + end)) / 2, z: z + edge * (road.half + width / 2), w: end - start, h: KERB, d: width, style: STYLE.pavement, color: pavement });
    }
    if (!ring) continue;

    const centre = { x: street.side * street.reach, z };
    const grand = street.end === "square";
    const color = squareColors[street.id] ?? palette.accent;
    // The way back to the main street, as an angle from +z toward +x, and half the width of the street's mouth.
    const mouth = -street.side * HALF_PI;
    const gap = Math.asin(road.half / ring.outer);
    const around = (radius, angle) => ({ x: centre.x + Math.sin(angle) * radius, z: centre.z + Math.cos(angle) * radius });

    // The paved ring round the road, a finger higher than the sidewalks it meets.
    kit.mesh(ringShape({ inner: ring.outer, outer: ring.square + 2, from: mouth + gap, to: mouth + Math.PI * 2 - gap, height: KERB + 0.012, segments: 72 }), {
      ...centre,
      style: STYLE.pavement,
      pattern: PAVING.radial,
      color: pavement,
    });
    // The island: a granite kerb, a lawn, a ring of flowers, and a fountain in the middle.
    kit.mesh(ringShape({ inner: ring.island - 0.45, outer: ring.island, height: 0.26, segments: 56 }), { ...centre, style: STYLE.plain, pattern: MASONRY.granite, color: palette.kerb });
    kit.add(PART.cylinder, { ...centre, w: (ring.island - 0.45) * 2, h: 0.2, d: (ring.island - 0.45) * 2, style: STYLE.foliage, pattern: PLANTING.lawn, seed: random() * 90, color: new Color("#2f6a34") });
    const basin = grand ? 4.6 : 2.7;
    kit.mesh(ringShape({ inner: basin + 0.5, outer: basin + (grand ? 1.7 : 1.2), height: 0.3, segments: 48 }), { ...centre, style: STYLE.foliage, pattern: PLANTING.flowers, seed: random() * 90, color: new Color("#2a5f31") });
    fountain(standing(kit, { ...centre, y: 0.2 }), { ...props, radius: basin, color, grand });
    // Low lamps among the flowers, washing the fountain with light.
    const posts = grand ? 8 : 5;
    for (let i = 0; i < posts; i += 1) {
      const spot = around(ring.island - 1.1, mouth + ((i + 0.5) / posts) * Math.PI * 2);
      kit.add(PART.cylinder, { ...spot, y: 0.2, w: 0.12, h: 0.55, d: 0.12, style: STYLE.metal, color: palette.darkSteel });
      kit.add(PART.ball, { ...spot, y: 0.72, w: 0.26, h: 0.24, d: 0.26, style: STYLE.neon, lit: 1.3, color: palette.warm });
      glows.add({ ...spot, y: 0.86, color: palette.warm, size: 1.5, strength: 0.5 });
      lights.add({ ...spot, radius: 4, color: palette.warm, strength: 0.45 });
    }

    // Paint on the road: a line along each edge, and dashes between the two lanes.
    const circle = (radius, dash, space, skipMouth) => {
      const count = Math.floor((Math.PI * 2 * radius) / (dash + space));
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        // Across the mouth of the street the outer line is left open.
        const fromMouth = Math.abs(Math.atan2(Math.sin(angle - mouth), Math.cos(angle - mouth)));
        if (skipMouth && fromMouth < gap + 0.05) continue;
        const spot = around(radius, angle);
        paint(spot.x, spot.z, 0.12, dash, white, angle + HALF_PI);
      }
    };
    circle(ring.island + 0.4, 1.0, 0.02, false);
    circle(ring.outer - 0.4, 1.0, 0.02, true);
    circle(street.loop, 1.5, 2.2, false);
    // A crossing where the street meets the roundabout.
    for (let across = -road.half + 0.8; across < road.half - 0.5; across += 1.3) paint(street.side * (street.reach - ring.outer - 3.2), z + across, 3, 0.6, white);

    // Round the paved ring: lamps reaching in over the road, benches facing the fountain, bins, planters.
    const lampCount = grand ? 6 : 4;
    for (let i = 0; i < lampCount; i += 1) {
      const angle = mouth + Math.PI * 2 * ((i + 0.5) / lampCount);
      const fromMouth = Math.abs(Math.atan2(Math.sin(angle - mouth), Math.cos(angle - mouth)));
      // The far side is the stop's own forecourt: no lamp in front of its building.
      if (fromMouth > Math.PI - 0.62) continue;
      const spot = around(ring.outer + 0.9, angle);
      // Turned so its arm (the lamp's own +x) points at the centre.
      lampAt(spot.x, spot.z, Math.atan2(spot.z - centre.z, centre.x - spot.x), lampColor(z));
    }
    if (detail) {
      const seats = grand ? [0.42, 0.62, 0.8] : [0.5, 0.74];
      for (const share of seats) {
        for (const hand of [-1, 1]) {
          const angle = mouth + hand * share * Math.PI;
          const spot = around(ring.outer + (grand ? 3.4 : 2.1), angle);
          // Facing the fountain.
          const facing = Math.atan2(centre.x - spot.x, centre.z - spot.z);
          bench(standing(kit, { ...spot, y: KERB + 0.012, turn: facing }));
          const beside = around(ring.outer + (grand ? 3.4 : 2.1), angle + hand * 0.11);
          if (random.chance(0.6)) bin(standing(kit, { ...beside, y: KERB + 0.012 }), props);
          else planterBox(standing(kit, { ...beside, y: KERB + 0.012, turn: facing }), props);
        }
      }
    }
  }

  // --- The plaza at the end of the main street ---
  kit.add(PART.cylinder, { x: 0, z: END_PLAZA.z, w: END_PLAZA.radius * 2, h: KERB, d: END_PLAZA.radius * 2, style: STYLE.pavement, pattern: PAVING.radial, color: pavement });

  // --- Road paint ---
  const junctionCuts = JUNCTIONS.map((junction) => {
    const half = Math.max(...SIDE_STREETS.filter((street) => street.junction === junction.id).map((street) => STREETS[street.street].half));
    return { z: junction.z, half: half + 5, side: half };
  });
  const roadEnd = END_PLAZA.z + END_PLAZA.radius;
  for (const [from, to] of between(MAIN_STREET.fromZ, roadEnd, junctionCuts)) {
    const length = from - to;
    const middle = (from + to) / 2;
    for (const x of [-0.16, 0.16]) paint(x, middle, 0.11, length, yellow);
    for (const x of [-MAIN.half + 0.45, MAIN.half - 0.45]) paint(x, middle, 0.12, length, white);
    for (let z = from - 2; z > to + 2; z -= 9) for (const x of [-3.5, 3.5]) paint(x, z - 1.5, 0.12, 3, white);
  }
  // Zebra crossings over the main street on both sides of each junction, and a stop line before each.
  for (const cut of junctionCuts) {
    for (const zSide of [-1, 1]) {
      const z = cut.z + zSide * (cut.half - 2.4);
      for (let x = -MAIN.half + 0.9; x < MAIN.half - 0.5; x += 1.3) paint(x, z, 0.6, 3, white);
      paint(zSide * 3.45, cut.z + zSide * (cut.half + 0.4), 6.5, 0.4, white);
    }
  }
  // Side roads: a dashed centre line, and a zebra crossing at the mouth.
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const start = facadeOf("main") + 3;
    const end = street.end === "stub" ? street.reach - 2 : street.reach - roundaboutOf(street).outer - 6;
    for (let along = start + 5; along < end - 2; along += 7) paint(street.side * (along + 1.25), z, 2.5, 0.12, white);
    for (const edge of [-1, 1]) paint((street.side * (start + end)) / 2, z + edge * (road.half - 0.4), end - start, 0.12, white);
    for (let across = -road.half + 0.8; across < road.half - 0.5; across += 1.3) paint(street.side * (facadeOf("main") + 1.6), z + across, 3, 0.6, white);
  }

  // --- Along the kerbs of the main street: lamps, and between them bins, hydrants, shelters ---
  const slots = kerbSlots();
  let shelterIn = 5;
  for (const slot of slots) {
    const x = slot.side * (MAIN.half + 0.9);
    if (slot.kind === "lamp") {
      // The lamp's arm reaches out over the road. None stands right in front of a stop's building.
      if (!blocksView(sites, slot.side, slot.z)) lampAt(x, slot.z, slot.side > 0 ? Math.PI : 0, lampColor(slot.z));
      continue;
    }
    if (slot.kind !== "kerb" || !detail) continue;
    const facing = slot.side > 0 ? -HALF_PI : HALF_PI;
    const put = standing(kit, { x, z: slot.z, turn: facing });
    shelterIn -= 1;
    if (shelterIn <= 0 && !nearStop(x, slot.z, 10) && !blocksView(sites, slot.side, slot.z)) {
      // A bus shelter, its open side to the road.
      busShelter(standing(kit, { x: slot.side * (MAIN.half + 1.5), z: slot.z, turn: facing }), props);
      shelterIn = 9 + Math.floor(random() * 5);
      continue;
    }
    const roll = random();
    if (roll < 0.3) bin(put, props);
    else if (roll < 0.42) hydrant(put);
    else if (roll < 0.52) cabinet(standing(kit, { x, z: slot.z, turn: -facing }), props);
    else if (roll < 0.62) newsRack(standing(kit, { x, z: slot.z, turn: -facing }), props);
  }

  // --- Against the buildings: benches, vending machines, planters, cafe tables ---
  if (detail) {
    const front = facadeOf("main");
    for (const side of [-1, 1]) {
      // Facing the street.
      const facing = side > 0 ? -HALF_PI : HALF_PI;
      for (let z = MAIN_STREET.fromZ - 14; z > FRONT_END; z -= 5.2) {
        const blocked = JUNCTIONS.some((junction) => Math.abs(z - junction.z) < 18) || ALLEYS.some((alley) => alley.side === side && Math.abs(z - alley.z) < 5) || RAILS.some((rail) => Math.abs(z - rail.z) < 5);
        if (blocked || nearStop(side * front, z, 12)) continue;
        const district = districtAt(z);
        const roll = random();
        const x = side * (front - 0.6);
        if (roll < 0.14) bench(standing(kit, { x, z, turn: facing }));
        else if (roll < (district === "old" ? 0.2 : 0.3)) vending(standing(kit, { x: side * (front - 0.42), z, turn: facing }), props);
        else if (roll < 0.5) planterBox(standing(kit, { x: side * (front - 0.4), z, turn: facing }), props);
        else if (roll < (district === "old" ? 0.72 : 0.58)) cafeSet(standing(kit, { x: side * (front - 0.95), z, turn: random() * Math.PI }), props);
        else if (roll < 0.76 && district !== "old") cabinet(standing(kit, { x: side * (front - 0.28), z, turn: facing }), props);
      }
    }
  }

  // --- Covers and drains in the road, some of them steaming ---
  let nth = 0;
  for (const [from, to] of between(MAIN_STREET.fromZ - 20, roadEnd + 8, junctionCuts)) {
    for (let z = from - 9; z > to + 6; z -= 31) {
      const x = [3.5, -1.75, 5.25, -3.5, 1.75][nth % 5];
      nth += 1;
      manhole(kit, { x, z });
      if (nth % 3 === 0) air.vent({ x, z, height: 4.5, width: 1.0, strength: 1 });
    }
    for (let z = from - 4; z > to + 3; z -= 26) for (const side of [-1, 1]) drain(kit, { x: side * (MAIN.half - 0.24), z: z + side * 4, turn: HALF_PI });
  }
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const end = street.end === "stub" ? street.reach - 6 : street.reach - roundaboutOf(street).outer - 8;
    for (let along = facadeOf("main") + 12; along < end; along += 27) {
      manhole(kit, { x: street.side * along, z: z + (nth % 2 === 0 ? 2.2 : -2.2) });
      nth += 1;
      if (nth % 2 === 0) air.vent({ x: street.side * along, z: z + (nth % 4 === 0 ? -2.2 : 2.2), height: 4, width: 0.9, strength: 0.9 });
    }
  }

  // --- Traffic lights on the corners of each junction ---
  JUNCTIONS.forEach((junction, index) => {
    const cut = junctionCuts[index];
    const x = MAIN.half + 0.75;
    const z = cut.side + 1.0;
    // For the main street's two directions, then for the two side streets.
    trafficLight(standing(kit, { x, z: junction.z + z, turn: 0 }), { palette, arm: -SIGNAL_ARM, phase: 0 });
    trafficLight(standing(kit, { x: -x, z: junction.z - z, turn: Math.PI }), { palette, arm: -SIGNAL_ARM, phase: 0 });
    trafficLight(standing(kit, { x, z: junction.z - z, turn: HALF_PI }), { palette, arm: -SIGNAL_ARM, phase: 2 });
    trafficLight(standing(kit, { x: -x, z: junction.z + z, turn: -HALF_PI }), { palette, arm: -SIGNAL_ARM, phase: 2 });
  });

  // --- Lamps along the side streets ---
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const end = street.end === "stub" ? street.reach - 4 : street.reach - roundaboutOf(street).outer - 4;
    let flip = 0;
    for (let along = facadeOf("main") + 8; along < end; along += 16) {
      const edge = flip % 2 === 0 ? 1 : -1;
      flip += 1;
      // The arm reaches across toward the street's centre line.
      lampAt(street.side * along, z + edge * (road.half + 0.9), edge > 0 ? HALF_PI : -HALF_PI, lampColor(z));
      if (detail && random.chance(0.7)) {
        const put = standing(kit, { x: street.side * (along + 8), z: z + edge * (road.half + 0.8), turn: edge > 0 ? Math.PI : 0 });
        if (random.chance(0.6)) bin(put, props);
        else hydrant(put);
      }
    }
  }

  // --- The alleys: dumpsters, crates, a vent breathing steam, one lamp deep inside ---
  for (const alley of ALLEYS) {
    const front = facadeOf("main");
    const x = (along) => alley.side * (front + along);
    if (detail) {
      dumpster(standing(kit, { x: x(5), z: alley.z + 1.25, y: 0, turn: Math.PI }), props);
      crates(standing(kit, { x: x(10.5), z: alley.z - 1.4, y: 0, turn: 0 }), props);
      crates(standing(kit, { x: x(19), z: alley.z + 1.3, y: 0, turn: Math.PI }), props);
    }
    air.vent({ x: x(13), z: alley.z + 0.4, y: 0.2, height: 6, width: 1.3, strength: 1.2 });
    const tone = random.pick(palette.neon);
    kit.add(PART.box, { x: x(17), y: 3.3, z: alley.z - 2.6, w: 0.9, h: 0.12, d: 0.12, style: STYLE.neon, lit: 1.5, pattern: 1, seed: random() * 90, color: tone });
    glows.add({ x: x(17), y: 3.3, z: alley.z - 2.4, color: tone, size: 2.6, strength: 0.6 });
    lights.add({ x: x(17), z: alley.z, radius: 9, color: tone, strength: 0.8 });
  }

  // --- Strings of lamps across the old town's street ---
  for (let z = 8; z > -236; z -= 39) {
    if (JUNCTIONS.some((junction) => Math.abs(z - junction.z) < 16)) continue;
    const reach = facadeOf("main") - 0.3;
    const bulbs = 15;
    for (let i = 0; i < bulbs; i += 1) {
      const t = i / (bulbs - 1);
      const sag = 1 - (2 * t - 1) ** 2;
      const tone = i % 3 === 0 ? palette.amber : palette.warm;
      glows.add({ x: -reach + t * reach * 2, y: 9.4 - sag * 2.1, z: z + Math.sin(t * 9) * 0.15, color: tone, size: 0.85, strength: 1.0 });
    }
    lights.add({ x: 0, z, radius: 9, color: palette.warm, strength: 0.22 });
  }

  // --- The gate over the start of the main street ---
  const gateColor = palette.accent;
  for (const side of [-1, 1]) {
    kit.add(PART.box, { x: side * (MAIN.half + 1.6), z: GATE_Z, w: 1.6, h: 14, d: 1.6, style: STYLE.metal, color: palette.darkSteel });
    kit.add(PART.box, { x: side * (MAIN.half + 1.6), z: GATE_Z, w: 2.0, h: 1.1, d: 2.0, style: STYLE.plain, pattern: MASONRY.granite, color: palette.kerb });
    kit.add(PART.box, { x: side * (MAIN.half + 1.6) - side * 0.82, y: 1.2, z: GATE_Z, w: 0.08, h: 11.6, d: 0.5, style: STYLE.neon, lit: 1.4, color: gateColor });
    glows.add({ x: side * (MAIN.half + 1.6), y: 14.4, z: GATE_Z, color: gateColor, size: 3, strength: 0.8 });
  }
  kit.add(PART.box, { y: 11.4, z: GATE_Z, w: MAIN.half * 2 + 4.8, h: 2.2, d: 1.4, style: STYLE.metal, color: palette.darkSteel });
  kit.add(PART.box, { y: 11.3, z: GATE_Z, w: MAIN.half * 2 + 4.4, h: 0.06, d: 1.2, style: STYLE.neon, lit: 1.3, color: gateColor });
  lights.add({ x: 0, z: GATE_Z - 2, radius: 12, color: gateColor, strength: 0.45 });

  const sign = new Mesh(
    new PlaneGeometry(MAIN.half * 2 + 3.6, (MAIN.half * 2 + 3.6) * (300 / 1024)),
    new MeshBasicMaterial({ map: canvasTexture(drawHoloText({ lines: [text.gate], color: gateColor, family: text.family, rtl: text.rtl })), transparent: true, depthWrite: false })
  );
  sign.position.set(0, 12.5, GATE_Z + 0.75);
  sign.renderOrder = 3;
  scene.add(sign);
}

// Where the main street's row of ordinary buildings stops, short of the end plaza (as in fillers.js).
const FRONT_END = END_PLAZA.z + END_PLAZA.radius + 14;
