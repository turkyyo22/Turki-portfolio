import { BoxGeometry, BufferAttribute, BufferGeometry, CapsuleGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The shapes of everything that moves through the city: cars, flying vehicles,
// trains and robot citizens. Each is built here from a few numbers, as one
// geometry whose vertices are tagged with the part they belong to, so that one
// material can paint the bodywork, the glass, the tyres and the lamps.

// --- Helpers -------------------------------------------------------------------

/** A primitive without its texture coordinates and index, with every vertex tagged `values` under `name`. */
function tagged(source, name, ...values) {
  const geometry = source.index ? source.toNonIndexed() : source;
  geometry.deleteAttribute("uv");
  const count = geometry.attributes.position.count;
  const data = new Float32Array(count * values.length);
  for (let index = 0; index < count; index += 1) data.set(values, index * values.length);
  geometry.setAttribute(name, new BufferAttribute(data, values.length));
  return geometry;
}

/**
 * A skin stretched over a row of rings. Each ring is a closed loop of [x, y, z]
 * points; all have the same number, going round the same way. `partOf(ring,
 * segment)` tags the quad between ring `ring` and the next, from point `segment`
 * to the one after it. A point repeated in a ring makes a sharp crease there.
 * The two ends are closed flat and tagged `capPart`.
 */
function loft(rings, partOf, name, capPart) {
  const count = rings[0].length;
  const rows = rings.length;
  // Smooth normals: at each point, the sum of the normals of the faces round it.
  const normals = rings.map((ring) => ring.map(() => [0, 0, 0]));
  const quads = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let outward = 0;
  for (let r = 0; r < rows - 1; r += 1) {
    const middle = rings[r].reduce((sum, p) => sum + p[1] / count, 0);
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      const a = rings[r][i];
      const b = rings[r][j];
      const c = rings[r + 1][j];
      const d = rings[r + 1][i];
      const n = cross(sub(c, a), sub(d, b));
      // Which way the faces point: away from the middle of the rings, on the whole.
      outward += n[0] * a[0] + n[1] * (a[1] - middle);
      for (const [row, col] of [[r, i], [r, j], [r + 1, j], [r + 1, i]]) {
        normals[row][col][0] += n[0];
        normals[row][col][1] += n[1];
        normals[row][col][2] += n[2];
      }
      quads.push([r, i, j]);
    }
  }
  const flip = outward < 0 ? -1 : 1;
  const position = [];
  const normal = [];
  const part = [];
  const push = (p, n, tag) => {
    const size = Math.hypot(n[0], n[1], n[2]) || 1;
    position.push(p[0], p[1], p[2]);
    normal.push((n[0] / size) * flip, (n[1] / size) * flip, (n[2] / size) * flip);
    part.push(tag);
  };
  for (const [r, i, j] of quads) {
    const tag = partOf(r, i);
    const corners = [[r, i], [r, j], [r + 1, j], [r + 1, i]];
    const order = flip > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) push(rings[corners[k][0]][corners[k][1]], normals[corners[k][0]][corners[k][1]], tag);
  }
  // The ends: a fan round the middle of the first and of the last ring.
  for (const [row, facing] of [[0, 1], [rows - 1, -1]]) {
    const ring = rings[row];
    const centre = ring.reduce((sum, p) => [sum[0] + p[0] / count, sum[1] + p[1] / count, sum[2] + p[2] / count], [0, 0, 0]);
    const n = [0, 0, Math.sign(ring[0][2] - rings[row === 0 ? 1 : rows - 2][0][2]) || facing];
    for (let i = 0; i < count; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % count];
      const turn = cross(sub(a, centre), sub(b, centre));
      const front = turn[2] * n[2] > 0;
      for (const p of front ? [centre, a, b] : [centre, b, a]) {
        position.push(p[0], p[1], p[2]);
        normal.push(n[0], n[1], n[2]);
        part.push(capPart);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normal), 3));
  geometry.setAttribute(name, new BufferAttribute(new Float32Array(part), 1));
  return geometry;
}

