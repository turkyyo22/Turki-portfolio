import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
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
} from "three";

import { STYLE } from "./buildings";
import { FLOOR, SIGN_RATIO } from "./layout";
import { bright } from "./palette";
import { OUTPUT } from "./shaders";
import { canvasTexture, drawHoloText, drawPlazaRings, drawProgressSign, drawScreenFallback, drawStopMarker, drawTitleSign } from "./signs";

// Landmarks further than this from the camera are hidden in the haze anyway.
const VISIBLE_RANGE = 440;

// --- Holograms -------------------------------------------------------------

function holoMaterials(color) {
  return {
    fill: new MeshBasicMaterial({ color: bright(color, 0.55), transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    edge: new LineBasicMaterial({ color: bright(color, 1.8), transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false }),
    solid: new MeshBasicMaterial({ color: bright(color, 1.9) }),
  };
}

/** A see-through shape with bright edges. */
function holo(geometry, materials, { fill = true, angle = 15 } = {}) {
  const group = new Group();
  if (fill) group.add(new Mesh(geometry, materials.fill));
  group.add(new LineSegments(new EdgesGeometry(geometry, angle), materials.edge));
  return group;
}

const at = (object, x, y, z) => {
  object.position.set(x, y, z);
  return object;
};

// What floats above each building, by the project's theme (see stopTheme in plan.js).
// Each is about two metres across and is scaled up by the caller.
const TOPPERS = {
  gem(m) {
    const group = new Group();
    group.add(holo(new OctahedronGeometry(1.15), m), holo(new OctahedronGeometry(0.5), m, { fill: false }));
    return group;
  },

  // A linked list: three nodes joined by arrows.
  nodes(m) {
    const group = new Group();
    for (const x of [-1.25, 0, 1.25]) group.add(at(holo(new BoxGeometry(0.7, 0.7, 0.7), m), x, 0, 0));
    for (const x of [-0.625, 0.625]) {
      group.add(at(new Mesh(new BoxGeometry(0.5, 0.06, 0.06), m.solid), x, 0, 0));
      const tip = at(new Mesh(new ConeGeometry(0.11, 0.22, 8), m.solid), x + 0.2, 0, 0);
      tip.rotation.z = -Math.PI / 2;
      group.add(tip);
    }
    return group;
  },

  car(m) {
    const car = new Group();
    car.add(at(holo(new BoxGeometry(2.4, 0.5, 1.05), m), 0, 0.38, 0), at(holo(new BoxGeometry(1.2, 0.42, 0.92), m), -0.12, 0.84, 0));
    for (const x of [-0.75, 0.75]) {
      for (const z of [-0.55, 0.55]) {
        const wheel = at(holo(new CylinderGeometry(0.27, 0.27, 0.16, 12), m), x, 0.2, z);
        wheel.rotation.x = Math.PI / 2;
        car.add(wheel);
      }
    }
    car.add(at(new Mesh(new BoxGeometry(0.08, 0.12, 0.8), m.solid), 1.22, 0.42, 0));
    car.position.y = -0.5;
    const group = new Group();
    group.add(car);
    return group;
  },

  globe(m) {
    const group = new Group();
    group.add(holo(new IcosahedronGeometry(1, 1), m, { angle: 1 }));
    const flat = new Mesh(new TorusGeometry(1.42, 0.022, 6, 48), m.solid);
    flat.rotation.x = Math.PI / 2;
    const tilted = new Mesh(new TorusGeometry(1.62, 0.018, 6, 48), m.solid);
    tilted.rotation.set(Math.PI / 2.6, 0.5, 0);
    group.add(flat, tilted, at(new Mesh(new SphereGeometry(0.09, 10, 8), m.solid), 1.42, 0, 0));
    return group;
  },

  // T.A Core's own head.
  robot(m) {
    const group = new Group();
    group.add(holo(new BoxGeometry(1.7, 1.4, 1.25), m), at(holo(new BoxGeometry(1.3, 0.78, 0.1), m, { fill: false }), 0, 0.04, 0.63));
    for (const x of [-0.27, 0.27]) group.add(at(new Mesh(new CapsuleGeometry(0.085, 0.2, 4, 10), m.solid), x, 0.08, 0.7));
    for (const x of [-0.93, 0.93]) {
      const ear = at(holo(new CylinderGeometry(0.17, 0.17, 0.16, 10), m), x, 0, 0);
      ear.rotation.z = Math.PI / 2;
      group.add(ear);
    }
    group.add(at(new Mesh(new CylinderGeometry(0.03, 0.03, 0.34, 6), m.solid), 0, 0.87, 0), at(new Mesh(new SphereGeometry(0.1, 12, 8), m.solid), 0, 1.08, 0));
    return group;
  },

  // A CV page inside a clock ring: "Seven Seconds".
  document(m) {
    const group = new Group();
    group.add(holo(new BoxGeometry(1.35, 1.8, 0.05), m));
    group.add(at(new Mesh(new BoxGeometry(0.5, 0.09, 0.07), m.solid), -0.2, 0.55, 0.05));
    for (const y of [0.2, -0.1, -0.4]) group.add(at(new Mesh(new BoxGeometry(0.9, 0.06, 0.07), m.solid), 0, y, 0.05));
    group.add(new Mesh(new TorusGeometry(1.42, 0.024, 6, 48), m.solid));
    const hand = new Group();
    hand.add(at(new Mesh(new BoxGeometry(0.05, 1.3, 0.05), m.solid), 0, 0.65, 0));
    hand.position.z = 0.12;
    group.add(hand);
    group.userData.tick = (time) => {
      hand.rotation.z = -time * 0.9;
    };
    return group;
  },

  // A graduation cap with its tassel.
  cap(m) {
    const group = new Group();
    const board = at(holo(new BoxGeometry(2.3, 0.1, 2.3), m), 0, 0.3, 0);
    board.rotation.y = Math.PI / 4;
    group.add(board, at(holo(new CylinderGeometry(0.8, 0.92, 0.55, 8), m), 0, -0.02, 0));
    group.add(at(new Mesh(new SphereGeometry(0.1, 10, 8), m.solid), 0, 0.4, 0));
    group.add(at(new Mesh(new BoxGeometry(1.2, 0.04, 0.04), m.solid), 0.6, 0.38, 0));
    group.add(at(new Mesh(new BoxGeometry(0.05, 0.6, 0.05), m.solid), 1.2, 0.08, 0));
    group.add(at(new Mesh(new ConeGeometry(0.09, 0.26, 8), m.solid), 1.2, -0.3, 0));
    return group;
  },

  // A bank front: columns under a pediment.
  bank(m) {
    const group = new Group();
    group.add(at(holo(new BoxGeometry(2.6, 0.22, 1.3), m), 0, -0.75, 0), at(holo(new BoxGeometry(2.3, 0.16, 1.15), m), 0, -0.56, 0));
    for (const x of [-0.84, -0.28, 0.28, 0.84]) group.add(at(holo(new CylinderGeometry(0.12, 0.12, 1, 8), m), x, 0.02, 0));
    group.add(at(holo(new BoxGeometry(2.4, 0.18, 1.2), m), 0, 0.61, 0));
    const pediment = new CylinderGeometry(1, 1, 1.2, 3).rotateX(-Math.PI / 2).scale(1.39, 0.42, 1);
    group.add(at(holo(pediment, m), 0, 0.91, 0));
    return group;
  },

  chart(m) {
    const group = new Group();
    [0.5, 0.9, 1.3, 1.8].forEach((height, index) => {
      group.add(at(holo(new BoxGeometry(0.42, height, 0.42), m), -0.9 + index * 0.6, -0.9 + height / 2, 0));
    });
    return group;
  },
};

/** A tall, faint column of light. Brightest at its foot, gone at the top. */
function lightBeam(color, height, { foot = 1.2, tip = 0.25, strength = 0.08 } = {}) {
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
function latticeGeometry(width, depth, from, to) {
  const hw = width / 2;
  const hd = depth / 2;
  const corners = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const points = [];
  for (let y = from; y <= to + 0.01; y += FLOOR) {
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
  new LineBasicMaterial({ color: bright(color, 1.5), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });

/** A plane lying on the ground that adds its (black-backed) texture as light. */
function groundMark(canvas, size) {
  const geometry = new PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);
  return new Mesh(geometry, new MeshBasicMaterial({ map: canvasTexture(canvas), blending: AdditiveBlending, transparent: true, depthWrite: false }));
}

/**
 * The buildings the tour stops at, one per project, plus the plaza at the end of
 * the street. Solid walls go into the shared `blocks` mesh; signs, screens,
 * holograms and cranes are added as their own small meshes.
 */
export function createLandmarks(context) {
  const { scene, shared, palette, random, layout, blocks, decals, glows, bollards, trees, family, rtl, text, imageFor, life } = context;
  const tickers = [];
  const groups = [];
  const loader = new TextureLoader();
  const pad = (number) => String(number).padStart(2, "0");

  /** A spot on the map with its own direction: local +z points toward the visitor. */
  const openSite = ({ x, z, turn }) => {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const world = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
    const group = new Group();
    group.position.set(x, 0, z);
    group.rotation.y = turn;
    scene.add(group);
    groups.push({ group, z });
    return {
      group,
      world,
      facing: { x: sin, z: cos },
      /** Adds a solid box, placed in the site's own coordinates. */
      box: ({ x: lx = 0, z: lz = 0, ...rest }) => blocks.add({ ...world(lx, lz), turn, ...rest }),
      glow: ({ x: lx = 0, z: lz = 0, ...rest }) => glows.add({ ...world(lx, lz), ...rest }),
    };
  };

  /** A crane with a slowly swinging jib and a red light on top. */
  const addCrane = (site, { x, z, height }) => {
    const metal = new MeshBasicMaterial({ color: palette.amber.clone().multiplyScalar(0.5) });
    site.box({ x, z, w: 0.8, h: height, d: 0.8, style: STYLE.plain, tint: palette.amber.clone().multiplyScalar(0.55), lit: 1 });
    const jib = at(new Group(), x, height, z);
    jib.add(at(new Mesh(new BoxGeometry(24, 0.45, 0.45), metal), 8, 0, 0));
    jib.add(at(new Mesh(new BoxGeometry(2.2, 1.4, 1.2), metal), -3.4, -0.5, 0));
    jib.add(at(new Mesh(new BoxGeometry(1.2, 1.2, 1.2), metal), 0.4, -0.8, 0.9));
    jib.add(at(new Mesh(new BoxGeometry(0.06, 9, 0.06), metal), 15, -4.5, 0));
    jib.add(at(new Mesh(new BoxGeometry(0.5, 0.5, 0.5), metal), 15, -9.2, 0));
    jib.add(at(new Mesh(new SphereGeometry(0.22, 10, 8), new MeshBasicMaterial({ color: bright(palette.red, 2.2) })), 20, 0.4, 0));
    site.group.add(jib);
    const start = random.range(0, Math.PI * 2);
    const phase = random.range(0, 6);
    tickers.push((time) => {
      jib.rotation.y = start + Math.sin(time * 0.12 + phase) * 0.8;
    });
    site.glow({ x, y: height + 1.2, z, color: palette.red, size: 3, strength: 1.2, blink: 2.2, phase });
  };

  /** A framed screen showing the project's picture, or a drawn stand-in. */
  const addScreen = (site, station, { x = 0, y, z, width }) => {
    const { stop, color } = station;
    const height = (width * 9) / 16;
    site.group.add(at(new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ color: "#03060e" })), x, y, z));
    const fallback = canvasTexture(drawScreenFallback({ year: stop.year, color }));
    const picture = at(new Mesh(new PlaneGeometry(width - 0.3, height - 0.3), new MeshBasicMaterial({ map: fallback })), x, y, z + 0.04);
    site.group.add(picture);

    // A neon frame around it.
    const tube = { style: STYLE.neon, tint: color, lit: 1.6, d: 0.13 };
    site.box({ ...tube, x, y: y + height / 2 - 0.02, z, w: width + 0.3, h: 0.13 });
    site.box({ ...tube, x, y: y - height / 2 - 0.11, z, w: width + 0.3, h: 0.13 });
    for (const sx of [-1, 1]) site.box({ ...tube, x: x + sx * (width / 2 + 0.08), y: y - height / 2, z, w: 0.13, h: height });

    const url = imageFor(stop);
    if (!url) return;
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
        const frame = (width - 0.3) / (height - 0.3);
        const aspect = texture.image.width / texture.image.height;
        picture.scale.set(Math.min(1, aspect / frame), Math.min(1, frame / aspect), 1);
        picture.material.map.dispose();
        picture.material.map = texture;
        picture.material.needsUpdate = true;
      },
      undefined,
      () => {}
    );
  };

  /** The name sign, the entrance, and the square in front: what every stop has. */
  const dress = (site, station, { signZ, doorWidth = 2.6, doorHeight = 3.1, doorY = 0, doorZ }) => {
    const { stop, color, index, tier, plazaOffset, signWidth, signY } = station;

    const label = stop.year ? `${pad(index + 1)} · ${stop.year}` : pad(index + 1);
    const sign = new Mesh(
      new PlaneGeometry(signWidth, signWidth * SIGN_RATIO),
      new MeshBasicMaterial({ map: canvasTexture(drawTitleSign({ title: stop.title, label, color, family, rtl })), transparent: true, depthWrite: false })
    );
    site.group.add(at(sign, 0, signY, signZ));
    sign.renderOrder = 3;

    // A lit doorway under a glowing canopy.
    site.box({ y: doorY, z: doorZ + 0.04, w: doorWidth, h: doorHeight, d: 0.12, style: STYLE.neon, tint: palette.warm, lit: 1.1 });
    site.box({ y: doorY + doorHeight + 0.35, z: doorZ + 0.75, w: doorWidth + 1.8, h: 0.2, d: 1.5, style: STYLE.neon, tint: color, lit: 1.3 });

    // On the ground: the stop's number in a ring, and light spilling from the door and the sign.
    site.group.add(at(groundMark(drawStopMarker({ number: pad(index + 1), color }), 8.5), 0, 0.07, plazaOffset));
    const door = site.world(0, doorZ + 0.5);
    decals.add({ ...door, width: doorWidth + 3, length: 11, color: palette.warm, strength: 0.34, streak: true, towardX: site.facing.x, towardZ: site.facing.z });
    decals.add({ ...door, width: signWidth, length: 15, color, strength: 0.22, streak: true, towardX: site.facing.x, towardZ: site.facing.z });
    decals.add({ ...site.world(0, plazaOffset), width: 26, color, strength: 0.13 });

    // Bollards around the front of the ring, and a tree on each side of the entrance.
    for (let step = 0; step < 6; step += 1) {
      const angle = ((-100 + step * 40) * Math.PI) / 180;
      const spot = site.world(Math.sin(angle) * 5.2, plazaOffset + Math.cos(angle) * 5.2);
      bollards.add({ ...spot, color: bright(color, 2) });
      glows.add({ ...spot, y: 1, color, size: 1.5, strength: 0.6 });
    }
    const leaves = tier < 0.25 ? palette.mint.clone().lerp(palette.amber, 0.45).multiplyScalar(0.5) : bright(random.pick([palette.pink, palette.mint, palette.violet]), 0.8);
    for (const sx of [-1, 1]) {
      trees.add({ ...site.world(sx * (station.width / 2 + 2.4), doorZ + 2.2), turn: random.range(0, 6), scale: random.range(0.9, 1.2), color: leaves });
    }
  };

  /** The hologram above a building, turning slowly. */
  const addTopper = (site, station, { x = 0, y, z = 0, size }) => {
    const topper = (TOPPERS[station.stop.theme] ?? TOPPERS.gem)(holoMaterials(station.color));
    topper.scale.setScalar(size);
    site.group.add(at(topper, x, y, z));
    const phase = random.range(0, 6);
    tickers.push((time) => {
      topper.rotation.y = time * 0.35 + phase;
      topper.position.y = y + Math.sin(time * 0.8 + phase) * 0.35;
      topper.userData.tick?.(time);
    });
    return topper;
  };

  // --- An ordinary project: from a small shop to a neon tower, by `tier` ---
  const buildProject = (station) => {
    const { width, depth, height, tier, color, stop } = station;
    const site = openSite(station);
    const seed = random.range(1, 90);
    const lit = 0.34 + 0.2 * tier;
    const front = depth / 2;
    const tube = { style: STYLE.neon, tint: color, lit: 1.75 };

    const { base, hasTower } = station;
    site.box({ w: width, h: base, d: depth, seed, tier, lit, tint: color, style: STYLE.shop });
    // Neon along the top of the front, and down its corners on the newer buildings.
    site.box({ ...tube, y: base - 0.08, z: front + 0.02, w: width + 0.3, h: 0.16, d: 0.16 });
    if (tier > 0.2) for (const sx of [-1, 1]) site.box({ ...tube, x: (sx * width) / 2, z: front, w: 0.16, h: base, d: 0.16, lit: 1.5 });

    let top = base;
    let screenWidth = Math.min(width - 3, 8.5);
    let screenZ = front - 0.7;
    if (hasTower) {
      const towerWidth = width * 0.74;
      const towerDepth = depth * 0.74;
      const full = height - base;
      // An unfinished project is built only part of the way up.
      const built = stop.inProgress ? Math.max(FLOOR * 3, Math.round((full * (0.3 + (0.7 * stop.progress) / 100)) / FLOOR) * FLOOR) : full;
      site.box({ y: base, w: towerWidth, h: built, d: towerDepth, seed: seed + 3, tier, lit, tint: color });
      if (tier > 0.4) {
        for (const sx of [-1, 1]) site.box({ ...tube, x: (sx * towerWidth) / 2, y: base, z: towerDepth / 2, w: 0.16, h: built, d: 0.16, tier: 0.4, seed: seed + sx });
      }
      top = base + built;
      screenWidth = Math.min(towerWidth - 1.2, 10.5, ((built - 1.6) * 16) / 9);
      screenZ = towerDepth / 2 + 0.16;

      if (stop.inProgress) {
        // The floors still to come, drawn as a blueprint, with a crane beside them.
        site.group.add(new LineSegments(latticeGeometry(towerWidth, towerDepth, top, base + full), blueprint(color)));
        addCrane(site, { x: -towerWidth / 2 - 1.8, z: -towerDepth / 4, height: base + full + 8 });
        top = base + full;
      } else if (tier > 0.55) {
        const crown = Math.min(10, full * 0.16);
        site.box({ y: top, w: width * 0.5, h: crown, d: depth * 0.5, seed: seed + 5, tier, lit, tint: color });
        top += crown;
        site.box({ y: top, w: 0.4, h: 8, d: 0.4, style: STYLE.plain, lit: 0 });
        site.glow({ y: top + 8.2, color: palette.red, size: 3.4, strength: 1.2, blink: 2, phase: seed });
      }
    } else {
      // A small building carries its screen on the roof, like an old billboard.
      for (const sx of [-1, 1]) site.box({ x: sx * screenWidth * 0.3, y: base, z: screenZ - 0.25, w: 0.22, h: 1, d: 0.22, style: STYLE.plain, lit: 0 });
    }

    const screenHeight = (screenWidth * 9) / 16;
    const screenY = base + (hasTower ? 1.3 : 1) + screenHeight / 2;
    addScreen(site, station, { y: screenY, z: screenZ, width: screenWidth });
    if (!hasTower) top = screenY + screenHeight / 2;

    if (stop.inProgress) {
      const board = new Mesh(
        new PlaneGeometry(7.2, 2.4),
        new MeshBasicMaterial({ map: canvasTexture(drawProgressSign({ name: text.inProgress, progress: stop.progress, color, family, rtl })), transparent: true, depthWrite: false })
      );
      board.renderOrder = 3;
      site.group.add(at(board, 0, screenY + screenHeight / 2 + 1.8, screenZ + 0.1));
    }

    dress(site, station, { signZ: front + 0.22, doorZ: front });
    addTopper(site, station, { y: top + 4 + tier * 2.5, size: 2 + 2.4 * tier });
    site.group.add(at(lightBeam(color, 110), 0, top, 0));
  };

  // --- Graduation Square: a hall with a colonnade, two wings and a tower ---
  const buildGraduation = (station) => {
    const { depth, color } = station;
    const site = openSite(station);
    const seed = random.range(1, 90);
    const front = depth / 2;
    const stone = { style: STYLE.plain, tint: palette.wallHigh.clone().lerp(palette.cool, 0.14), lit: 1 };
    const tube = { style: STYLE.neon, tint: color, lit: 1.7 };

    // Steps up to the colonnade.
    site.box({ ...stone, z: front + 2.6, w: 30, h: 0.45, d: 5.2 });
    site.box({ ...stone, y: 0.45, z: front + 1.9, w: 27, h: 0.45, d: 3.8 });
    site.box({ ...stone, y: 0.9, z: front + 1.2, w: 24, h: 0.45, d: 2.4 });

    // The hall, its wings, and the tower behind.
    site.box({ w: 22, h: 15, d: depth, seed, tier: 0.9, lit: 0.5, tint: color });
    for (const sx of [-1, 1]) site.box({ x: sx * 14.5, w: 7, h: 22.4, d: depth - 2, seed: seed + sx, tier: 1, lit: 0.45, tint: color, style: STYLE.shop });
    site.box({ y: 15, z: -1, w: 11, h: 38, d: 11, seed: seed + 4, tier: 1, lit: 0.5, tint: color });
    site.box({ y: 53, z: -1, w: 7, h: 6, d: 7, seed: seed + 6, tier: 1, lit: 0.6, tint: color });
    site.box({ y: 59, z: -1, w: 0.4, h: 9, d: 0.4, style: STYLE.plain, lit: 0 });
    site.glow({ y: 68.3, z: -1, color, size: 4, strength: 1.3, blink: 1.7, phase: seed });
    for (const sx of [-1, 1]) site.box({ ...tube, x: sx * 5.5, y: 15, z: 4.5, w: 0.16, h: 38, d: 0.16, tier: 0.4, seed: seed + sx });

    // Five columns lit from below, under a beam and a pediment.
    for (let index = 0; index < 5; index += 1) {
      const x = -9 + index * 4.5;
      site.box({ ...stone, x, y: 1.35, z: front + 1.5, w: 1.15, h: 11.4, d: 1.15 });
      site.box({ ...tube, x, y: 12.75, z: front + 1.5, w: 1.5, h: 0.14, d: 1.5, lit: 1.5 });
      site.glow({ x, y: 2, z: front + 2.4, color, size: 2.4, strength: 0.55 });
    }
    site.box({ ...stone, y: 12.9, z: front + 1.2, w: 23.5, h: 2.2, d: 3.4 });
    site.box({ ...stone, y: 15.1, z: front + 1.9, w: 15.5, h: 5.2, d: 1.2, lit: 0.8 });
    site.box({ ...tube, y: 15.02, z: front + 2.95, w: 23.8, h: 0.16, d: 0.16 });

    addScreen(site, station, { y: 25.7, z: 4.66, width: 9.5 });
    dress(site, station, { signZ: front + 2.56, doorWidth: 4, doorHeight: 5.2, doorY: 1.35, doorZ: front });

    // A big graduation cap above the pediment, and gold light from the wings.
    addTopper(site, station, { y: 35, z: 8, size: 4.6 });
    for (const sx of [-1, 1]) site.group.add(at(lightBeam(color, 120, { strength: 0.07 }), sx * 14.5, 22.4, 0));

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
            // Each piece glints as it turns.
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
    site.group.add(points);
  };

  // --- The co-op training: the tallest tower in the city ---
  const buildCoop = (station) => {
    const { height, color } = station;
    const site = openSite(station);
    const seed = random.range(1, 90);
    const front = 10;
    const tube = { style: STYLE.neon, tint: color, lit: 1.75 };

    site.box({ w: 26, h: 12.8, d: 20, seed, tier: 1, lit: 0.6, tint: color, style: STYLE.shop });
    site.box({ ...tube, y: 12.72, z: front + 0.02, w: 26.3, h: 0.16, d: 0.16 });
    for (const sx of [-1, 1]) site.box({ ...tube, x: sx * 13, z: front, w: 0.16, h: 12.8, d: 0.16, lit: 1.5 });

    // The main tower, with a shorter one beside it.
    site.box({ x: -3, y: 12.8, w: 15, h: height - 12.8, d: 13, seed: seed + 2, tier: 1, lit: 0.55, tint: color });
    site.box({ x: 8.5, y: 12.8, z: -1, w: 8.5, h: 52, d: 10, seed: seed + 4, tier: 1, lit: 0.5, tint: color });
    site.box({ x: -3, y: height, w: 10, h: 8, d: 9, seed: seed + 6, tier: 1, lit: 0.65, tint: color });
    site.box({ x: -3, y: height + 8, w: 0.5, h: 14, d: 0.5, style: STYLE.plain, lit: 0 });
    site.glow({ x: -3, y: height + 22.4, color: palette.white, size: 4.5, strength: 1.2, blink: 1.5, phase: seed });
    // Fins of green light up the corners.
    for (const sx of [-1, 1]) site.box({ ...tube, x: -3 + sx * 7.5, y: 12.8, z: 6.5, w: 0.2, h: height - 12.8, d: 0.2, tier: 0.5, seed: seed + sx });
    for (const sx of [-1, 1]) site.box({ ...tube, x: 8.5 + sx * 4.25, y: 12.8, z: 4, w: 0.16, h: 52, d: 0.16, tier: 0.5, seed: seed + 9 + sx, lit: 1.5 });

    addScreen(site, station, { x: -3, y: 17.15, z: 6.66, width: 10.5 });
    dress(site, station, { signZ: front + 0.22, doorWidth: 5, doorHeight: 3.6, doorZ: front });

    // Two rings turning around the crown, and a bank front above the shorter tower.
    const materials = holoMaterials(color);
    const rings = at(new Group(), -3, height - 6, 0);
    const ring = new Mesh(new TorusGeometry(10.5, 0.12, 6, 64), materials.solid);
    ring.rotation.x = Math.PI / 2;
    const tilted = new Mesh(new TorusGeometry(12, 0.08, 6, 64), materials.solid);
    tilted.rotation.x = Math.PI / 2.4;
    rings.add(ring, tilted);
    site.group.add(rings);
    tickers.push((time) => {
      rings.rotation.y = time * 0.2;
      tilted.rotation.z = time * 0.15;
    });
    addTopper(site, station, { x: 8.5, y: 71, z: -1, size: 3.4 });
    decals.add({ ...site.world(8.5, -1), y: 64.9, width: 8, color, strength: 0.5 });
    site.group.add(at(lightBeam(color, 130, { foot: 2, strength: 0.07 }), -3, height + 8, 0));

    // Searchlights sweeping from the roof of the lobby.
    for (const sx of [-1, 1]) {
      const pivot = at(new Group(), sx * 11, 12.8, 8);
      const beam = lightBeam(palette.cool, 150, { foot: 0.4, tip: 4.5, strength: 0.05 });
      beam.rotation.z = 0.5;
      pivot.add(beam);
      site.group.add(pivot);
      const phase = random.range(0, 6);
      tickers.push((time) => {
        pivot.rotation.y = time * 0.22 * sx + phase;
      });
    }
  };

  // --- Unfinished projects with no post yet: construction sites near the end ---
  const buildLot = (lot) => {
    const site = openSite(lot);
    const color = palette.amber;
    const full = FLOOR * 8;
    const built = Math.max(FLOOR, Math.round((full * lot.item.progress) / 100 / FLOOR) * FLOOR);
    site.box({ w: 13, h: built, d: 13, seed: random.range(1, 90), style: STYLE.plain, tint: palette.steel, lit: 0.8 });
    site.group.add(new LineSegments(latticeGeometry(13, 13, built, full), blueprint(color)));
    addCrane(site, { x: -8.4, z: -3, height: full + 9 });

    const board = new Mesh(
      new PlaneGeometry(8.4, 2.8),
      new MeshBasicMaterial({ map: canvasTexture(drawProgressSign({ name: lot.item.name, progress: lot.item.progress, color, family, rtl })), transparent: true, depthWrite: false })
    );
    board.renderOrder = 3;
    site.group.add(at(board, 0, Math.max(built + 2.4, 6.5), 6.8));
    decals.add({ ...site.world(0, 9), width: 20, color, strength: 0.14 });
    for (const sx of [-1, 1]) {
      const spot = site.world(sx * 5, 8.5);
      bollards.add({ ...spot, color: bright(color, 2) });
      glows.add({ ...spot, y: 1, color, size: 1.5, strength: 0.6 });
    }
  };

  // --- The plaza at the end: an empty plot with the outline of a tower to come ---
  const buildFinale = () => {
    const site = openSite({ x: 0, z: layout.plaza.z, turn: 0 });
    const color = palette.accent;
    const { radius } = layout.plaza;

    const disc = new CircleGeometry(radius, 64);
    disc.rotateX(-Math.PI / 2);
    site.group.add(at(new Mesh(disc, new MeshBasicMaterial({ color: palette.pavement.clone().multiplyScalar(0.8) })), 0, 0.03, 0));
    site.group.add(at(groundMark(drawPlazaRings({ color }), radius * 2), 0, 0.08, 0));
    decals.add({ x: 0, z: layout.plaza.z, width: radius * 2.4, color, strength: 0.16, y: 0.1 });

    // The blueprint of the next tower, floor by floor, with a line of light scanning up it.
    site.box({ w: 18, h: 1.1, d: 18, style: STYLE.plain, tint: palette.steel, lit: 0.7 });
    const tower = new Group();
    const steps = [
      [16, 1.1, 20.3],
      [11, 20.3, 39.5],
      [7, 39.5, 52.3],
    ];
    for (const [size, from, to] of steps) tower.add(new LineSegments(latticeGeometry(size, size, from, to), blueprint(color, 0.8)));
    const spire = new BufferGeometry();
    spire.setAttribute("position", new BufferAttribute(new Float32Array([0, 52.3, 0, 0, 66, 0]), 3));
    tower.add(new LineSegments(spire, blueprint(color, 0.9)));
    site.group.add(tower);

    const scanGeometry = new PlaneGeometry(1, 1);
    scanGeometry.rotateX(-Math.PI / 2);
    const scan = new Mesh(scanGeometry, new MeshBasicMaterial({ color: bright(color, 0.9), transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    site.group.add(scan);
    tickers.push((time) => {
      const y = 1.1 + ((time * 4.5) % 51.2);
      const size = steps.find(([, , to]) => y < to)?.[0] ?? 7;
      scan.position.y = y;
      scan.scale.set(size, 1, size);
    });
    site.group.add(at(lightBeam(color, 150, { foot: 3, tip: 0.4, strength: 0.09 }), 0, 1.1, 0));
    site.glow({ y: 66.4, color, size: 4.5, strength: 1.3, blink: 1.4 });

    // A sign facing the visitor.
    const sign = new Mesh(
      new PlaneGeometry(15, 4.4),
      new MeshBasicMaterial({ map: canvasTexture(drawHoloText({ lines: text.finaleSign, color, family, rtl })), transparent: true, depthWrite: false })
    );
    sign.renderOrder = 3;
    // High enough to read above the panel that closes the tour.
    site.group.add(at(sign, 0, 24, 11.5));

    // Lights and trees around the rim.
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const spot = { x: Math.sin(angle) * (radius - 1.2), z: layout.plaza.z + Math.cos(angle) * (radius - 1.2) };
      if (Math.abs(spot.x) < 8) continue;
      bollards.add({ ...spot, color: bright(color, 2) });
      glows.add({ ...spot, y: 1, color, size: 1.5, strength: 0.6 });
      if (step % 2 === 0) {
        trees.add({ x: spot.x * 0.82, z: layout.plaza.z + (spot.z - layout.plaza.z) * 0.82, turn: step, scale: 1.1, color: bright(random.pick([palette.pink, palette.mint, palette.violet]), 0.8) });
      }
    }
  };

  for (const station of layout.stations) {
    if (station.kind === "graduation") buildGraduation(station);
    else if (station.kind === "coop") buildCoop(station);
    else buildProject(station);
  }
  layout.lots.forEach(buildLot);
  buildFinale();

  return {
    update(time, cameraZ) {
      for (const entry of groups) entry.group.visible = Math.abs(entry.z - cameraZ) < VISIBLE_RANGE;
      for (const tick of tickers) tick(time);
    },
  };
}
