import {
  ALLEYS,
  END_PLAZA,
  MAIN_STREET,
  RAILS,
  SIDE_STREETS,
  cornersOf,
  districtAt,
  facadeOf,
  grandnessAt,
  junctionById,
} from "@/lib/explore/city";
import { rotateLeft } from "@/lib/explore/path";

import { raiseBackdrop, raiseBuilding } from "./architecture";

// The ordinary buildings that line every street: a front row along the main
// street, two rows of towers behind it, both sides of each side street, a ring
// round each square and round the end plaza. They leave room for the junctions,
// the alleys, the project buildings and the view of them, and the construction
// lots. Returns the street fronts, where signs, screens and lamps are hung.

const HALF_PI = Math.PI / 2;
const DEG = Math.PI / 180;

const WIDTHS = { old: [9, 14], mid: [12, 18], centre: [17, 25], new: [16, 23], frontier: [14, 22] };
const DEPTHS = { old: [12, 16], mid: [14, 18], centre: [18, 24], new: [18, 22], frontier: [16, 22] };
const GAPS = { old: [0.1, 0.6], mid: [0.4, 2], centre: [1.5, 4], new: [2, 5], frontier: [2, 6] };

// Where the main street's front row stops, short of the end plaza's ring of buildings.
const FRONT_END_Z = END_PLAZA.z + END_PLAZA.radius + 14;

function floorsFor(district, grandness, random) {
  if (district === "old") return 2 + Math.round(grandness * 3 + random() * 1.4);
  if (district === "mid") return 5 + Math.round(random() * 5 + grandness * 2);
  if (district === "centre") return 10 + Math.round(random() * 14 + grandness * 8);
  if (district === "new") return 8 + Math.round(random() * 12);
  return 2;
}

function backdropHeight(district, grandness, row, random) {
  const base = { old: 12, mid: 24, centre: 55, new: 42, frontier: 14 }[district];
  const spread = { old: 10, mid: 24, centre: 75, new: 50, frontier: 8 }[district];
  return Math.round((base + random() * spread) * (row === 2 ? 1.3 : 1) * (0.6 + 0.5 * grandness));
}

/**
 * The free stretches of a street edge running from `from` down to `to` (from > to),
 * once the `blocked` intervals ([high, low] pairs) are taken out.
 */
export function freeStretches(from, to, blocked) {
  const sorted = blocked.filter(([high, low]) => high > to && low < from).sort((a, b) => b[0] - a[0]);
  const stretches = [];
  let cursor = from;
  for (const [high, low] of sorted) {
    if (high < cursor) stretches.push([cursor, Math.max(high, to)]);
    cursor = Math.min(cursor, low);
    if (cursor <= to) break;
  }
  if (cursor > to) stretches.push([cursor, to]);
  return stretches.filter(([a, b]) => a - b > 4);
}

/**
 * Splits a stretch into building plots, from its start. `plot(start, width)`
 * builds one. The last plot stretches to the end, so no sliver is left.
 */
function splitStretch(from, to, district, random, plot) {
  let cursor = from;
  const [minWidth, maxWidth] = WIDTHS[district];
  const [minGap, maxGap] = GAPS[district];
  while (cursor - to > 5) {
    let width = random.range(minWidth, maxWidth);
    const gap = random.range(minGap, maxGap);
    if (cursor - to - width - gap < minWidth * 0.7) width = cursor - to;
    plot(cursor, width, gap);
    cursor -= width + gap;
  }
}

