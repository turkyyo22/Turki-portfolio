import { PART, STYLE, WINDOWS } from "./kit";

// Ordinary buildings, assembled from the kit (kit.js) by district:
//   old       small masonry buildings with shops, awnings, balconies, fire escapes and roof tanks
//   mid       concrete and panel blocks with setbacks, balconies and rooftop billboards
//   centre    glass towers on shop podiums, with setbacks, crowns and spires
//   new       round glass towers, white slabs with cantilevers and sky gardens, some unfinished
//   frontier  warehouses and yards at the edge of the city
// Each recipe works in the building's own frame: x across its front, z out of its
// front (the street side), y up. `detail` is false at Low quality, which leaves
// out the small pieces (balconies, air conditioners, fire escapes, parapets).

export const FLOOR = 3.2;
export const SHOP_FLOOR = 4.4;
const TOWER_FLOOR = 3.7;

const pick = (random, list) => list[Math.floor(random() * list.length) % list.length];

/** Places pieces in a building's frame, turning them with it. */
export function inFrame(kit, spec) {
  const cos = Math.cos(spec.turn);
  const sin = Math.sin(spec.turn);
  return (part, { x = 0, y = 0, z = 0, turn = 0, ...rest }) =>
    kit.add(part, { x: spec.x + x * cos + z * sin, y, z: spec.z - x * sin + z * cos, turn: spec.turn + turn, ...rest });
}

/** A point in a building's frame, on the map. */
export function framePoint(spec, x, y, z) {
  const cos = Math.cos(spec.turn);
  const sin = Math.sin(spec.turn);
  return { x: spec.x + x * cos + z * sin, y, z: spec.z - x * sin + z * cos };
}

// --- Pieces shared by the recipes ---------------------------------------------

/** A ring of thin walls round the edge of a roof. */
function parapet(add, { w, d, y, h = 0.9, thick = 0.25, color }) {
  add(PART.box, { y, z: d / 2 - thick / 2, w, h, d: thick, style: STYLE.plain, color });
  add(PART.box, { y, z: -d / 2 + thick / 2, w, h, d: thick, style: STYLE.plain, color });
  add(PART.box, { y, x: w / 2 - thick / 2, w: thick, h, d: d - thick * 2, style: STYLE.plain, color });
  add(PART.box, { y, x: -w / 2 + thick / 2, w: thick, h, d: d - thick * 2, style: STYLE.plain, color });
}

/** A balcony on the front: a slab with a railing round it. */
function balcony(add, { x, y, z, w, d = 1.05, color, railColor }) {
  add(PART.box, { x, y: y - 0.16, z: z + d / 2, w, h: 0.16, d, style: STYLE.plain, color });
  add(PART.plane, { x, y, z: z + d, w, h: 1.0, d: 0.04, style: STYLE.railing, color: railColor });
  add(PART.plane, { x: x - w / 2, y, z: z + d / 2, w: d, h: 1.0, d: 0.04, turn: Math.PI / 2, style: STYLE.railing, color: railColor });
  add(PART.plane, { x: x + w / 2, y, z: z + d / 2, w: d, h: 1.0, d: 0.04, turn: Math.PI / 2, style: STYLE.railing, color: railColor });
}

/** Things on a roof: water tanks on legs, air conditioners, an antenna, a dish, a stair hut. */
function roofClutter(add, { w, d, y, random, palette, detail, tanks = true }) {
  const metal = palette.steel;
  if (tanks && random() < 0.6) {
    const x = (random() - 0.5) * (w - 4);
    const z = (random() - 0.5) * (d - 4);
    const size = 1.6 + random() * 0.8;
    if (detail) {
      for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) {
        add(PART.box, { x: x + lx * size * 0.6, y, z: z + lz * size * 0.6, w: 0.12, h: 1.0, d: 0.12, style: STYLE.metal, color: metal });
      }
    }
    add(PART.cylinder, { x, y: y + 1.0, z, w: size, h: size * 1.1, d: size, style: STYLE.plain, color: random() < 0.5 ? palette.darkSteel : palette.stone[0] });
  }
  if (random() < 0.5) {
    add(PART.box, { x: (random() - 0.5) * (w - 4), y, z: (random() - 0.5) * (d - 4), w: 2.4, h: 2.3, d: 2.4, style: STYLE.plain, color: palette.stone[1] });
  }
  const units = detail ? 1 + Math.floor(random() * 3) : 1;
  for (let i = 0; i < units; i += 1) {
    add(PART.box, { x: (random() - 0.5) * (w - 2), y, z: (random() - 0.5) * (d - 2), w: 1.1, h: 0.8, d: 0.9, turn: random() < 0.5 ? 0 : Math.PI / 2, style: STYLE.vent, color: palette.steel });
  }
  if (random() < 0.55) {
    add(PART.cylinder, { x: (random() - 0.5) * (w - 2), y, z: (random() - 0.5) * (d - 2), w: 0.07, h: 3 + random() * 3.5, d: 0.07, style: STYLE.metal, color: metal });
  }
  if (detail && random() < 0.4) {
    add(PART.cylinder, { x: (random() - 0.5) * (w - 2), y: y + 0.4, z: (random() - 0.5) * (d - 2), w: 1.0, h: 0.1, d: 1.0, tilt: -0.85, turn: random() * Math.PI * 2, style: STYLE.metal, color: palette.stone[3] });
  }
}

