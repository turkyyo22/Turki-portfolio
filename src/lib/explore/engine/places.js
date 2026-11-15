import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector3,
} from "three";

import { END_PLAZA, LOTS, lotSite } from "@/lib/explore/city";

import { FLOOR, SHOP_FLOOR, crane, inFrame } from "./architecture";
import { PART, STYLE, WINDOWS } from "./kit";
import { bright } from "./palette";
import { OUTPUT } from "./shaders";
import { canvasTexture, drawHoloText, drawPlazaRings, drawProgressSign, drawScreenFallback, drawStopMarker, drawTitleSign } from "./signs";

// The buildings the tour stops at. Each kind of building is a generator,
// registered by name (registerBuildingType), so a new kind is one function and a
// new project is only data. Every stop is dressed the same way: a name sign over
// the entrance, a screen showing the project's picture, the stop's number on the
// square in front, a lit doorway, bollards, and a small hologram over the roof.
// Also here: the construction sites for unfinished projects, the gate's sign,
// and the plaza at the end of the street.

const SIGN_RATIO = 340 / 1024;
// Buildings further than this from the camera are hidden in the haze anyway.
const VISIBLE_RANGE = 460;

const at = (object, x, y, z) => {
  object.position.set(x, y, z);
  return object;
};

// --- Holograms -----------------------------------------------------------------

function holoMaterials(color) {
  return {
    fill: new MeshBasicMaterial({ color: bright(color, 0.5), transparent: true, opacity: 0.14, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    edge: new LineBasicMaterial({ color: bright(color, 1.5), transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
    solid: new MeshBasicMaterial({ color: bright(color, 1.6) }),
  };
}

/** A see-through shape with bright edges. */
function holo(geometry, materials, { fill = true, angle = 15 } = {}) {
  const group = new Group();
  if (fill) group.add(new Mesh(geometry, materials.fill));
  group.add(new LineSegments(new EdgesGeometry(geometry, angle), materials.edge));
  return group;
}

// What floats over each building, by the project's theme (see stopTheme in plan.js).
// Each is about two metres across and is scaled by the caller.
const TOPPERS = {
  gem(m) {
    const group = new Group();
    group.add(holo(new OctahedronGeometry(1.15), m), holo(new OctahedronGeometry(0.5), m, { fill: false }));
    return group;
  },
  nodes(m) {
    const group = new Group();
    for (const x of [-1.25, 0, 1.25]) group.add(at(holo(new BoxGeometry(0.7, 0.7, 0.7), m), x, 0, 0));
    for (const x of [-0.625, 0.625]) group.add(at(new Mesh(new BoxGeometry(0.5, 0.06, 0.06), m.solid), x, 0, 0));
    return group;
  },
  car(m) {
    const group = new Group();
    group.add(at(holo(new BoxGeometry(2.4, 0.5, 1.05), m), 0, -0.12, 0), at(holo(new BoxGeometry(1.2, 0.42, 0.92), m), -0.12, 0.34, 0));
    for (const x of [-0.75, 0.75]) {
      for (const z of [-0.55, 0.55]) {
        const wheel = at(holo(new CylinderGeometry(0.27, 0.27, 0.16, 12), m), x, -0.3, z);
        wheel.rotation.x = Math.PI / 2;
        group.add(wheel);
      }
    }
    return group;
  },
  globe(m) {
    const group = new Group();
    group.add(holo(new IcosahedronGeometry(1, 1), m, { angle: 1 }));
    const ring = new Mesh(new TorusGeometry(1.42, 0.022, 6, 48), m.solid);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    return group;
  },
  robot(m) {
    const group = new Group();
    group.add(holo(new BoxGeometry(1.7, 1.4, 1.25), m));
    for (const x of [-0.27, 0.27]) group.add(at(new Mesh(new CapsuleGeometry(0.085, 0.2, 4, 10), m.solid), x, 0.08, 0.7));
    group.add(at(new Mesh(new SphereGeometry(0.1, 12, 8), m.solid), 0, 1.08, 0), at(new Mesh(new CylinderGeometry(0.03, 0.03, 0.34, 6), m.solid), 0, 0.87, 0));
    return group;
  },
  document(m) {
    const group = new Group();
    group.add(holo(new BoxGeometry(1.35, 1.8, 0.05), m));
    for (const y of [0.4, 0.1, -0.2, -0.5]) group.add(at(new Mesh(new BoxGeometry(0.9, 0.06, 0.07), m.solid), 0, y, 0.05));
    const hand = new Group();
    hand.add(at(new Mesh(new BoxGeometry(0.05, 1.3, 0.05), m.solid), 0, 0.65, 0));
    hand.position.z = 0.12;
    group.add(new Mesh(new TorusGeometry(1.42, 0.024, 6, 48), m.solid), hand);
    group.userData.tick = (time) => {
      hand.rotation.z = -time * 0.9;
    };
    return group;
  },
  cap(m) {
    const group = new Group();
    const board = at(holo(new BoxGeometry(2.3, 0.1, 2.3), m), 0, 0.3, 0);
    board.rotation.y = Math.PI / 4;
    group.add(board, at(holo(new CylinderGeometry(0.8, 0.92, 0.55, 8), m), 0, -0.02, 0));
    group.add(at(new Mesh(new BoxGeometry(1.2, 0.04, 0.04), m.solid), 0.6, 0.38, 0), at(new Mesh(new BoxGeometry(0.05, 0.6, 0.05), m.solid), 1.2, 0.08, 0));
    return group;
  },
  bank(m) {
    const group = new Group();
    group.add(at(holo(new BoxGeometry(2.6, 0.22, 1.3), m), 0, -0.75, 0));
    for (const x of [-0.84, -0.28, 0.28, 0.84]) group.add(at(holo(new CylinderGeometry(0.12, 0.12, 1, 8), m), x, 0.02, 0));
    group.add(at(holo(new BoxGeometry(2.4, 0.18, 1.2), m), 0, 0.61, 0));
    group.add(at(holo(new CylinderGeometry(1, 1, 1.2, 3).rotateX(-Math.PI / 2).scale(1.39, 0.42, 1), m), 0, 0.91, 0));
    return group;
  },
  chart(m) {
    const group = new Group();
    [0.5, 0.9, 1.3, 1.8].forEach((height, index) => group.add(at(holo(new BoxGeometry(0.42, height, 0.42), m), -0.9 + index * 0.6, -0.9 + height / 2, 0)));
    return group;
  },
};

/** A tall, faint column of light. Brightest at its foot, gone at the top. */
function lightBeam(color, height, { foot = 1.2, tip = 0.25, strength = 0.05 } = {}) {
  const geometry = new CylinderGeometry(tip, foot, height, 16, 1, true);
  geometry.translate(0, height / 2, 0);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const fade = (1 - geometry.attributes.position.getY(index) / height) ** 2 * strength;
    colors.set([color.r * fade, color.g * fade, color.b * fade], index * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide }));
}

/** The outline of floors still to be built: a ring per floor and four corner posts. */
function latticeGeometry(width, depth, from, to, floor = FLOOR) {
  const hw = width / 2;
  const hd = depth / 2;
  const corners = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const points = [];
  for (let y = from; y <= to + 0.01; y += floor) {
    for (let index = 0; index < 4; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % 4];
      points.push(a[0], y, a[1], b[0], y, b[1]);
    }
  }
  for (const [x, z] of corners) points.push(x, from, z, x, to, z);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return geometry;
}

const blueprint = (color, opacity = 0.75) =>
  new LineBasicMaterial({ color: bright(color, 1.4), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });

/** A plane lying on the ground that adds its (black-backed) texture as light. */
function groundMark(canvas, size) {
  const geometry = new PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);
  return new Mesh(geometry, new MeshBasicMaterial({ map: canvasTexture(canvas), blending: AdditiveBlending, transparent: true, depthWrite: false }));
}