export function lineStreets({ kit, random, palette, detail, glows, lights, placeSites, lotsInUse, emptyEnds }) {
  const fronts = [];
  const options = { random, palette, detail, glows, lights };
  const mainFacade = facadeOf("main");

  // --- The main street's front row ---
  for (const side of [-1, 1]) {
    const blocked = [];
    for (const street of SIDE_STREETS) {
      if (street.side !== side) continue;
      const { z } = junctionById(street.junction);
      const half = facadeOf(street.street);
      blocked.push([z + half, z - half]);
    }
    for (const alley of ALLEYS) if (alley.side === side) blocked.push([alley.z + 3, alley.z - 3]);
    for (const rail of RAILS) blocked.push([rail.z + 3.5, rail.z - 3.5]);
    for (const { place, site } of placeSites) {
      if (place.at !== "main" || place.side !== side) continue;
      const zs = cornersOf(site.footprint, site.turn).map((corner) => site.z + corner.z);
      // Keep the building itself clear, and an open view of it on the way there.
      blocked.push([Math.max(...zs) + 24, Math.min(...zs) - 2.5]);
    }
    for (const lot of lotsInUse) if (lot.side === side) blocked.push([lot.z + 8.5, lot.z - 8.5]);

    for (const [from, to] of freeStretches(MAIN_STREET.fromZ, FRONT_END_Z, blocked)) {
      splitStretch(from, to, districtAt((from + to) / 2), random, (start, width) => {
        const z = start - width / 2;
        const district = districtAt(z);
        const grandness = grandnessAt(z);
        const depth = random.range(...DEPTHS[district]);
        const spec = {
          x: side * (mainFacade + depth / 2),
          z,
          turn: side > 0 ? -HALF_PI : HALF_PI,
          width,
          depth,
          floors: floorsFor(district, grandness, random),
          district,
          shops: true,
        };
        const { height } = raiseBuilding(kit, spec, options);
        fronts.push({ street: "main", side, x: side * mainFacade, z, along: width, height, district, turn: spec.turn });
      });
    }
  }

  // --- Two rows of towers behind the main street ---
  for (const side of [-1, 1]) {
    for (const row of [1, 2]) {
      const near = row === 1 ? 36 : 66;
      const blocked = [];
      for (const street of SIDE_STREETS) {
        if (street.side !== side) continue;
        const { z } = junctionById(street.junction);
        const reach = street.end === "square" ? (row === 1 ? 40 : 76) : street.end === "court" ? (row === 1 ? 34 : 58) : row === 1 ? 32 : 22;
        blocked.push([z + reach, z - reach]);
      }
      for (const { place, site } of placeSites) {
        if (row !== 1 || place.at !== "main" || place.side !== side) continue;
        const zs = cornersOf(site.footprint, site.turn).map((corner) => site.z + corner.z);
        blocked.push([Math.max(...zs) + 4, Math.min(...zs) - 4]);
      }
      blocked.push([END_PLAZA.z + 62, -Infinity]);
      for (const rail of RAILS) blocked.push([rail.z + 4, rail.z - 4]);
      for (const [from, to] of freeStretches(MAIN_STREET.fromZ + 40, MAIN_STREET.toZ, blocked)) {
        let cursor = from;
        while (cursor - to > 10) {
          const width = Math.min(cursor - to, random.range(14, 26));
          const depth = random.range(16, 26);
          const z = cursor - width / 2;
          const district = districtAt(z);
          raiseBackdrop(kit, { x: side * (near + depth / 2), z, turn: side > 0 ? -HALF_PI : HALF_PI, width: width - 2, depth, height: backdropHeight(district, grandnessAt(z), row, random), district }, options);
          cursor -= width + random.range(1, 6);
        }
      }
    }
  }

  // --- Side streets, their squares, and the stub ---
  for (const street of SIDE_STREETS) {
    const { z: junctionZ } = junctionById(street.junction);
    const facade = facadeOf(street.street);
    const district = districtAt(junctionZ);
    const grandness = grandnessAt(junctionZ);
    const start = mainFacade + 17;
    const end = street.end === "stub" ? street.reach : street.reach - street.square - 1.5;

    for (const edge of [-1, 1]) {
      splitStretch(end, start, district, random, (from, width) => {
        const along = from - width / 2;
        const depth = random.range(12, 16);
        const spec = {
          x: street.side * along,
          z: junctionZ + edge * (facade + depth / 2),
          // Facing the street: toward smaller z from the far edge, toward larger z from the near one.
          turn: edge > 0 ? Math.PI : 0,
          width,
          depth,
          floors: Math.max(2, floorsFor(district, grandness * 0.85, random) - 1),
          district,
          shops: random() < 0.75,
        };
        const { height } = raiseBuilding(kit, spec, options);
        fronts.push({ street: street.id, side: edge, x: spec.x, z: junctionZ + edge * facade, along: width, height, district, turn: spec.turn });
      });
    }

    const centre = { x: street.side * street.reach, z: junctionZ };
    const away = [street.side, 0];
    if (street.end === "stub") {
      // A building closes the end of the street.
      const depth = 15;
      raiseBuilding(
        kit,
        { x: street.side * (street.reach + depth / 2), z: junctionZ, turn: street.side < 0 ? HALF_PI : -HALF_PI, width: facade * 2 + 2, depth, floors: floorsFor(district, grandness, random), district, shops: true },
        options
      );
      continue;
    }

    // A ring of buildings round the square, facing it. The far end holds the
    // project's building; when the place is empty, an ordinary building stands there.
    const angles = street.end === "square" ? [50, -50, 100, -100] : [62, -62, 112, -112];
    if (emptyEnds.has(street.id)) angles.unshift(0);
    for (const angle of angles) {
      const [dx, dz] = rotateLeft(away[0], away[1], angle * DEG);
      const depth = random.range(13, 17);
      const distance = street.square + 1.5 + depth / 2;
      const spec = {
        x: centre.x + dx * distance,
        z: centre.z + dz * distance,
        turn: Math.atan2(-dx, -dz),
        width: angle === 0 ? 18 : random.range(15, 20),
        depth,
        floors: floorsFor(district, grandness, random) + (street.end === "square" ? 2 : 0),
        district,
        shops: true,
      };
      raiseBuilding(kit, spec, options);
    }
  }

  // --- Round the end plaza ---
  for (const angle of [0, 44, -44, 88, -88, 125, -125]) {
    const [dx, dz] = rotateLeft(0, -1, angle * DEG);
    const depth = random.range(18, 22);
    const distance = END_PLAZA.radius + 2 + depth / 2;
    raiseBuilding(
      kit,
      {
        x: dx * distance,
        z: END_PLAZA.z + dz * distance,
        turn: Math.atan2(-dx, -dz),
        width: random.range(18, 24),
        depth,
        floors: 12 + Math.round(random() * 10),
        district: "new",
        shops: true,
      },
      options
    );
  }

  return fronts;
}