/** Air conditioners on the front wall, under some windows. */
function wallUnits(add, { w, d, floors, bay, base, floorHeight, random, palette, share }) {
  const columns = Math.max(1, Math.floor(w / bay));
  const step = w / columns;
  for (let floor = 1; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (random() > share) continue;
      add(PART.box, {
        x: -w / 2 + (column + 0.5) * step + 0.55,
        y: base + (floor - 1) * floorHeight + 0.18,
        z: d / 2 + 0.22,
        w: 0.8,
        h: 0.52,
        d: 0.44,
        style: STYLE.vent,
        color: palette.stone[1],
      });
    }
  }
}

/** A fire escape down one side wall, near the front. */
function fireEscape(add, { w, d, floors, side, palette }) {
  for (let floor = 1; floor < floors; floor += 1) {
    add(PART.escape, {
      x: side * w / 2,
      y: SHOP_FLOOR + (floor - 1) * FLOOR,
      z: d / 2 - 2.6,
      w: 2.8,
      h: FLOOR,
      d: 1.25,
      turn: side * Math.PI / 2,
      style: STYLE.metal,
      color: palette.darkSteel,
    });
  }
}

/** A crane: a lattice mast and a jib with its counterweight. Returns where its warning light is. */
export function crane(add, { x, z, height, turn = 0, color }) {
  add(PART.box, { x, z, w: 1.6, h: height, d: 1.6, style: STYLE.railing, color });
  add(PART.box, { x, y: height, z, w: 1.4, h: 1.6, d: 1.4, style: STYLE.metal, color });
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const along = (distance) => ({ x: x + cos * distance, z: z - sin * distance });
  add(PART.box, { ...along(9), y: height + 1.6, w: 26, h: 0.9, d: 0.9, turn, style: STYLE.metal, color });
  add(PART.box, { ...along(-5.5), y: height + 0.9, w: 3, h: 1.6, d: 1.8, turn, style: STYLE.plain, color: color.clone().multiplyScalar(0.5) });
  add(PART.box, { ...along(14), y: height - 8, w: 0.06, h: 9.5, d: 0.06, turn, style: STYLE.metal, color });
  return { ...along(21), y: height + 2.6 };
}

// --- The recipes --------------------------------------------------------------

