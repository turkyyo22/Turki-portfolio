import { Color } from "three";

import { IRONWORK, MASONRY, METAL, PART, PLANTING, STYLE } from "./kit";
import { bright } from "./palette";

// Street furniture and the small things that make a street look lived in:
// benches, bins, hydrants, bus shelters, vending machines, cafe tables, traffic
// lights, covers and grates in the road, dumpsters and crates in the alleys.
// Each is a handful of kit pieces (kit.js), so hundreds of them add no draw
// calls. A prop is placed with `put`, which sets pieces in the prop's own frame:
// x across, z out of its front, y up from the ground it stands on.

const KERB = 0.15;
const HALF_PI = Math.PI / 2;

/** Returns `put(part, piece)` for a prop standing at (x, z) on ground at height `y`, its front turned to `turn`. */
export function standing(kit, { x, z, y = KERB, turn = 0 }) {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const put = (part, { x: px = 0, y: py = 0, z: pz = 0, turn: pturn = 0, ...rest }) =>
    kit.add(part, { x: x + px * cos + pz * sin, y: y + py, z: z - px * sin + pz * cos, turn: turn + pturn, ...rest });
  /** A point of the prop's own frame, on the map. */
  put.at = (px, pz) => ({ x: x + px * cos + pz * sin, z: z - px * sin + pz * cos });
  put.y = y;
  return put;
}

const WOOD = new Color("#6b4a2e");
const DARK = new Color("#14171d");
const IRON = new Color("#23272f");
const RUBBER = new Color("#0c0d10");

/** A bench: three planks for a seat, two for a back, on cast-iron ends. */
export function bench(put) {
  for (const x of [-0.8, 0.8]) {
    put(PART.box, { x, z: 0.02, w: 0.07, h: 0.44, d: 0.48, style: STYLE.metal, color: IRON });
    put(PART.box, { x, y: 0.44, z: -0.2, w: 0.07, h: 0.42, d: 0.06, tilt: -0.2, style: STYLE.metal, color: IRON });
  }
  for (const z of [-0.12, 0.04, 0.2]) put(PART.box, { y: 0.44, z, w: 1.8, h: 0.04, d: 0.13, style: STYLE.wood, color: WOOD });
  for (const y of [0.6, 0.76]) put(PART.box, { y, z: -0.24 - (y - 0.44) * 0.2, w: 1.8, h: 0.12, d: 0.035, tilt: -0.2, style: STYLE.wood, color: WOOD });
}

/** A litter bin: a ribbed drum with a hooded top. */
export function bin(put, { palette }) {
  put(PART.cylinder, { w: 0.5, h: 0.78, d: 0.5, style: STYLE.metal, pattern: METAL.ribbed, color: palette.darkSteel });
  put(PART.cylinder, { y: 0.78, w: 0.54, h: 0.06, d: 0.54, style: STYLE.metal, color: IRON });
  put(PART.cylinder, { y: 0.84, w: 0.4, h: 0.16, d: 0.4, style: STYLE.metal, color: IRON });
}

/** A fire hydrant. */
export function hydrant(put) {
  const red = new Color("#a3261c");
  put(PART.cylinder, { w: 0.3, h: 0.08, d: 0.3, style: STYLE.metal, color: red });
  put(PART.cylinder, { y: 0.08, w: 0.22, h: 0.5, d: 0.22, style: STYLE.metal, color: red });
  put(PART.ball, { y: 0.5, w: 0.24, h: 0.22, d: 0.24, style: STYLE.metal, color: red });
  put(PART.cylinder, { y: 0.34, z: 0.14, w: 0.11, h: 0.1, d: 0.11, tilt: HALF_PI, style: STYLE.metal, pattern: METAL.zinc, color: new Color("#8c8f96") });
  for (const x of [-0.14, 0.14]) put(PART.box, { x, y: 0.36, w: 0.08, h: 0.09, d: 0.09, style: STYLE.metal, color: red });
}

