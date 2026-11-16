import { BufferAttribute, BufferGeometry, Color, DoubleSide, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

import { END_PLAZA, SIDE_STREETS, STREETS, districtAt, facadeOf, junctionById, roundaboutOf } from "@/lib/explore/city";

import { treeGrate } from "./furniture";
import { FOG, LIGHTING, NOISE, OUTPUT } from "./shaders";
import { blocksView, kerbSlots } from "./streets";

// Trees: date palms along the old town, on the squares and round the
// roundabouts, broad-leaved trees elsewhere, and a few softly glowing trees in
// the newest district. They sway a little in the wind.

const KERB = 0.15;
const UP = new Vector3(0, 1, 0);
// The parts of a tree, as the material paints them.
const TRUNK = 0;
const FROND = 1;
const LEAVES = 2;
const FRUIT = 3;

/** A geometry from loose triangles: positions, normals, a part for each vertex and a pair of numbers for its pattern. */
function assemble({ position, normal, part, uv }) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normal), 3));
  geometry.setAttribute("aPart", new BufferAttribute(new Float32Array(part), 1));
  geometry.setAttribute("aUv", new BufferAttribute(new Float32Array(uv), 2));
  return geometry;
}

/**
 * A trunk or a branch: a tube round a row of centres ([x, y, z], with a radius
 * for each), `sides` round. The pattern numbers are how far round and how high.
 */
function tube(centres, radii, sides, part = TRUNK) {
  const data = { position: [], normal: [], part: [], uv: [] };
  const ring = (index) => {
    const [cx, cy, cz] = centres[index];
    return Array.from({ length: sides + 1 }, (_, side) => {
      const angle = (side / sides) * Math.PI * 2;
      const n = [Math.sin(angle), 0, Math.cos(angle)];
      return { p: [cx + n[0] * radii[index], cy, cz + n[2] * radii[index]], n, uv: [side / sides, cy] };
    });
  };
  for (let index = 0; index < centres.length - 1; index += 1) {
    const lower = ring(index);
    const upper = ring(index + 1);
    for (let side = 0; side < sides; side += 1) {
      for (const corner of [lower[side], lower[side + 1], upper[side + 1], lower[side], upper[side + 1], upper[side]]) {
        data.position.push(...corner.p);
        data.normal.push(...corner.n);
        data.part.push(part);
        data.uv.push(...corner.uv);
      }
    }
  }
  return assemble(data);
}

/** A primitive tagged as one part of a tree. */
function lump(source, part) {
  const geometry = source.index ? source.toNonIndexed() : source;
  geometry.deleteAttribute("uv");
  const count = geometry.attributes.position.count;
  geometry.setAttribute("aPart", new BufferAttribute(new Float32Array(count).fill(part), 1));
  geometry.setAttribute("aUv", new BufferAttribute(new Float32Array(count * 2), 2));
  return geometry;
}

/**
 * A date palm about 9 m tall: a leaning trunk ringed with old leaf scars, a crown
 * of arching fronds, and bunches of dates. `light` makes it of fewer pieces.
 */