// --- Vehicles ------------------------------------------------------------------
// Parts, as the vehicle material colours them (see life.js).
export const CAR = { paint: 0, glass: 1, head: 2, tail: 3, neon: 4, trim: 5, tyre: 6, rim: 7, sign: 8, plate: 9 };

const carPart = (geometry, part) => tagged(geometry, "aPart", part);
const carBox = (w, h, d, x, y, z, part) => carPart(new BoxGeometry(w, h, d).translate(x, y, z), part);

/** One cross-section of a car body: `z` along the car, half width `w`, underside `yb`, belt line `ys`, roof `yr`, half width of the roof `wr`. */
function bodyRing([z, w, yb, ys, yr, wr]) {
  const cabin = yr - ys > 0.25;
  // Rounded off in proportion where the body is small (a nose, a tail).
  const small = Math.min(1, w / 0.6, (ys - yb) / 0.3);
  const chamfer = 0.12 * small;
  const top = cabin ? wr : w - 0.16 * small;
  const half = [
    [0, yb],
    [w - chamfer, yb],
    [w, yb + chamfer],
    [w, ys - 0.07 * small],
    [w - 0.03 * small, ys],
    [w - 0.03 * small, ys],
    [top + 0.04 * small, yr - (cabin ? 0.08 : 0.02 * small)],
    [top - 0.06 * small, yr],
    [0, yr + 0.025 * small],
  ];
  const right = half.map(([x, y]) => [x, y, z]);
  const left = half
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y, z]);
  return [...right, ...left];
}

/**
 * A wheeled vehicle, facing +z, from its cross-sections front to back
 * (`stations`, see bodyRing), its axles (`axles`: z of each), wheel `radius`,
 * and extras. Returns the geometry and the numbers the material needs to draw
 * door seams and window pillars: { geometry, seams: [z…], belt, pillars }.
 */