function oldTown(add, spec, random, palette, detail) {
  const { width: w, depth: d } = spec;
  const floors = spec.floors;
  const height = SHOP_FLOOR + (floors - 1) * FLOOR;
  const wall = pick(random, palette.walls.old);
  const stone = pick(random, palette.stone);
  const seed = random() * 90;
  add(PART.box, { w, h: height, d, style: spec.shops ? STYLE.shop : STYLE.wall, seed, lit: 0.3 + random() * 0.22, pattern: WINDOWS.old, color: wall });
  add(PART.box, { y: SHOP_FLOOR - 0.16, w: w + 0.3, h: 0.32, d: d + 0.3, style: STYLE.plain, color: stone });
  add(PART.box, { y: height - 0.05, w: w + 0.7, h: 0.5, d: d + 0.7, style: STYLE.plain, color: stone });
  if (detail) {
    add(PART.box, { y: height - 0.36, w: w + 0.36, h: 0.32, d: d + 0.36, style: STYLE.plain, color: stone.clone().multiplyScalar(0.82) });
    if (random() < 0.6) parapet(add, { w: w + 0.5, d: d + 0.5, y: height + 0.45, h: 0.8, color: stone });
  }

  if (spec.shops) {
    const shops = Math.max(1, Math.floor(w / 3.6));
    const shopW = w / shops;
    for (let i = 0; i < shops; i += 1) {
      if (random() > 0.68) continue;
      add(PART.wedge, {
        x: -w / 2 + (i + 0.5) * shopW,
        y: 2.75,
        z: d / 2,
        w: shopW * 0.84,
        h: 1.25,
        d: 1.55,
        style: STYLE.fabric,
        pattern: random() < 0.55 ? 1 : 0,
        color: pick(random, palette.fabric),
      });
    }
  }

  if (detail) {
    const bay = w / Math.max(1, Math.floor(w / 2.5));
    const columns = Math.round(w / bay);
    const railColor = palette.darkSteel;
    for (let column = 0; column < columns; column += 1) {
      if (random() > 0.32) continue;
      for (let floor = 1; floor < floors; floor += 1) {
        balcony(add, { x: -w / 2 + (column + 0.5) * bay, y: SHOP_FLOOR + (floor - 1) * FLOOR, z: d / 2, w: bay * 0.8, color: stone, railColor });
      }
    }
    wallUnits(add, { w, d, floors, bay: 2.5, base: SHOP_FLOOR, floorHeight: FLOOR, random, palette, share: 0.16 });
    if (floors >= 3 && random() < 0.5) fireEscape(add, { w, d, floors, side: random() < 0.5 ? 1 : -1, palette });
  }
  roofClutter(add, { w, d, y: height, random, palette, detail });
  return { height };
}

function midtown(add, spec, random, palette, detail) {
  const { width: w, depth: d } = spec;
  const floors = spec.floors;
  const homes = random() < 0.45;
  const wall = pick(random, palette.walls.mid);
  const trim = pick(random, palette.stone);
  const seed = random() * 90;
  const lit = 0.3 + random() * 0.2;
  const pattern = homes ? WINDOWS.homes : WINDOWS.block;
  const setbackAt = floors >= 8 && random() < 0.5 ? floors - 2 - Math.floor(random() * 2) : floors;
  const lowerHeight = SHOP_FLOOR + (setbackAt - 1) * FLOOR;
  const height = SHOP_FLOOR + (floors - 1) * FLOOR;

  add(PART.box, { w, h: lowerHeight, d, style: spec.shops ? STYLE.shop : STYLE.wall, seed, lit, pattern, color: wall });
  add(PART.box, { y: SHOP_FLOOR - 0.12, w: w + 0.24, h: 0.26, d: d + 0.24, style: STYLE.plain, color: trim });
  if (detail) {
    for (let floor = 4; floor < setbackAt; floor += 3) {
      add(PART.box, { y: SHOP_FLOOR + (floor - 1) * FLOOR - 0.1, w: w + 0.16, h: 0.2, d: d + 0.16, style: STYLE.plain, color: wall.clone().multiplyScalar(1.25) });
    }
  }
  add(PART.box, { y: lowerHeight, w: w + 0.3, h: 0.35, d: d + 0.3, style: STYLE.plain, color: trim });

  let roofW = w;
  let roofD = d;
  let roofZ = 0;
  if (setbackAt < floors) {
    roofW = w * 0.78;
    roofD = d * 0.78;
    roofZ = -d * 0.08;
    add(PART.box, { y: lowerHeight + 0.35, z: roofZ, w: roofW, h: height - lowerHeight, d: roofD, style: STYLE.wall, seed: seed + 5, lit, pattern, color: wall });
    add(PART.box, { y: height + 0.35, z: roofZ, w: roofW + 0.3, h: 0.32, d: roofD + 0.3, style: STYLE.plain, color: trim });
    if (detail) add(PART.plane, { y: lowerHeight + 0.35, z: d / 2 - 0.2, w: w - 0.4, h: 1.05, d: 0.04, style: STYLE.railing, color: palette.darkSteel });
  }

  if (homes && detail) {
    for (let floor = 1; floor < setbackAt; floor += 1) {
      balcony(add, { x: 0, y: SHOP_FLOOR + (floor - 1) * FLOOR, z: d / 2, w: w - 1.2, d: 1.15, color: trim, railColor: palette.darkSteel });
    }
  } else if (detail) {
    wallUnits(add, { w, d, floors: setbackAt, bay: 2.3, base: SHOP_FLOOR, floorHeight: FLOOR, random, palette, share: 0.14 });
  }

  const roofY = setbackAt < floors ? height + 0.67 : lowerHeight + 0.35;
  let billboard = null;
  if (random() < 0.35) {
    // A rooftop billboard on two legs, facing the street.
    const bw = Math.min(roofW - 1, 7 + random() * 3);
    const bh = bw * 0.45;
    for (const x of [-bw * 0.3, bw * 0.3]) add(PART.box, { x, y: roofY, z: roofZ + roofD / 2 - 1.2, w: 0.3, h: 2.2, d: 0.3, style: STYLE.metal, color: palette.steel });
    add(PART.plane, { y: roofY + 2.2, z: roofZ + roofD / 2 - 1.05, w: bw, h: bh, d: 0.1, style: STYLE.screen, seed: random() * 20 });
    add(PART.box, { y: roofY + 2.2, z: roofZ + roofD / 2 - 1.2, w: bw + 0.3, h: bh + 0.3, d: 0.25, style: STYLE.metal, color: palette.darkSteel });
    billboard = true;
  }
  roofClutter(add, { w: roofW, d: roofD, y: roofY, random, palette, detail, tanks: !billboard });
  return { height: roofY };
}