/** A bus shelter: a glass back and end, a roof with a strip of light, a bench and a lit advert. Returns where its light falls. */
export function busShelter(put, { palette, random, lights }) {
  const steel = palette.darkSteel;
  for (const x of [-1.9, 1.9]) put(PART.box, { x, z: -0.62, w: 0.08, h: 2.5, d: 0.08, style: STYLE.metal, pattern: METAL.zinc, color: palette.steel });
  put(PART.box, { y: 0.25, z: -0.64, w: 3.7, h: 1.95, d: 0.03, style: STYLE.smoked, seed: random() * 90, color: palette.cool });
  put(PART.box, { y: 2.42, z: -0.1, w: 4.1, h: 0.1, d: 1.5, style: STYLE.metal, color: steel });
  put(PART.box, { y: 2.38, z: 0.1, w: 3.6, h: 0.04, d: 0.12, style: STYLE.neon, lit: 1.3, color: palette.cool });
  // A bench inside, and a lit advert at one end.
  put(PART.box, { x: -0.5, y: 0.45, z: -0.4, w: 2.4, h: 0.05, d: 0.34, style: STYLE.wood, color: WOOD });
  for (const x of [-1.5, 0.5]) put(PART.box, { x, z: -0.4, w: 0.06, h: 0.45, d: 0.3, style: STYLE.metal, color: IRON });
  const tone = random.pick(palette.neon);
  put(PART.box, { x: 1.95, y: 0.3, z: 0, w: 0.12, h: 1.95, d: 1.2, style: STYLE.metal, color: steel });
  put(PART.plane, { x: 1.88, y: 0.4, z: 0, w: 1.05, h: 1.75, d: 0.02, turn: -HALF_PI, style: STYLE.lightbox, seed: random() * 90, lit: 1.1, pattern: random.chance(0.5) ? 1 : 0, color: tone });
  const spot = put.at(0.6, 0.6);
  lights?.add({ x: spot.x, z: spot.z, radius: 5.5, color: palette.cool.clone().lerp(tone, 0.35), strength: 0.75 });
}

/** A vending machine: a lit front of bottles, a dark cabinet. */
export function vending(put, { palette, random, lights }) {
  const tone = random.pick(palette.neon);
  put(PART.box, { w: 1.0, h: 1.9, d: 0.72, style: STYLE.metal, color: tone.clone().multiplyScalar(0.3) });
  put(PART.plane, { y: 0.5, z: 0.365, w: 0.66, x: -0.12, h: 1.25, d: 0.02, style: STYLE.lightbox, seed: random() * 90, lit: 1.15, pattern: 1, color: tone });
  put(PART.box, { x: 0.36, y: 0.9, z: 0.36, w: 0.2, h: 0.5, d: 0.03, style: STYLE.metal, pattern: METAL.zinc, color: palette.steel });
  put(PART.box, { x: 0.36, y: 1.22, z: 0.378, w: 0.12, h: 0.1, d: 0.01, style: STYLE.neon, lit: 1.2, color: palette.mint });
  put(PART.box, { x: -0.12, y: 0.16, z: 0.36, w: 0.6, h: 0.22, d: 0.03, style: STYLE.metal, color: DARK });
  const spot = put.at(0, 1.6);
  lights?.add({ x: spot.x, z: spot.z, radius: 4.2, color: tone, strength: 0.7 });
}

/** A utility cabinet, covered in stickers. */
export function cabinet(put, { palette, random }) {
  put(PART.box, { w: 0.9 + random() * 0.5, h: 1.25, d: 0.42, style: STYLE.metal, color: new Color("#3d4a45") });
  put(PART.box, { y: 1.25, w: 1.5, h: 0.05, d: 0.48, style: STYLE.metal, color: palette.darkSteel });
  put(PART.plane, { x: 0.05, y: 0.5, z: 0.215, w: 0.4, h: 0.5, d: 0.01, style: STYLE.fabric, pattern: 1, color: random.pick(palette.fabric) });
}