function wheeled({ stations, axles, radius, extras = [], lamps = {} }) {
  const cabin = stations.map(([, , , ys, yr]) => yr - ys > 0.25);
  const rings = stations.map(bodyRing);
  const body = loft(
    rings,
    (row, segment) => {
      if (segment <= 1 || segment >= 14) return CAR.trim;
      const glazed = cabin[row] || cabin[row + 1];
      if (segment === 5 || segment === 10) return glazed ? CAR.glass : CAR.paint;
      if (segment >= 6 && segment <= 9) return cabin[row] !== cabin[row + 1] ? CAR.glass : CAR.paint;
      return CAR.paint;
    },
    "aPart",
    CAR.paint
  );
  const pieces = [body];
  const widthAt = (z) => {
    // The body's half width at `z`, between the two nearest stations.
    for (let i = 0; i < stations.length - 1; i += 1) {
      const [z0, w0] = stations[i];
      const [z1, w1] = stations[i + 1];
      if (z <= z0 && z >= z1) return w0 + ((w1 - w0) * (z0 - z)) / (z0 - z1 || 1);
    }
    return stations[0][1];
  };

  for (const z of axles) {
    const w = widthAt(z);
    for (const side of [-1, 1]) {
      const x = side * (w - 0.1);
      pieces.push(
        carPart(new CylinderGeometry(radius, radius, 0.24, 16).rotateZ(Math.PI / 2).translate(x, radius, z), CAR.tyre),
        carPart(new CylinderGeometry(radius * 0.62, radius * 0.62, 0.25, 12).rotateZ(Math.PI / 2).translate(x, radius, z), CAR.rim),
        carPart(new CylinderGeometry(radius * 0.2, radius * 0.2, 0.262, 8).rotateZ(Math.PI / 2).translate(x, radius, z), CAR.trim),
        // The shadow of the wheel arch round the tyre.
        carPart(new CylinderGeometry(radius * 1.22, radius * 1.22, 0.02, 18).rotateZ(Math.PI / 2).translate(side * (w - 0.005), radius * 1.03, z), CAR.trim)
      );
    }
  }

  const [front, frontW, frontLow, frontBelt] = stations[0];
  const [back, backW, backLow, backBelt] = stations[stations.length - 1];
  const headY = lamps.headY ?? (frontLow + frontBelt) / 2 + 0.03;
  const tailY = lamps.tailY ?? (backLow + backBelt) / 2 + 0.06;
  pieces.push(
    // Headlamps, a grille between them and a bumper below.
    carBox(frontW * 0.42, 0.1, 0.05, -frontW * 0.62, headY, front, CAR.head),
    carBox(frontW * 0.42, 0.1, 0.05, frontW * 0.62, headY, front, CAR.head),
    carBox(frontW * 0.7, 0.09, 0.04, 0, headY - 0.02, front, CAR.trim),
    carBox(frontW * 1.7, 0.1, 0.07, 0, frontLow + 0.06, front - 0.02, CAR.trim),
    // A bar of tail lamps, the number plate, the rear bumper.
    carBox(backW * 1.72, lamps.tailH ?? 0.07, 0.05, 0, tailY, back, CAR.tail),
    carBox(0.42, 0.11, 0.03, 0, backLow + 0.13, back - 0.01, CAR.plate),
    carBox(backW * 1.7, 0.1, 0.07, 0, backLow + 0.06, back + 0.02, CAR.trim),
    // A strip of light under the sills, for the cars that have one.
    carBox(1.5, 0.03, (front - back) * 0.7, 0, frontLow - 0.03, (front + back) / 2, CAR.neon)
  );
  // Door mirrors, at the foot of the windscreen.
  const cowl = stations.findIndex((_, index) => cabin[index]);
  if (cowl > 0) {
    const [z, w, , belt] = stations[cowl - 1];
    for (const side of [-1, 1]) pieces.push(carBox(0.15, 0.09, 0.08, side * (w + 0.06), belt + 0.09, z - 0.12, CAR.paint));
  }
  for (const extra of extras) pieces.push(extra);

  const roofed = stations.filter((_, index) => cabin[index]);
  return {
    geometry: mergeGeometries(pieces),
    // Where the cabin starts and ends, and the height of the belt line.
    cabin: [roofed[0]?.[0] ?? 0, roofed[roofed.length - 1]?.[0] ?? 0],
    belt: roofed[0]?.[3] ?? frontBelt,
  };
}

// z, half width, underside, belt line, roof, half width of the roof.
const SEDAN = [
  [2.25, 0.7, 0.38, 0.62, 0.66, 0],
  [2.1, 0.86, 0.3, 0.71, 0.75, 0],
  [1.55, 0.92, 0.27, 0.79, 0.83, 0],
  [0.92, 0.93, 0.27, 0.87, 0.91, 0],
  [0.28, 0.93, 0.27, 0.9, 1.38, 0.6],
  [-0.78, 0.93, 0.27, 0.92, 1.4, 0.62],
  [-1.45, 0.93, 0.27, 0.92, 0.96, 0],
  [-2.02, 0.9, 0.29, 0.9, 0.93, 0],
  [-2.2, 0.84, 0.34, 0.84, 0.87, 0],
  [-2.26, 0.74, 0.4, 0.74, 0.76, 0],
];

const HATCH = [
  [1.95, 0.68, 0.38, 0.64, 0.68, 0],
  [1.8, 0.84, 0.3, 0.73, 0.77, 0],
  [1.3, 0.9, 0.27, 0.81, 0.85, 0],
  [0.85, 0.9, 0.27, 0.88, 0.92, 0],
  [0.3, 0.9, 0.27, 0.92, 1.43, 0.6],
  [-1.25, 0.9, 0.27, 0.94, 1.45, 0.62],
  [-1.82, 0.88, 0.29, 0.95, 0.99, 0],
  [-1.95, 0.8, 0.36, 0.86, 0.89, 0],
];

