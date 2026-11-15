import { BufferAttribute, BufferGeometry, Color, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3 } from "three";

import { FOG, LIGHTING, NOISE, OUTPUT } from "./shaders";

// The building kit: every solid piece of the city (walls, towers, cornices,
// awnings, tanks, railings, kerbs, road paint…) is an instance of one of a few
// shapes below, drawn by one shared material. Each shape is a single instanced
// mesh, so the whole city is about ten draw calls however many buildings it has.
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
};

export const STYLE = {
  wall: 0, // a wall with windows (the pattern picks the kind of windows)
  shop: 1, // a wall with shop fronts along the ground floor
  glass: 2, // a glass curtain wall
  plain: 3, // stone, concrete or plaster in the given colour
  metal: 4, // painted metal, with a sheen from the moon
  neon: 5, // light: the colour times `lit`; pattern 1 flickers
  pavement: 6, // a sidewalk slab: tiles on top, a kerb at the sides
  paint: 7, // road markings
  foliage: 8, // leaves and hedges
  fabric: 9, // awnings; pattern 1 is striped
  railing: 10, // bars, with gaps between them
  screen: 11, // an animated advertising screen
  vent: 12, // the grille of an air conditioner
  roof: 13, // a flat roof
};

// Window schemes for walls (the pattern of the wall and shop styles).
export const WINDOWS = {
  old: 0, // narrow, tall windows with sills and shutters
  block: 1, // regular windows in a concrete or panel block
  office: 2, // long bands of glass
  homes: 3, // flats with wide windows and balcony doors
};

// --- Shapes ------------------------------------------------------------------
// Every vertex carries `aFacade`: how far across its face it lies (0 to 1),
// which size of the piece measures that face (0 width, 1 depth, 2 round), and
// the kind of face (0 side, 1 top, 2 bottom); and `aTangent`: the direction
// "across" grows in, seen from outside. The material turns these into metres on
// the facade, so a window grid fits any size of wall.