function centreTower(add, spec, random, palette, detail, glows) {
  const { width: w, depth: d } = spec;
  const podiumH = SHOP_FLOOR + TOWER_FLOOR * 2;
  const wall = pick(random, palette.walls.centre);
  const seed = random() * 90;
  const lit = 0.3 + random() * 0.2;
  const glassy = random() < 0.62;
  const glassTint = pick(random, [palette.blue, palette.accent, palette.violet, palette.cool]).clone().multiplyScalar(0.55);

  add(PART.box, { w, h: podiumH, d, style: STYLE.shop, seed, lit: lit + 0.1, pattern: WINDOWS.office, color: wall });
  add(PART.box, { y: podiumH, w: w + 0.4, h: 0.5, d: d + 0.4, style: STYLE.plain, color: palette.stone[1] });
  // A canopy over the entrance, lit from underneath.
  add(PART.box, { y: 4.1, z: d / 2 + 1.2, w: Math.min(w * 0.5, 8), h: 0.32, d: 2.4, style: STYLE.metal, color: palette.darkSteel });
  add(PART.box, { y: 4.05, z: d / 2 + 1.2, w: Math.min(w * 0.5, 8) - 0.3, h: 0.06, d: 2.2, style: STYLE.neon, lit: 1.3, color: palette.warm });

  let y = podiumH + 0.5;
  let tw = w * 0.82;
  let td = d * 0.82;
  const floors = spec.floors;
  const tiers = floors > 16 ? 2 + Math.floor(random() * 2) : 1;
  const perTier = Math.ceil(floors / tiers);
  for (let tier = 0; tier < tiers; tier += 1) {
    const h = perTier * TOWER_FLOOR;
    add(PART.box, { y, w: tw, h, d: td, style: glassy ? STYLE.glass : STYLE.wall, seed: seed + tier * 3, lit, pattern: WINDOWS.office, color: glassy ? glassTint : wall });
    y += h;
    if (tier < tiers - 1) {
      add(PART.box, { y, w: tw + 0.3, h: 0.45, d: td + 0.3, style: STYLE.plain, color: palette.stone[1] });
      if (detail) add(PART.box, { y: y - 0.06, w: tw + 0.2, h: 0.06, d: td + 0.2, style: STYLE.neon, lit: 0.9, color: pick(random, palette.neon) });
      tw *= 0.8;
      td *= 0.8;
      y += 0.45;
    }
  }
  // A crown: a lighter top with a band of light under it, then a spire.
  const crownH = 3 + random() * 5;
  add(PART.box, { y, w: tw * 0.9, h: crownH, d: td * 0.9, style: STYLE.plain, color: palette.darkSteel });
  add(PART.box, { y: y + 0.4, w: tw * 0.92, h: 0.3, d: td * 0.92, style: STYLE.neon, lit: 1.1, color: pick(random, palette.neon) });
  y += crownH;
  if (random() < 0.7) {
    const spire = 6 + random() * 12;
    add(PART.cylinder, { y, w: 0.35, h: spire, d: 0.35, style: STYLE.metal, color: palette.steel });
    glows?.add({ ...framePoint(spec, 0, y + spire + 0.3, 0), color: palette.red, size: 3.2, strength: 1.1, blink: 1.6 + random(), phase: random() * 6 });
    y += spire;
  }
  // An advertising screen on the podium.
  if (random() < 0.55) {
    const sw = Math.min(w - 2, 9);
    add(PART.plane, { y: 5.2, z: d / 2 + 0.08, w: sw, h: Math.min(podiumH - 6, sw * 0.5), d: 0.1, style: STYLE.screen, seed: random() * 20 });
  }
  return { height: y };
}