const SUV = [
  [2.3, 0.74, 0.46, 0.82, 0.87, 0],
  [2.15, 0.92, 0.38, 0.92, 0.97, 0],
  [1.5, 0.98, 0.36, 0.99, 1.04, 0],
  [0.95, 0.98, 0.36, 1.05, 1.1, 0],
  [0.45, 0.98, 0.36, 1.08, 1.68, 0.7],
  [-1.7, 0.98, 0.36, 1.1, 1.7, 0.72],
  [-2.2, 0.96, 0.38, 1.1, 1.15, 0],
  [-2.34, 0.86, 0.46, 0.98, 1.02, 0],
];

const VAN = [
  [2.4, 0.8, 0.44, 0.9, 0.95, 0],
  [2.28, 0.96, 0.36, 1.02, 1.07, 0],
  [1.9, 1.0, 0.34, 1.08, 1.13, 0],
  [1.45, 1.0, 0.34, 1.1, 2.02, 0.82],
  [-2.3, 1.0, 0.34, 1.1, 2.06, 0.84],
  [-2.42, 0.94, 0.4, 1.06, 1.98, 0.8],
];

const SPORTS = [
  [2.3, 0.7, 0.3, 0.5, 0.53, 0],
  [2.1, 0.9, 0.24, 0.58, 0.61, 0],
  [1.4, 0.96, 0.22, 0.68, 0.71, 0],
  [0.55, 0.97, 0.22, 0.76, 0.8, 0],
  [-0.15, 0.97, 0.22, 0.8, 1.16, 0.56],
  [-0.85, 0.97, 0.22, 0.83, 1.17, 0.58],
  [-1.7, 0.98, 0.22, 0.85, 0.89, 0],
  [-2.15, 0.94, 0.26, 0.84, 0.87, 0],
  [-2.3, 0.82, 0.34, 0.76, 0.78, 0],
];

const BUS = [
  [5.4, 1.0, 0.5, 1.0, 1.06, 0],
  [5.25, 1.2, 0.4, 1.1, 2.9, 1.04],
  [-5.2, 1.2, 0.4, 1.1, 2.95, 1.06],
  [-5.4, 1.12, 0.48, 1.1, 2.86, 1.0],
];

/** Every kind of road vehicle: { geometry, cabin: [front z, back z], belt, length }. */
export function roadVehicles() {
  const spoiler = carBox(1.5, 0.04, 0.3, 0, 0.98, -2.12, CAR.paint);
  const taxiSign = [carBox(0.5, 0.16, 0.2, 0, 1.5, -0.2, CAR.sign), carBox(0.6, 0.03, 0.28, 0, 1.415, -0.2, CAR.trim)];
  const roofRack = [carBox(1.2, 0.03, 0.05, 0, 1.76, 0.1, CAR.trim), carBox(1.2, 0.03, 0.05, 0, 1.76, -1.4, CAR.trim), carBox(0.04, 0.03, 1.6, -0.6, 1.775, -0.65, CAR.trim), carBox(0.04, 0.03, 1.6, 0.6, 1.775, -0.65, CAR.trim)];
  const busSign = [carBox(1.6, 0.28, 0.05, 0, 2.6, 5.27, CAR.sign)];
  return {
    sedan: { ...wheeled({ stations: SEDAN, axles: [1.42, -1.36], radius: 0.33 }), length: 4.5 },
    taxi: { ...wheeled({ stations: SEDAN, axles: [1.42, -1.36], radius: 0.33, extras: taxiSign }), length: 4.5 },
    hatch: { ...wheeled({ stations: HATCH, axles: [1.22, -1.2], radius: 0.32 }), length: 3.9 },
    suv: { ...wheeled({ stations: SUV, axles: [1.45, -1.45], radius: 0.39, extras: roofRack, lamps: { tailH: 0.1 } }), length: 4.65 },
    van: { ...wheeled({ stations: VAN, axles: [1.6, -1.55], radius: 0.37, lamps: { tailH: 0.12 } }), length: 4.85 },
    sports: { ...wheeled({ stations: SPORTS, axles: [1.45, -1.4], radius: 0.34, extras: [spoiler] }), length: 4.6 },
    bus: { ...wheeled({ stations: BUS, axles: [3.4, -3.2], radius: 0.5, extras: busSign, lamps: { headY: 0.78, tailY: 0.9, tailH: 0.14 } }), length: 10.8 },
  };
}

