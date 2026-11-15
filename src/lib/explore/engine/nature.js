import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { END_PLAZA, JUNCTIONS, MAIN_STREET, RAILS, SIDE_STREETS, STREETS, districtAt, facadeOf, junctionById } from "@/lib/explore/city";

import { FOG, LIGHTING, NOISE, OUTPUT } from "./shaders";

// Trees and planters: date palms along the old town and on the squares, dark
// green trees elsewhere, planters with hedges, and a few softly glowing trees
// in the newest district. They sway a little in the wind.

const KERB = 0.15;
const UP = new Vector3(0, 1, 0);

/** Marks every vertex with what it is: 0 trunk or stone, 1 leaves. */
function tagged(source, part) {
  // Every piece is merged unindexed, since some shapes come with an index and others without.
  const geometry = source.index ? source.toNonIndexed() : source;
  const values = new Float32Array(geometry.attributes.position.count).fill(part);
  geometry.setAttribute("aPart", new BufferAttribute(values, 1));
  return geometry;
}

/** A date palm about 9 m tall: a gently curving trunk and a crown of drooping fronds. */
function palmGeometry() {
  const pieces = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 7; i += 1) {
    const height = 1.15;
    const bottom = 0.25 - i * 0.014;
    const segment = new CylinderGeometry(bottom - 0.014, bottom, height, 7).translate(0, height / 2, 0);
    pieces.push(tagged(segment.translate(x, y, 0), 0));
    y += height * 0.97;
    x += 0.05 + i * 0.022;
  }
  for (let i = 0; i < 11; i += 1) {
    const angle = (i / 11) * Math.PI * 2 + (i % 2) * 0.28;
    const length = 3.2 + (i % 3) * 0.35;
    const frond = new BoxGeometry(0.46, 0.035, length).translate(0, 0, length / 2);
    frond.rotateX(0.32 + (i % 3) * 0.17);
    frond.rotateY(angle);
    pieces.push(tagged(frond.translate(x, y, 0), 1));
  }
  pieces.push(tagged(new IcosahedronGeometry(0.42, 0).translate(x, y - 0.1, 0), 1));
  return mergeGeometries(pieces);
}

/** A broad tree about 5 m tall: a trunk and three clusters of leaves. */
function broadleafGeometry() {
  return mergeGeometries([
    tagged(new CylinderGeometry(0.11, 0.17, 2.6, 6).translate(0, 1.3, 0), 0),
    tagged(new IcosahedronGeometry(1.35, 1).scale(1, 0.86, 1).translate(0, 3.3, 0), 1),
    tagged(new IcosahedronGeometry(0.9, 1).translate(0.62, 4.1, 0.2), 1),
    tagged(new IcosahedronGeometry(0.8, 1).translate(-0.55, 3.9, -0.42), 1),
  ]);
}

/** A concrete planter with a clipped hedge. */
function planterGeometry() {
  return mergeGeometries([tagged(new BoxGeometry(2.4, 0.62, 1.05).translate(0, 0.31, 0), 0), tagged(new BoxGeometry(2.2, 0.5, 0.86).translate(0, 0.86, 0), 1)]);
}

const VERTEX = /* glsl */ `
attribute float aPart;
attribute vec3 aLeaf;    // leaf colour
attribute vec2 aGrow;    // how much the leaves glow, sway phase
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
flat varying vec3 vLeaf;
flat varying vec2 vGrow;
varying float vPart;
varying float vDepth;
void main() {
  vec3 p = position;
  // Wind: the higher a point, the more it moves.
  float sway = sin(uTime * 1.05 + aGrow.y) * 0.6 + sin(uTime * 2.4 + aGrow.y * 1.7) * 0.25;
  p.x += sway * 0.004 * p.y * p.y;
  p.z += cos(uTime * 0.8 + aGrow.y) * 0.002 * p.y * p.y;
  vLocal = position;
  vLeaf = aLeaf;
  vGrow = aGrow;
  vPart = aPart;
  vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
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
  vec3 color;
  if (vPart < 0.5) {
    vec3 bark = vec3(0.24, 0.19, 0.15) * (0.75 + 0.5 * noise21(vLocal.xy * vec2(9.0, 3.0)));
    color = shade(bark, n, vWorld, view, 0.85);
  } else {
    float leaves = noise21(vLocal.xz * 5.0 + vLocal.y * 3.0 + vGrow.y);
    vec3 albedo = vLeaf * (0.55 + 0.75 * leaves);
    color = shade(albedo, n, vWorld, view, 1.0);
    // Lit from below by the street, and from within on the glowing trees.
    color += vLeaf * uStreetLight * 0.5 * exp(-max(vWorld.y, 0.0) * 0.25);
    color += vLeaf * vGrow.x * (0.5 + 0.8 * leaves);
  }
  gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
  ${OUTPUT}
}
`;

