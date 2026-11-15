import { Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

import { END_PLAZA, GATE_Z, JUNCTIONS, MAIN_STREET, SIDE_STREETS, STREETS, districtAt, facadeOf, grandnessAt, junctionById } from "@/lib/explore/city";

import { PART, STYLE } from "./kit";
import { bright } from "./palette";
import { canvasTexture, drawHoloText } from "./signs";

// The streets, built from the map in city.js: raised sidewalks with kerbs along
// every road, paved squares at the ends of the side streets and at the end of
// the main street, road paint, street lamps with their pools of light, and the
// gate over the start of the main street. The roads themselves are the asphalt
// ground (ground.js).

const KERB = 0.15;
const PAINT_Y = 0.02;
const MAIN = STREETS.main;

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

export function buildStreets({ scene, kit, palette, lamps, glows, decals, text }) {
  const pavement = palette.pavement;
  const white = bright(palette.white, 0.75);
  const yellow = palette.amber.clone().multiplyScalar(0.8);
  const endZ = END_PLAZA.z + END_PLAZA.radius - 1;
  const walk = MAIN.walk + 0.6;

  // --- Sidewalks along the main street, broken where side roads cross them ---
  for (const side of [-1, 1]) {
    for (const [from, to] of between(MAIN_STREET.fromZ, endZ, crossingsOn(side))) {
      kit.add(PART.box, { x: side * (MAIN.half + walk / 2), z: (from + to) / 2, w: walk, h: KERB, d: from - to, style: STYLE.pavement, color: pavement });
    }
  }

  // --- Side streets: sidewalks on both edges, and a paved square at the end ---
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const start = facadeOf("main");
    const end = street.end === "stub" ? street.reach : street.reach - street.square + 1;
    const width = road.walk + 0.6;
    for (const edge of [-1, 1]) {
      kit.add(PART.box, {
        x: street.side * (start + end) / 2,
        z: z + edge * (road.half + width / 2),
        w: end - start,
        h: KERB,
        d: width,
        style: STYLE.pavement,
        color: pavement,
      });
    }
    if (street.end !== "stub") {
      const centreX = street.side * street.reach;
      kit.add(PART.cylinder, { x: centreX, z, w: street.square * 2, h: KERB, d: street.square * 2, style: STYLE.pavement, color: pavement });
      // A low fountain in the middle, which the route drives round: a stone basin,
      // a softly lit pool and a column of water in the middle.
      const bed = street.end === "square" ? 8 : 4.6;
      kit.add(PART.cylinder, { x: centreX, y: KERB, z, w: bed * 2, h: 0.6, d: bed * 2, style: STYLE.plain, color: palette.stone[3] });
      kit.add(PART.cylinder, { x: centreX, y: KERB + 0.6, z, w: bed * 2 - 0.7, h: 0.02, d: bed * 2 - 0.7, style: STYLE.neon, lit: 0.1, color: palette.accent });
      kit.add(PART.cylinder, { x: centreX, y: KERB, z, w: bed * 0.5, h: 1.3, d: bed * 0.5, style: STYLE.plain, color: palette.stone[3] });
      kit.add(PART.cylinder, { x: centreX, y: KERB + 1.3, z, w: 0.35, h: 1.4, d: 0.35, style: STYLE.neon, lit: 0.5, color: palette.cool });
      glows.add({ x: centreX, y: KERB + 1.2, z, color: palette.accent, size: bed * 1.2, strength: 0.1 });
    }
  }
  kit.add(PART.cylinder, { x: 0, z: END_PLAZA.z, w: END_PLAZA.radius * 2, h: KERB, d: END_PLAZA.radius * 2, style: STYLE.pavement, color: pavement });

  // --- Road paint ---
  const paint = (x, z, w, d, color) => kit.add(PART.flat, { x, y: PAINT_Y, z, w, h: 1, d, style: STYLE.paint, color });
  const junctionCuts = JUNCTIONS.map((junction) => {
    const half = Math.max(...SIDE_STREETS.filter((street) => street.junction === junction.id).map((street) => STREETS[street.street].half));
    return { z: junction.z, half: half + 5 };
  });
  const roadEnd = END_PLAZA.z + END_PLAZA.radius;
  for (const [from, to] of between(MAIN_STREET.fromZ, roadEnd, junctionCuts)) {
    const length = from - to;
    const middle = (from + to) / 2;
    for (const x of [-0.16, 0.16]) paint(x, middle, 0.11, length, yellow);
    for (const x of [-MAIN.half + 0.45, MAIN.half - 0.45]) paint(x, middle, 0.12, length, white);
    for (let z = from - 2; z > to + 2; z -= 9) for (const x of [-3.5, 3.5]) paint(x, z - 1.5, 0.12, 3, white);
  }
  // Zebra crossings over the main street on both sides of each junction.
  for (const cut of junctionCuts) {
    for (const zSide of [-1, 1]) {
      const z = cut.z + zSide * (cut.half - 2.4);
      for (let x = -MAIN.half + 0.9; x < MAIN.half - 0.5; x += 1.3) paint(x, z, 0.6, 3, white);
    }
  }
  // Side roads: a dashed centre line, and a zebra crossing at the mouth.
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const start = facadeOf("main") + 3;
    const end = street.end === "stub" ? street.reach - 2 : street.reach - street.square - 1;
    for (let along = start + 5; along < end - 2; along += 7) paint(street.side * (along + 1.25), z, 2.5, 0.12, white);
    for (let across = -road.half + 0.8; across < road.half - 0.5; across += 1.3) paint(street.side * (facadeOf("main") + 1.6), z + across, 3, 0.6, white);
  }

  // --- Street lamps, each with a halo and a pool of light on the road ---
  const lampAt = (x, z, turn, point, color) => {
    lamps.add({ x, y: KERB, z, turn, color: bright(color, 2.4) });
    glows.add({ ...point, y: 6.4, color, size: 3.4, strength: 0.6 });
    decals.add({ x: point.x, z: point.z, width: 13, color, strength: 0.16 });
  };
  const lampColor = (z) => {
    const grandness = grandnessAt(z);
    return palette.warm.clone().lerp(palette.cool.clone().lerp(palette.accent, 0.3), districtAt(z) === "old" ? grandness * 0.4 : 0.55 + grandness * 0.45);
  };
  const cuts = JUNCTIONS.map((junction) => ({ z: junction.z, half: 13 }));
  let alternate = 0;
  for (const [from, to] of between(MAIN_STREET.fromZ - 6, roadEnd + 4, cuts)) {
    for (let z = from - 4; z > to + 2; z -= 13) {
      const side = alternate % 2 === 0 ? 1 : -1;
      alternate += 1;
      const x = side * (MAIN.half + 0.9);
      // The lamp's arm reaches out over the road.
      lampAt(x, z, side > 0 ? Math.PI : 0, { x: side * (MAIN.half - 0.65), z }, lampColor(z));
    }
  }
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const end = street.end === "stub" ? street.reach - 4 : street.reach - street.square - 2;
    let flip = 0;
    for (let along = facadeOf("main") + 8; along < end; along += 16) {
      const edge = flip % 2 === 0 ? 1 : -1;
      flip += 1;
      const lampZ = z + edge * (road.half + 0.9);
      // The arm reaches across toward the street's centre line.
      lampAt(street.side * along, lampZ, edge > 0 ? Math.PI / 2 : -Math.PI / 2, { x: street.side * along, z: z + edge * (road.half - 0.65) }, lampColor(z));
    }
  }

  // --- The gate over the start of the main street ---
  const gateColor = palette.accent;
  for (const side of [-1, 1]) {
    kit.add(PART.box, { x: side * (MAIN.half + 1.6), z: GATE_Z, w: 1.6, h: 14, d: 1.6, style: STYLE.metal, color: palette.darkSteel });
    kit.add(PART.box, { x: side * (MAIN.half + 1.6) - side * 0.82, y: 1.2, z: GATE_Z, w: 0.08, h: 11.6, d: 0.5, style: STYLE.neon, lit: 1.4, color: gateColor });
    glows.add({ x: side * (MAIN.half + 1.6), y: 14.4, z: GATE_Z, color: gateColor, size: 3, strength: 0.8 });
  }
  kit.add(PART.box, { y: 11.4, z: GATE_Z, w: MAIN.half * 2 + 4.8, h: 2.2, d: 1.4, style: STYLE.metal, color: palette.darkSteel });
  kit.add(PART.box, { y: 11.3, z: GATE_Z, w: MAIN.half * 2 + 4.4, h: 0.06, d: 1.2, style: STYLE.neon, lit: 1.3, color: gateColor });
  decals.add({ x: 0, z: GATE_Z, width: 18, length: 10, color: gateColor, strength: 0.12 });

  const sign = new Mesh(
    new PlaneGeometry(MAIN.half * 2 + 3.6, (MAIN.half * 2 + 3.6) * (300 / 1024)),
    new MeshBasicMaterial({ map: canvasTexture(drawHoloText({ lines: [text.gate], color: gateColor, family: text.family, rtl: text.rtl })), transparent: true, depthWrite: false })
  );
  sign.position.set(0, 12.5, GATE_Z + 0.75);
  sign.renderOrder = 3;
  scene.add(sign);
}