// A flying vehicle: a slim pod with a bubble of glass, a fin, and a ring of light at each thruster.
const POD = [
  [2.0, 0.12, 0.02, 0.1, 0.13, 0],
  [1.7, 0.5, -0.1, 0.16, 0.2, 0],
  [1.0, 0.72, -0.2, 0.2, 0.25, 0],
  [0.45, 0.78, -0.24, 0.22, 0.62, 0.42],
  [-0.5, 0.8, -0.24, 0.24, 0.64, 0.44],
  [-1.2, 0.76, -0.22, 0.24, 0.3, 0],
  [-1.9, 0.5, -0.12, 0.2, 0.24, 0],
  [-2.1, 0.3, -0.02, 0.14, 0.17, 0],
];

export function flyerGeometry() {
  const cabin = POD.map(([, , , ys, yr]) => yr - ys > 0.25);
  const body = loft(
    POD.map(bodyRing),
    (row, segment) => {
      if (segment <= 1 || segment >= 14) return CAR.trim;
      const glazed = cabin[row] || cabin[row + 1];
      if (segment === 5 || segment === 10) return glazed ? CAR.glass : CAR.paint;
      if (segment >= 6 && segment <= 9) return cabin[row] !== cabin[row + 1] ? CAR.glass : CAR.paint;
      return CAR.paint;
    },
    "aPart",
    CAR.paint
  );
  const pieces = [body];
  for (const side of [-1, 1]) {
    pieces.push(
      // A thruster pod on a stub wing, its nozzle lit.
      carBox(0.5, 0.06, 0.5, side * 0.95, 0.0, -0.6, CAR.paint),
      carPart(new CylinderGeometry(0.2, 0.24, 0.9, 12).rotateX(Math.PI / 2).translate(side * 1.25, 0, -0.7), CAR.paint),
      carPart(new CylinderGeometry(0.17, 0.17, 0.04, 12).rotateX(Math.PI / 2).translate(side * 1.25, 0, -1.16), CAR.neon),
      carPart(new TorusGeometry(0.3, 0.03, 6, 16).rotateX(Math.PI / 2).translate(side * 1.25, -0.2, -0.3), CAR.neon)
    );
  }
  pieces.push(
    carBox(0.05, 0.4, 0.7, 0, 0.42, -1.7, CAR.paint),
    carBox(0.7, 0.05, 0.05, 0, 0.1, 2.0, CAR.head),
    carBox(0.8, 0.05, 0.05, 0, 0.14, -2.1, CAR.tail),
    carBox(0.16, 0.03, 2.2, 0, -0.25, 0, CAR.neon)
  );
  return mergeGeometries(pieces);
}

/** One carriage of an elevated train, 10.4 m long, facing +z: a rounded shell with a band of lit windows. */
export function trainGeometry() {
  const stations = [
    [5.2, 1.1, 0.5, 1.5, 2.4, 0.9],
    [5.0, 1.45, 0.3, 1.5, 3.05, 1.2],
    [-5.0, 1.45, 0.3, 1.5, 3.05, 1.2],
    [-5.2, 1.1, 0.5, 1.5, 2.4, 0.9],
  ];
  const body = loft(
    stations.map(bodyRing),
    (row, segment) => {
      if (segment <= 1 || segment >= 14) return CAR.trim;
      if (segment === 5 || segment === 10) return row === 1 ? CAR.sign : CAR.glass;
      if (segment >= 6 && segment <= 9) return row === 1 ? CAR.paint : CAR.glass;
      return CAR.paint;
    },
    "aPart",
    CAR.paint
  );
  return mergeGeometries([body, carBox(2.96, 0.1, 10.0, 0, 1.36, 0, CAR.neon), carBox(1.4, 0.12, 0.05, 0, 0.9, 5.21, CAR.head), carBox(1.4, 0.12, 0.05, 0, 0.9, -5.21, CAR.tail)]);
}