/** A round cafe table with two chairs, and sometimes a parasol. */
export function cafeSet(put, { palette, random }) {
  put(PART.cylinder, { w: 0.07, h: 0.72, d: 0.07, style: STYLE.metal, color: IRON });
  put(PART.cylinder, { w: 0.42, h: 0.03, d: 0.42, style: STYLE.metal, color: IRON });
  put(PART.cylinder, { y: 0.72, w: 0.76, h: 0.035, d: 0.76, style: STYLE.metal, pattern: METAL.zinc, color: palette.steel });
  for (const side of [-1, 1]) {
    const x = side * 0.62;
    put(PART.box, { x, y: 0.42, w: 0.4, h: 0.035, d: 0.4, style: STYLE.wood, color: WOOD });
    put(PART.box, { x: x + side * 0.19, y: 0.455, w: 0.03, h: 0.42, d: 0.4, style: STYLE.wood, color: WOOD });
    for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17], [-0.17, 0.17]]) put(PART.box, { x: x + lx, z: lz, w: 0.03, h: 0.42, d: 0.03, style: STYLE.metal, color: IRON });
  }
  if (random.chance(0.45)) {
    put(PART.cylinder, { y: 0.72, w: 0.045, h: 1.6, d: 0.045, style: STYLE.metal, color: IRON });
    put(PART.cone, { y: 2.1, w: 2.3, h: 0.5, d: 2.3, style: STYLE.fabric, pattern: 1, color: random.pick(palette.fabric) });
  }
}

/** A planter box of flowers or clipped green. */
export function planterBox(put, { palette, random, long = 1.6 }) {
  put(PART.box, { w: long, h: 0.5, d: 0.6, style: STYLE.plain, pattern: MASONRY.concrete, color: palette.concrete });
  put(PART.box, { y: 0.44, w: long - 0.14, h: 0.34 + random() * 0.25, d: 0.46, style: STYLE.foliage, seed: random() * 90, color: new Color(random.pick(["#1f4a2c", "#2d5a2a", "#24563a"])) });
  if (random.chance(0.5)) put(PART.flat, { y: 0.8 + random() * 0.2, w: long - 0.2, h: 1, d: 0.42, style: STYLE.foliage, pattern: PLANTING.flowers, seed: random() * 90, color: new Color("#2f6a34") });
}

/** A rack of newspaper boxes. */
export function newsRack(put, { palette, random }) {
  for (let i = 0; i < 3; i += 1) {
    const tone = random.pick(palette.fabric);
    put(PART.box, { x: (i - 1) * 0.5, y: 0.25, w: 0.44, h: 0.72, d: 0.4, style: STYLE.metal, color: tone });
    put(PART.box, { x: (i - 1) * 0.5, w: 0.08, h: 0.25, d: 0.08, style: STYLE.metal, color: IRON });
    put(PART.plane, { x: (i - 1) * 0.5, y: 0.5, z: 0.205, w: 0.32, h: 0.34, d: 0.01, style: STYLE.smoked, seed: i, color: palette.cool });
  }
}

/**
 * A traffic light on the corner of a junction: a post, an arm reaching `arm`
 * metres over the road (toward the prop's +x, or -x when negative), a head of three lamps on the arm
 * and one on the post, facing the prop's front. `phase` offsets its changes.
 */
export function trafficLight(put, { palette, arm = 5.5, phase = 0 }) {
  const dark = DARK;
  put(PART.cylinder, { w: 0.3, h: 0.5, d: 0.3, style: STYLE.metal, color: dark });
  put(PART.cylinder, { w: 0.15, h: 6.2, d: 0.15, style: STYLE.metal, color: dark });
  put(PART.box, { x: arm / 2, y: 5.9, w: Math.abs(arm), h: 0.12, d: 0.12, style: STYLE.metal, color: dark });
  const head = (x, y) => {
    put(PART.box, { x, y, z: 0.02, w: 0.36, h: 1.05, d: 0.26, style: STYLE.metal, color: dark });
    const tones = [palette.red, palette.amber, palette.mint];
    tones.forEach((tone, index) => {
      put(PART.cylinder, { x, y: y + 0.9 - index * 0.32, z: 0.16, w: 0.2, h: 0.03, d: 0.2, tilt: HALF_PI, style: STYLE.signal, seed: phase, pattern: index, color: bright(tone, 1.0) });
      put(PART.box, { x, y: y + 0.98 - index * 0.32, z: 0.22, w: 0.24, h: 0.02, d: 0.14, style: STYLE.metal, color: dark });
    });
  };
  head(arm - Math.sign(arm) * 0.5, 4.9);
  head(0, 2.6);
}