// --- Building types ----------------------------------------------------------------
// Each draws its building in its own frame (x across the front, z out of the
// front, y up) with `add` (kit pieces) and `group` (other meshes), and returns
// where its dressing goes: { top, sign: { y, z, width }, screen: { y, z, width },
// door: { z, width, height, y }, eye (camera height at the stop), frontY (the
// height to frame) }.

function workshop({ add, footprint, palette, random, detail }) {
  const { width: w, depth: d } = footprint;
  const height = SHOP_FLOOR + 2 * FLOOR;
  const brick = palette.walls.old[5];
  const stone = palette.stone[0];
  add(PART.box, { w, h: height, d, style: STYLE.wall, seed: random() * 90, lit: 0.45, pattern: WINDOWS.old, color: brick });
  // A garage on the ground floor, its door half up and the workshop lit inside.
  add(PART.box, { y: 0, z: d / 2 - 0.15, w: 6.4, h: 3.7, d: 0.4, style: STYLE.plain, color: palette.darkSteel });
  add(PART.plane, { y: 0.05, z: d / 2 - 0.3, w: 6, h: 2.1, d: 0.1, style: STYLE.neon, lit: 0.55, color: palette.warm });
  add(PART.box, { y: 2.15, z: d / 2 + 0.02, w: 6.1, h: 1.5, d: 0.12, style: STYLE.vent, color: palette.stone[2] });
  add(PART.box, { y: SHOP_FLOOR - 0.16, w: w + 0.3, h: 0.32, d: d + 0.3, style: STYLE.plain, color: stone });
  add(PART.box, { y: height - 0.05, w: w + 0.7, h: 0.5, d: d + 0.7, style: STYLE.plain, color: stone });
  if (detail) {
    for (let floor = 1; floor < 3; floor += 1) {
      add(PART.escape, { x: w / 2, y: SHOP_FLOOR + (floor - 1) * FLOOR, z: d / 2 - 2.6, w: 2.8, h: FLOOR, d: 1.25, turn: Math.PI / 2, style: STYLE.metal, color: palette.darkSteel });
    }
  }
  // On the roof: a water tank, an antenna, and a screen on legs facing the street.
  add(PART.cylinder, { x: -w * 0.28, y: height + 1, z: -d * 0.2, w: 2.2, h: 2.4, d: 2.2, style: STYLE.plain, color: palette.darkSteel });
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(PART.box, { x: -w * 0.28 + lx * 0.8, y: height, z: -d * 0.2 + lz * 0.8, w: 0.12, h: 1, d: 0.12, style: STYLE.metal, color: palette.steel });
  add(PART.cylinder, { x: w * 0.36, y: height, z: -d * 0.3, w: 0.08, h: 6, d: 0.08, style: STYLE.metal, color: palette.steel });
  const screenWidth = 6.2;
  for (const x of [-2, 2]) add(PART.box, { x, y: height, z: d / 2 - 1.4, w: 0.25, h: 1.5, d: 0.25, style: STYLE.metal, color: palette.steel });
  return {
    top: height + 1.5 + (screenWidth * 9) / 16,
    sign: { y: 5.4, z: d / 2 + 0.2, width: Math.min(w - 2, 10) },
    screen: { y: height + 1.5 + (screenWidth * 9) / 32, z: d / 2 - 1.2, width: screenWidth },
    door: { z: d / 2, width: 6, height: 3.6, y: 0 },
    eye: 4.2,
    frontY: 5.6,
  };
}