export function createNature({ scene, shared, palette, random, sites, emptyEnds, detail }) {
  const kinds = { palm: [], tree: [], planter: [] };
  const darkGreen = [new Color("#1f4a2c"), new Color("#24563a"), new Color("#2d5a2a"), new Color("#1c4636")];
  const palmGreen = [new Color("#3a6a2c"), new Color("#476f2a"), new Color("#355e30")];
  const add = (kind, x, z, { y = KERB, scale = 1, turn = random() * Math.PI * 2, glow = 0, color } = {}) => {
    const leaf = color ?? random.pick(kind === "palm" ? palmGreen : darkGreen);
    kinds[kind].push({ x, y, z, scale, turn, glow, leaf, phase: random() * 6.28 });
  };

  // Along the main street's sidewalks, between the lamps, away from junctions and crossings.
  const junctionNear = (z) => JUNCTIONS.some((junction) => Math.abs(z - junction.z) < 16) || RAILS.some((rail) => Math.abs(z - rail.z) < 6);
  const stopNear = (x, z) => sites.some((site) => Math.hypot(site.x - x, site.z - z) < Math.max(site.footprint.width, site.footprint.depth) * 0.75 + 9);
  const roadEnd = END_PLAZA.z + END_PLAZA.radius + 6;
  let flip = 0;
  for (let z = MAIN_STREET.fromZ - 12; z > roadEnd; z -= 13) {
    flip += 1;
    if (junctionNear(z) || flip % 2 === 0) continue;
    const side = flip % 4 === 1 ? 1 : -1;
    const x = side * (STREETS.main.half + 3.4);
    if (stopNear(x, z)) continue;
    const district = districtAt(z);
    if (district === "old" || district === "centre") add("palm", x, z, { scale: random.range(0.9, 1.15) });
    else if (district === "new" && flip % 3 === 0) add("tree", x, z, { glow: 0.55, color: palette.accent.clone().multiplyScalar(0.55) });
    else if (detail && random() < 0.4) add("planter", x, z, { turn: 0 });
    else add("tree", x, z, { scale: random.range(0.85, 1.1) });
  }

  // Palms along the sides of each square, clear of the view down the street to its building,
  // and a small park where a court is empty.
  for (const street of SIDE_STREETS) {
    if (street.end === "stub") continue;
    const { z } = junctionById(street.junction);
    const centre = { x: street.side * street.reach, z };
    const ring = street.square - 3;
    const angles = street.end === "square" ? [62, 90, 118] : [72, 108];
    for (const degrees of angles) {
      for (const across of [-1, 1]) {
        const angle = (degrees * Math.PI) / 180;
        add("palm", centre.x + street.side * Math.cos(angle) * ring, centre.z + across * Math.sin(angle) * ring, { scale: random.range(0.9, 1.1) });
      }
    }
    if (emptyEnds.has(street.id)) {
      // `along` runs from the square's centre toward its far end, `across` sideways.
      for (const [along, across] of [[13, -6], [13, 6], [16, 0], [10, -11], [10, 11]]) {
        add("tree", centre.x + street.side * along, centre.z + across, { scale: random.range(0.9, 1.2) });
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
    const end = street.end === "stub" ? street.reach - 6 : street.reach - street.square - 3;
    for (let along = facadeOf("main") + 14; along < end; along += 18) {
      const edge = Math.floor(along / 18) % 2 === 0 ? 1 : -1;
      add(districtAt(z) === "old" ? "palm" : "tree", street.side * along, z + edge * (road.half + 2.2), { scale: random.range(0.85, 1.05) });
    }
  }

  const material = new ShaderMaterial({ uniforms: { ...shared }, vertexShader: VERTEX, fragmentShader: FRAGMENT });
  const shapes = { palm: palmGeometry, tree: broadleafGeometry, planter: planterGeometry };
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  for (const [kind, list] of Object.entries(kinds)) {
    if (list.length === 0) continue;
    const geometry = shapes[kind]();
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