/** A dumpster with its lid half open. */
export function dumpster(put, { random }) {
  const green = new Color(random.pick(["#1f4a3a", "#2b3f5a", "#4a2f24"]));
  put(PART.box, { y: 0.14, w: 1.9, h: 1.05, d: 1.05, style: STYLE.metal, pattern: METAL.ribbed, color: green });
  put(PART.box, { y: 1.19, z: -0.12, w: 1.94, h: 0.05, d: 0.9, tilt: -0.22, style: STYLE.metal, color: green.clone().multiplyScalar(0.7) });
  for (const [x, z] of [[-0.8, -0.4], [0.8, -0.4], [0.8, 0.4], [-0.8, 0.4]]) put(PART.cylinder, { x, z, w: 0.14, h: 0.14, d: 0.14, style: STYLE.metal, color: RUBBER });
}

/** A stack of crates, boxes and a sack or two. */
export function crates(put, { random }) {
  const tones = ["#7a5a36", "#8c6a40", "#5e4a30"].map((hex) => new Color(hex));
  const count = 2 + Math.floor(random() * 3);
  for (let i = 0; i < count; i += 1) {
    const size = 0.5 + random() * 0.3;
    put(PART.box, { x: (random() - 0.5) * 1.2, y: i > 1 ? 0.55 : 0, z: (random() - 0.5) * 0.5, w: size, h: 0.5, d: size, turn: random() * 0.6, style: STYLE.wood, seed: random() * 90, color: random.pick(tones) });
  }
  if (random.chance(0.6)) put(PART.ball, { x: 0.9, z: 0.2, w: 0.55, h: 0.4, d: 0.5, style: STYLE.fabric, color: new Color("#3a3d44") });
}

/** A cover in the road. Returns nothing: add steam separately. */
export function manhole(kit, { x, z, y = 0.012 }) {
  kit.add(PART.cylinder, { x, y: y - 0.01, z, w: 0.84, h: 0.012, d: 0.84, style: STYLE.grate, pattern: IRONWORK.manhole, color: new Color("#3a3d44") });
}

/** A drain against the kerb. `turn` lines its slots up along the kerb. */
export function drain(kit, { x, z, turn = 0 }) {
  kit.add(PART.flat, { x, y: 0.014, z, w: 0.75, h: 1, d: 0.42, turn, style: STYLE.grate, pattern: IRONWORK.drain, color: new Color("#2e3138") });
}

/** The iron grate round the foot of a street tree. */
export function treeGrate(kit, { x, z }) {
  kit.add(PART.cylinder, { x, y: KERB, z, w: 1.5, h: 0.012, d: 1.5, style: STYLE.grate, pattern: IRONWORK.tree, color: new Color("#2a2d33") });
}

/** A plastic barrier and two cones, for a building site. */
export function barrier(put) {
  const orange = new Color("#c4571a");
  put(PART.box, { y: 0.5, w: 2.0, h: 0.32, d: 0.06, style: STYLE.fabric, pattern: 1, color: orange });
  for (const x of [-0.9, 0.9]) put(PART.box, { x, w: 0.06, h: 0.9, d: 0.4, style: STYLE.metal, color: DARK });
  for (const x of [-1.5, 1.5]) {
    put(PART.box, { x, z: 0.5, w: 0.34, h: 0.03, d: 0.34, style: STYLE.metal, color: DARK });
    put(PART.cone, { x, y: 0.03, z: 0.5, w: 0.26, h: 0.58, d: 0.26, style: STYLE.fabric, color: orange });
  }
}