function palmGeometry(light = false) {
  const height = 7.6;
  const lean = 0.55;
  const steps = light ? 7 : 12;
  const centres = [];
  const radii = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    centres.push([lean * t * t, height * t, 0]);
    // Flared at the foot, a little swollen under the crown.
    radii.push(0.2 + 0.12 * Math.exp(-t * 14) + 0.035 * Math.exp(-((1 - t) ** 2) * 60) - 0.03 * t);
  }
  const pieces = [tube(centres, radii, light ? 6 : 9)];
  const crown = [lean, height, 0];
  pieces.push(lump(new SphereGeometry(0.34, light ? 6 : 10, light ? 5 : 8).scale(1, 1.25, 1).translate(crown[0], crown[1] + 0.05, crown[2]), TRUNK));

  // Fronds: each a spine that arches out and droops, with a row of leaflets hanging to either side.
  const fronds = { position: [], normal: [], part: [], uv: [] };
  const count = light ? 12 : 17;
  const segments = light ? 5 : 7;
  for (let f = 0; f < count; f += 1) {
    const angle = (f / count) * Math.PI * 2 + (f % 2) * 0.2;
    // The upper ones stand up before they fall; the lower ones hang.
    const tier = (f % 3) / 2;
    const length = 3.5 + tier * 0.6 + (f % 2) * 0.25;
    const rise = 0.95 - tier * 0.75;
    const droop = 0.85 + tier * 0.25;
    const out = [Math.sin(angle), Math.cos(angle)];
    const spine = (s) => {
      const reach = length * (s - 0.22 * s * s);
      return [crown[0] + out[0] * reach, crown[1] + 0.25 + length * (rise * s - droop * s * s), crown[2] + out[1] * reach];
    };
    const side = [out[1], 0, -out[0]];
    for (let segment = 0; segment < segments; segment += 1) {
      const s0 = segment / segments;
      const s1 = (segment + 1) / segments;
      const p0 = spine(s0);
      const p1 = spine(s1);
      const width = (s) => 0.62 * Math.sin(Math.PI * (0.06 + 0.94 * s)) ** 0.7 + 0.03;
      for (const hand of [-1, 1]) {
        // Leaflets hang from the spine: out to the side and a little down.
        const edge = (p, s) => [p[0] + side[0] * hand * width(s), p[1] - width(s) * 0.42, p[2] + side[2] * hand * width(s)];
        const e0 = edge(p0, s0);
        const e1 = edge(p1, s1);
        const a = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const b = [e0[0] - p0[0], e0[1] - p0[1], e0[2] - p0[2]];
        let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const size = Math.hypot(...n) || 1;
        n = n.map((value) => (value / size) * (n[1] < 0 ? -1 : 1));
        const corners = [
          [p0, 0, s0],
          [e0, hand, s0],
          [e1, hand, s1],
          [p0, 0, s0],
          [e1, hand, s1],
          [p1, 0, s1],
        ];
        for (const [p, u, v] of corners) {
          fronds.position.push(...p);
          fronds.normal.push(...n);
          fronds.part.push(FROND);
          fronds.uv.push(u, v);
        }
      }
    }
  }
  pieces.push(assemble(fronds));
  // Bunches of dates under the crown.
  for (const angle of [0.6, 2.7, 4.6]) {
    pieces.push(lump(new SphereGeometry(0.2, light ? 5 : 7, light ? 4 : 6).scale(1, 1.5, 1).translate(crown[0] + Math.sin(angle) * 0.42, crown[1] - 0.42, crown[2] + Math.cos(angle) * 0.42), FRUIT));
  }
  return mergeGeometries(pieces);
}

/** Cheap lumpy noise for shaping a canopy: about -1 to 1. */
function lumpiness(x, y, z, seed) {
  return Math.sin(x * 2.1 + seed) * Math.cos(y * 2.6 + seed * 1.7) * 0.5 + Math.sin(z * 2.9 + x * 1.3 + seed * 0.6) * 0.3 + Math.cos(y * 4.3 + z * 3.7 + seed * 2.3) * 0.2;
}

/** A clump of leaves: a ball pushed in and out into lobes. */
function clump(radius, x, y, z, seed, detail) {
  const ball = mergeVertices(new IcosahedronGeometry(radius, detail));
  const positions = ball.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const px = positions.getX(index);
    const py = positions.getY(index);
    const pz = positions.getZ(index);
    const swell = 1 + 0.26 * lumpiness(px / radius * 1.6, py / radius * 1.6, pz / radius * 1.6, seed);
    positions.setXYZ(index, px * swell, py * swell * 0.86, pz * swell);
  }
  ball.computeVertexNormals();
  return lump(ball.translate(x, y, z), LEAVES);
}

