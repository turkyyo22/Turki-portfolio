import { BufferAttribute, BufferGeometry, Color, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3 } from "three";

import { FOG, LIGHTING, NOISE, OUTPUT } from "./shaders";

// The building kit: every solid piece of the city (walls, towers, cornices,
// awnings, tanks, railings, kerbs, road paint, benches…) is an instance of one of
// a few shapes below, drawn by one shared material. Each shape is a single
// instanced mesh, so the whole city is about ten draw calls however many
// buildings it has.
//
// A piece is placed by its base centre (x, y, z), its size (w across, h up,
// d deep), a turn around the vertical axis and an optional tilt. Its look comes
// from a style (below), a seed, a "lit" amount (the share of lit windows, or the
// brightness of a glowing piece), a pattern and a colour.

export const PART = {
  box: "box",
  cylinder: "cylinder",
  wedge: "wedge",
  plane: "plane",
  flat: "flat",
  escape: "escape",
  cone: "cone",
  ball: "ball",
};

export const STYLE = {
  wall: 0, // a wall with windows (the pattern picks the kind of windows)
  shop: 1, // a wall with shop fronts along the ground floor
  glass: 2, // a glass curtain wall
  plain: 3, // masonry in the given colour; the pattern picks the kind (MASONRY)
  metal: 4, // metal in the given colour; the pattern picks the finish (METAL)
  neon: 5, // light: the colour times `lit`; pattern 1 flickers
  pavement: 6, // a sidewalk slab: pavers on top, a kerb at the sides; the pattern picks the paving (PAVING)
  paint: 7, // road markings
  foliage: 8, // leaves; the pattern picks hedge, lawn or flower bed (PLANTING)
  fabric: 9, // awnings; pattern 1 is striped
  railing: 10, // bars, with gaps between them
  screen: 11, // an animated advertising screen
  vent: 12, // the grille of an air conditioner; pattern 1 is a roller shutter
  roof: 13, // a flat roof
  water: 14, // the pool of a fountain, lit from below in the given colour
  grate: 15, // ironwork set in the ground; the pattern picks the kind (IRONWORK)
  wood: 16, // planks
  signal: 17, // one lamp of a traffic light: pattern 0 red, 1 amber, 2 green
  lightbox: 18, // a backlit panel with lettering: an advert, a kiosk, a vending machine
  smoked: 19, // dark glass: a bus shelter, a kiosk window
  entrance: 20, // glass doors set back in a metal frame, the lobby lit behind them
};

// Window schemes for walls (the pattern of the wall and shop styles).
export const WINDOWS = {
  old: 0, // narrow, tall windows with sills and shutters, in brick or stucco
  block: 1, // regular windows in a concrete panel block
  office: 2, // long bands of glass between metal panels
  homes: 3, // flats with wide windows and balcony doors, in painted render
};

export const MASONRY = { concrete: 0, stone: 1, render: 2, granite: 3 };
export const METAL = { painted: 0, zinc: 1, ribbed: 2, chrome: 3 };
export const PAVING = { pavers: 0, radial: 1, slabs: 2 };
export const PLANTING = { hedge: 0, lawn: 1, flowers: 2 };
export const IRONWORK = { manhole: 0, drain: 1, tree: 2 };

// How high the shop fronts of the shop style reach, and how wide one shop is at most.
export const SHOP_HEIGHT = 4.4;
const SHOP_WIDTH = 3.6;

/**
 * What the material draws in shop `index` (counted across the front, from the
 * building's left) of a shop-style wall `width` metres wide with this `seed`:
 * whether it is shut, which of the palette's neon colours its sign has, and
 * where it is. The same sums are in the shader, so lights can be put in front
 * of the shops that match them.
 */
export function shopsOf(seed, width) {
  const key = Math.floor(Math.fround(seed));
  const count = Math.max(1, Math.floor(Math.fround(width) / Math.fround(SHOP_WIDTH)));
  const each = width / count;
  return Array.from({ length: count }, (_, index) => ({
    shut: (key * 3 + index * 5) % 9 < 2,
    neon: (key + index * 3) % 5,
    // Metres across the front from its centre, and the shop's width.
    x: -width / 2 + (index + 0.5) * each,
    width: each,
  }));
}

// --- Shapes ------------------------------------------------------------------
// Every vertex carries `aFacade`: how far across its face it lies (0 to 1),
// which size of the piece measures that face (0 width, 1 depth, 2 round), and
// the kind of face (0 side, 1 top, 2 bottom); and `aTangent`: the direction
// "across" grows in, seen from outside. The material turns these into metres on
// the facade, so a window grid fits any size of wall.

export function createShape() {
  const position = [];
  const normal = [];
  const facade = [];
  const tangent = [];
  const index = [];
  const shape = {
    vertex(p, n, u, axis, face, t) {
      position.push(...p);
      normal.push(...n);
      facade.push(u, axis, face);
      tangent.push(...t);
      return position.length / 3 - 1;
    },
    // Four corners, anticlockwise seen from outside, with u at each corner.
    quad(a, b, c, d, n, t, us, axis, face) {
      const first = shape.vertex(a, n, us[0], axis, face, t);
      shape.vertex(b, n, us[1], axis, face, t);
      shape.vertex(c, n, us[2], axis, face, t);
      shape.vertex(d, n, us[3], axis, face, t);
      index.push(first, first + 1, first + 2, first, first + 2, first + 3);
    },
    triangle(a, b, c) {
      index.push(a, b, c);
    },
    // An axis-aligned box between two corners, with all six faces.
    box(x0, y0, z0, x1, y1, z1) {
      const U = [0, 1, 1, 0];
      shape.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [1, 0, 0], U, 0, 0);
      shape.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-1, 0, 0], U, 0, 0);
      shape.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, 0, -1], U, 1, 0);
      shape.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, 0, 1], U, 1, 0);
      shape.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [1, 0, 0], U, 0, 1);
      shape.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [1, 0, 0], U, 0, 2);
    },
    build() {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
      geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normal), 3));
      geometry.setAttribute("aFacade", new BufferAttribute(new Float32Array(facade), 3));
      geometry.setAttribute("aTangent", new BufferAttribute(new Float32Array(tangent), 3));
      geometry.setIndex(index);
      return geometry;
    },
  };
  return shape;
}

/** A unit box standing on y = 0: x and z from -0.5 to 0.5, y from 0 to 1. */
function boxShape() {
  const shape = createShape();
  shape.box(-0.5, 0, -0.5, 0.5, 1, 0.5);
  return shape.build();
}

/** A ring of side faces from radius `bottom` at y = 0 to radius `top` at y = 1, and its caps. */
function roundShape(shape, segments, bottom, top) {
  const lean = Math.atan2(bottom - top, 1);
  const ny = Math.sin(lean);
  const nr = Math.cos(lean);
  const ring = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const n = [s * nr, ny, c * nr];
    const t = [c, 0, -s];
    ring.push([shape.vertex([s * bottom, 0, c * bottom], n, i / segments, 2, 0, t), shape.vertex([s * top, 1, c * top], n, i / segments, 2, 0, t)]);
  }
  for (let i = 0; i < segments; i += 1) {
    const [a, d] = ring[i];
    const [b, c] = ring[i + 1];
    shape.triangle(a, b, c);
    shape.triangle(a, c, d);
  }
  // Caps: the top facing up, the bottom down.
  const cap = (y, radius, up) => {
    if (!(radius > 0)) return;
    const n = [0, up ? 1 : -1, 0];
    const face = up ? 1 : 2;
    const centre = shape.vertex([0, y, 0], n, 0.5, 0, face, [1, 0, 0]);
    const rim = [];
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      rim.push(shape.vertex([x, y, Math.cos(angle) * radius], n, x + 0.5, 0, face, [1, 0, 0]));
    }
    for (let i = 0; i < segments; i += 1) {
      if (up) shape.triangle(centre, rim[i], rim[i + 1]);
      else shape.triangle(centre, rim[i + 1], rim[i]);
    }
  };
  cap(1, top, true);
  cap(0, bottom, false);
}

/** A unit cylinder standing on y = 0, 0.5 in radius, with smooth sides. */
function cylinderShape(segments = 20) {
  const shape = createShape();
  roundShape(shape, segments, 0.5, 0.5);
  return shape.build();
}

/** A unit cone standing on y = 0: 0.5 in radius at its base, a point at y = 1. */
function coneShape(segments = 16) {
  const shape = createShape();
  roundShape(shape, segments, 0.5, 0);
  return shape.build();
}

/** A unit ball resting on y = 0: 0.5 in radius, centred on y = 0.5. */
function ballShape(segments = 14, rings = 9) {
  const shape = createShape();
  const grid = [];
  for (let r = 0; r <= rings; r += 1) {
    const polar = (r / rings) * Math.PI;
    const y = Math.cos(polar);
    const radius = Math.sin(polar);
    const row = [];
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const n = [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
      row.push(shape.vertex([n[0] * 0.5, y * 0.5 + 0.5, n[2] * 0.5], n, i / segments, 2, 0, [Math.cos(angle), 0, -Math.sin(angle)]));
    }
    grid.push(row);
  }
  for (let r = 0; r < rings; r += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = grid[r + 1][i];
      const b = grid[r + 1][i + 1];
      const c = grid[r][i + 1];
      const d = grid[r][i];
      shape.triangle(a, b, c);
      shape.triangle(a, c, d);
    }
  }
  return shape.build();
}