// Light that vehicles throw on what is round them, drawn by adding it to the picture.
export const BEAM = { headPool: 0, tailPool: 1, underGlow: 2, trail: 3, headFlare: 4, tailFlare: 5 };

const beam = (geometry, part) => tagged(geometry, "aPart", part);
const onRoad = (width, length, y, z, part) => {
  const geometry = new PlaneGeometry(width, length).rotateX(-Math.PI / 2).translate(0, y, z);
  const tag = beam(geometry.toNonIndexed(), part);
  return withUv(tag, geometry);
};
const upright = (width, height, x, y, z, part, back = false) => {
  const geometry = new PlaneGeometry(width, height);
  if (back) geometry.rotateY(Math.PI);
  geometry.translate(x, y, z);
  return withUv(beam(geometry.toNonIndexed(), part), geometry);
};

/** Puts back the texture coordinates that `tagged` took off: the light shapes are drawn from them. */
function withUv(target, source) {
  const plain = source.index ? source.toNonIndexed() : source;
  target.setAttribute("uv", plain.attributes.uv.clone());
  return target;
}

/** The light of a car `length` metres long: beams on the road ahead, a red wash behind, glare at the lamps, glow underneath. */
export function carLightGeometry(length = 4.5) {
  const half = length / 2;
  return mergeGeometries([
    onRoad(4.6, 13, 0.05, half + 6.2, BEAM.headPool),
    onRoad(3, 4, 0.05, -half - 1.4, BEAM.tailPool),
    onRoad(3, length + 1.2, 0.04, 0, BEAM.underGlow),
    upright(1.5, 1.0, -0.55, 0.62, half + 0.04, BEAM.headFlare),
    upright(1.5, 1.0, 0.55, 0.62, half + 0.04, BEAM.headFlare),
    upright(2.6, 0.9, 0, 0.8, -half - 0.04, BEAM.tailFlare, true),
  ]);
}

export function flyerLightGeometry() {
  return mergeGeometries([onRoad(0.7, 12, 0, -7.5, BEAM.trail), upright(1.6, 1.0, 0, 0.1, 2.06, BEAM.headFlare)]);
}

/** A soft shadow on the road under a vehicle `width` by `length` metres. */
export function shadowGeometry(width, length) {
  return new PlaneGeometry(width, length).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
}

// --- Robot citizens --------------------------------------------------------------
// aBody: the part (BODY), the limb it belongs to (0 none; ±1 a leg, ±2 an arm:
// the sign is the side it swings on), the height of the limb's top joint (hip or
// shoulder) and of its middle joint (knee or elbow).
export const BODY = { dark: 0, shell: 1, accent: 2, light: 3 };

const bodyPart = (geometry, part, limb = 0, top = 0, middle = 0) => tagged(geometry, "aBody", part, limb, top, middle);

/** A capsule standing between heights `from` and `to` at x, `round` its [cap, side] segments. */
const limbOf = (round) => (radius, from, to, x) => new CapsuleGeometry(radius, Math.max(0.01, to - from - radius * 2), round[0], round[1]).translate(x, (from + to) / 2, 0);

/**
 * A walking robot about 1.75 m tall, facing +z: jointed legs and arms, a
 * tapering torso with a light across its chest, and a head with a lit visor.
 * `build` 0 is slight, 1 heavy-set. `lean` makes it of fewer, flatter pieces,
 * for Low quality.
 */