/** A broad tree about 6 m tall: a trunk that forks into boughs, under a canopy of leaf clumps. `light` makes it of fewer pieces. */
function broadleafGeometry(light = false) {
  const pieces = [
    tube(
      [
        [0, 0, 0],
        [0.02, 0.5, 0],
        [0.06, 1.4, 0.02],
        [0.1, 2.5, 0.05],
      ],
      [0.24, 0.16, 0.13, 0.11],
      8
    ),
  ];
  const boughs = [
    [0.95, 4.1, 0.25, 1.25],
    [-0.85, 3.95, -0.5, 1.15],
    [0.1, 4.75, -0.15, 1.35],
    [-0.25, 3.7, 0.95, 1.0],
    [0.55, 3.55, -0.9, 0.95],
  ];
  boughs.forEach(([x, y, z, radius], index) => {
    pieces.push(
      tube(
        [
          [0.1, 2.4, 0.05],
          [x * 0.5 + 0.05, (2.4 + y) / 2, z * 0.5],
          [x * 0.9, y - radius * 0.3, z * 0.9],
        ],
        [0.1, 0.07, 0.04],
        6
      ),
      clump(radius, x, y, z, index * 2.3 + 1, index < 3 && !light ? 2 : 1)
    );
  });
  return mergeGeometries(pieces);
}

const VERTEX = /* glsl */ `
attribute float aPart;
attribute vec2 aUv;
attribute vec3 aLeaf;    // leaf colour
attribute vec2 aGrow;    // how much the leaves glow, sway phase
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUv;
flat varying vec3 vLeaf;
flat varying vec2 vGrow;
varying float vPart;
varying float vDepth;
void main() {
  vec3 p = position;
  // Wind: the higher a point, the more it moves; the tips of fronds flutter as well.
  float sway = sin(uTime * 1.05 + aGrow.y) * 0.6 + sin(uTime * 2.4 + aGrow.y * 1.7) * 0.25;
  p.x += sway * 0.004 * p.y * p.y;
  p.z += cos(uTime * 0.8 + aGrow.y) * 0.002 * p.y * p.y;
  if (aPart > 0.5 && aPart < 1.5) p.y += sin(uTime * 2.2 + aGrow.y + aUv.y * 5.0 + position.x) * 0.09 * aUv.y * aUv.y;
  vLocal = position;
  vUv = aUv;
  vLeaf = aLeaf;
  vGrow = aGrow;
  vPart = aPart;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUv;
flat varying vec3 vLeaf;
flat varying vec2 vGrow;
varying float vPart;
varying float vDepth;
${FOG}
${NOISE}
${LIGHTING}
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 view = normalize(cameraPosition - vWorld);
  int part = int(vPart + 0.5);
  vec3 color;
  float alpha = 1.0;
  if (part == ${TRUNK}) {
    // Bark. A palm's is a lattice of old leaf bases; a tree's runs in ridges.
    vec2 at = vec2(vUv.x * 9.0, vUv.y * 3.2);
    vec2 cell = fract(vec2(at.x + 0.5 * floor(at.y), at.y)) - 0.5;
    float pixel = fwidth(at.y) + 1e-4;
    float scar = smoothstep(0.5, 0.3, abs(cell.x) + abs(cell.y)) * resolved(pixel, 0.5);
    float ridge = noise21(vec2(vUv.x * 30.0, vUv.y * 2.0));
    vec3 bark = vec3(0.2, 0.15, 0.11) * (0.55 + 0.55 * scar + 0.3 * ridge);
    float height = scar * 0.02 + ridge * 0.006;
  #ifndef LOW
    n = bumped(n, vWorld, height, 1.8);
  #endif
    color = shade(bark, n, vWorld, view, 0.9, 0.0, 0.6 + 0.4 * smoothstep(0.0, 0.8, vLocal.y));
  } else if (part == ${FRUIT}) {
    color = shade(vec3(0.3, 0.14, 0.04), n, vWorld, view, 0.6, 0.0, 0.8);
  } else {
    vec3 albedo;
    if (part == ${FROND}) {
      // A frond: a spine with leaflets to either side, and gaps between them toward the edge.
      float across = abs(vUv.x);
      float comb = stripes(vUv.y * 30.0 + across * 2.5, 0.62, fwidth(vUv.y) * 30.0 + 0.02);
      float tip = 1.0 - smoothstep(0.82, 1.0, vUv.y);
      alpha = max(1.0 - smoothstep(0.1, 0.22, across), comb * (1.0 - smoothstep(0.86, 1.0, across))) * tip;
      albedo = vLeaf * (0.55 + 0.6 * (1.0 - across)) * (0.8 + 0.4 * comb);
    } else {
      // A canopy: clumps of leaves, darker inside, ragged where it is seen against the sky.
      float leaves = noise21(vLocal.xz * 5.0 + vLocal.y * 3.0 + vGrow.y) * 0.6 + noise21(vLocal.xy * 13.0 + vLocal.z * 9.0) * 0.4;
      float rim = 1.0 - abs(dot(n, view));
      alpha = 1.0 - smoothstep(0.35, 0.75, rim * 0.75 + leaves * 0.55);
      albedo = vLeaf * (0.4 + 0.9 * leaves);
    #ifndef LOW
      n = bumped(n, vWorld, leaves * 0.08, 1.0);
    #endif
    }
    color = shade(albedo, n, vWorld, view, 0.75, 0.0, 1.0);
    // Light from the street comes through the leaves; the glowing trees shine of themselves.
    color += albedo * lightField(vWorld.xz, 1.0).rgb * streetReach(vWorld.y * 0.6) * 0.35;
    color += vLeaf * vGrow.x * (0.5 + 0.8 * noise21(vLocal.xz * 5.0 + vLocal.y * 3.0));
  }
  if (alpha < 1.0) {
  #ifdef COVERAGE
    if (alpha < 0.03) discard;
  #else
    if (alpha < 0.5) discard;
    alpha = 1.0;
  #endif
  }
  gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), alpha);
  ${OUTPUT}
}
`;