/**
 * A fountain: a stone basin of water `radius` metres across lit from below in
 * `color`, a raised bowl in the middle, and jets (through `air`): one tall in
 * the middle and a ring arching inward. `grand` adds a second tier.
 */
export function fountain(put, { palette, air, lights, glows, radius, color, grand = false }) {
  const stone = palette.stone[3];
  put(PART.cylinder, { w: radius * 2, h: 0.62, d: radius * 2, style: STYLE.plain, pattern: MASONRY.granite, color: stone });
  put(PART.cylinder, { y: 0.62, w: radius * 2 + 0.24, h: 0.1, d: radius * 2 + 0.24, style: STYLE.plain, pattern: MASONRY.granite, color: stone.clone().multiplyScalar(1.15) });
  put(PART.cylinder, { y: 0.5, w: radius * 2 - 0.7, h: 0.19, d: radius * 2 - 0.7, style: STYLE.water, lit: 0.55, color });
  const centre = put.at(0, 0);
  const base = put.y;
  // The middle: a stem, a bowl that brims over, and a finial of light.
  const stem = grand ? 2.2 : 1.5;
  put(PART.cylinder, { y: 0.6, w: radius * 0.34, h: 0.5, d: radius * 0.34, style: STYLE.plain, pattern: MASONRY.granite, color: stone });
  put(PART.cylinder, { y: 1.1, w: radius * 0.16, h: stem - 0.5, d: radius * 0.16, style: STYLE.plain, pattern: MASONRY.granite, color: stone });
  put(PART.cone, { y: stem + 0.95, w: radius * 0.72, h: 0.38, d: radius * 0.72, tilt: Math.PI, style: STYLE.plain, pattern: MASONRY.granite, color: stone });
  put(PART.cylinder, { y: stem + 0.9, w: radius * 0.66, h: 0.06, d: radius * 0.66, style: STYLE.water, lit: 0.8, color });
  if (grand) {
    put(PART.cylinder, { y: stem + 0.96, w: radius * 0.08, h: 1.4, d: radius * 0.08, style: STYLE.plain, pattern: MASONRY.granite, color: stone });
    put(PART.ball, { y: stem + 2.3, w: 0.7, h: 0.7, d: 0.7, style: STYLE.neon, lit: 1.5, color });
    glows?.add({ x: centre.x, y: base + stem + 2.65, z: centre.z, color, size: 4.5, strength: 0.7 });
  }
  const top = base + stem + (grand ? 3.0 : 1.0);
  const water = color.clone().lerp(palette.cool, 0.55).multiplyScalar(0.8);
  air?.jet({ x: centre.x, y: top, z: centre.z, vy: grand ? 8.5 : 6, spread: 0.35, drops: grand ? 70 : 40, color: water });
  // A ring of jets leaning in toward the bowl.
  const nozzles = grand ? 12 : 8;
  for (let i = 0; i < nozzles; i += 1) {
    const angle = (i / nozzles) * Math.PI * 2;
    const reach = radius - 0.75;
    const at = put.at(Math.sin(angle) * reach, Math.cos(angle) * reach);
    const inward = grand ? 2.6 : 2.0;
    air?.jet({ x: at.x, y: base + 0.7, z: at.z, vx: -(at.x - centre.x) / reach * inward, vy: grand ? 6.6 : 5.2, vz: -(at.z - centre.z) / reach * inward, spread: 0.12, drops: grand ? 22 : 16, color: water });
    put(PART.cylinder, { x: Math.sin(angle) * reach, y: 0.62, z: Math.cos(angle) * reach, w: 0.12, h: 0.14, d: 0.12, style: STYLE.metal, pattern: METAL.chrome, color: palette.steel });
  }
  // Mist drifting off the water, and its light on the square.
  air?.vent({ x: centre.x, y: base + 0.9, z: centre.z, height: 3.2, width: radius * 0.7, strength: 0.35 });
  lights?.add({ x: centre.x, z: centre.z, radius: radius * 2.6, color, strength: 0.6 });
}