function studio({ add, footprint, palette, random, detail }) {
  const { width: w, depth: d } = footprint;
  const showroom = 5.6;
  const floors = 4;
  const height = showroom + floors * FLOOR;
  const wall = palette.walls.mid[1];
  const trim = palette.stone[1];
  // A double-height showroom behind a glass front, under the flats.
  add(PART.box, { w, h: showroom, d, style: STYLE.plain, color: wall.clone().multiplyScalar(0.7) });
  add(PART.box, { z: d / 2 - 0.5, w: w - 1.2, h: showroom - 0.6, d: 0.4, style: STYLE.glass, seed: random() * 90, lit: 0.95, color: palette.warm.clone().multiplyScalar(0.55) });
  add(PART.box, { y: showroom, w, h: floors * FLOOR, d, style: STYLE.wall, seed: random() * 90, lit: 0.4, pattern: WINDOWS.homes, color: wall });
  add(PART.box, { y: showroom - 0.25, z: d / 2 + 1, w: w - 0.6, h: 0.35, d: 2.2, style: STYLE.metal, color: palette.darkSteel });
  add(PART.box, { y: showroom - 0.3, z: d / 2 + 1, w: w - 1, h: 0.05, d: 2, style: STYLE.neon, lit: 1.1, color: palette.warm });
  add(PART.box, { y: height, w: w + 0.4, h: 0.4, d: d + 0.4, style: STYLE.plain, color: trim });
  if (detail) {
    for (let floor = 1; floor < floors; floor += 1) {
      const y = showroom + floor * FLOOR;
      add(PART.box, { y: y - 0.16, z: d / 2 + 0.55, w: w - 2, h: 0.16, d: 1.1, style: STYLE.plain, color: trim });
      add(PART.plane, { y, z: d / 2 + 1.1, w: w - 2, h: 1, d: 0.04, style: STYLE.railing, color: palette.darkSteel });
    }
  }
  // A billboard on the roof for the project's picture.
  const screenWidth = Math.min(w - 2, 10);
  for (const x of [-screenWidth * 0.3, screenWidth * 0.3]) add(PART.box, { x, y: height + 0.4, z: d / 2 - 2, w: 0.3, h: 1.6, d: 0.3, style: STYLE.metal, color: palette.steel });
  return {
    top: height + 2 + (screenWidth * 9) / 16,
    sign: { y: showroom + 0.75, z: d / 2 + 2.15, width: Math.min(w - 2, 11) },
    screen: { y: height + 2 + (screenWidth * 9) / 32, z: d / 2 - 1.8, width: screenWidth },
    door: { z: d / 2, width: 4, height: 3.4, y: 0 },
    eye: 5,
    frontY: 7,
  };
}

function lab({ add, footprint, palette, random, detail, stop, color }) {
  const { width: w, depth: d } = footprint;
  const podium = SHOP_FLOOR + FLOOR;
  const panel = palette.walls.new[0];
  const tint = color.clone().multiplyScalar(0.45);
  add(PART.box, { w, h: podium, d, style: STYLE.shop, seed: random() * 90, lit: 0.6, pattern: WINDOWS.office, color: panel.clone().multiplyScalar(0.75) });
  // A round glass tower beside a white wing, capped by a stepped dome and antennas.
  const towerSize = Math.min(w, d) * 0.72;
  const floors = stop.inProgress ? 3 + Math.round((stop.progress / 100) * 4) : 7;
  const towerHeight = floors * 3.7;
  add(PART.cylinder, { x: -w * 0.16, y: podium, w: towerSize, h: towerHeight, d: towerSize, style: STYLE.glass, seed: random() * 90, lit: 0.5, color: tint });
  add(PART.box, { x: w * 0.3, y: podium, z: -d * 0.12, w: w * 0.36, h: towerHeight * 0.7, d: d * 0.7, style: STYLE.wall, seed: random() * 90, lit: 0.4, pattern: WINDOWS.office, color: panel });
  let y = podium + towerHeight;
  for (const [scale, h] of [[0.86, 1.2], [0.66, 1], [0.42, 0.9]]) {
    add(PART.cylinder, { x: -w * 0.16, y, w: towerSize * scale, h, d: towerSize * scale, style: STYLE.plain, color: panel });
    y += h;
  }
  add(PART.cylinder, { x: -w * 0.16, y: podium + towerHeight - 0.4, w: towerSize + 1.6, h: 0.18, d: towerSize + 1.6, style: STYLE.neon, lit: 1.1, color });
  if (detail) {
    for (const [x, h] of [[0.1, 7], [0.2, 5], [0.28, 6]]) add(PART.cylinder, { x: w * x + 2, y: podium + towerHeight * 0.7, z: -d * 0.1, w: 0.1, h, d: 0.1, style: STYLE.metal, color: palette.steel });
    add(PART.cylinder, { x: w * 0.36, y: podium + towerHeight * 0.7 + 0.6, z: d * 0.05, w: 2.4, h: 0.16, d: 2.4, tilt: -0.8, turn: 0.6, style: STYLE.metal, color: palette.stone[3] });
  }
  const screenWidth = Math.min(w - 4, 8.5);
  return {
    top: y,
    sign: { y: podium - 1.5, z: d / 2 + 0.2, width: Math.min(w - 2, 11) },
    screen: { y: podium + 1.2 + (screenWidth * 9) / 32, z: d / 2 + 0.1, width: screenWidth, x: w * 0.12 },
    door: { z: d / 2, width: 3.6, height: 3.2, y: 0 },
    eye: 5.5,
    frontY: podium - 1,
    towerX: -w * 0.16,
  };
}