/**
 * Plants the city's trees. `sites` are the stops' buildings, kept clear;
 * `coverage` smooths the edges of leaves where the picture is multisampled.
 */
export function createNature({ scene, shared, palette, random, kit, sites, detail, coverage = false }) {
  const kinds = { palm: [], tree: [] };
  const darkGreen = [new Color("#1f4a2c"), new Color("#24563a"), new Color("#2d5a2a"), new Color("#1c4636")];
  const palmGreen = [new Color("#3a6a2c"), new Color("#476f2a"), new Color("#355e30")];
  const add = (kind, x, z, { y = KERB, scale = 1, turn = random() * Math.PI * 2, glow = 0, color } = {}) => {
    const leaf = color ?? random.pick(kind === "palm" ? palmGreen : darkGreen);
    kinds[kind].push({ x, y, z, scale, turn, glow, leaf, phase: random() * 6.28 });
  };
  const stopNear = (x, z) => sites.some((site) => Math.hypot(site.x - x, site.z - z) < Math.max(site.footprint.width, site.footprint.depth) * 0.75 + 9);

  // Along the main street's kerbs, between the lamps (see kerbSlots), each in an iron grate.
  let nth = 0;
  for (const slot of kerbSlots()) {
    if (slot.kind !== "tree") continue;
    nth += 1;
    const x = slot.side * (STREETS.main.half + 1.5);
    if (stopNear(x, slot.z) || blocksView(sites, slot.side, slot.z)) continue;
    const district = districtAt(slot.z);
    if (district === "frontier" && nth % 2 === 0) continue;
    if (district === "old" || district === "centre") add("palm", x, slot.z, { scale: random.range(0.9, 1.12) });
    else if (district === "new" && nth % 3 === 0) add("tree", x, slot.z, { glow: 0.5, color: palette.accent.clone().multiplyScalar(0.5) });
    else add("tree", x, slot.z, { scale: random.range(0.85, 1.1) });
    treeGrate(kit, { x, z: slot.z });
  }

  // On the island of each roundabout, and round the square about it, clear of the street's mouth and of the stop's building.
  for (const street of SIDE_STREETS) {
    if (street.end === "stub") continue;
    const { z } = junctionById(street.junction);
    const ring = roundaboutOf(street);
    const centre = { x: street.side * street.reach, z };
    const mouth = -street.side * (Math.PI / 2);
    const grand = street.end === "square";
    const onIsland = grand ? 6 : 4;
    for (let i = 0; i < onIsland; i += 1) {
      const angle = mouth + ((i + 0.5) / onIsland) * Math.PI * 2;
      add("palm", centre.x + Math.sin(angle) * (ring.island - 2.1), centre.z + Math.cos(angle) * (ring.island - 2.1), { y: 0.2, scale: random.range(0.85, 1.05) });
    }
    for (const share of grand ? [0.3, 0.47, 0.64] : [0.36, 0.6]) {
      for (const hand of [-1, 1]) {
        const angle = mouth + hand * share * Math.PI;
        add("palm", centre.x + Math.sin(angle) * (ring.square + 0.4), centre.z + Math.cos(angle) * (ring.square + 0.4), { y: KERB, scale: random.range(0.95, 1.15) });
      }
    }
  }

  // Flanking each stop's entrance.
  for (const site of sites) {
    const cos = Math.cos(site.turn);
    const sin = Math.sin(site.turn);
    for (const lx of [-1, 1]) {
      const local = { x: lx * (site.footprint.width / 2 + 2.4), z: site.footprint.depth / 2 + site.footprint.apron + 2.2 };
      add("palm", site.x + local.x * cos + local.z * sin, site.z - local.x * sin + local.z * cos, { scale: 0.95 });
    }
  }

  // Round the end plaza.
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const x = Math.sin(angle) * (END_PLAZA.radius - 4);
    if (Math.abs(x) < 8 && Math.cos(angle) > 0) continue;
    add("palm", x, END_PLAZA.z + Math.cos(angle) * (END_PLAZA.radius - 4), { scale: random.range(0.95, 1.15) });
  }

  // Side street sidewalks: a tree every so often.
  for (const street of SIDE_STREETS) {
    const { z } = junctionById(street.junction);
    const road = STREETS[street.street];
    const end = street.end === "stub" ? street.reach - 6 : street.reach - roundaboutOf(street).outer - 6;
    for (let along = facadeOf("main") + 14; along < end; along += 18) {
      const edge = Math.floor(along / 18) % 2 === 0 ? 1 : -1;
      const x = street.side * along;
      const treeZ = z + edge * (road.half + 1.4);
      add(districtAt(z) === "old" ? "palm" : "tree", x, treeZ, { scale: random.range(0.85, 1.05) });
      if (detail) treeGrate(kit, { x, z: treeZ });
    }
  }

  const defines = {};
  if (!detail) defines.LOW = "";
  if (coverage) defines.COVERAGE = "";
  const material = new ShaderMaterial({ defines, uniforms: { ...shared }, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: DoubleSide, alphaToCoverage: coverage });
  const shapes = { palm: palmGeometry, tree: broadleafGeometry };
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  for (const [kind, list] of Object.entries(kinds)) {
    if (list.length === 0) continue;
    const geometry = shapes[kind](!detail);
    const leaf = new Float32Array(list.length * 3);
    const grow = new Float32Array(list.length * 2);
    const mesh = new InstancedMesh(geometry, material, list.length);
    list.forEach((item, index) => {
      rotation.setFromAxisAngle(UP, item.turn);
      matrix.compose(position.set(item.x, item.y, item.z), rotation, scale.setScalar(item.scale));
      mesh.setMatrixAt(index, matrix);
      leaf.set([item.leaf.r, item.leaf.g, item.leaf.b], index * 3);
      grow.set([item.glow, item.phase], index * 2);
    });
    geometry.setAttribute("aLeaf", new InstancedBufferAttribute(leaf, 3));
    geometry.setAttribute("aGrow", new InstancedBufferAttribute(grow, 2));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  return {};
}
