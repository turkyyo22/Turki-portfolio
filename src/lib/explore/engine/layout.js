import { ROUTE, routeEnd, stationZ } from "@/lib/explore/plan";

import { stopColor } from "./palette";
import { clamp, lerp } from "./random";

// The street's cross-section, in metres from its centre line.
export const STREET = {
  roadHalf: 7, // two lanes each way
  walk: 5, // sidewalk width
  front: 12.6, // where the buildings' facades stand
};

export const FLOOR = 3.2;
// A name sign's height as a share of its width (the shape of its texture).
export const SIGN_RATIO = 340 / 1024;

/** The front of a stop's building: how tall its base is, whether a tower stands on it, and where the name sign hangs. */
function frontOf(kind, tier, width, height) {
  if (kind === "graduation") return { base: 15, hasTower: true, signWidth: 14, signY: 17.7 };
  if (kind === "coop") return { base: 12.8, hasTower: true, signWidth: 11.5, signY: 10.5 };
  const podium = FLOOR * (3 + Math.round(tier * 2));
  const hasTower = height - podium >= 6;
  const base = hasTower ? podium : height;
  const signWidth = Math.min(width - 1.4, 11.5);
  return { base, hasTower, signWidth, signY: base - (signWidth * SIGN_RATIO) / 2 - 0.4 };
}

/** The ground a stop's building covers: its size, and how far steps or a porch reach out in front. */
function footprintOf(kind, tier) {
  if (kind === "graduation") return { width: 36, depth: 18, apron: 5.4, height: 58 };
  if (kind === "coop") return { width: 26, depth: 20, apron: 1, height: 104 };
  return { width: 13 + 9 * tier, depth: 11 + 6 * tier, apron: 0, height: 9 + 62 * tier ** 1.35 };
}

/**
 * Where everything stands along the street: the stops and their buildings, the
 * cross streets between them, the construction sites and the plaza at the end.
 */
export function createLayout(tour, palette) {
  const count = tour.stops.length;
  const end = routeEnd(count);

  // A cross street between every two stops.
  const crossings = [];
  for (let index = 0; index < count - 1; index += 1) crossings.push(stationZ(index) - ROUTE.leg * ROUTE.crossAt);

  // The street gets grander between these two distances (0 = old town, 1 = the landmarks).
  const tierFrom = ROUTE.intro + 16;
  const tierTo = Math.max(tierFrom + 60, -stationZ(Math.max(0, count - 2)));
  const tierAt = (z) => clamp((-z - tierFrom) / (tierTo - tierFrom), 0, 1);

  const stations = tour.stops.map((stop, index) => {
    const { tier, side, kind } = stop;
    const grand = kind !== "project";
    const { width, depth, apron, height } = footprintOf(kind, tier);
    const front = frontOf(kind, tier, width, height);

    // The camera pauses at (cameraX, cameraZ). Small buildings are seen from close
    // by, towers from across the street.
    const cameraZ = stationZ(index);
    const cameraX = -side * lerp(-1.2, 3.4, tier);

    // The building stands `standOff` metres further down the street, turned to
    // face the camera's spot so its sign reads straight on, and just far enough
    // from the street that its nearest corner clears the sidewalk.
    const place = (standOff) => {
      const z = cameraZ - standOff;
      // How far the footprint reaches toward the street, back and forward, once turned.
      const extents = (turn) => {
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const corners = [
          [-width / 2, -depth / 2],
          [width / 2, -depth / 2],
          [width / 2, depth / 2 + apron],
          [-width / 2, depth / 2 + apron],
        ].map(([lx, lz]) => ({ x: lx * cos + lz * sin, z: -lx * sin + lz * cos }));
        return {
          reach: Math.max(...corners.map((corner) => -side * corner.x)),
          back: Math.min(...corners.map((corner) => corner.z)),
          front: Math.max(...corners.map((corner) => corner.z)),
        };
      };
      // The turn depends on where the building stands and the other way round, so
      // settle the two over a few passes.
      let x = side * (STREET.front + 1.4 + Math.hypot(width, depth) / 2);
      for (let pass = 0; pass < 5; pass += 1) {
        x = side * (STREET.front + 1.3 + extents(Math.atan2(cameraX - x, cameraZ - z)).reach);
      }
      const turn = Math.atan2(cameraX - x, cameraZ - z);
      const { back, front } = extents(turn);
      return { x, z, turn, farZ: z + back, nearZ: z + front };
    };

    // Step the building back toward the camera until it is clear of the next cross street.
    const limit = index < crossings.length ? crossings[index] + STREET.roadHalf + STREET.walk + 1 : -Infinity;
    let standOff = 12 + 12 * tier + (grand ? 6 : 0);
    let spot = place(standOff);
    while (spot.farZ < limit && standOff > 9) {
      standOff -= 1;
      spot = place(standOff);
    }

    const { x, z, turn } = spot;
    const facing = { x: Math.sin(turn), z: Math.cos(turn) };
    const plazaOffset = depth / 2 + apron + 5.5;

    return {
      stop,
      index,
      side,
      tier,
      kind,
      color: stopColor(palette, stop, index),
      width,
      depth,
      height,
      apron,
      ...front,
      x,
      z,
      turn,
      facing,
      cameraX,
      cameraZ,
      // The height the camera looks at: a little under the name sign, so the sign
      // sits in the upper half of the picture and the square below it stays in view.
      focusY: front.signY - 3,
      // The open square in front of the building: its distance from the building's
      // centre, and where that puts it on the map.
      plazaOffset,
      plaza: { x: x + facing.x * plazaOffset, z: z + facing.z * plazaOffset },
      /** A point given in the building's own coordinates (x across, z toward the visitor), on the map. */
      toWorld: (lx, lz) => ({ x: x + lx * facing.z + lz * facing.x, z: z - lx * facing.x + lz * facing.z }),
      // No ordinary buildings stand in this stretch on the stop's side of the
      // street: the building itself, and an open view of it on the way in.
      clearFrom: spot.nearZ + 24,
      clearTo: spot.farZ - 2.5,
    };
  });

  const plaza = { z: end - 46, radius: 24 };

  // Unfinished projects without a post stand as construction sites along the
  // last stretch, on alternating sides, starting opposite the final stop.
  const lastZ = count > 0 ? stationZ(count - 1) : -ROUTE.intro;
  const lastSide = count > 0 ? tour.stops[count - 1].side : 1;
  const lots = tour.upcoming.map((item, index) => {
    const side = index % 2 === 0 ? -lastSide : lastSide;
    const x = side * (STREET.front + 9.5);
    const z = lastZ - 58 - index * 24;
    return { item, side, x, z, turn: Math.atan2(-x, 30), clearFrom: z + 13, clearTo: z - 13 };
  });

  /** Metres from `z` to the centre of the nearest cross street (Infinity when there is none). */
  const crossingDistance = (z) => crossings.reduce((nearest, crossing) => Math.min(nearest, Math.abs(z - crossing)), Infinity);

  return {
    count,
    end,
    crossings,
    tierFrom,
    tierTo,
    tierAt,
    stations,
    plaza,
    lots,
    crossingDistance,
    // The built-up street runs from behind the starting point to well past the end.
    startZ: 70,
    finishZ: end - 230,
  };
}