function tower({ add, group, footprint, palette, random, stop, color, glows }) {
  const { width: w, depth: d } = footprint;
  const podium = SHOP_FLOOR + 3.7 * 2;
  const wall = palette.walls.centre[1];
  const glass = color.clone().lerp(palette.blue, 0.5).multiplyScalar(0.42);
  add(PART.box, { w, h: podium, d, style: STYLE.shop, seed: random() * 90, lit: 0.55, pattern: WINDOWS.office, color: wall });
  add(PART.box, { y: podium, w: w + 0.4, h: 0.5, d: d + 0.4, style: STYLE.plain, color: palette.stone[1] });
  add(PART.box, { y: 4.2, z: d / 2 + 1.4, w: w * 0.6, h: 0.32, d: 2.8, style: STYLE.metal, color: palette.darkSteel });
  add(PART.box, { y: 4.15, z: d / 2 + 1.4, w: w * 0.6 - 0.3, h: 0.06, d: 2.6, style: STYLE.neon, lit: 1.2, color: palette.warm });

  const fullFloors = 18;
  const builtFloors = stop.inProgress ? Math.max(4, Math.round(fullFloors * (0.25 + (0.6 * stop.progress) / 100))) : fullFloors;
  const tw = w * 0.78;
  const td = d * 0.78;
  const split = Math.round(fullFloors * 0.62);
  let y = podium + 0.5;
  const lowerFloors = Math.min(builtFloors, split);
  add(PART.box, { y, w: tw, h: lowerFloors * 3.7, d: td, style: STYLE.glass, seed: random() * 90, lit: 0.42, color: glass });
  y += lowerFloors * 3.7;
  if (builtFloors > split) {
    add(PART.box, { y, w: tw + 0.3, h: 0.4, d: td + 0.3, style: STYLE.plain, color: palette.stone[1] });
    add(PART.box, { y: y - 0.06, w: tw + 0.2, h: 0.06, d: td + 0.2, style: STYLE.neon, lit: 0.9, color });
    y += 0.4;
    add(PART.box, { y, w: tw * 0.78, h: (builtFloors - split) * 3.7, d: td * 0.78, style: STYLE.glass, seed: random() * 90, lit: 0.42, color: glass });
    y += (builtFloors - split) * 3.7;
  }
  if (stop.inProgress) {
    // The floors still to come, drawn as a blueprint, with a crane beside them.
    const full = podium + 0.5 + fullFloors * 3.7;
    add(PART.box, { y, w: tw * 0.78, h: 0.3, d: td * 0.78, style: STYLE.plain, color: palette.stone[2] });
    group.add(new LineSegments(latticeGeometry(tw * 0.78, td * 0.78, y, full, 3.7), blueprint(color)));
    const warning = crane(add, { x: -tw / 2 - 2, z: -td / 4, height: full + 8, turn: 0.4, color: palette.amber.clone().multiplyScalar(0.55) });
    glows.push({ local: warning, color: palette.red, size: 2.8, strength: 1.2, blink: 2.2 });
    y = full;
  } else {
    add(PART.box, { y, w: tw * 0.6, h: 6, d: td * 0.6, style: STYLE.plain, color: palette.darkSteel });
    add(PART.box, { y: y + 0.4, w: tw * 0.62, h: 0.3, d: td * 0.62, style: STYLE.neon, lit: 1.1, color });
    add(PART.cylinder, { y: y + 6, w: 0.4, h: 10, d: 0.4, style: STYLE.metal, color: palette.steel });
    glows.push({ local: { x: 0, y: y + 16.3, z: 0 }, color: palette.red, size: 3.4, strength: 1.2, blink: 2 });
    y += 16;
  }
  const screenWidth = Math.min(w - 4, 10);
  return {
    top: y,
    sign: { y: podium - 1.6, z: d / 2 + 0.2, width: Math.min(w - 2, 11.5) },
    screen: { y: podium + 1.8 + (screenWidth * 9) / 32, z: td / 2 + 0.16, width: Math.min(screenWidth, tw - 2) },
    door: { z: d / 2, width: 5, height: 3.6, y: 0 },
    eye: 6,
    frontY: podium - 1,
  };
}