function newDistrict(add, spec, random, palette, detail, glows) {
  const { width: w, depth: d } = spec;
  const roll = random();
  const seed = random() * 90;
  const lit = 0.28 + random() * 0.2;
  const floors = spec.floors;
  const light = pick(random, palette.walls.new);
  const tint = pick(random, [palette.mint, palette.accent, palette.violet, palette.blue]).clone().multiplyScalar(0.5);

  // A two-storey podium of shops in pale panels.
  const podiumH = SHOP_FLOOR + FLOOR;
  add(PART.box, { w, h: podiumH, d, style: STYLE.shop, seed, lit: lit + 0.1, pattern: WINDOWS.office, color: light.clone().multiplyScalar(0.7) });
  let y = podiumH;

  if (roll < 0.4) {
    // A round glass tower with a terrace garden on the podium.
    const size = Math.min(w, d) * 0.86;
    const h = floors * TOWER_FLOOR;
    add(PART.cylinder, { y, w: size, h, d: size, style: STYLE.glass, seed, lit, color: tint });
    for (let ring = TOWER_FLOOR * 4; ring < h - 2; ring += TOWER_FLOOR * 4) {
      add(PART.cylinder, { y: y + ring, w: size + 0.7, h: 0.28, d: size + 0.7, style: STYLE.plain, color: light });
    }
    if (detail) {
      for (const side of [-1, 1]) add(PART.box, { x: side * (w / 2 - 1.6), y, z: d / 2 - 1.6, w: 2.4, h: 0.9, d: 2.4, style: STYLE.foliage, lit: 0.05, color: palette.emerald.clone().multiplyScalar(0.35) });
    }
    y += h;
    add(PART.cylinder, { y, w: size * 0.7, h: 2.2, d: size * 0.7, style: STYLE.plain, color: light });
    add(PART.cylinder, { y: y + 2.2, w: size * 0.72, h: 0.25, d: size * 0.72, style: STYLE.neon, lit: 1.1, color: tint.clone().multiplyScalar(2.6) });
    y += 2.45;
  } else {
    // A white slab, with an upper block that cantilevers toward the street.
    const unfinished = roll > 0.85;
    const built = unfinished ? Math.max(4, Math.floor(floors * 0.6)) : floors;
    const lower = Math.max(3, Math.floor(built * 0.6));
    const h1 = lower * TOWER_FLOOR;
    add(PART.box, { y, z: -d * 0.06, w: w * 0.86, h: h1, d: d * 0.84, style: STYLE.wall, seed, lit, pattern: WINDOWS.office, color: light });
    y += h1;
    const h2 = (built - lower) * TOWER_FLOOR;
    if (h2 > 0) {
      add(PART.box, { y, z: d * 0.08, w: w * 0.8, h: h2, d: d * 0.84, style: STYLE.glass, seed: seed + 2, lit, color: tint });
      if (detail) {
        // A sky garden on the step between the two blocks.
        add(PART.box, { y, z: -d * 0.36, w: w * 0.7, h: 0.8, d: 1.6, style: STYLE.foliage, lit: 0.06, color: palette.emerald.clone().multiplyScalar(0.35) });
      }
      y += h2;
    }
    add(PART.box, { y, z: d * 0.08, w: w * 0.82, h: 0.4, d: d * 0.86, style: STYLE.plain, color: light });
    if (unfinished) {
      // Bare floors and columns where the building is still going up, and a crane.
      const columns = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let level = 1; level <= 3; level += 1) {
        add(PART.box, { y: y + level * TOWER_FLOOR, z: d * 0.08, w: w * 0.8, h: 0.3, d: d * 0.8, style: STYLE.plain, color: palette.stone[2] });
      }
      for (const [cx, cz] of columns) add(PART.box, { x: cx * w * 0.36, y, z: d * 0.08 + cz * d * 0.36, w: 0.5, h: TOWER_FLOOR * 3, d: 0.5, style: STYLE.plain, color: palette.stone[2] });
      const warning = crane(add, { x: -w * 0.55, z: -d * 0.3, height: y + TOWER_FLOOR * 3 + 12, turn: random() * Math.PI, color: palette.amber.clone().multiplyScalar(0.55) });
      glows?.add({ ...framePoint(spec, warning.x, warning.y, warning.z), color: palette.red, size: 2.6, strength: 1.1, blink: 2, phase: random() * 6 });
      y += TOWER_FLOOR * 3;
    } else if (random() < 0.5) {
      add(PART.cylinder, { y: y + 0.4, w: 0.3, h: 9, d: 0.3, style: STYLE.metal, color: palette.steel });
      glows?.add({ ...framePoint(spec, 0, y + 9.6, d * 0.08), color: palette.red, size: 2.8, strength: 1, blink: 1.8, phase: random() * 6 });
    }
  }
  return { height: y };
}