export function walkerGeometry(build = 0, lean = false) {
  const wide = 1 + build * 0.3;
  const limb = limbOf(lean ? [1, 5] : [2, 6]);
  const ball = lean ? [5, 3] : [6, 4];
  const shell = (w, h, d, radius) => (lean ? new BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, radius));
  const hip = 0.88;
  const knee = 0.47;
  const shoulder = 1.44;
  const elbow = 1.14;
  const pieces = [];
  for (const side of [-1, 1]) {
    const x = side * 0.11 * wide;
    const leg = side;
    pieces.push(
      bodyPart(limb(0.068 * wide, knee - 0.02, hip + 0.04, x), BODY.shell, leg, hip, knee),
      bodyPart(new SphereGeometry(0.066 * wide, ball[0], ball[1]).translate(x, knee, 0), BODY.dark, leg, hip, knee),
      bodyPart(limb(0.052 * wide, 0.1, knee + 0.02, x), BODY.accent, leg, hip, knee),
      bodyPart(new BoxGeometry(0.11 * wide, 0.09, 0.25).translate(x, 0.045, 0.045), BODY.dark, leg, hip, knee)
    );
    const ax = side * (0.24 * wide + 0.045);
    const arm = side * 2;
    pieces.push(
      bodyPart(new SphereGeometry(0.082 * wide, ball[0], ball[1]).translate(ax, shoulder, 0), BODY.accent, 0, 0, 0),
      bodyPart(limb(0.047 * wide, elbow - 0.02, shoulder, ax), BODY.shell, arm, shoulder, elbow),
      bodyPart(new SphereGeometry(0.046 * wide, ball[0], ball[1]).translate(ax, elbow, 0), BODY.dark, arm, shoulder, elbow),
      bodyPart(limb(0.04 * wide, 0.88, elbow + 0.01, ax), BODY.shell, arm, shoulder, elbow),
      bodyPart(new SphereGeometry(0.05 * wide, ball[0], ball[1]).scale(0.8, 1.1, 1).translate(ax, 0.83, 0.01), BODY.dark, arm, shoulder, elbow)
    );
  }
  // Pelvis, a flexible waist, and a torso wider at the shoulders.
  pieces.push(
    bodyPart(new BoxGeometry(0.3 * wide, 0.17, 0.2).translate(0, 0.94, 0), BODY.shell),
    bodyPart(new CylinderGeometry(0.085 * wide, 0.095 * wide, 0.12, 8).translate(0, 1.07, 0), BODY.dark)
  );
  const torso = shell(0.44 * wide, 0.42, 0.25, 0.07);
  const positions = torso.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    // Narrower at the waist.
    const taper = 0.78 + 0.22 * (positions.getY(index) / 0.42 + 0.5);
    positions.setX(index, positions.getX(index) * taper);
    positions.setZ(index, positions.getZ(index) * (0.86 + 0.14 * (positions.getY(index) / 0.42 + 0.5)));
  }
  pieces.push(
    bodyPart(torso.translate(0, 1.33, 0), BODY.shell),
    // A light across the chest, a pack on the back.
    bodyPart(new BoxGeometry(0.24 * wide, 0.035, 0.02).translate(0, 1.41, 0.125), BODY.light),
    bodyPart(new BoxGeometry(0.26 * wide, 0.3, 0.1).translate(0, 1.33, -0.16), BODY.accent),
    bodyPart(new CylinderGeometry(0.04, 0.05, 0.07, 6).translate(0, 1.57, 0), BODY.dark),
    // The head: a rounded shell, a visor of light across the face, an aerial.
    bodyPart(shell(0.21, 0.23, 0.23, 0.085).translate(0, 1.71, 0), BODY.shell),
    bodyPart(new BoxGeometry(0.19, 0.065, 0.06).translate(0, 1.725, 0.094), BODY.light),
    bodyPart(new CylinderGeometry(0.035, 0.035, 0.03, 6).rotateZ(Math.PI / 2).translate(-0.112, 1.71, 0), BODY.accent),
    bodyPart(new CylinderGeometry(0.035, 0.035, 0.03, 6).rotateZ(Math.PI / 2).translate(0.112, 1.71, 0), BODY.accent),
    bodyPart(new CylinderGeometry(0.006, 0.006, 0.2, 5).translate(0.07, 1.92, -0.03), BODY.dark),
    bodyPart(new SphereGeometry(0.014, 5, 3).translate(0.07, 2.02, -0.03), BODY.light)
  );
  return mergeGeometries(pieces);
}