function academy({ add, group, footprint, palette, random, color, shared }) {
  const { depth: d } = footprint;
  const front = d / 2;
  const stone = palette.stone[3].clone().multiplyScalar(1.05);
  const wall = palette.stone[1].clone().multiplyScalar(0.8);
  // Steps up to a colonnade, the hall and its wings, and a clock tower behind.
  add(PART.box, { z: front + 2.6, w: 30, h: 0.45, d: 5.2, style: STYLE.plain, color: stone });
  add(PART.box, { y: 0.45, z: front + 1.9, w: 27, h: 0.45, d: 3.8, style: STYLE.plain, color: stone });
  add(PART.box, { y: 0.9, z: front + 1.2, w: 24, h: 0.45, d: 2.4, style: STYLE.plain, color: stone });
  add(PART.box, { w: 22, h: 15, d, style: STYLE.wall, seed: random() * 90, lit: 0.55, pattern: WINDOWS.old, color: wall });
  for (const side of [-1, 1]) {
    add(PART.box, { x: side * 14.5, w: 7, h: 22.4, d: d - 2, style: STYLE.wall, seed: random() * 90, lit: 0.5, pattern: WINDOWS.old, color: wall });
    add(PART.box, { x: side * 14.5, y: 22.4, w: 7.6, h: 0.7, d: d - 1.4, style: STYLE.plain, color: stone });
  }
  add(PART.box, { y: 15, z: -1, w: 11, h: 34, d: 11, style: STYLE.wall, seed: random() * 90, lit: 0.45, pattern: WINDOWS.old, color: wall });
  add(PART.box, { y: 49, z: -1, w: 11.8, h: 0.8, d: 11.8, style: STYLE.plain, color: stone });
  add(PART.box, { y: 49.8, z: -1, w: 7.5, h: 7, d: 7.5, style: STYLE.plain, color: wall });
  add(PART.cylinder, { y: 56.8, z: -1, w: 6.6, h: 1.6, d: 6.6, style: STYLE.plain, color: stone });
  add(PART.cylinder, { y: 58.4, z: -1, w: 0.4, h: 8, d: 0.4, style: STYLE.metal, color: palette.steel });
  // Five columns under a beam and a gabled pediment, lit from below.
  for (let index = 0; index < 5; index += 1) {
    const x = -9 + index * 4.5;
    add(PART.cylinder, { x, y: 1.35, z: front + 1.5, w: 1.15, h: 11.4, d: 1.15, style: STYLE.plain, color: stone });
    add(PART.box, { x, y: 1.35, z: front + 1.5, w: 1.6, h: 0.5, d: 1.6, style: STYLE.plain, color: stone });
  }
  add(PART.box, { y: 12.75, z: front + 1.2, w: 23.5, h: 2.2, d: 3.4, style: STYLE.plain, color: stone });
  // A stepped pediment over the beam.
  [[23, 0], [17, 1.1], [11, 2.2], [5, 3.3]].forEach(([width, rise]) => {
    add(PART.box, { y: 14.95 + rise, z: front + 1.2, w: width, h: 1.1, d: 3, style: STYLE.plain, color: stone });
  });
  // A clock face on the tower.
  add(PART.cylinder, { y: 38, z: -1 + 5.6, w: 5, h: 0.2, d: 5, tilt: Math.PI / 2, style: STYLE.neon, lit: 0.9, color: palette.warm });

  // Confetti drifting down over the steps.
  const count = 150;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const falls = new Float32Array(count * 3);
  const confetti = [color, palette.pink, palette.accent, palette.white, palette.mint];
  for (let index = 0; index < count; index += 1) {
    positions.set([random.range(-15, 15), random.range(0, 26), random.range(front - 1, front + 15)], index * 3);
    const tone = random.pick(confetti);
    colors.set([tone.r, tone.g, tone.b], index * 3);
    falls.set([random.range(0.5, 1.3), random.range(0, 6.3), random.range(0.16, 0.32)], index * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aFall", new BufferAttribute(falls, 3));
  const points = new Points(
    geometry,
    new ShaderMaterial({
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: shared.uTime, uPointScale: shared.uPointScale },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute vec3 aFall;   // speed, phase, size in metres
        uniform float uTime;
        uniform float uPointScale;
        varying vec3 vColor;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * aFall.x, 26.0);
          p.x += sin(uTime * 0.9 + aFall.y) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vColor = aColor * (0.45 + 0.55 * abs(sin(uTime * 2.6 + aFall.y * 3.0)));
          gl_PointSize = clamp(aFall.z * uPointScale / max(0.1, -mv.z), 1.0, 9.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
          ${OUTPUT}
        }
      `,
    })
  );
  points.frustumCulled = false;
  group.add(points);
  return {
    top: 66,
    sign: { y: 17.7, z: front + 2.95, width: 14 },
    screen: { y: 26, z: -1 + 5.56, width: 8.5 },
    door: { z: front, width: 4, height: 5.2, y: 1.35 },
    eye: 6.5,
    frontY: 14.5,
    topperZ: 8,
    topperY: 30,
  };
}

function bank({ add, group, footprint, palette, random, color, tickers, glows }) {
  const { depth: d } = footprint;
  const front = d / 2;
  const height = 104;
  const glass = color.clone().multiplyScalar(0.35);
  const wall = palette.walls.centre[0];
  add(PART.box, { w: 26, h: 12.8, d: 20, style: STYLE.shop, seed: random() * 90, lit: 0.62, pattern: WINDOWS.office, color: wall });
  add(PART.box, { y: 12.8, w: 26.4, h: 0.6, d: 20.4, style: STYLE.plain, color: palette.stone[1] });
  add(PART.box, { y: 4.4, z: front + 1.6, w: 12, h: 0.35, d: 3.2, style: STYLE.metal, color: palette.darkSteel });
  add(PART.box, { y: 4.35, z: front + 1.6, w: 11.6, h: 0.06, d: 3, style: STYLE.neon, lit: 1.2, color: palette.warm });
  // The main tower with a shorter one beside it, and fins of light up the corners.
  add(PART.box, { x: -3, y: 13.4, w: 15, h: height - 13.4, d: 13, style: STYLE.glass, seed: random() * 90, lit: 0.5, color: glass });
  add(PART.box, { x: 8.5, y: 13.4, z: -1, w: 8.5, h: 52, d: 10, style: STYLE.glass, seed: random() * 90, lit: 0.45, color: glass });
  for (const sx of [-1, 1]) add(PART.box, { x: -3 + sx * 7.5, y: 13.4, z: 6.5, w: 0.22, h: height - 13.4, d: 0.22, style: STYLE.metal, color: palette.stone[3] });
  add(PART.box, { x: -3, y: height, w: 10, h: 8, d: 9, style: STYLE.plain, color: palette.darkSteel });
  add(PART.box, { x: -3, y: height + 0.5, w: 10.2, h: 0.3, d: 9.2, style: STYLE.neon, lit: 1.1, color });
  add(PART.cylinder, { x: -3, y: height + 8, w: 0.5, h: 14, d: 0.5, style: STYLE.metal, color: palette.steel });
  glows.push({ local: { x: -3, y: height + 22.4, z: 0 }, color: palette.white, size: 4.5, strength: 1.2, blink: 1.5 });
  add(PART.box, { x: 8.5, y: 65.4, z: -1, w: 9, h: 0.6, d: 10.6, style: STYLE.plain, color: palette.stone[1] });

  // Two rings turning round the crown.
  const materials = holoMaterials(color);
  const rings = at(new Group(), -3, height - 6, 0);
  const ring = new Mesh(new TorusGeometry(10.5, 0.1, 6, 64), materials.solid);
  ring.rotation.x = Math.PI / 2;
  const tilted = new Mesh(new TorusGeometry(12, 0.07, 6, 64), materials.solid);
  tilted.rotation.x = Math.PI / 2.4;
  rings.add(ring, tilted);
  group.add(rings);
  tickers.push((time) => {
    rings.rotation.y = time * 0.2;
    tilted.rotation.z = time * 0.15;
  });
  // Searchlights sweeping from the roof of the lobby.
  for (const sx of [-1, 1]) {
    const pivot = at(new Group(), sx * 11, 12.8, 8);
    const beam = lightBeam(palette.cool, 150, { foot: 0.4, tip: 4.5, strength: 0.04 });
    beam.rotation.z = 0.5;
    pivot.add(beam);
    group.add(pivot);
    const phase = random.range(0, 6);
    tickers.push((time) => {
      pivot.rotation.y = time * 0.22 * sx + phase;
    });
  }
  return {
    top: height + 8,
    sign: { y: 10.2, z: front + 0.22, width: 11.5 },
    screen: { y: 18.5, z: 6.66, width: 10.5, x: -3 },
    door: { z: front, width: 5, height: 3.6, y: 0 },
    eye: 6,
    frontY: 10,
    topperX: 8.5,
    topperY: 72,
    topperZ: -1,
  };
}

const TYPES = { workshop, studio, lab, tower, academy, bank };

/**
 * Adds a kind of building. `generator(context)` draws it in its own frame and
 * returns where its sign, screen and door go (see the types above).
 */
export function registerBuildingType(key, generator) {
  TYPES[key] = generator;
}

// --- Placing and dressing ----------------------------------------------------------

/**
 * Builds every stop's building and its dressing, the construction lots, and the
 * plaza at the end. Returns, per stop, what the camera needs to frame it
 * (see createRig) and an update function for the moving parts.
 */
export function buildPlaces(context) {
  const { scene, shared, kit, palette, random, detail, sites, stops, upcoming, decals, glows, bollards, family, rtl, text, imageFor, life, colors } = context;
  const tickers = [];
  const groups = [];
  const loader = new TextureLoader();
  const pad = (number) => String(number).padStart(2, "0");
  const frames = [];

  const openSite = ({ x, z, turn }) => {
    const group = new Group();
    group.position.set(x, 0, z);
    group.rotation.y = turn;
    scene.add(group);
    groups.push({ group, x, z });
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const world = (lx, ly, lz) => new Vector3(x + lx * cos + lz * sin, ly, z - lx * sin + lz * cos);
    return { group, world, facing: { x: sin, z: cos }, add: inFrame(kit, { x, z, turn }) };
  };

  /** A framed screen showing the project's picture, or a drawn stand-in. */
  const addScreen = (site, stop, color, { x = 0, y, z, width }) => {
    const height = (width * 9) / 16;
    site.add(PART.box, { x, y: y - height / 2 - 0.25, z: z - 0.2, w: width + 0.5, h: height + 0.5, d: 0.25, style: STYLE.metal, color: palette.darkSteel });
    const fallback = canvasTexture(drawScreenFallback({ year: stop.year, color }));
    const picture = at(new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: fallback })), x, y, z - 0.06);
    site.group.add(picture);
    const url = imageFor(stop);
    if (url) {
      loader.load(
        url,
        (texture) => {
          if (life.disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = 4;
          // Show the whole picture, like the project cards on the main site.
          const aspect = texture.image.width / texture.image.height;
          const frame = 16 / 9;
          picture.scale.set(Math.min(1, aspect / frame), Math.min(1, frame / aspect), 1);
          picture.material.map.dispose();
          picture.material.map = texture;
          picture.material.needsUpdate = true;
        },
        undefined,
        () => {}
      );
    }
    decals.add({ ...flat(site.world(x, 0, z)), width: width * 1.2, length: 12, color, strength: 0.14, streak: true, towardX: site.facing.x, towardZ: site.facing.z });
    return { centre: site.world(x, y, z), normal: new Vector3(site.facing.x, 0, site.facing.z), width, height };
  };

  const flat = (point) => ({ x: point.x, z: point.z });

  stops.forEach((stop, index) => {
    const site = sites[index];
    const color = colors[index];
    const handle = openSite(site);
    const generator = TYPES[stop.type] ?? TYPES.studio;
    const placed = [];
    const layout = generator({ add: handle.add, group: handle.group, footprint: site.footprint, palette, random, detail, stop, color, tickers, glows: placed, shared });
    for (const glow of placed) glows.add({ ...handle.world(glow.local.x, glow.local.y, glow.local.z), color: glow.color, size: glow.size, strength: glow.strength, blink: glow.blink, phase: random() * 6 });

    // The name plate over the entrance.
    const label = stop.year ? `${pad(index + 1)} · ${stop.year}` : pad(index + 1);
    const { sign } = layout;
    const plate = new Mesh(
      new PlaneGeometry(sign.width, sign.width * SIGN_RATIO),
      new MeshBasicMaterial({ map: canvasTexture(drawTitleSign({ title: stop.title, label, color, family, rtl })), transparent: true, depthWrite: false })
    );
    plate.renderOrder = 3;
    handle.group.add(at(plate, 0, sign.y, sign.z));
    handle.add(PART.box, { y: sign.y - (sign.width * SIGN_RATIO) / 2 - 0.15, z: sign.z - 0.25, w: sign.width + 0.3, h: sign.width * SIGN_RATIO + 0.3, d: 0.2, style: STYLE.metal, color: palette.darkSteel });

    const screen = addScreen(handle, stop, color, layout.screen);

    // A lit doorway, its light spilling onto the square, and the stop's number on the ground.
    const { door } = layout;
    handle.add(PART.box, { y: door.y, z: door.z + 0.03, w: door.width, h: door.height, d: 0.1, style: STYLE.neon, lit: 0.9, color: palette.warm });
    const doorway = handle.world(0, 0, door.z + 0.5);
    decals.add({ ...flat(doorway), width: door.width + 3, length: 11, color: palette.warm, strength: 0.3, streak: true, towardX: handle.facing.x, towardZ: handle.facing.z });
    const plazaOffset = site.footprint.depth / 2 + site.footprint.apron + 5.5;
    handle.group.add(at(groundMark(drawStopMarker({ number: pad(index + 1), color }), 8.5), 0, 0.18, plazaOffset));
    decals.add({ ...flat(handle.world(0, 0, plazaOffset)), width: 24, color, strength: 0.1 });
    for (let step = 0; step < 6; step += 1) {
      const angle = ((-100 + step * 40) * Math.PI) / 180;
      const spot = handle.world(Math.sin(angle) * 5.2, 0.15, plazaOffset + Math.cos(angle) * 5.2);
      bollards.add({ x: spot.x, y: 0.15, z: spot.z, color: bright(color, 2) });
      glows.add({ x: spot.x, y: 1.15, z: spot.z, color, size: 1.4, strength: 0.5 });
    }

    // A small hologram over the roof, turning slowly.
    const topper = (TOPPERS[stop.theme] ?? TOPPERS.gem)(holoMaterials(color));
    const topperY = layout.topperY ?? layout.top + 4;
    const topperX = layout.topperX ?? layout.towerX ?? 0;
    const topperZ = layout.topperZ ?? 0;
    topper.scale.setScalar(stop.kind === "project" ? 2.2 : 4);
    handle.group.add(at(topper, topperX, topperY, topperZ));
    const phase = random.range(0, 6);
    tickers.push((time) => {
      topper.rotation.y = time * 0.35 + phase;
      topper.position.y = topperY + Math.sin(time * 0.8 + phase) * 0.35;
      topper.userData.tick?.(time);
    });
    handle.group.add(at(lightBeam(color, 90), topperX, layout.top, topperZ));

    frames.push({
      front: handle.world(0, layout.frontY, site.footprint.depth / 2 + site.footprint.apron),
      eye: layout.eye,
      screen,
      top: layout.top,
    });
  });

  // --- Construction sites for unfinished projects without a post ---
  upcoming.forEach((item, index) => {
    const lot = LOTS[index];
    if (!lot) return;
    const site = lotSite(lot);
    const handle = openSite(site);
    const color = palette.amber;
    const full = FLOOR * 8;
    const built = Math.max(FLOOR, Math.round((full * item.progress) / 100 / FLOOR) * FLOOR);
    handle.add(PART.box, { w: 13, h: built, d: 13, style: STYLE.plain, color: palette.stone[2] });
    for (let level = FLOOR; level < built; level += FLOOR) handle.add(PART.box, { y: level - 0.15, w: 13.4, h: 0.3, d: 13.4, style: STYLE.plain, color: palette.stone[1] });
    handle.group.add(new LineSegments(latticeGeometry(13, 13, built, full), blueprint(color)));
    const warning = crane(handle.add, { x: -8.4, z: -3, height: full + 9, color: palette.amber.clone().multiplyScalar(0.55) });
    glows.add({ ...handle.world(warning.x, warning.y, warning.z), color: palette.red, size: 2.6, strength: 1.1, blink: 2.2, phase: index });
    const board = new Mesh(
      new PlaneGeometry(8.4, 2.8),
      new MeshBasicMaterial({ map: canvasTexture(drawProgressSign({ name: item.name, progress: item.progress, color, family, rtl })), transparent: true, depthWrite: false })
    );
    board.renderOrder = 3;
    handle.group.add(at(board, 0, Math.max(built + 2.4, 6.5), 6.8));
    // A fence along the front, with work lights.
    handle.add(PART.plane, { z: 8, w: 14, h: 2, d: 0.05, style: STYLE.railing, color: palette.amber.clone().multiplyScalar(0.4) });
    decals.add({ ...flat(handle.world(0, 0, 9)), width: 18, color, strength: 0.12 });
  });

  // --- The plaza at the end: the outline of a tower still to be built ---
  {
    const handle = openSite({ x: 0, z: END_PLAZA.z, turn: 0 });
    const color = palette.accent;
    const { radius } = END_PLAZA;
    handle.group.add(at(groundMark(drawPlazaRings({ color }), radius * 2), 0, 0.17, 0));
    handle.add(PART.box, { y: 0.15, w: 18, h: 1, d: 18, style: STYLE.plain, color: palette.steel });
    const blueprintTower = new Group();
    const steps = [
      [16, 1.15, 20.3],
      [11, 20.3, 39.5],
      [7, 39.5, 52.3],
    ];
    for (const [size, from, to] of steps) blueprintTower.add(new LineSegments(latticeGeometry(size, size, from, to), blueprint(color, 0.8)));
    handle.group.add(blueprintTower);
    const scanGeometry = new PlaneGeometry(1, 1);
    scanGeometry.rotateX(-Math.PI / 2);
    const scan = new Mesh(scanGeometry, new MeshBasicMaterial({ color: bright(color, 0.9), transparent: true, opacity: 0.14, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    handle.group.add(scan);
    tickers.push((time) => {
      const y = 1.15 + ((time * 4.5) % 51.2);
      const size = steps.find(([, , to]) => y < to)?.[0] ?? 7;
      scan.position.y = y;
      scan.scale.set(size, 1, size);
    });
    handle.group.add(at(lightBeam(color, 150, { foot: 3, tip: 0.4, strength: 0.07 }), 0, 1.15, 0));
    glows.add({ x: 0, y: 52.8, z: END_PLAZA.z, color, size: 4.5, strength: 1.2, blink: 1.4 });
    const sign = new Mesh(
      new PlaneGeometry(15, 4.4),
      new MeshBasicMaterial({ map: canvasTexture(drawHoloText({ lines: text.finaleSign, color, family, rtl })), transparent: true, depthWrite: false })
    );
    sign.renderOrder = 3;
    handle.group.add(at(sign, 0, 24, 11.5));
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const spot = { x: Math.sin(angle) * (radius - 1.5), z: END_PLAZA.z + Math.cos(angle) * (radius - 1.5) };
      if (Math.abs(spot.x) < 8) continue;
      bollards.add({ x: spot.x, y: 0.15, z: spot.z, color: bright(color, 2) });
      glows.add({ x: spot.x, y: 1.15, z: spot.z, color, size: 1.4, strength: 0.5 });
    }
  }

  return {
    frames,
    update(time, cameraX, cameraZ) {
      for (const entry of groups) entry.group.visible = Math.hypot(entry.x - cameraX, entry.z - cameraZ) < VISIBLE_RANGE;
      for (const tick of tickers) tick(time);
    },
  };
}