/** An awning: a sloping canopy with a short valance, sticking out from a wall at z = 0 toward +z. */
function wedgeShape() {
  const shape = createShape();
  const U = [0, 1, 1, 0];
  const top = [0, 0.894, 0.447];
  shape.quad([-0.5, 0.5, 1], [0.5, 0.5, 1], [0.5, 1, 0], [-0.5, 1, 0], top, [1, 0, 0], U, 0, 0);
  shape.quad([-0.5, 0.3, 1], [0.5, 0.3, 1], [0.5, 0.5, 1], [-0.5, 0.5, 1], [0, 0, 1], [1, 0, 0], U, 0, 0);
  shape.quad([-0.5, 0.8, 0], [0.5, 0.8, 0], [0.5, 0.3, 1], [-0.5, 0.3, 1], [0, -0.894, -0.447], [1, 0, 0], U, 0, 2);
  shape.quad([0.5, 0.3, 1], [0.5, 0.8, 0], [0.5, 1, 0], [0.5, 0.5, 1], [1, 0, 0], [0, 0, -1], U, 1, 0);
  shape.quad([-0.5, 0.8, 0], [-0.5, 0.3, 1], [-0.5, 0.5, 1], [-0.5, 1, 0], [-1, 0, 0], [0, 0, 1], U, 1, 0);
  return shape.build();
}

/** A vertical panel facing +z (and, from behind, -z): signs, screens, railings, banners. */
function planeShape() {
  const shape = createShape();
  shape.quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], [0, 0, 1], [1, 0, 0], [0, 1, 1, 0], 0, 0);
  shape.quad([0.5, 0, 0], [-0.5, 0, 0], [-0.5, 1, 0], [0.5, 1, 0], [0, 0, -1], [-1, 0, 0], [1, 0, 0, 1], 0, 0);
  return shape.build();
}

/** A horizontal panel at y = 0 facing up: road markings, covers set in the ground. */
function flatShape() {
  const shape = createShape();
  shape.quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5], [0, 1, 0], [1, 0, 0], [0, 1, 1, 0], 0, 1);
  return shape.build();
}

/**
 * One storey of a fire escape, fixed to a wall at z = 0: a grated landing, a
 * railing round it and a flight of stairs down to the storey below. Unit size:
 * 1 wide, 1 storey high, 1 deep.
 */
function escapeShape() {
  const shape = createShape();
  shape.box(-0.5, 0, 0, 0.5, 0.025, 1); // landing
  shape.box(-0.5, 0.36, 0.95, 0.5, 0.375, 1); // rails
  shape.box(-0.5, 0.18, 0.95, 0.5, 0.19, 1);
  shape.box(0.485, 0.025, 0, 0.5, 0.375, 1);
  shape.box(-0.5, 0.025, 0, -0.485, 0.375, 1);
  for (const x of [-0.5, -0.17, 0.16, 0.485]) shape.box(x, 0.025, 0.95, x + 0.015, 0.36, 1); // posts
  // A flight of stairs down to the landing below, as a sloping stringer and treads.
  for (let step = 0; step < 8; step += 1) {
    const y = -0.94 + step * 0.115;
    const x = -0.42 + step * 0.105;
    shape.box(x, y, 0.08, x + 0.1, y + 0.012, 0.5);
  }
  return shape.build();
}

/**
 * Part of a flat ring lying on the ground, as a solid `height` metres thick:
 * from radius `inner` to `outer`, between the angles `from` and `to` (radians,
 * measured from +z toward +x). In metres, round its own centre: a paved ring
 * round a roundabout, with a gap where the street comes in. Use with kit.mesh().
 */