/** A hovering drone, its body 0.3 m above the instance's origin: a shell with an eye, four rotor rings and a lamp underneath. */
export function droneGeometry() {
  const pieces = [
    bodyPart(new SphereGeometry(0.2, 10, 6).scale(1.15, 0.72, 1.3).translate(0, 0.3, 0), BODY.shell),
    bodyPart(new SphereGeometry(0.075, 6, 4).translate(0, 0.3, 0.24), BODY.dark),
    bodyPart(new SphereGeometry(0.04, 6, 4).translate(0, 0.3, 0.3), BODY.light),
    bodyPart(new CylinderGeometry(0.05, 0.03, 0.06, 6).translate(0, 0.14, 0), BODY.light),
    bodyPart(new CylinderGeometry(0.008, 0.008, 0.22, 5).translate(0, 0.52, -0.1), BODY.dark),
  ];
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    pieces.push(
      bodyPart(new BoxGeometry(0.03, 0.025, 0.34).rotateY(Math.atan2(x, z)).translate(x * 0.17, 0.33, z * 0.17), BODY.dark),
      bodyPart(new TorusGeometry(0.115, 0.014, 4, 10).rotateX(Math.PI / 2).translate(x * 0.3, 0.35, z * 0.3), BODY.accent),
      bodyPart(new CylinderGeometry(0.1, 0.1, 0.006, 8).translate(x * 0.3, 0.35, z * 0.3), BODY.dark)
    );
  }
  return mergeGeometries(pieces);
}

/** A delivery robot on six small wheels, facing +z: a rounded box with a lid, a strip of light and a flag on a whip aerial. */
export function courierGeometry() {
  const pieces = [];
  for (const x of [-0.29, 0.29]) {
    for (const z of [-0.26, 0, 0.26]) pieces.push(bodyPart(new CylinderGeometry(0.1, 0.1, 0.08, 8).rotateZ(Math.PI / 2).translate(x, 0.1, z), BODY.dark));
  }
  pieces.push(
    bodyPart(new RoundedBoxGeometry(0.54, 0.44, 0.74, 2, 0.09).translate(0, 0.42, 0), BODY.shell),
    bodyPart(new BoxGeometry(0.5, 0.05, 0.7).translate(0, 0.655, 0), BODY.accent),
    bodyPart(new BoxGeometry(0.36, 0.05, 0.02).translate(0, 0.5, 0.372), BODY.light),
    bodyPart(new BoxGeometry(0.3, 0.035, 0.02).translate(0, 0.44, -0.372), BODY.light),
    bodyPart(new SphereGeometry(0.035, 6, 4).translate(-0.14, 0.36, 0.37), BODY.dark),
    bodyPart(new SphereGeometry(0.035, 6, 4).translate(0.14, 0.36, 0.37), BODY.dark),
    bodyPart(new CylinderGeometry(0.006, 0.006, 0.75, 5).translate(-0.22, 1.05, -0.3), BODY.dark),
    bodyPart(new BoxGeometry(0.16, 0.1, 0.008).translate(-0.14, 1.36, -0.3), BODY.light)
  );
  return mergeGeometries(pieces);
}

/** A round soft shadow under a robot, `size` metres across. */
export function blobGeometry(size) {
  return new PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
}