function frontier(add, spec, random, palette, detail) {
  const { width: w, depth: d } = spec;
  const height = 6 + random() * 4;
  const wall = pick(random, palette.walls.frontier);
  add(PART.box, { w, h: height, d, style: STYLE.plain, color: wall });
  // Roller doors on the front, lit by a lamp over each.
  const doors = Math.max(1, Math.floor(w / 6));
  for (let i = 0; i < doors; i += 1) {
    const x = -w / 2 + (i + 0.5) * (w / doors);
    add(PART.box, { x, z: d / 2, w: 3.6, h: 4.2, d: 0.12, style: STYLE.vent, color: palette.stone[2] });
    add(PART.box, { x, y: 4.5, z: d / 2 + 0.25, w: 0.9, h: 0.12, d: 0.5, style: STYLE.neon, lit: 1.2, color: palette.warm });
  }
  add(PART.box, { y: height, w: w + 0.3, h: 0.3, d: d + 0.3, style: STYLE.plain, color: palette.stone[2] });
  roofClutter(add, { w, d, y: height + 0.3, random, palette, detail, tanks: false });
  return { height: height + 0.3 };
}

const RECIPES = { old: oldTown, mid: midtown, centre: centreTower, new: newDistrict, frontier };

/**
 * Raises one ordinary building. `spec`: x, z (centre), turn (its front faces
 * (sin turn, cos turn)), width (across the front), depth, floors, district,
 * shops (whether its ground floor has shops). Returns its height.
 */
export function raiseBuilding(kit, spec, { random, palette, detail, glows }) {
  const add = inFrame(kit, spec);
  return (RECIPES[spec.district] ?? midtown)(add, spec, random, palette, detail, glows);
}

/**
 * A plain tower for the rows behind the street fronts: just its masses, windows
 * and a top. Cheap, since these are seen from a distance.
 */
export function raiseBackdrop(kit, spec, { random, palette, glows }) {
  const add = inFrame(kit, spec);
  const { width: w, depth: d, height, district } = spec;
  const seed = random() * 90;
  const lit = 0.24 + random() * 0.22;
  const glassy = district === "centre" || district === "new" ? random() < 0.55 : random() < 0.12;
  const wall = pick(random, palette.walls[district] ?? palette.walls.mid);
  const tint = pick(random, [palette.blue, palette.accent, palette.violet, palette.mint]).clone().multiplyScalar(0.45);
  const pattern = district === "old" ? WINDOWS.old : glassy ? WINDOWS.office : random() < 0.5 ? WINDOWS.block : WINDOWS.office;
  const round = district === "new" && random() < 0.3;
  if (round) {
    add(PART.cylinder, { w: Math.min(w, d), h: height, d: Math.min(w, d), style: STYLE.glass, seed, lit, color: tint });
  } else if (height > 40 && random() < 0.6) {
    const split = height * (0.55 + random() * 0.2);
    add(PART.box, { w, h: split, d, style: glassy ? STYLE.glass : STYLE.wall, seed, lit, pattern, color: glassy ? tint : wall });
    add(PART.box, { y: split, w: w * 0.72, h: height - split, d: d * 0.72, style: glassy ? STYLE.glass : STYLE.wall, seed: seed + 3, lit, pattern, color: glassy ? tint : wall });
  } else {
    add(PART.box, { w, h: height, d, style: glassy ? STYLE.glass : STYLE.wall, seed, lit, pattern, color: glassy ? tint : wall });
  }
  if (height > 45 && random() < 0.55) {
    add(PART.cylinder, { y: height, w: 0.3, h: 6, d: 0.3, style: STYLE.metal, color: palette.steel });
    glows?.add({ ...framePoint(spec, 0, height + 6.3, 0), color: palette.red, size: 3, strength: 1.05, blink: 1.6 + random(), phase: random() * 6 });
  }
  return { height };
}