export function ringShape({ inner, outer, from = 0, to = Math.PI * 2, height, segments = 48 }) {
  const shape = createShape();
  const full = Math.abs(to - from) >= Math.PI * 2 - 1e-6;
  const point = (radius, angle, y) => [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
  for (let i = 0; i < segments; i += 1) {
    const a0 = from + ((to - from) * i) / segments;
    const a1 = from + ((to - from) * (i + 1)) / segments;
    const arcs = [a0, a1].map((angle) => angle * outer);
    // Top.
    shape.quad(point(inner, a0, height), point(outer, a0, height), point(outer, a1, height), point(inner, a1, height), [0, 1, 0], [1, 0, 0], [0, 0, 0, 0], 0, 1);
    // Outer wall, and the inner one (the kerb round the road).
    const n0 = [Math.sin(a0), 0, Math.cos(a0)];
    const n1 = [Math.sin(a1), 0, Math.cos(a1)];
    const t0 = [Math.cos(a0), 0, -Math.sin(a0)];
    const t1 = [Math.cos(a1), 0, -Math.sin(a1)];
    const outerA = shape.vertex(point(outer, a0, 0), n0, arcs[0], 0, 0, t0);
    const outerB = shape.vertex(point(outer, a1, 0), n1, arcs[1], 0, 0, t1);
    const outerC = shape.vertex(point(outer, a1, height), n1, arcs[1], 0, 0, t1);
    const outerD = shape.vertex(point(outer, a0, height), n0, arcs[0], 0, 0, t0);
    shape.triangle(outerA, outerB, outerC);
    shape.triangle(outerA, outerC, outerD);
    if (inner > 0) {
      const back = (n) => n.map((value) => -value);
      const innerA = shape.vertex(point(inner, a1, 0), back(n1), arcs[1], 0, 0, back(t1));
      const innerB = shape.vertex(point(inner, a0, 0), back(n0), arcs[0], 0, 0, back(t0));
      const innerC = shape.vertex(point(inner, a0, height), back(n0), arcs[0], 0, 0, back(t0));
      const innerD = shape.vertex(point(inner, a1, height), back(n1), arcs[1], 0, 0, back(t1));
      shape.triangle(innerA, innerB, innerC);
      shape.triangle(innerA, innerC, innerD);
    }
  }
  if (!full) {
    // The two ends, where the ring is cut.
    for (const [angle, sign] of [[from, -1], [to, 1]]) {
      const n = [Math.cos(angle) * sign, 0, -Math.sin(angle) * sign];
      const t = [Math.sin(angle) * sign, 0, Math.cos(angle) * sign];
      const corners = [point(inner, angle, 0), point(outer, angle, 0), point(outer, angle, height), point(inner, angle, height)];
      if (sign < 0) shape.quad(corners[0], corners[1], corners[2], corners[3], n, t, [0, outer - inner, outer - inner, 0], 0, 0);
      else shape.quad(corners[1], corners[0], corners[3], corners[2], n, t, [0, outer - inner, outer - inner, 0], 0, 0);
    }
  }
  return shape.build();
}

// `low` gives the round shapes fewer sides.
const SHAPES = {
  [PART.box]: boxShape,
  [PART.cylinder]: (low) => cylinderShape(low ? 12 : 20),
  [PART.wedge]: wedgeShape,
  [PART.plane]: planeShape,
  [PART.flat]: flatShape,
  [PART.escape]: escapeShape,
  [PART.cone]: (low) => coneShape(low ? 10 : 16),
  [PART.ball]: (low) => (low ? ballShape(10, 6) : ballShape(14, 9)),
};

// --- The material ------------------------------------------------------------

const VERTEX = /* glsl */ `
attribute vec3 aFacade;
attribute vec3 aTangent;
attribute vec4 aLook;
attribute vec3 aTint;
flat varying vec4 vLook;
flat varying vec3 vTint;
flat varying vec3 vSize;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vFacade;
varying float vDepth;
void main() {
  vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vSize = size;
  vLook = aLook;
  vTint = aTint;
  vLocal = position;
  float faceWidth = aFacade.y < 0.5 ? size.x : (aFacade.y < 1.5 ? size.z : 3.14159 * size.x);
  // Across and up the face in metres, and the face's width.
  vFacade = vec3(aFacade.x * faceWidth, position.y * size.y, aFacade.z > 0.5 ? -aFacade.z : faceWidth);
  mat3 placed = mat3(modelMatrix) * mat3(instanceMatrix);
  vNormal = normalize(placed * (normal / max(size * size, vec3(1e-6))));
  vTangent = normalize(placed * aTangent);
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uNeon[5];
uniform sampler2D uShopNames;
flat varying vec4 vLook;
flat varying vec3 vTint;
flat varying vec3 vSize;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vFacade;
varying float vDepth;
${FOG}
${NOISE}
${LIGHTING}

const vec3 WARM = vec3(1.0, 0.72, 0.42);
const vec3 COOL = vec3(0.72, 0.84, 1.0);

// Set once per pixel in main().
vec3 gView;     // from the surface to the camera
vec3 gRay;      // the view ray in the face's own frame: x across, y up, z out of the wall (negative looking at it)
vec2 gPixel;    // metres of the face per pixel, across and up
float gSpan;    // the larger of the two

// The look of the surface, filled in by the material functions below.
vec3 sAlbedo;
vec3 sGlow;
float sHeight;
float sRough;
float sMetal;
float sOpen;

vec3 neonTone(float index) {
  return uNeon[int(mod(floor(index), 5.0) + 0.5)];
}

// The colour of the light in a room: mostly warm, some cool, a few tinted by a screen or a neon sign.
vec3 lampColor(float pick) {
  if (pick < 0.62) return WARM;
  if (pick < 0.88) return COOL;
  return mix(WARM, neonTone(pick * 61.0), 0.6);
}

// Blocky made-up lettering for signs seen from across the street: 1 on a stroke.
// 'uv' runs 0 to 1 over the text, 'count' is how many letters fit across and
// 'size' the height of the text in metres.
float lettering(vec2 uv, float count, float seed, float size) {
  float across = uv.x * count;
  float glyph = floor(across);
  vec2 g = vec2((fract(across) - 0.14) / 0.72, (uv.y - 0.12) / 0.76);
  if (g.x < 0.0 || g.x > 1.0 || g.y < 0.0 || g.y > 1.0) return 0.0;
  vec2 dot5 = floor(g * vec2(3.0, 5.0));
  float on = step(0.45, hash21(dot5 + vec2(glyph * 7.0 + seed, seed * 1.3)));
  // A stem down one side keeps the shapes reading as letters.
  on = max(on, step(dot5.x, 0.5) * step(0.3, hash21(vec2(glyph + seed, dot5.y))));
  float gap = step(0.86, hash21(vec2(glyph, seed * 3.1)));
  float sharp = resolved(gSpan, size * 0.2);
  return mix(0.42, on * (1.0 - gap), sharp);
}

// A panel set 'depth' metres back into the wall, seen through an opening 'size'
// metres across and high. 'p' is the point on the wall, measured from the
// opening's lower left corner. Returns how much of the pixel lies in the opening.
// 'q' is where the view ray meets the panel, and 'reveal' says what it meets
// first: 0 the panel, 1 a side of the opening, 2 its sill, 3 the underside of its head.
float recess(vec2 p, vec2 size, float depth, out vec2 q, out float reveal) {
  vec2 shift = gRay.xy * (depth / max(-gRay.z, 0.16)) * resolved(gSpan, depth * 0.35);
  q = p + shift;
  reveal = 0.0;
  if (q.y < 0.0) reveal = 2.0;
  else if (q.y > size.y) reveal = 3.0;
  else if (q.x < 0.0 || q.x > size.x) reveal = 1.0;
  return boxMask(p, vec2(0.0), size, gPixel);
}

// The room behind a pane, seen through it: interior mapping. 'p' is the point on
// the pane in metres from its centre and 'size' the pane. 'kind' 0 is a home,
// 1 an office floor, 2 a shop.
vec3 roomBehind(vec2 p, vec2 size, float seed, vec3 lamp, float on, int kind) {
#ifdef LOW
  return lamp * on * (0.45 + 0.4 * clamp(p.y / size.y + 0.5, 0.0, 1.0)) + vec3(0.004, 0.005, 0.012);
#else
  vec3 d = gRay;
  vec3 inv = 1.0 / max(abs(d), vec3(1e-4));
  float halfWidth = size.x * 0.5 + (kind == 1 ? 4.0 : 0.7) + seed * 0.8;
  float floorY = -size.y * 0.5 - (kind == 2 ? 0.45 : 0.9);
  float ceilY = size.y * 0.5 + (kind == 1 ? 0.22 : 0.38);
  float back = kind == 1 ? 7.0 + seed * 6.0 : (kind == 2 ? 4.2 + seed * 2.4 : 2.6 + seed * 2.2);
  float tx = (halfWidth - p.x * sign(d.x)) * inv.x;
  float ty = (d.y > 0.0 ? ceilY - p.y : p.y - floorY) * inv.y;
  float tz = back * inv.z;
  float t = min(tx, min(ty, tz));
  vec3 h = vec3(p, 0.0) + d * t;
  vec3 wall = mix(vec3(0.62, 0.56, 0.48), vec3(0.42, 0.48, 0.58), fract(seed * 13.7));
  float sharp = resolved(gSpan, 0.25);
  vec3 c;
  if (t == tz) {
    c = wall;
    float up = h.y - floorY;
    if (kind == 2) {
      // Shelves of goods along the back of a shop.
      vec2 slot = vec2(h.x / 0.26, up / 0.46);
      float board = stripes(slot.y, 0.84, fwidth(slot.y));
      float item = stripes(slot.x, 0.8, fwidth(slot.x));
      vec3 hue = 0.5 + 0.5 * cos(6.283 * (hash21(floor(slot) + seed * 9.0) + vec3(0.0, 0.33, 0.67)));
      vec3 goods = mix(vec3(0.42, 0.4, 0.38), hue, 0.38) * (0.45 + 0.4 * hash21(floor(slot) * 1.7 + 4.0));
      c = mix(wall * 0.22, mix(wall * 0.7, goods, sharp * item), board * step(up, 2.5));
    } else if (kind == 1) {
      // Partitions and doors at the back of an office floor.
      float door = boxMask(vec2(fract(h.x / 3.2), up), vec2(0.3, 0.0), vec2(0.62, 2.1), vec2(0.01));
      c = mix(wall * 0.8, wall * 0.35, door * sharp);
    } else {
      // Furniture against the back wall, and a picture or a screen above it.
      float low = step(up, 0.85) * step(abs(h.x - (seed - 0.5) * 1.6), 0.95);
      c = mix(c, wall * 0.22, low);
      float frame = boxMask(h.xy, vec2(-0.5 + seed, floorY + 1.3), vec2(0.3 + seed, floorY + 1.9), vec2(0.015));
      c = mix(c, mix(vec3(0.95, 0.9, 0.8), neonTone(seed * 37.0) * 1.6, step(0.7, seed)), frame * 0.7 * sharp);
    }
  } else if (t == tx) {
    c = wall * 0.72;
  } else if (d.y > 0.0) {
    // The ceiling: a lamp over a home's table, rows of light panels in an office or a shop.
    if (kind == 0) {
      vec2 lampAt = h.xz + vec2(0.0, back * 0.45);
      c = vec3(1.05) * (0.55 + 0.6 * exp(-dot(lampAt, lampAt) * 0.35));
    } else {
      vec2 tile = vec2(h.x / 1.5, -h.z / 2.2);
      float panel = boxMask(fract(tile), vec2(0.2, 0.3), vec2(0.8, 0.7), fwidth(tile) + 0.01);
      c = mix(vec3(0.5), vec3(1.7), panel * (0.4 + 0.6 * sharp));
    }
  } else {
    c = vec3(0.32, 0.25, 0.2) * (0.8 + 0.2 * stripes(h.x * 1.5, 0.5, fwidth(h.x * 1.5)));
    if (kind == 1) c = vec3(0.16, 0.17, 0.2);
  }
  float far = clamp(-h.z / (back + 0.5), 0.0, 1.0);
  c *= 1.0 - 0.45 * far;
  // A dark room: the glow of a screen left on, now and then.
  vec3 dark = c * vec3(0.012, 0.014, 0.03) + neonTone(seed * 53.0) * 0.03 * step(0.85, fract(seed * 31.0)) * (0.6 + 0.4 * sin(uTime * 7.0 + seed * 20.0));
  return mix(dark, c * lamp, on);
#endif
}

// Glass over what lies 'behind' it: the sky, the far city and the glow of the
// street show in the pane, the more so the more it is seen edge-on.
vec3 glazed(vec3 behind, vec3 n, float seed) {
  // No two panes sit quite true, so each mirrors a slightly different patch of sky.
  vec3 pane = normalize(n + normalize(vTangent) * (hash21(vec2(seed, 3.1)) - 0.5) * 0.06 + vec3(0.0, (hash21(vec2(seed, 7.7)) - 0.5) * 0.05, 0.0));
  float cosine = clamp(dot(pane, gView), 0.0, 1.0);
  float fresnel = 0.07 + 0.93 * pow(1.0 - cosine, 5.0);
  vec3 r = reflect(-gView, pane);
  vec3 mirrored = skyAround(r, 0.04);
#ifndef LOW
  // Down in the streets a pane mirrors the lit street across the road, not the sky.
  vec4 field = lightField(vWorld.xz + r.xz * 8.0, 2.0);
  float street = clamp(field.a * 1.4, 0.0, 1.0) * streetReach(vWorld.y) * (1.0 - smoothstep(0.05, 0.6, r.y));
  mirrored = mix(mirrored, field.rgb * 1.4 + uBounce * 0.4, street * 0.9);
#endif
  return behind * (1.0 - fresnel * 0.7) + mirrored * fresnel;
}

// --- Wall materials: each sets sAlbedo, sHeight (relief, metres) and sRough ---

// Brick, laid in courses with mortar between.
void brick(vec2 m, float seed, vec3 tint) {
  const vec2 size = vec2(0.44, 0.15);
  float row = floor(m.y / size.y);
  vec2 p = vec2(m.x / size.x + 0.5 * mod(row, 2.0), m.y / size.y);
  vec2 cell = fract(p);
  vec2 id = floor(p);
  float seen = resolved(gSpan, size.y * 0.5);
  vec2 edge = min(cell, 1.0 - cell) * size;
  float joint = 1.0 - smoothstep(0.011, 0.011 + gSpan, min(edge.x, edge.y));
  float tone = hash21(id + seed * 3.7);
  vec3 face = tint * (0.7 + 0.6 * tone) * mix(vec3(1.0), vec3(1.14, 0.94, 0.82), hash21(id * 1.7 + 9.0) * 0.6);
  vec3 mortar = tint * 0.35 + vec3(0.07, 0.065, 0.06);
  float grit = noise21(m * 34.0);
  sAlbedo = mix(tint, mix(face * (0.9 + 0.2 * grit), mortar, joint), seen);
  sHeight = seen * ((1.0 - joint) * 0.014 + grit * 0.003);
  sRough = 0.92;
}

// Concrete cast in panels a storey high: seams between them, the holes of the form ties, pores.
void concrete(vec2 m, float seed, vec3 tint, float storey) {
  vec2 size = vec2(2.4, storey);
  vec2 p = m / size;
  vec2 cell = fract(p);
  vec2 id = floor(p);
  vec2 edge = min(cell, 1.0 - cell) * size;
  float seam = (1.0 - smoothstep(0.012, 0.012 + gSpan, min(edge.x, edge.y))) * resolved(gSpan, 0.04);
  vec2 tie = abs(abs((cell - 0.5) * size) - size * 0.28);
  float hole = (1.0 - smoothstep(0.025, 0.04, length(tie))) * resolved(gSpan, 0.05);
  float pores = noise21(m * 9.0) * 0.5 + noise21(m * 31.0) * 0.5;
  float cloud = fbm(m * 0.45 + seed);
  sAlbedo = tint * (0.82 + 0.16 * hash21(id + seed) + 0.2 * cloud) * (0.92 + 0.16 * pores);
  sAlbedo = mix(sAlbedo, sAlbedo * 0.4, max(seam, hole));
  sHeight = pores * 0.003 * resolved(gSpan, 0.05) - seam * 0.014 - hole * 0.012;
  sRough = 0.9;
}

// Plaster or painted render: fine grain, a few patches where it was mended.
void render(vec2 m, float seed, vec3 tint) {
  float grain = noise21(m * 26.0) * 0.6 + noise21(m * 61.0) * 0.4;
  float cloud = fbm(m * 0.38 + seed * 1.7);
  float mended = smoothstep(0.62, 0.66, fbm(m * 0.21 + seed * 5.0));
  sAlbedo = tint * (0.86 + 0.24 * cloud) * (0.94 + 0.12 * grain);
  sAlbedo = mix(sAlbedo, sAlbedo * vec3(1.08, 1.05, 0.98) * 0.86, mended);
  sHeight = grain * 0.004 * resolved(gSpan, 0.04) + mended * 0.004;
  sRough = 0.88;
}

// Metal or stone cladding in panels: fine shadow gaps, each panel a shade apart, a soft sheen.
void cladding(vec2 m, float seed, vec3 tint, float bay, float storey) {
  vec2 size = vec2(bay, storey * 0.5);
  vec2 p = m / size;
  vec2 cell = fract(p);
  vec2 id = floor(p);
  vec2 edge = min(cell, 1.0 - cell) * size;
  float gap = (1.0 - smoothstep(0.008, 0.008 + gSpan, min(edge.x, edge.y))) * resolved(gSpan, 0.03);
  sAlbedo = tint * (0.9 + 0.2 * hash21(id + seed * 2.3)) * (0.95 + 0.1 * noise21(m * 3.0));
  sAlbedo = mix(sAlbedo, sAlbedo * 0.3, gap);
  sHeight = -gap * 0.012;
  sRough = 0.42 + 0.2 * hash21(id + 4.0);
  sMetal = 0.35;
}

// Dressed stone in blocks.
void ashlar(vec2 m, float seed, vec3 tint) {
  const vec2 size = vec2(1.1, 0.5);
  float row = floor(m.y / size.y);
  vec2 p = vec2(m.x / size.x + 0.5 * mod(row, 2.0), m.y / size.y);
  vec2 cell = fract(p);
  vec2 id = floor(p);
  vec2 edge = min(cell, 1.0 - cell) * size;
  float joint = (1.0 - smoothstep(0.012, 0.012 + gSpan, min(edge.x, edge.y))) * resolved(gSpan, 0.04);
  float grain = noise21(m * 18.0) * 0.5 + noise21(m * 47.0) * 0.5;
  sAlbedo = tint * (0.84 + 0.26 * hash21(id + seed)) * (0.92 + 0.16 * grain);
  sAlbedo = mix(sAlbedo, sAlbedo * 0.45, joint);
  sHeight = (1.0 - joint) * 0.012 * resolved(gSpan, 0.04) + grain * 0.003 * resolved(gSpan, 0.04);
  sRough = 0.86;
}

// Time and weather on a wall: soot washed down from the roof line, grime rising from the pavement.
void weather(vec2 m, float top, float seed) {
  float streak = fbm(vec2(m.x * 1.9 + seed, m.y * 0.09));
  float run = smoothstep(0.5, 0.82, streak) * smoothstep(top - 9.0, top, m.y) * 0.4;
  float foot = (1.0 - smoothstep(0.0, 2.4, m.y)) * (0.45 + 0.55 * noise21(vec2(m.x * 0.9 + seed, m.y * 2.0)));
  sAlbedo *= 1.0 - run - 0.38 * foot;
}

// The wall a scheme of windows is cut into.
void wallOf(int scheme, vec2 m, float seed, vec3 tint, float bay, float storey) {
  if (scheme == 0) {
    if (fract(seed * 0.37) < 0.62) brick(m, seed, tint);
    else render(m, seed, tint);
  } else if (scheme == 1) {
    concrete(m, seed, tint, storey);
  } else if (scheme == 2) {
    cladding(m, seed, tint, bay, storey);
  } else {
    render(m, seed, tint);
  }
}

// A facade of windows (and, for shops, shop fronts along the ground floor).
void facade(int scheme, bool shops, vec3 n) {
  float seed = vLook.y;
  float lit = vLook.z;
  vec2 m = vFacade.xy;
  float width = max(vFacade.z, 0.5);
  float height = vSize.y;
  float groundH = shops ? ${SHOP_HEIGHT.toFixed(1)} : 0.0;
  float floorH = scheme == 2 ? 3.6 : 3.2;
  float bayW = scheme == 0 ? 2.5 : (scheme == 1 ? 2.3 : (scheme == 2 ? 1.6 : 3.1));
  float bays = max(1.0, floor(width / bayW));
  float bay = width / bays;

  wallOf(scheme, m, seed, vTint, bay, floorH);
  weather(m, height, seed);
  vec3 wall = sAlbedo;

  if (shops && m.y < groundH) {
    // --- A row of shops: piers between them, a sign over each, glass set back behind ---
    float count = max(1.0, floor(width / ${SHOP_WIDTH.toFixed(1)}));
    float shopW = width / count;
    float shopId = floor(m.x / shopW);
    vec2 c = vec2(fract(m.x / shopW) * shopW, m.y);
    float key = floor(seed);
    bool shut = mod(key * 3.0 + shopId * 5.0, 9.0) < 1.5;
    vec3 signTone = neonTone(key + shopId * 3.0);
    float pick = hash21(vec2(shopId, seed * 7.0));

    // The stone base and the piers stand a little proud of the wall.
    float pier = 1.0 - boxMask(c, vec2(0.2, -1.0), vec2(shopW - 0.2, 9.0), gPixel);
    sAlbedo = mix(wall * 0.8, wall * 1.1, pier);
    sHeight += pier * 0.03;
    // A fascia across the top, with the shop's sign on it.
    vec2 bandLo = vec2(0.3, 3.24);
    vec2 bandSize = vec2(shopW - 0.6, 0.8);
    float band = boxMask(c, bandLo, bandLo + bandSize, gPixel);
    // The shop's name, from the texture of names: four times as wide as it is high, centred on the fascia.
    float textH = 0.56;
    float textW = min(textH * 4.0, bandSize.x - 0.2);
    vec2 textUv = (c - bandLo - vec2((bandSize.x - textW) * 0.5, (bandSize.y - textH) * 0.5)) / vec2(textW, textH);
    float inText = step(0.0, textUv.x) * step(textUv.x, 1.0) * step(0.0, textUv.y) * step(textUv.y, 1.0);
    float name = floor(hash21(vec2(shopId * 3.7, key)) * 31.99);
    vec2 nameUv = (vec2(mod(name, 4.0), 7.0 - floor(name / 4.0)) + clamp(textUv, 0.0, 1.0)) / vec2(4.0, 8.0);
    float letters = textureLod(uShopNames, nameUv, log2(max(gSpan * 256.0 / textW, 1.0))).r * inText;
    float boxed = step(0.5, pick);
    // Half the signs are lit boxes with dark letters, half are glowing letters on a dark board.
    vec3 lightUp = signTone * mix(letters * 1.9, (1.0 - letters * 0.85) * 1.05, boxed);
    sAlbedo = mix(sAlbedo, vec3(0.035), band);
    sRough = mix(sRough, 0.45, band);
    sGlow = lightUp * band * (shut ? 0.16 : 1.0);

    // The opening.
    vec2 oLo = vec2(0.34, 0.05);
    vec2 oSize = vec2(shopW - 0.68, 3.02);
    vec2 q;
    float reveal;
    if (shut) {
      // A roller shutter down over it: slats, a rail at the foot, a lock.
      float inside = boxMask(c, oLo, oLo + oSize, gPixel);
      float slat = stripes((c.y - oLo.y) / 0.085, 0.82, gPixel.y / 0.085);
      vec3 steel = mix(vec3(0.2, 0.21, 0.24), vec3(0.34, 0.35, 0.38), fract(pick * 7.3)) * (0.55 + 0.45 * slat);
      // Paint someone sprayed across it.
      float spray = smoothstep(0.55, 0.62, fbm(c * 0.9 + pick * 30.0)) * step(0.5, fract(pick * 3.7));
      steel = mix(steel, neonTone(pick * 23.0) * 0.5, spray * 0.7);
      float rail = boxMask(c, oLo, oLo + vec2(oSize.x, 0.16), gPixel);
      sAlbedo = mix(sAlbedo, mix(steel, vec3(0.1), rail), inside);
      sHeight += inside * slat * 0.012 * resolved(gSpan, 0.04);
      sRough = mix(sRough, 0.5, inside);
      sMetal = mix(sMetal, 0.8, inside);
      return;
    }
    float opening = recess(c - oLo, oSize, 0.3, q, reveal);
    vec3 lamp = mix(WARM, signTone, 0.3) * (0.5 + 0.34 * fract(pick * 11.0));
    if (reveal > 0.5) {
      // The sides of the doorway: stone, lit by the shop.
      vec3 side = wall * (reveal > 2.5 ? 0.55 : (reveal > 1.5 ? 1.15 : 0.8));
      sAlbedo = mix(sAlbedo, side, opening);
      sGlow += side * lamp * 0.6 * opening;
      sHeight *= 1.0 - opening;
      return;
    }
    // On the set-back front: a glass door at one end, windows over a low wall for the rest.
    float doorX = pick < 0.5 ? 0.12 : oSize.x - 1.2;
    float inDoor = step(doorX, q.x) * step(q.x, doorX + 1.08);
    vec2 pixel = gPixel;
    float sharp = resolved(gSpan, 0.08);
    // Frames: round the front, round the door, a transom, and uprights every so often.
    float uprights = max(1.0, floor((oSize.x - 1.2) / 1.5));
    float inPanes = clamp((q.x - (pick < 0.5 ? 1.2 : 0.0)) / max(oSize.x - 1.2, 0.3), 0.0, 1.0);
    float upright = 1.0 - smoothstep(0.028, 0.028 + pixel.x, abs(fract(inPanes * uprights + 0.5) - 0.5) * (oSize.x - 1.2) / uprights);
    float border = 1.0 - boxMask(q, vec2(0.05), oSize - vec2(0.05), pixel);
    float doorFrame = (1.0 - smoothstep(0.03, 0.03 + pixel.x, min(abs(q.x - doorX), abs(q.x - doorX - 1.08)))) + (1.0 - smoothstep(0.025, 0.025 + pixel.y, abs(q.y - 2.28))) * inDoor;
    float frame = clamp(border + upright * (1.0 - inDoor) + doorFrame, 0.0, 1.0) * sharp;
    float kick = (1.0 - inDoor) * (1.0 - smoothstep(0.5, 0.5 + pixel.y, q.y));
    // A long handle on the door.
    float handle = (1.0 - smoothstep(0.018, 0.018 + pixel.x, abs(q.x - doorX - (pick < 0.5 ? 0.92 : 0.16)))) * step(0.85, q.y) * step(q.y, 1.5) * sharp;
    vec3 inside = roomBehind(q - oSize * 0.5, oSize, fract(pick * 3.1), lamp, 1.0, 2);
    vec3 pane = glazed(inside, n, shopId + seed);
    float solid = clamp(frame + kick + handle, 0.0, 1.0);
    vec3 trim = mix(vec3(0.05, 0.055, 0.065), wall * 0.6, kick * (1.0 - frame));
    trim = mix(trim, vec3(0.55), handle);
    sAlbedo = mix(sAlbedo, mix(vec3(0.015), trim, solid), opening);
    sGlow += pane * (1.0 - solid) * opening;
    sRough = mix(sRough, mix(0.1, 0.4, solid), opening);
    sMetal = mix(sMetal, frame * 0.8, opening);
    sHeight *= 1.0 - opening;
    return;
  }

  // --- The floors above: a window to each bay ---
  float y = m.y - groundH;
  float row = floor(y / floorH);
  float top = groundH + (row + 1.0) * floorH;
  if (top > height - 0.4 || height < 2.5) return;
  float column = floor(m.x / bay);
  vec2 cellSize = vec2(bay, floorH);
  vec2 cell = vec2(fract(m.x / bay), fract(y / floorH)) * cellSize;
  vec2 lo;
  vec2 hi;
  if (scheme == 0) { lo = vec2(0.3, 0.24); hi = vec2(0.7, 0.86); }
  else if (scheme == 1) { lo = vec2(0.17, 0.3); hi = vec2(0.83, 0.82); }
  else if (scheme == 2) { lo = vec2(0.03, 0.3); hi = vec2(0.97, 0.94); }
  else { lo = vec2(0.12, 0.08); hi = vec2(0.66, 0.86); }
  lo *= cellSize;
  vec2 size = hi * cellSize - lo;
  // Faraway windows are smaller than a pixel: show their average instead of noise.
  float detail = clamp(1.6 - gSpan * 2.0, 0.0, 1.0);

  vec2 id = vec2(column, row);
  float life = hash21(id * 1.31 + seed * 5.0);
  float tick = floor(uTime * 0.11 + life * 30.0) * step(0.9, life);
  float on = step(hash21(id + seed * 17.0 + tick * 0.37), lit);
  on = mix(lit, on, detail);
  vec3 lamp = lampColor(hash21(id * 2.7 + seed)) * (0.75 + 0.5 * hash21(id + 3.3));

  // The sill, the surround, and the stain that runs down from the sill.
  vec2 p = cell - lo;
  float sill = boxMask(p, vec2(-0.12, -0.11), vec2(size.x + 0.12, 0.0), gPixel) * detail;
  float surround = (boxMask(p, vec2(-0.1), size + vec2(0.1), gPixel) - boxMask(p, vec2(0.0), size, gPixel)) * detail * (scheme == 2 ? 0.0 : 1.0);
  float drip = boxMask(vec2(p.x, 0.0), vec2(0.0, -1.0), vec2(size.x, 1.0), gPixel) * smoothstep(-1.5, -0.11, p.y) * step(p.y, -0.11) * (0.4 + 0.6 * noise21(vec2(m.x * 7.0, seed))) * detail;
  sAlbedo *= 1.0 - 0.28 * drip;
  sAlbedo = mix(sAlbedo, wall * 1.22 + 0.02, max(sill, surround * 0.7));
  sHeight += sill * 0.05 + surround * 0.022;

  vec2 q;
  float reveal;
  float depth = scheme == 2 ? 0.1 : (scheme == 0 ? 0.24 : 0.17);
  float opening = recess(p, size, depth, q, reveal);
  if (reveal > 0.5) {
    // The thickness of the wall round the window: its sill catches the sky, its head the lamp inside.
    vec3 side = wall * (reveal > 2.5 ? 0.5 : (reveal > 1.5 ? 1.25 : 0.72));
    sAlbedo = mix(sAlbedo, side, opening);
    sGlow = side * lamp * on * 0.35 * opening;
    sHeight *= 1.0 - opening;
    return;
  }
  // Old-town windows have shutters, some of them closed.
  if (scheme == 0 && hash21(id * 3.1 + seed) > 0.82) {
    float slats = 0.6 + 0.4 * stripes(q.y / 0.07, 0.6, gPixel.y / 0.07);
    float leaf = 1.0 - smoothstep(0.012, 0.012 + gPixel.x, abs(q.x - size.x * 0.5));
    sAlbedo = mix(sAlbedo, vTint * 0.55 * slats * (1.0 - 0.6 * leaf), opening);
    sRough = 0.7;
    sHeight *= 1.0 - opening;
    return;
  }
  // The frame and its bars.
  float border = 1.0 - boxMask(q, vec2(0.045), size - vec2(0.045), gPixel);
  float bars = 0.0;
  if (scheme == 0) bars = max(1.0 - smoothstep(0.02, 0.02 + gPixel.x, abs(q.x - size.x * 0.5)), 1.0 - smoothstep(0.02, 0.02 + gPixel.y, abs(q.y - size.y * 0.62)));
  else if (scheme == 1) bars = 1.0 - smoothstep(0.02, 0.02 + gPixel.x, abs(q.x - size.x * 0.5));
  else if (scheme == 3) bars = 1.0 - smoothstep(0.022, 0.022 + gPixel.x, abs(fract(q.x / size.x * 3.0 + 0.5) - 0.5) * size.x / 3.0);
  float frame = clamp(border + bars, 0.0, 1.0) * resolved(gSpan, 0.07);
  vec3 frameTone = scheme == 0 ? vTint * 0.4 : (scheme == 3 ? vec3(0.62, 0.63, 0.66) : vec3(0.07, 0.075, 0.09));

  // What the glass shows: the room, blinds or a curtain, and the sky mirrored in the pane.
  float sd = hash21(id + seed);
  vec3 room = roomBehind(q - size * 0.5, size, sd, lamp, on, 0);
  float cover = fract(sd * 9.1);
  if (cover > 0.72) {
    // Blinds, let part of the way down.
    float drop = 0.35 + 0.6 * fract(sd * 4.3);
    float slat = 0.72 + 0.28 * stripes(q.y / 0.055, 0.5, gPixel.y / 0.055);
    vec3 blind = mix(vec3(0.02, 0.022, 0.03), lamp * 0.55, on) * slat;
    room = mix(room, blind, step(size.y * (1.0 - drop), q.y));
  } else if (cover < 0.2) {
    // A curtain drawn across one side, glowing with the lamp behind it.
    float fold = 0.8 + 0.2 * sin(q.x * 38.0);
    float drawn = step(q.x, size.x * (0.25 + 0.3 * fract(sd * 6.1)));
    room = mix(room, mix(vec3(0.03, 0.025, 0.03), lamp * mix(vec3(0.9, 0.6, 0.5), vec3(0.6, 0.75, 0.9), fract(sd * 2.9)) * 0.5, on) * fold, drawn);
  }
  vec3 pane = glazed(room, n, sd * 50.0);
  sAlbedo = mix(sAlbedo, mix(vec3(0.012), frameTone, frame), opening);
  sGlow = pane * (1.0 - frame) * opening;
  sRough = mix(sRough, mix(0.08, 0.5, frame), opening);
  sHeight *= 1.0 - opening;
}

// A glass curtain wall: mullions standing proud of the glass, a band of dark
// glass at each floor, lit office floors behind, and the sky mirrored in it all.
void curtainWall(vec3 n) {
  float seed = vLook.y;
  float lit = vLook.z;
  vec2 m = vFacade.xy;
  float width = max(vFacade.z, 0.5);
  const float floorH = 3.7;
  const float panel = 1.55;
  vec2 size = vec2(panel, floorH);
  vec2 cell = vec2(fract(m.x / panel), fract(m.y / floorH)) * size;
  vec2 id = vec2(floor(m.x / panel), floor(m.y / floorH));
  float detail = clamp(1.6 - gSpan * 2.0, 0.0, 1.0);

  // The glass sits behind the mullions' faces, so from the side each mullion hides a strip of it.
  vec2 q;
  float reveal;
  recess(cell, size, 0.14, q, reveal);
  vec2 edge = min(cell, size - cell);
  float mullion = 1.0 - smoothstep(0.032, 0.032 + gPixel.x, edge.x);
  float transom = 1.0 - smoothstep(0.022, 0.022 + gPixel.y, edge.y);
  float metalwork = clamp(max(mullion, transom) + step(0.5, reveal), 0.0, 1.0) * resolved(gSpan, 0.1);
  float spandrel = 1.0 - smoothstep(0.92, 0.92 + gPixel.y * 1.5, q.y);

  // Whole floors (or stretches of them) light up together, as offices do.
  float zone = floor(id.x / 6.0);
  float on = step(hash21(vec2(zone, id.y) + seed * 3.0), lit);
  on = mix(lit, on, detail);
  vec3 lamp = lampColor(hash21(vec2(zone, id.y) + seed)) * mix(0.8, 1.15, hash21(vec2(zone + 4.0, id.y)));
  float sd = hash21(id + seed);
  vec2 paneSize = vec2(panel, floorH - 0.92);
  vec3 room = roomBehind(vec2(q.x, q.y - 0.92) - paneSize * 0.5, paneSize, sd, lamp, on, 1) * vTint * 1.7;
  // Blinds, here and there.
  if (fract(sd * 9.1) > 0.8) {
    float slat = 0.72 + 0.28 * stripes(q.y / 0.06, 0.5, gPixel.y / 0.06);
    room = mix(room, mix(vec3(0.02), lamp * vTint * 0.9, on) * slat, step(floorH - (floorH - 0.92) * (0.3 + 0.6 * fract(sd * 4.3)), q.y));
  }

  // Some towers carry light: a strip up each corner, a band every few floors, or a wall of moving colour.
  float flair = hash21(vec2(seed, 5.5));
  vec3 show = vec3(0.0);
  vec3 trim = vTint * 3.2 + 0.04;
  if (flair > 0.45) show += trim * (1.0 - smoothstep(0.1, 0.1 + gPixel.x, min(m.x, width - m.x))) * 0.9;
  if (fract(flair * 7.0) > 0.55) show += trim * (1.0 - smoothstep(0.05, 0.05 + gPixel.y, abs(cell.y - 0.5))) * step(mod(id.y, 6.0), 0.5) * 0.8;
  if (fract(flair * 13.0) > 0.78 && vSize.y > 40.0) {
    // A media wall: every pane a pixel of a slow pattern that climbs the tower.
    float inShow = boxMask(m, vec2(width * 0.14, vSize.y * 0.3), vec2(width * 0.86, vSize.y * 0.82), vec2(0.4));
    float beat = uTime * 0.6 + seed;
    float wave = 0.5 + 0.5 * sin(id.y * 0.7 - beat * 1.6 + sin(id.x * 0.9 + beat * 0.4) * 2.0);
    vec3 hue = mix(neonTone(seed), neonTone(seed + 2.0), 0.5 + 0.5 * sin(id.x * 0.5 + beat * 0.3));
    room = mix(room, hue * (0.25 + 1.5 * wave * wave), inShow * 0.85 * (1.0 - spandrel));
  }

  vec3 behind = mix(room, vTint * 0.03, spandrel);
  vec3 pane = glazed(behind, n, id.x * 7.0 + id.y * 3.0 + seed);
  sAlbedo = mix(vec3(0.01), vec3(0.11, 0.12, 0.14), metalwork);
  sGlow = pane * (1.0 - metalwork) + show;
  sRough = mix(0.06, 0.35, metalwork);
  sMetal = metalwork;
  sHeight = 0.0;
}

// The paving of a sidewalk or a square, seen from above. 'edge' is how far the point lies from the slab's nearest side.
void paving(int pattern, float seed, float edge) {
  vec2 g = vWorld.xz;
  float pixel = max(fwidth(g.x), fwidth(g.y));
  vec2 size;
  vec2 p;
  if (pattern == 1) {
    // Rings of stone round the middle of the square.
    vec2 from = vLocal.xz * vSize.xz;
    float radius = length(from);
    float ring = floor(radius / 0.7);
    float arc = max(6.0, floor(6.2832 * (ring + 0.5) * 0.7 / 0.9));
    p = vec2(atan(from.x, from.y) / 6.2832 * arc + 0.5 * mod(ring, 2.0), radius / 0.7);
    size = vec2(0.9, 0.7);
  } else if (pattern == 2) {
    size = vec2(1.2, 1.2);
    p = g / size;
  } else {
    size = vec2(0.42, 0.21);
    float row = floor(g.y / size.y);
    p = vec2(g.x / size.x + 0.5 * mod(row, 2.0), g.y / size.y);
  }
  vec2 cell = fract(p);
  vec2 id = floor(p);
  vec2 inset = min(cell, 1.0 - cell) * size;
  float seen = resolved(pixel, min(size.x, size.y) * 0.4);
  float joint = (1.0 - smoothstep(0.008, 0.008 + pixel, min(inset.x, inset.y))) * seen;
  float tone = hash21(id + seed + 3.0);
  float grain = noise21(g * 21.0);
  vec3 stone = vTint * mix(1.0, 0.74 + 0.5 * tone, seen) * (0.93 + 0.14 * grain);
  // A band of granite along the kerb.
  float kerb = 1.0 - smoothstep(0.3, 0.3 + pixel, edge);
  float kerbJoint = (1.0 - smoothstep(0.006, 0.006 + pixel, abs(edge - 0.3))) * resolved(pixel, 0.03);
  stone = mix(stone, vTint * 1.3 * (0.9 + 0.2 * noise21(g * 40.0)), kerb);
  joint = max(joint * (1.0 - kerb), kerbJoint);
  sAlbedo = mix(stone, stone * 0.38, joint);
  // Dark stains, and the gum of years.
  sAlbedo *= 0.82 + 0.3 * fbm(g * 0.33 + 9.0);
  float gum = step(0.985, hash21(floor(g * 9.0))) * resolved(pixel, 0.08);
  sAlbedo = mix(sAlbedo, sAlbedo * 0.45, gum);
  sHeight = ((1.0 - joint) * 0.007 + grain * 0.002) * seen;
  // Rain stands in the hollows.
  float puddle = smoothstep(0.58, 0.72, fbm(g * 0.13 + 4.0));
  sAlbedo *= 1.0 - 0.5 * puddle;
  sHeight *= 1.0 - puddle;
  sRough = mix(0.62, 0.05, puddle);
}

void main() {
  int style = int(vLook.x + 0.5);
  float seed = vLook.y;
  float lit = vLook.z;
  int pattern = int(vLook.w + 0.5);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  gView = normalize(cameraPosition - vWorld);
  bool top = vFacade.z < -0.5 && vFacade.z > -1.5;
  bool bottom = vFacade.z < -1.5;
  vec2 m = vFacade.xy;
  gPixel = fwidth(m) + 1e-5;
  gSpan = max(gPixel.x, gPixel.y);
  vec3 across = normalize(vTangent);
  vec3 upward = normalize(cross(n, across));
  gRay = vec3(dot(-gView, across), dot(-gView, upward), dot(-gView, n));
  vec2 ground = vWorld.xz;
  float groundPixel = max(fwidth(ground.x), fwidth(ground.y)) + 1e-5;

  sAlbedo = vTint;
  sGlow = vec3(0.0);
  sHeight = 0.0;
  sRough = 0.85;
  sMetal = 0.0;
  // Light gathers less where a wall meets the ground.
  sOpen = top || bottom || vSize.y < 2.0 ? 1.0 : 0.7 + 0.3 * smoothstep(0.0, 1.1, m.y);
  float alpha = 1.0;

  if (style == 5) {
    // Light. Pattern 1: an old tube that stutters now and then.
    float stutter = pattern == 1 ? step(0.92, hash21(vec2(floor(uTime * 9.0), seed))) : 0.0;
    vec3 color = vTint * lit * (1.0 - stutter * 0.7);
    gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
    ${OUTPUT}
    return;
  }

  if (style == 11) {
    // An advertising screen of light-emitting dots: shapes and lines of text that change every few seconds.
    float t = uTime * 0.45 + seed * 10.0;
    float scene = floor(t / 4.0);
    float mode = hash21(vec2(scene, seed));
    vec3 a = neonTone(hash21(vec2(scene + 3.0, seed)) * 5.0);
    vec3 b = neonTone(hash21(vec2(scene + 9.0, seed * 2.0)) * 5.0);
    vec2 extent = vec2(max(vFacade.z, 0.1), max(vSize.y, 0.1));
    // The picture is made of dots a hand apart.
    vec2 dots = m / 0.11;
    vec2 at = (floor(dots) + 0.5) * 0.11;
    vec2 uv = at / extent;
    float pick;
    if (mode < 0.34) pick = smoothstep(0.45, 0.55, fract(at.y * 0.5 - t * 0.6));
    else if (mode < 0.67) pick = 1.0 - smoothstep(0.0, 0.07, abs(length((uv - 0.5) * vec2(extent.x / extent.y, 1.0)) - fract(t * 0.35) * 0.75));
    else pick = step(0.55, hash21(floor(at * 1.1) + floor(t * 2.5)));
    vec3 color = mix(a * 0.2, b * 1.25, pick);
    // A line of lettering crosses the lower part.
    vec2 textUv = vec2(fract(uv.x * 0.6 + t * 0.03), (uv.y - 0.12) / 0.2);
    float text = textUv.y > 0.0 && textUv.y < 1.0 ? lettering(textUv, 14.0, scene + seed, extent.y * 0.2) : 0.0;
    color = mix(color, vec3(1.5), text * 0.85);
    float led = 1.0 - smoothstep(0.3, 0.5, length(fract(dots) - 0.5));
    color *= mix(1.0, 0.25 + 1.2 * led, resolved(gSpan, 0.05));
    vec2 border = min(uv, 1.0 - uv) * extent;
    color *= smoothstep(0.0, 0.2, min(border.x, border.y));
    gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
    ${OUTPUT}
    return;
  }

  if (style == 17) {
    // One lamp of a traffic light. The three take turns: green, amber, red.
    float beat = mod(uTime * 0.5 + floor(seed) * 3.0, 12.0);
    float on = pattern == 2 ? step(beat, 5.0) : (pattern == 1 ? step(5.0, beat) * step(beat, 6.2) : step(6.2, beat));
    vec3 color = vTint * mix(0.05, 2.4, on);
    gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
    ${OUTPUT}
    return;
  }

  if (style == 10) {
    // Railing: a top rail, a bottom rail and thin bars, with gaps between them.
    float bars = stripes(m.x / 0.13, 0.24, gPixel.x / 0.13);
    float rails = max(step(vSize.y - 0.06, m.y), step(m.y, 0.05));
    alpha = max(bars, rails);
    sRough = 0.45;
    sMetal = 0.9;
  } else if (top && (style <= 2 || style == 13)) {
    // A flat roof: strips of dark felt lapped over each other, gravel, a few puddles.
    float seams = (1.0 - smoothstep(0.02, 0.02 + groundPixel, abs(fract(ground.x * 0.4) - 0.5) / 0.4)) * resolved(groundPixel, 0.06);
    float gravel = noise21(ground * 14.0);
    sAlbedo = vec3(0.13, 0.13, 0.15) * (0.75 + 0.5 * fbm(ground * 0.6 + seed)) * (0.9 + 0.2 * gravel) * (1.0 - 0.35 * seams);
    // The parapet shades the edge of the roof.
    vec2 inset = (0.5 - abs(vLocal.xz)) * vSize.xz;
    sOpen = 0.55 + 0.45 * smoothstep(0.0, 1.4, min(inset.x, inset.y));
    float puddle = smoothstep(0.62, 0.74, fbm(ground * 0.21 + seed * 3.0));
    sRough = mix(0.9, 0.08, puddle);
    sHeight = gravel * 0.004 * resolved(groundPixel, 0.07) * (1.0 - puddle);
  } else if (bottom) {
    sAlbedo = vTint * 0.3;
  } else if (style == 0 || style == 1) {
    facade(pattern, style == 1, n);
  } else if (style == 2) {
    curtainWall(n);
  } else if (style == 3 || style == 13) {
    vec2 at = top ? ground : m;
    float span = top ? groundPixel : gSpan;
    gSpan = span;
    if (pattern == 1) {
      ashlar(at, seed, vTint);
    } else if (pattern == 2) {
      render(at, seed, vTint);
    } else if (pattern == 3) {
      // Granite: flecked, with a dull polish.
      float fleck = noise21(at * 60.0) * 0.6 + noise21(at * 23.0) * 0.4;
      sAlbedo = vTint * (0.82 + 0.36 * fleck);
      sRough = 0.38;
      sHeight = 0.0;
    } else {
      concrete(at, seed, vTint, 3.2);
    }
    if (!top && vSize.y > 5.0) weather(m, vSize.y, seed);
  } else if (style == 4) {
    sMetal = 1.0;
    if (pattern == 1) {
      // Zinc: dull, with the spangle of its crystals.
      sAlbedo = vTint * (0.8 + 0.4 * noise21(m * 23.0 + vWorld.xz * 3.0));
      sRough = 0.5;
    } else if (pattern == 2) {
      // Ribbed sheet.
      float rib = stripes(m.x / 0.16, 0.5, gPixel.x / 0.16);
      sAlbedo = vTint * (0.7 + 0.3 * rib);
      sHeight = rib * 0.014 * resolved(gSpan, 0.06);
      sRough = 0.45;
    } else if (pattern == 3) {
      sRough = 0.12;
    } else {
      // Paint over steel: a soft sheen, chipped here and there.
      float chip = smoothstep(0.7, 0.78, fbm(m * 2.3 + vWorld.xz * 0.7 + seed));
      sAlbedo = mix(vTint, vTint * 0.4 + vec3(0.05, 0.03, 0.02), chip);
      sMetal = 0.25 + 0.6 * chip;
      sRough = 0.38 + 0.3 * chip;
    }
  } else if (style == 6) {
    if (top) {
      vec2 inset = (0.5 - abs(vLocal.xz)) * vSize.xz;
      paving(pattern, seed, pattern == 1 ? 9.0 : min(inset.x, inset.y));
    } else {
      // The kerb: blocks of granite end to end.
      float block = (1.0 - smoothstep(0.008, 0.008 + gPixel.x, abs(fract(m.x / 1.1) - 0.5) * 1.1)) * resolved(gSpan, 0.03);
      sAlbedo = vTint * 1.25 * (0.88 + 0.24 * noise21(m * 40.0 + ground)) * (1.0 - 0.6 * block);
      sRough = 0.5;
    }
  } else if (style == 7) {
    // Road paint, worn thin where the tyres run.
    float wear = smoothstep(0.42, 0.78, fbm(ground * 1.9 + 3.0) * 0.7 + noise21(ground * 17.0) * 0.3);
    sAlbedo = mix(vTint * 0.85, vec3(0.03, 0.032, 0.04), wear * 0.75);
    sRough = 0.5;
    sGlow = vTint * 0.03 * (1.0 - wear);
  } else if (style == 8) {
    vec3 at = vLocal * vSize;
    if (pattern == 1 || pattern == 2) {
      // A lawn, or a bed of flowers, seen from above.
      float blades = noise21(ground * 26.0) * 0.6 + noise21(ground * 61.0) * 0.4;
      sAlbedo = vTint * (0.55 + 0.6 * fbm(ground * 0.7 + seed)) * (0.7 + 0.6 * blades);
      sHeight = blades * 0.02 * resolved(groundPixel, 0.05);
      if (pattern == 2) {
        vec2 bed = ground * 5.0;
        vec2 bloom = hash22(floor(bed) + seed);
        float petal = (1.0 - smoothstep(0.1, 0.2, length(fract(bed) - 0.2 - 0.6 * bloom))) * step(0.45, bloom.x) * resolved(groundPixel, 0.06);
        vec3 hue = neonTone(bloom.y * 5.0) * 0.6 + 0.25;
        sAlbedo = mix(sAlbedo, hue, petal);
        sGlow = hue * petal * 0.05;
      }
      sRough = 0.9;
    } else {
      float leaves = noise21(at.xz * 7.0 + at.y * 5.0 + seed * 7.0) * 0.6 + noise21(at.xy * 19.0 + at.z * 13.0) * 0.4;
      sAlbedo = vTint * (0.5 + 0.8 * leaves);
      sHeight = leaves * 0.05 * resolved(gSpan, 0.08);
      sGlow = vTint * lit * (0.4 + 0.6 * leaves);
      sRough = 0.8;
    }
  } else if (style == 9) {
    // Canvas, striped or plain, with the weave showing up close.
    float band = pattern == 1 ? stripes(m.x / 0.42, 0.5, gPixel.x / 0.42) : 1.0;
    float weave = noise21(m * 90.0);
    sAlbedo = mix(vec3(0.82, 0.8, 0.74), vTint, band) * (0.92 + 0.12 * weave);
    sRough = 0.95;
  } else if (style == 12) {
    if (pattern == 1) {
      // A roller shutter or a corrugated door.
      float slat = stripes(m.y / 0.09, 0.8, gPixel.y / 0.09);
      sAlbedo = vTint * (0.5 + 0.5 * slat) * (0.9 + 0.2 * noise21(m * 3.0 + seed));
      sHeight = slat * 0.012 * resolved(gSpan, 0.04);
      sRough = 0.5;
      sMetal = 0.7;
    } else {
      // An air conditioner: a slatted grille with a fan behind it.
      float grille = 0.55 + 0.45 * stripes(m.y * 14.0, 0.5, gPixel.y * 14.0);
      float side = max(vSize.y, 0.4);
      float fan = 1.0 - smoothstep(0.26, 0.3, length(vec2(fract(m.x / side) - 0.5, m.y / side - 0.5)));
      sAlbedo = vTint * mix(grille, 0.3, fan * step(0.5, abs(n.z) + abs(n.x)));
      sRough = 0.55;
      sMetal = 0.5;
    }
  } else if (style == 14) {
    // Water in a basin: ripples spreading from the jets, the glow of lamps set under the surface.
    vec2 from = vLocal.xz * vSize.xz;
    float radius = length(from);
    float ripples = sin(radius * 9.0 - uTime * 3.2) * 0.5 + sin(from.x * 5.3 + uTime * 1.7) * 0.25 + sin(from.y * 4.1 - uTime * 1.3) * 0.25 + noise21(from * 3.0 + uTime * 0.4) * 0.6;
    sHeight = ripples * 0.012;
    sAlbedo = vec3(0.004, 0.012, 0.018);
    sRough = 0.03;
    float lamps = 0.5 + 0.5 * cos(atan(from.x, from.y) * 6.0);
    float rim = smoothstep(vSize.x * 0.5 - 1.6, vSize.x * 0.5 - 0.3, radius);
    sGlow = vTint * lit * (0.25 + 0.5 * rim * lamps + 0.35 * exp(-radius * 0.5)) * (0.8 + 0.2 * ripples);
  } else if (style == 15) {
    // Ironwork set in the ground.
    vec2 from = vLocal.xz * vSize.xz;
    float radius = length(from);
    float slot;
    if (pattern == 1) slot = stripes(from.x / 0.07, 0.45, groundPixel / 0.07) * step(abs(from.y), vSize.z * 0.42);
    else if (pattern == 2) slot = stripes(radius / 0.1, 0.4, groundPixel / 0.1) * step(0.12, abs(fract(atan(from.x, from.y) / 6.2832 * 8.0) - 0.5));
    else slot = (1.0 - stripes(radius / 0.09, 0.62, groundPixel / 0.09)) * 0.6 + (1.0 - stripes(atan(from.x, from.y) / 6.2832 * 16.0, 0.7, 0.02)) * 0.4 * step(0.14, radius);
    slot *= resolved(groundPixel, 0.03);
    sAlbedo = mix(vTint, vec3(0.008), slot * (pattern == 0 ? 0.6 : 1.0));
    sHeight = -slot * 0.01;
    sRough = 0.5;
    sMetal = 0.9;
  } else if (style == 16) {
    // Planks.
    vec2 at = top ? ground : m;
    float span = top ? groundPixel : gSpan;
    float plank = floor(at.y / 0.14);
    float gap = (1.0 - smoothstep(0.006, 0.006 + span, abs(fract(at.y / 0.14) - 0.5) * 0.14)) * resolved(span, 0.03);
    float grain = noise21(vec2(at.x * 3.0 + plank * 7.0, at.y * 60.0));
    sAlbedo = vTint * (0.75 + 0.35 * hash21(vec2(plank, seed))) * (0.85 + 0.3 * grain) * (1.0 - 0.6 * gap);
    sHeight = -gap * 0.006 + grain * 0.002;
    sRough = 0.75;
  } else if (style == 18) {
    // A backlit panel: bands of colour and lines of lettering.
    vec2 extent = vec2(max(vFacade.z, 0.1), max(vSize.y, 0.1));
    vec2 uv = m / extent;
    vec3 a = vTint;
    vec3 b = neonTone(seed + 2.0);
    vec3 art = mix(a, b, smoothstep(0.35, 0.65, uv.y + 0.2 * sin(uv.x * 5.0 + seed)));
    if (pattern == 1) art = mix(a * 0.25, b, step(0.5, fract(uv.y * 3.0 + uv.x * 0.6 + seed)));
    float lines = floor(uv.y * 5.0);
    vec2 textUv = vec2(uv.x, fract(uv.y * 5.0));
    float text = lettering(textUv, max(3.0, floor(extent.x / (extent.y * 0.16))), seed + lines * 7.0, extent.y * 0.2) * step(0.5, hash21(vec2(lines, seed))) * step(0.08, uv.x) * step(uv.x, 0.92);
    vec3 color = mix(art * 0.9, vec3(1.25), text * 0.9) * lit;
    vec2 border = min(uv, 1.0 - uv) * extent;
    color *= smoothstep(0.0, 0.05, min(border.x, border.y));
    // The glass over it mirrors the street.
    sAlbedo = vec3(0.01);
    sGlow = glazed(color, n, seed);
    sRough = 0.08;
  } else if (style == 19) {
    // Dark glass.
    sAlbedo = vec3(0.008);
    sGlow = glazed(vTint * 0.04, n, seed);
    sRough = 0.05;
  } else if (style == 20) {
    // An entrance: glass doors set back in a metal frame, the lobby lit behind them.
    vec2 inner = vec2(max(vFacade.z, 0.1), max(vSize.y, 0.1)) - vec2(0.3, 0.16);
    sRough = 0.35;
    sMetal = 0.8;
    if (!top && !bottom && inner.x > 0.5) {
      vec2 q;
      float reveal;
      float opening = recess(m - vec2(0.15, 0.0), inner, 0.3, q, reveal);
      vec3 lamp = WARM * (0.5 + 0.55 * lit);
      if (reveal > 0.5) {
        vec3 side = vTint * (reveal > 2.5 ? 0.7 : 1.2);
        sAlbedo = mix(sAlbedo, side, opening);
        sGlow = side * lamp * 0.5 * opening;
      } else {
        // Leaves about a metre wide, with a transom over them when the doorway is tall.
        float leaves = max(2.0, floor(inner.x / 1.05));
        float leafW = inner.x / leaves;
        float inLeaf = fract(q.x / leafW) * leafW;
        float transomY = inner.y > 2.9 ? 2.35 : inner.y + 1.0;
        float bars = 1.0 - smoothstep(0.028, 0.028 + gPixel.x, min(inLeaf, leafW - inLeaf));
        bars = max(bars, 1.0 - smoothstep(0.028, 0.028 + gPixel.y, abs(q.y - transomY)));
        bars = max(bars, 1.0 - boxMask(q, vec2(0.04), inner - vec2(0.04), gPixel));
        // A long handle on each leaf, by the edge where it meets its pair.
        float meet = mod(floor(q.x / leafW), 2.0) < 0.5 ? leafW - inLeaf : inLeaf;
        float handle = (1.0 - smoothstep(0.014, 0.014 + gPixel.x, abs(meet - 0.14))) * step(0.9, q.y) * step(q.y, min(1.5, transomY));
        float solid = clamp(bars + handle, 0.0, 1.0) * resolved(gSpan, 0.08);
        vec3 inside = roomBehind(q - inner * 0.5, inner, fract(seed * 0.37), lamp, 1.0, 1);
        vec3 pane = glazed(inside, n, seed);
        sAlbedo = mix(sAlbedo, mix(vec3(0.012), mix(vTint, vec3(0.6), handle), solid), opening);
        sGlow = pane * (1.0 - solid) * opening;
        sRough = mix(sRough, mix(0.08, 0.35, solid), opening);
        sMetal = mix(sMetal, solid * 0.8, opening);
      }
    }
  }

  if (alpha < 1.0) {
#ifdef COVERAGE
    if (alpha < 0.02) discard;
#else
    // Without smoothing by coverage, thin bars are kept or dropped pixel by pixel in a fixed, even pattern.
    float sieve = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + 0.125);
    if (alpha <= sieve) discard;
    alpha = 1.0;
#endif
  }

#ifndef LOW
  if (sHeight != 0.0) n = bumped(n, vWorld, sHeight, 1.6);
#endif
  vec3 color = shade(sAlbedo, n, vWorld, gView, sRough, sMetal, sOpen) + sGlow;
  gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), alpha);
  ${OUTPUT}
}
`;

/**
 * The one material every piece of the kit is drawn with. `low` skips the rooms
 * behind windows, the relief of surfaces and the finer lighting; `coverage`
 * smooths the gaps in railings where the picture is drawn with multisampling.
 */
export function createKitMaterial(shared, { low = false, coverage = false } = {}) {
  const defines = {};
  if (low) defines.LOW = "";
  if (coverage) defines.COVERAGE = "";
  return new ShaderMaterial({
    defines,
    uniforms: { ...shared },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    alphaToCoverage: coverage,
  });
}

// --- Placing pieces ----------------------------------------------------------

// Pieces at least this tall and wide, standing on the ground, shade the street round them.
const SOLID_STYLES = new Set([STYLE.wall, STYLE.shop, STYLE.glass, STYLE.plain]);

/**
 * Collects pieces, then builds one instanced mesh per shape. `add` takes:
 * x, y, z (the base centre), w, h, d (size), turn (around the vertical axis),
 * tilt (around the piece's own x axis), style, seed, lit, pattern, color.
 * `mesh` adds a shape of its own (see ringShape), drawn with the same material.
 */
export function createKit({ scene, shared, low = false, coverage = false }) {
  const lists = new Map(Object.keys(SHAPES).map((part) => [part, []]));
  const singles = [];
  const footprints = [];
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler(0, 0, 0, "YXZ");
  const position = new Vector3();
  const scale = new Vector3();
  const black = new Color(0, 0, 0);

  const kit = {
    add(part, { x = 0, y = 0, z = 0, w = 1, h = 1, d = 1, turn = 0, tilt = 0, style = STYLE.plain, seed = 0, lit = 0, pattern = 0, color = black }) {
      if (!(w > 0 && h > 0 && d > 0)) return;
      lists.get(part).push(x, y, z, w, h, d, turn, tilt, style, seed, lit, pattern, color.r, color.g, color.b);
      if ((part === PART.box || part === PART.cylinder) && y < 0.6 && h >= 3 && w >= 3.5 && d >= 3.5 && tilt === 0 && SOLID_STYLES.has(style)) {
        footprints.push({ x, z, w, d, turn });
      }
    },

    /** A shape of its own, in metres round (x, y, z) and turned by `turn`. */
    mesh(geometry, { x = 0, y = 0, z = 0, turn = 0, style = STYLE.plain, seed = 0, lit = 0, pattern = 0, color = black }) {
      singles.push({ geometry, x, y, z, turn, look: [style, seed, lit, pattern], tint: [color.r, color.g, color.b] });
    },

    /** How many pieces have been added. */
    get count() {
      let total = singles.length;
      for (const list of lists.values()) total += list.length / 15;
      return total;
    },

    /** The ground covered by the large pieces added so far: [{ x, z, w, d, turn }]. */
    get footprints() {
      return footprints;
    },

    build() {
      const material = createKitMaterial(shared, { low, coverage });
      const meshes = [];
      for (const [part, list] of lists) {
        const count = list.length / 15;
        if (count === 0) continue;
        const geometry = SHAPES[part](low);
        const look = new Float32Array(count * 4);
        const tint = new Float32Array(count * 3);
        const mesh = new InstancedMesh(geometry, material, count);
        for (let i = 0; i < count; i += 1) {
          const o = i * 15;
          euler.set(list[o + 7], list[o + 6], 0);
          rotation.setFromEuler(euler);
          matrix.compose(position.set(list[o], list[o + 1], list[o + 2]), rotation, scale.set(list[o + 3], list[o + 4], list[o + 5]));
          mesh.setMatrixAt(i, matrix);
          look.set([list[o + 8], list[o + 9], list[o + 10], list[o + 11]], i * 4);
          tint.set([list[o + 12], list[o + 13], list[o + 14]], i * 3);
        }
        geometry.setAttribute("aLook", new InstancedBufferAttribute(look, 4));
        geometry.setAttribute("aTint", new InstancedBufferAttribute(tint, 3));
        mesh.frustumCulled = false;
        scene.add(mesh);
        meshes.push(mesh);
      }
      for (const single of singles) {
        const { geometry } = single;
        geometry.setAttribute("aLook", new InstancedBufferAttribute(new Float32Array(single.look), 4));
        geometry.setAttribute("aTint", new InstancedBufferAttribute(new Float32Array(single.tint), 3));
        const mesh = new InstancedMesh(geometry, material, 1);
        euler.set(0, single.turn, 0);
        rotation.setFromEuler(euler);
        mesh.setMatrixAt(0, matrix.compose(position.set(single.x, single.y, single.z), rotation, scale.set(1, 1, 1)));
        mesh.frustumCulled = false;
        scene.add(mesh);
        meshes.push(mesh);
      }
      lists.clear();
      singles.length = 0;
      return meshes;
    },
  };
  return kit;
}