function createShape() {
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

/** A unit cylinder standing on y = 0, 0.5 in radius, with smooth sides. */
function cylinderShape(segments = 14) {
  const shape = createShape();
  const ring = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const n = [s, 0, c];
    const t = [c, 0, -s];
    ring.push([shape.vertex([s * 0.5, 0, c * 0.5], n, i / segments, 2, 0, t), shape.vertex([s * 0.5, 1, c * 0.5], n, i / segments, 2, 0, t)]);
  }
  for (let i = 0; i < segments; i += 1) {
    const [a, d] = ring[i];
    const [b, c] = ring[i + 1];
    shape.triangle(a, b, c);
    shape.triangle(a, c, d);
  }
  // Caps: the top facing up, the bottom down.
  const top = shape.vertex([0, 1, 0], [0, 1, 0], 0.5, 0, 1, [1, 0, 0]);
  const bottom = shape.vertex([0, 0, 0], [0, -1, 0], 0.5, 0, 2, [1, 0, 0]);
  const topRing = [];
  const bottomRing = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.sin(angle) * 0.5;
    const z = Math.cos(angle) * 0.5;
    topRing.push(shape.vertex([x, 1, z], [0, 1, 0], x + 0.5, 0, 1, [1, 0, 0]));
    bottomRing.push(shape.vertex([x, 0, z], [0, -1, 0], x + 0.5, 0, 2, [1, 0, 0]));
  }
  for (let i = 0; i < segments; i += 1) {
    shape.triangle(top, topRing[i], topRing[i + 1]);
    shape.triangle(bottom, bottomRing[i + 1], bottomRing[i]);
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

/** A horizontal panel at y = 0 facing up: road markings. */
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

const SHAPES = {
  [PART.box]: boxShape,
  [PART.cylinder]: cylinderShape,
  [PART.wedge]: wedgeShape,
  [PART.plane]: planeShape,
  [PART.flat]: flatShape,
  [PART.escape]: escapeShape,
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

vec3 neonPick(float pick) {
  if (pick < 0.2) return vec3(0.0, 0.85, 1.0);
  if (pick < 0.4) return vec3(1.0, 0.16, 0.6);
  if (pick < 0.6) return vec3(1.0, 0.62, 0.12);
  if (pick < 0.8) return vec3(0.55, 0.36, 1.0);
  return vec3(0.15, 0.95, 0.7);
}

// The colour of the light in a room: mostly warm, some cool, a few tinted by a screen or a neon sign.
vec3 lampColor(float pick) {
  if (pick < 0.62) return WARM;
  if (pick < 0.88) return COOL;
  return mix(WARM, neonPick(fract(pick * 7.3)), 0.6);
}

// The room behind a window, seen through the glass: interior mapping. 'cell' is
// the point on the window (0 to 1 across and up), 'size' the window in metres and
// 'ray' the view ray in face space (x across, y up, z out of the wall).
vec3 roomBehind(vec2 cell, vec2 size, vec3 ray, float seed, vec3 lamp, float on) {
#ifdef LOW
  return lamp * on * (0.5 + 0.5 * cell.y) + vec3(0.004, 0.005, 0.012);
#else
  vec3 d = ray;
  vec3 p = vec3((cell - 0.5) * size, 0.0);
  vec3 inv = 1.0 / max(abs(d), vec3(1e-4));
  float halfWidth = size.x * 0.5 + 0.7 + seed * 0.8;
  float floorY = -size.y * 0.5 - 0.9;
  float ceilY = size.y * 0.5 + 0.38;
  float back = 2.6 + seed * 2.2;
  float tx = (halfWidth - p.x * sign(d.x)) * inv.x;
  float ty = (d.y > 0.0 ? ceilY - p.y : p.y - floorY) * inv.y;
  float tz = back * inv.z;
  float t = min(tx, min(ty, tz));
  vec3 h = p + d * t;
  vec3 wall = mix(vec3(0.62, 0.56, 0.48), vec3(0.42, 0.48, 0.58), fract(seed * 13.7));
  vec3 c;
  if (t == tz) {
    c = wall;
    // Furniture against the back wall, and a picture or a screen above it.
    float low = step(h.y, floorY + 0.85) * step(abs(h.x - (seed - 0.5) * 1.6), 0.95);
    c = mix(c, wall * 0.22, low);
    float frame = boxMask(h.xy, vec2(-0.5 + seed, floorY + 1.3), vec2(0.3 + seed, floorY + 1.9), vec2(0.015));
    c = mix(c, mix(vec3(0.95, 0.9, 0.8), neonPick(seed) * 1.6, step(0.7, seed)), frame * 0.7);
  } else if (t == tx) {
    c = wall * 0.72;
  } else if (d.y > 0.0) {
    c = vec3(1.05) * (0.55 + 0.6 * exp(-dot(h.xz + vec2(0.0, back * 0.45), h.xz + vec2(0.0, back * 0.45)) * 0.35));
  } else {
    c = vec3(0.32, 0.25, 0.2) * (0.8 + 0.2 * step(0.5, fract(h.x * 1.5)));
  }
  float far = clamp(-h.z / (back + 0.5), 0.0, 1.0);
  c *= 1.0 - 0.45 * far;
  vec3 dark = c * vec3(0.012, 0.014, 0.03) + neonPick(seed) * 0.03 * step(0.85, fract(seed * 31.0)) * (0.6 + 0.4 * sin(uTime * 7.0 + seed * 20.0));
  return mix(dark, c * lamp, on);
#endif
}

// What a window shows: the room behind it, the sky reflected in the glass, and sometimes blinds.
vec3 windowGlass(vec2 cell, vec2 size, vec3 ray, vec3 view, vec3 n, float seed, vec3 lamp, float on) {
  vec3 color = roomBehind(cell, size, ray, seed, lamp, on);
  float blinds = step(0.72, fract(seed * 9.1));
  if (blinds > 0.5) {
    float drop = 0.35 + 0.6 * fract(seed * 4.3);
    float slat = 0.75 + 0.25 * step(0.5, fract(cell.y * size.y * 9.0));
    vec3 slatColor = mix(vec3(0.02, 0.022, 0.03), lamp * 0.55, on) * slat;
    color = mix(color, slatColor, step(1.0 - drop, cell.y));
  }
  float fresnel = 0.06 + 0.94 * pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 5.0);
  vec3 sky = mix(uSkyLight * 3.0, uBounce * 2.4, 0.5 + 0.5 * view.y);
  return color * (1.0 - fresnel * 0.6) + sky * fresnel;
}

// The view ray in face space: x across the face, y up, z out of it.
vec3 faceRay(vec3 view) {
  vec3 t = normalize(vTangent);
  vec3 n = normalize(vNormal);
  vec3 b = normalize(cross(n, t));
  vec3 ray = -view;
  return vec3(dot(ray, t), dot(ray, b), dot(ray, n));
}

// A facade of windows (and, for shops, shop fronts along the ground floor).
// Returns the wall's albedo in 'albedo' and the light of the windows in 'glow'.
void facade(int scheme, bool shops, vec3 view, vec3 n, out vec3 albedo, out vec3 glow, out float glassMask) {
  float seed = vLook.y;
  float lit = vLook.z;
  vec2 m = vFacade.xy;
  float width = max(vFacade.z, 0.5);
  float height = vSize.y;
  vec3 wall = vTint * (0.86 + 0.28 * noise21(m * vec2(0.9, 0.6) + seed * 13.0));
  albedo = wall;
  glow = vec3(0.0);
  glassMask = 0.0;

  float groundH = shops ? 4.4 : 0.0;
  float floorH = scheme == 2 ? 3.6 : 3.2;
  float bayW = scheme == 0 ? 2.5 : (scheme == 1 ? 2.3 : (scheme == 2 ? 1.6 : 3.1));
  float bays = max(1.0, floor(width / bayW));
  float bay = width / bays;
  vec2 pixel = fwidth(m);

  if (shops && m.y < groundH) {
    // Shop fronts: glass with a door, a lit sign band above, and shutters on closed shops.
    float shopW = width / max(1.0, floor(width / 3.6));
    vec2 cell = vec2(fract(m.x / shopW), m.y / groundH);
    float shopId = floor(m.x / shopW);
    float pick = hash21(vec2(shopId, seed * 7.0));
    bool open = pick < 0.78;
    vec3 neon = neonPick(fract(pick * 5.7));
    float front = boxMask(cell, vec2(0.06, 0.05), vec2(0.94, 0.72), pixel / vec2(shopW, groundH));
    float band = boxMask(cell, vec2(0.05, 0.78), vec2(0.95, 0.94), pixel / vec2(shopW, groundH));
    albedo = mix(wall * 0.75, vec3(0.05), front);
    if (open) {
      vec3 ray = faceRay(view);
      vec3 inside = roomBehind(vec2((cell.x - 0.06) / 0.88, cell.y / 0.72), vec2(shopW * 0.88, groundH * 0.72), ray, fract(pick * 3.1), mix(WARM, neon, 0.3) * (0.42 + 0.3 * fract(pick * 11.0)), 1.0);
      float mullion = 1.0 - lineAA(abs(cell.x - 0.5) * shopW, 0.05, pixel.x);
      glow = inside * front * mullion;
      glassMask = front;
      glow += neon * 1.25 * band;
    } else {
      float slats = 0.8 + 0.2 * step(0.5, fract(m.y * 5.0));
      albedo = mix(albedo, vec3(0.32, 0.33, 0.36) * slats, front);
      glow += neon * 0.25 * band;
    }
    albedo = mix(albedo, vec3(0.04), band);
    return;
  }

  float y = m.y - groundH;
  float row = floor(y / floorH);
  float top = groundH + (row + 1.0) * floorH;
  if (top > height - 0.4 || height < 2.5) return;
  vec2 cell = vec2(fract(m.x / bay), fract(y / floorH));
  float column = floor(m.x / bay);
  vec2 lo;
  vec2 hi;
  if (scheme == 0) { lo = vec2(0.3, 0.24); hi = vec2(0.7, 0.86); }
  else if (scheme == 1) { lo = vec2(0.17, 0.3); hi = vec2(0.83, 0.82); }
  else if (scheme == 2) { lo = vec2(0.03, 0.3); hi = vec2(0.97, 0.94); }
  else { lo = vec2(0.12, 0.08); hi = vec2(0.66, 0.86); }
  vec2 cellPixel = pixel / vec2(bay, floorH);
  float glass = boxMask(cell, lo, hi, cellPixel);
  float frameBand = boxMask(cell, lo - vec2(0.05, 0.035), hi + vec2(0.05, 0.035), cellPixel) - glass;
  float sill = boxMask(cell, vec2(lo.x - 0.07, lo.y - 0.06), vec2(hi.x + 0.07, lo.y - 0.015), cellPixel);
  // Faraway windows are smaller than a pixel: show their average instead of noise.
  float detail = clamp(1.6 - max(cellPixel.x * bay, cellPixel.y * floorH) * 2.0, 0.0, 1.0);

  vec2 id = vec2(column, row);
  float life = hash21(id * 1.31 + seed * 5.0);
  float tick = floor(uTime * 0.11 + life * 30.0) * step(0.9, life);
  float on = step(hash21(id + seed * 17.0 + tick * 0.37), lit);
  on = mix(lit, on, detail);
  vec3 lamp = lampColor(hash21(id * 2.7 + seed)) * (0.75 + 0.5 * hash21(id + 3.3));
  vec2 size = (hi - lo) * vec2(bay, floorH);
  vec2 inWindow = clamp((cell - lo) / (hi - lo), 0.0, 1.0);
  vec3 ray = faceRay(view);
  vec3 pane = windowGlass(inWindow, size, ray, view, n, hash21(id + seed), lamp, on);
  // Old-town windows have shutters, some of them closed.
  if (scheme == 0 && hash21(id * 3.1 + seed) > 0.82) {
    float slats = 0.75 + 0.25 * step(0.5, fract(cell.y * 18.0));
    albedo = mix(albedo, vTint * 0.6 * slats, glass);
    glass = 0.0;
  }
  albedo = mix(albedo, wall * 0.5, frameBand * detail);
  albedo = mix(albedo, wall * 1.35, sill * detail);
  albedo = mix(albedo, vec3(0.02), glass);
  glow = pane * glass;
  glassMask = glass;
}

// A glass curtain wall: mullions, spandrels at each floor, and lit floors behind the glass.
void curtainWall(vec3 view, vec3 n, out vec3 albedo, out vec3 glow) {
  float seed = vLook.y;
  float lit = vLook.z;
  vec2 m = vFacade.xy;
  float floorH = 3.7;
  float panel = 1.55;
  vec2 cell = vec2(fract(m.x / panel), fract(m.y / floorH));
  vec2 id = vec2(floor(m.x / panel), floor(m.y / floorH));
  vec2 pixel = fwidth(m) / vec2(panel, floorH);
  float mullion = lineAA(min(cell.x, 1.0 - cell.x) * panel, 0.05, fwidth(m.x));
  float spandrel = boxMask(cell, vec2(-1.0, -0.01), vec2(2.0, 0.24), pixel);
  // Whole floors (or stretches of them) light up together, as offices do.
  float zone = floor(id.x / 6.0);
  float on = step(hash21(vec2(zone, id.y) + seed * 3.0), lit);
  vec3 lamp = lampColor(hash21(vec2(zone, id.y) + seed)) * mix(0.8, 1.15, hash21(vec2(zone + 4.0, id.y)));
  vec3 ray = faceRay(view);
  vec3 pane = windowGlass(vec2(cell.x, (cell.y - 0.24) / 0.76), vec2(panel, floorH * 0.76), ray, view, n, hash21(id + seed), lamp, on);
  vec3 tint = vTint;
  albedo = mix(vec3(0.04), tint * 0.5, spandrel);
  albedo = mix(albedo, vec3(0.16, 0.18, 0.22), mullion);
  glow = pane * tint * 1.6 * (1.0 - spandrel) * (1.0 - mullion);
}

void main() {
  int style = int(vLook.x + 0.5);
  float seed = vLook.y;
  float lit = vLook.z;
  int pattern = int(vLook.w + 0.5);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 view = normalize(cameraPosition - vWorld);
  bool top = vFacade.z < -0.5 && vFacade.z > -1.5;
  bool bottom = vFacade.z < -1.5;

  // Light gathers less in corners and close to the ground.
  float occlusion = (0.55 + 0.45 * smoothstep(0.0, 3.5, vWorld.y)) * (0.72 + 0.28 * smoothstep(0.0, 1.6, vFacade.y));

  vec3 albedo = vTint;
  vec3 glow = vec3(0.0);
  float shine = 0.0;

  if (style == 5) {
    // Light. Pattern 1: an old tube that stutters now and then.
    float stutter = pattern == 1 ? step(0.92, hash21(vec2(floor(uTime * 9.0), seed))) : 0.0;
    vec3 color = vTint * lit * (1.0 - stutter * 0.7);
    gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
    ${OUTPUT}
    return;
  }

  if (style == 11) {
    // An advertising screen: patterns that change every few seconds.
    vec2 m = vFacade.xy;
    float t = uTime * 0.45 + seed * 10.0;
    float scene = floor(t / 4.0);
    float mode = hash21(vec2(scene, seed));
    vec3 a = neonPick(hash21(vec2(scene + 3.0, seed)));
    vec3 b = neonPick(hash21(vec2(scene + 9.0, seed * 2.0)));
    vec2 uv = vec2(m.x / max(vFacade.z, 0.1), m.y / max(vSize.y, 0.1));
    float pick;
    if (mode < 0.34) pick = smoothstep(0.45, 0.55, fract(m.y * 0.5 - t * 0.6));
    else if (mode < 0.67) pick = 1.0 - smoothstep(0.0, 0.07, abs(length(uv - 0.5) - fract(t * 0.35) * 0.75));
    else pick = step(0.55, hash21(floor(m * 1.1) + floor(t * 2.5)));
    vec3 color = mix(a * 0.22, b * 1.15, pick) * (0.8 + 0.2 * sin(m.y * 26.0));
    vec2 border = min(uv, 1.0 - uv) * vec2(vFacade.z, vSize.y);
    color *= smoothstep(0.0, 0.2, min(border.x, border.y));
    gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
    ${OUTPUT}
    return;
  }

  if (style == 10) {
    // Railing: a top rail, a bottom rail and thin bars, with gaps between them.
    vec2 m = vFacade.xy;
    float bars = step(fract(m.x / 0.13), 0.24);
    float rails = step(vSize.y - 0.06, m.y) + step(m.y, 0.05);
    if (bars + rails < 0.5) discard;
    shine = 0.6;
  } else if (top && (style <= 2 || style == 13)) {
    // A flat roof: dark felt with seams, and a few lighter patches.
    vec2 p = vWorld.xz;
    float seams = 1.0 - 0.3 * lineAA(abs(fract(p.x * 0.4) - 0.5), 0.02, fwidth(p.x * 0.4));
    albedo = vec3(0.13, 0.13, 0.15) * (0.8 + 0.4 * noise21(p * 0.7 + seed)) * seams;
    occlusion = 1.0;
  } else if (bottom) {
    albedo = vTint * 0.3;
  } else if (style == 0 || style == 1) {
    float glassMask;
    facade(pattern, style == 1, view, n, albedo, glow, glassMask);
  } else if (style == 2) {
    curtainWall(view, n, albedo, glow);
  } else if (style == 3 || style == 13) {
    albedo = vTint * (0.85 + 0.3 * noise21(vWorld.xz * 1.3 + vWorld.y * 0.7 + seed * 9.0));
  } else if (style == 4) {
    albedo = vTint;
    shine = 1.0;
  } else if (style == 6) {
    if (top) {
      vec2 p = vWorld.xz / 1.5;
      vec2 tile = abs(fract(p) - 0.5);
      float joints = smoothstep(0.45, 0.5, max(tile.x, tile.y)) * clamp(1.0 - fwidth(p.x) * 2.0, 0.0, 1.0);
      albedo = vTint * (0.78 + 0.4 * hash21(floor(p) + 3.0)) * (1.0 - 0.45 * joints);
      // Puddles darken the paving and mirror the sky.
      float puddle = smoothstep(0.6, 0.75, noise21(vWorld.xz * 0.11 + 4.0));
      albedo *= 1.0 - 0.45 * puddle;
      shine = puddle * 1.5;
    } else {
      albedo = vTint * 1.25;
    }
  } else if (style == 7) {
    albedo = vTint;
    glow = vTint * 0.08;
  } else if (style == 8) {
    float leaves = noise21(vLocal.xz * 6.0 + vLocal.y * 4.0 + seed * 7.0);
    albedo = vTint * (0.6 + 0.7 * leaves);
    glow = vTint * lit * (0.4 + 0.6 * leaves);
  } else if (style == 9) {
    float stripes = pattern == 1 ? step(0.5, fract(vFacade.x / 0.42)) : 1.0;
    albedo = mix(vec3(0.82, 0.8, 0.74), vTint, stripes);
    // Lit from below by the shop it shelters.
    glow = albedo * WARM * 0.18 * max(-n.y, 0.0) * 3.0;
  } else if (style == 12) {
    vec2 m = vFacade.xy;
    float grille = 0.6 + 0.4 * step(0.5, fract(m.y * 14.0));
    float fan = 1.0 - smoothstep(0.26, 0.3, length(vec2(fract(m.x / max(vSize.y, 0.4)) - 0.5, m.y / max(vSize.y, 0.4) - 0.5)));
    albedo = vTint * mix(grille, 0.35, fan * step(0.5, abs(n.z) + abs(n.x)));
  }

  vec3 color = shade(albedo, n, vWorld, view, occlusion);
  if (shine > 0.0) {
    // A glint of the moon, and the glow of the city's horizon in wet or polished surfaces.
    vec3 reflected = reflect(-view, n);
    float moonGlint = pow(max(dot(reflected, uMoonDir), 0.0), 28.0);
    float horizon = pow(1.0 - abs(reflected.y), 3.0);
    color += (uMoonColor * moonGlint * 2.5 + uBounce * horizon * 1.2) * shine;
  }
  color += glow;
  gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
  ${OUTPUT}
}
`;

/** The one material every piece of the kit is drawn with. `low` skips the rooms behind windows. */
export function createKitMaterial(shared, { low = false } = {}) {
  return new ShaderMaterial({
    defines: low ? { LOW: "" } : {},
    uniforms: { ...shared },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

// --- Placing pieces ----------------------------------------------------------

/**
 * Collects pieces, then builds one instanced mesh per shape. `add` takes:
 * x, y, z (the base centre), w, h, d (size), turn (around the vertical axis),
 * tilt (around the piece's own x axis), style, seed, lit, pattern, color.
 */
export function createKit({ scene, shared, low = false }) {
  const lists = new Map(Object.keys(SHAPES).map((part) => [part, []]));
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
    },

    /** How many pieces have been added. */
    get count() {
      let total = 0;
      for (const list of lists.values()) total += list.length / 15;
      return total;
    },

    build() {
      const material = createKitMaterial(shared, { low });
      const meshes = [];
      for (const [part, list] of lists) {
        const count = list.length / 15;
        if (count === 0) continue;
        const geometry = SHAPES[part]();
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
      lists.clear();
      return meshes;
    },
  };
  return kit;
}
