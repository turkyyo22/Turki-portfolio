import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from "three";

import { STREET } from "./layout";
import { lerp } from "./random";
import { FOG, NOISE, OUTPUT } from "./shaders";
import { ATLAS, canvasTexture, drawSignAtlas } from "./signs";

const UP = new Vector3(0, 1, 0);
const FLOOR = 3.2;

// How a box is painted (see the shader below).
export const STYLE = {
  windows: 0, // a facade with rows of windows
  shop: 1, // the same, with lit shop fronts on the ground floor
  plain: 2, // a bare wall, tinted by `tint` as far as `lit` says (0 to 1)
  neon: 3, // a glowing tube or panel: `tint` times `lit`; `tier` makes it pulse
};

/**
 * Every solid box in the city (buildings, their upper floors, neon tubes, crane
 * masts) is one instance of the same mesh, so the whole skyline is a single draw
 * call. The shader draws the windows, shop fronts and neon trim onto each box.
 * Add boxes first, then call build().
 */
export function createBlocks({ scene, shared, palette }) {
  const specs = [];

  return {
    /**
     * `x`, `y`, `z`: the middle of the box's base. `w`, `h`, `d`: its size across,
     * up and deep. `turn` rotates it around the vertical axis. `tier` (0 to 1) is
     * how modern it looks, `lit` the share of lit windows.
     */
    add({ x, y = 0, z, w, h, d, turn = 0, seed = 0, tier = 0, lit = 0.4, style = STYLE.windows, tint = palette.accent }) {
      specs.push({ x, y, z, w, h, d, turn, seed, tier, lit, style, tint });
    },

    build() {
      const geometry = new BoxGeometry(1, 1, 1);
      geometry.translate(0, 0.5, 0);
      const material = new ShaderMaterial({
        uniforms: {
          ...shared,
          uWall: { value: palette.wall },
          uWallHigh: { value: palette.wallHigh },
          uGlass: { value: palette.glass },
          uWarm: { value: palette.warm },
          uCool: { value: palette.cool },
          uNeon: { value: palette.neon },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aLook;   // seed, tier, lit share, style
          attribute vec3 aTint;
          varying vec3 vLocal;
          varying vec3 vFace;
          flat varying vec3 vSize;
          flat varying vec4 vLook;
          flat varying vec3 vTint;
          varying float vDepth;
          varying float vHeight;
          void main() {
            vLocal = position;
            vFace = normal;
            vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vLook = aLook;
            vTint = aTint;
            vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vHeight = world.y;
            vec4 mv = viewMatrix * world;
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uWall;
          uniform vec3 uWallHigh;
          uniform vec3 uGlass;
          uniform vec3 uWarm;
          uniform vec3 uCool;
          uniform vec3 uNeon[5];
          varying vec3 vLocal;
          varying vec3 vFace;
          flat varying vec3 vSize;
          flat varying vec4 vLook;
          flat varying vec3 vTint;
          varying float vDepth;
          varying float vHeight;
          ${FOG}
          ${NOISE}

          vec3 neonAt(float pick) {
            return uNeon[int(min(pick, 0.999) * 5.0)];
          }

          void main() {
            float seed = vLook.x;
            float tier = vLook.y;
            float lit = vLook.z;
            float style = vLook.w;
            vec3 color;

            if (style > 2.5) {
              // A neon tube or glowing panel.
              float pulse = 1.0 - tier * 0.5 * (0.5 + 0.5 * sin(uTime * 2.2 + seed * 40.0));
              color = vTint * lit * pulse;
            } else {
              vec3 wall = mix(uWall, uWallHigh, hash21(vec2(seed, 3.7)));
              if (style > 1.5) wall = mix(wall, vTint, lit);

              if (abs(vFace.y) > 0.5) {
                // Roof: dark, with a neon rim on the modern towers.
                vec2 fromEdge = 0.5 * vSize.xz - abs(vLocal.xz * vSize.xz);
                float rim = 1.0 - smoothstep(0.0, 0.3, min(fromEdge.x, fromEdge.y));
                color = wall * 0.6 + vTint * rim * smoothstep(0.35, 0.9, tier) * 1.3 * step(style, 1.5);
              } else if (style > 1.5) {
                color = wall * (0.72 + 0.34 * vLocal.y);
              } else {
                // A facade, measured in metres: across from its left edge, and up from the ground.
                bool sideFace = abs(vFace.x) > 0.5;
                float width = sideFace ? vSize.z : vSize.x;
                float across = (sideFace ? vLocal.z : vLocal.x) * width;
                float up = vLocal.y * vSize.y;

                float cellWidth = 1.5 + 0.9 * hash21(vec2(seed, 9.1));
                vec2 grid = vec2((across + 0.5 * width) / cellWidth, up / ${FLOOR.toFixed(1)});
                vec2 cell = floor(grid);
                vec2 f = fract(grid);
                vec2 pixel = fwidth(grid);
                float window = smoothstep(0.14 - pixel.x, 0.14 + pixel.x, f.x) * (1.0 - smoothstep(0.86 - pixel.x, 0.86 + pixel.x, f.x))
                             * smoothstep(0.26 - pixel.y, 0.26 + pixel.y, f.y) * (1.0 - smoothstep(0.84 - pixel.y, 0.84 + pixel.y, f.y));
                // Far away, where windows are smaller than a pixel, show their average instead of noise.
                float detail = clamp(1.6 - max(pixel.x, pixel.y) * 3.0, 0.0, 1.0);

                // Which windows are lit. One in ten changes its mind now and then.
                float life = hash21(cell * 1.31 + seed * 5.0);
                float tick = floor(uTime * 0.12 + life * 30.0) * step(0.9, life);
                float on = step(hash21(cell + seed * 17.0 + tick * 0.37), lit);
                on = mix(lit, on, detail);

                float shade = hash21(cell * 2.7 + seed);
                float coolLight = step(hash21(cell.yx + seed * 3.0), 0.15 + 0.55 * tier);
                vec3 lamp = mix(uWarm, uCool, coolLight);
                lamp = mix(lamp, vTint, step(0.82, shade) * (0.3 + 0.5 * tier));
                float brightness = (0.28 + 0.6 * shade) * (0.8 + 0.4 * f.y);
                vec3 glass = uGlass * (0.8 + 0.6 * hash21(cell + 1.7));
                vec3 pane = mix(glass, lamp * brightness, on);

                float ledge = 1.0 - 0.25 * smoothstep(0.9, 0.98, f.y) * detail;
                color = mix(wall * ledge * (0.8 + 0.3 * vLocal.y), pane, window);

                // Shop fronts along the ground floor.
                if (style > 0.5 && up < 4.6) {
                  vec2 shop = vec2((across + 0.5 * width) / 3.6, up / 4.6);
                  vec2 shopCell = floor(shop);
                  vec2 s = fract(shop);
                  float open = step(hash21(shopCell + seed * 5.0), 0.78);
                  vec3 shopColor = neonAt(hash21(shopCell * 3.3 + seed));
                  float front = step(0.07, s.x) * step(s.x, 0.93) * step(0.08, s.y) * step(s.y, 0.72);
                  float signBand = step(0.78, s.y) * step(s.y, 0.93) * step(0.05, s.x) * step(s.x, 0.95);
                  // Through the glass: light that is brightest near the ceiling and the
                  // middle of the shop, shelves along the back, and a frame down the middle.
                  float ceilingLight = 0.3 + 0.7 * smoothstep(0.08, 0.72, s.y);
                  float middle = 0.55 + 0.45 * sin(s.x * 3.1416);
                  float shelves = 0.72 + 0.28 * step(0.5, fract(s.y * 9.0 + hash21(shopCell)));
                  float frame = step(0.018, abs(s.x - 0.5));
                  vec3 inside = mix(uWarm, shopColor, 0.35) * 0.66 * ceilingLight * middle * shelves * frame;
                  // A closed shop has its shutter down.
                  vec3 shutter = wall * (0.85 + 0.5 * step(0.5, fract(s.y * 24.0)));
                  color = wall * 0.7;
                  color = mix(color, mix(shutter, inside, open), front);
                  color = mix(color, shopColor * mix(0.22, 1.5, open), signBand);
                }

                // Neon trim on the corners and the roof line of modern towers, with light running up it.
                float trim = smoothstep(0.3, 0.75, tier) * step(0.35, hash21(vec2(seed, 5.5)));
                float corner = lineAA(0.5 * width - abs(across), 0.14, fwidth(across));
                float crown = lineAA(vSize.y - up, 0.16, fwidth(up));
                float chase = 0.55 + 0.45 * smoothstep(0.75, 1.0, sin(up * 0.12 - uTime * 1.3 + seed * 30.0));
                color += vTint * (corner * chase + crown) * trim * 1.7;
              }
            }

            gl_FragColor = vec4(applyFog(color, vDepth, vHeight), 1.0);
            ${OUTPUT}
          }
        `,
      });

      const mesh = new InstancedMesh(geometry, material, specs.length);
      const look = new Float32Array(specs.length * 4);
      const tint = new Float32Array(specs.length * 3);
      const matrix = new Matrix4();
      const rotation = new Quaternion();
      const position = new Vector3();
      const scale = new Vector3();
      specs.forEach((spec, index) => {
        rotation.setFromAxisAngle(UP, spec.turn);
        matrix.compose(position.set(spec.x, spec.y, spec.z), rotation, scale.set(spec.w, spec.h, spec.d));
        mesh.setMatrixAt(index, matrix);
        look.set([spec.seed, spec.tier, spec.lit, spec.style], index * 4);
        tint.set([spec.tint.r, spec.tint.g, spec.tint.b], index * 3);
      });
      geometry.setAttribute("aLook", new InstancedBufferAttribute(look, 4));
      geometry.setAttribute("aTint", new InstancedBufferAttribute(tint, 3));
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    },
  };
}

/** The neon colour of an ordinary building: warm in the old town, mixed further on. */
function trimColor(palette, random, tier) {
  if (tier < 0.25) return random.chance(0.7) ? palette.amber : palette.accent;
  return random.pick([palette.accent, palette.accent, palette.pink, palette.violet, palette.mint, palette.blue]);
}

/**
 * The ordinary buildings: a row along each sidewalk and two taller rows behind,
 * low and warm at the start of the street, tall and neon toward its end. They
 * leave room for cross streets, for each stop's square and for the end plaza.
 * Returns the street-facing fronts, so signs can be hung on them.
 */
export function layBuildings({ layout, palette, random, blocks, glows }) {
  const fronts = [];

  const blocked = (side, z, half, row) => {
    if (layout.crossingDistance(z) < STREET.roadHalf + STREET.walk + half) return true;
    if (row === 0 && Math.abs(z - layout.plaza.z) < layout.plaza.radius + 6 + half) return true;
    if (row < 2) {
      for (const station of layout.stations) {
        if (station.side === side && z - half < station.clearFrom && z + half > station.clearTo) return true;
      }
    }
    if (row === 0) {
      for (const lot of layout.lots) {
        if (lot.side === side && z - half < lot.clearFrom && z + half > lot.clearTo) return true;
      }
    }
    return false;
  };

  const heightFor = (tier, row) => {
    const base = lerp(7, 34, tier ** 1.4) * random.range(0.6, 1.5);
    const boost = row === 0 ? 1 : row === 1 ? 1.5 : 2.3;
    return Math.max(2, Math.round((base * boost + row * 6 * tier) / FLOOR)) * FLOOR;
  };

  const layRow = (side, row) => {
    const near = [STREET.front, STREET.front + 22, STREET.front + 48][row];
    let z = layout.startZ;
    while (z > layout.finishZ) {
      const tier = layout.tierAt(z);
      const along = random.range(9, 15) + tier * 5 + row * 4;
      const gap = random.chance(0.22) ? random.range(1.4, 3.2) : 0.5;
      const centre = z - along / 2;
      z -= along + gap;
      // The far rows thin out in the old town, so the skyline rises with the street.
      if (row === 2 && random.chance(0.55 - 0.4 * tier)) continue;
      if (blocked(side, centre, along / 2, row)) continue;

      const deep = random.range(13, 19) + row * 3;
      const height = heightFor(tier, row);
      const x = side * (near + deep / 2 + (row > 0 ? random.range(0, 5) : 0));
      const seed = random.range(1, 90);
      const tint = trimColor(palette, random, tier);
      const lit = lerp(0.2, 0.48, tier) * random.range(0.7, 1.3);
      blocks.add({ x, z: centre, w: deep, h: height, d: along, seed, tier, lit, tint, style: row === 0 ? 1 : 0 });

      // Many towers step back to a slimmer top.
      let top = height;
      if (height > 18 && random.chance(0.4 + 0.3 * tier)) {
        const extra = Math.round((height * random.range(0.25, 0.7)) / FLOOR) * FLOOR;
        blocks.add({ x, y: height, z: centre, w: deep * 0.62, h: extra, d: along * 0.62, seed: seed + 7, tier, lit, tint });
        top += extra;
      } else if (tier < 0.35 && random.chance(0.6)) {
        // Old roofs carry water tanks and air conditioners.
        blocks.add({ x: x + random.range(-2, 2), y: height, z: centre + random.range(-2, 2), w: 2.2, h: 1.6, d: 2.2, seed, style: 2, lit: 0 });
      }
      // Tall towers carry a red beacon, as real ones do for aircraft.
      if (top > 38 && random.chance(0.7)) {
        blocks.add({ x, y: top, z: centre, w: 0.35, h: 6, d: 0.35, seed, style: 2, lit: 0 });
        glows.add({ x, y: top + 6.2, z: centre, color: palette.red, size: 3.2, strength: 1.1, blink: random.range(1.6, 2.6), phase: random.range(0, 6) });
      }

      if (row === 0) fronts.push({ side, x: side * near, z: centre, along, height, tier });
    }
  };

  for (const side of [-1, 1]) for (const row of [0, 1, 2]) layRow(side, row);
  return fronts;
}

/**
 * Vertical neon signs on the fronts of the first row, facing up the street.
 * Their words are the visitor-facing tech stack (see signWords in plan.js).
 */
export function createStreetSigns({ scene, shared, palette, random, fronts, words, family, decals }) {
  const list = words.length > 0 ? words : ["OPEN", "CODE", "DATA", "24H", "LAB", "AI"];
  const { canvas, count } = drawSignAtlas({ words: list, colors: palette.neon, family });
  const texture = canvasTexture(canvas);

  const signs = [];
  for (const front of fronts) {
    if (!random.chance(0.3 + 0.55 * front.tier)) continue;
    const cell = random.int(0, count - 1);
    const height = Math.min(random.range(4.4, 6.4), front.height - 2.5);
    if (height < 3) continue;
    const width = height / 4;
    const y = Math.min(front.height - height - 0.8, random.range(3.6, 7.5));
    const z = front.z + random.range(-0.35, 0.35) * front.along;
    // The sign sticks out from the facade toward the street.
    const x = front.side * (STREET.front - width / 2 - 0.2);
    signs.push({ x, y: Math.max(3.2, y), z, width, height, cell, flicker: random.chance(0.5 - 0.4 * front.tier) ? 1 : 0, seed: random.range(0, 50) });
    decals.add({
      x: front.side * (STREET.front - 4.2),
      z: z + 1.2,
      width: 3.4,
      length: 9,
      color: palette.neon[cell % palette.neon.length],
      strength: 0.22,
      streak: true,
      towardX: -front.side,
      towardZ: 0,
    });
  }
  if (signs.length === 0) {
    texture.dispose();
    return;
  }

  const geometry = new PlaneGeometry(1, 1);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared, uMap: { value: texture }, uGrid: { value: [ATLAS.cols, ATLAS.rows] } },
    vertexShader: /* glsl */ `
      attribute vec3 aSign;   // atlas cell, flicker (0 or 1), seed
      uniform vec2 uGrid;
      varying vec2 vUv;
      flat varying vec2 vSign;
      varying float vDepth;
      varying float vHeight;
      void main() {
        float column = mod(aSign.x, uGrid.x);
        float row = floor(aSign.x / uGrid.x);
        vUv = vec2((column + uv.x) / uGrid.x, 1.0 - (row + 1.0 - uv.y) / uGrid.y);
        vSign = aSign.yz;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vHeight = world.y;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uMap;
      varying vec2 vUv;
      flat varying vec2 vSign;
      varying float vDepth;
      varying float vHeight;
      ${FOG}
      ${NOISE}
      void main() {
        vec4 texel = texture2D(uMap, vUv);
        // Old tubes stutter now and then.
        float stutter = step(0.9, hash21(vec2(floor(uTime * 9.0), vSign.y)));
        float power = 1.0 - vSign.x * stutter * 0.65;
        vec3 color = applyFog(texel.rgb * 1.55 * power, vDepth, vHeight);
        gl_FragColor = vec4(color, texel.a * (1.0 - fogAmount(vDepth) * 0.6));
        ${OUTPUT}
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, signs.length);
  const data = new Float32Array(signs.length * 3);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  signs.forEach((sign, index) => {
    matrix.compose(position.set(sign.x, sign.y + sign.height / 2, sign.z), rotation, scale.set(sign.width, sign.height, 1));
    mesh.setMatrixAt(index, matrix);
    data.set([sign.cell, sign.flicker, sign.seed], index * 3);
  });
  geometry.setAttribute("aSign", new InstancedBufferAttribute(data, 3));
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
}

/**
 * Animated advertising screens on some of the modern towers: abstract patterns
 * that change every few seconds. Add them first, then call build().
 */
export function createScreens({ scene, shared, palette }) {
  const items = [];
  return {
    /** A screen `width` by `height`, centred on (x, y, z), facing along `turn`. */
    add({ x, y, z, width, height, turn = 0, seed = 0 }) {
      items.push({ x, y, z, width, height, turn, seed });
    },
    build() {
      if (items.length === 0) return;
      const geometry = new PlaneGeometry(1, 1);
      const material = new ShaderMaterial({
        uniforms: { ...shared, uNeon: { value: palette.neon } },
        vertexShader: /* glsl */ `
          attribute vec3 aScreen;   // seed, width, height
          varying vec2 vUv;
          flat varying vec3 vScreen;
          varying float vDepth;
          varying float vHeight;
          void main() {
            vUv = uv;
            vScreen = aScreen;
            vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vHeight = world.y;
            vec4 mv = viewMatrix * world;
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uNeon[5];
          varying vec2 vUv;
          flat varying vec3 vScreen;
          varying float vDepth;
          varying float vHeight;
          ${FOG}
          ${NOISE}
          void main() {
            float seed = vScreen.x;
            float t = uTime * 0.45 + seed * 10.0;
            float scene = floor(t / 4.0);
            float mode = hash21(vec2(scene, seed));
            vec3 first = uNeon[int(min(hash21(vec2(scene + 3.0, seed)), 0.999) * 5.0)];
            vec3 second = uNeon[int(min(hash21(vec2(scene + 9.0, seed * 2.0)), 0.999) * 5.0)];
            vec2 metres = vUv * vScreen.yz;

            float pattern;
            if (mode < 0.34) {
              pattern = smoothstep(0.45, 0.55, fract(metres.y * 0.5 - t * 0.6));
            } else if (mode < 0.67) {
              float ring = abs(length(vUv - 0.5) - fract(t * 0.35) * 0.75);
              pattern = 1.0 - smoothstep(0.0, 0.07, ring);
            } else {
              pattern = step(0.55, hash21(floor(metres * 1.1) + floor(t * 2.5)));
            }
            vec3 color = mix(first * 0.22, second * 1.15, pattern);
            // Fine rows of pixels, and a dark frame.
            color *= 0.8 + 0.2 * sin(metres.y * 26.0);
            vec2 border = min(metres, vScreen.yz - metres);
            color *= smoothstep(0.0, 0.25, min(border.x, border.y));

            gl_FragColor = vec4(applyFog(color, vDepth, vHeight), 1.0);
            ${OUTPUT}
          }
        `,
      });
      const mesh = new InstancedMesh(geometry, material, items.length);
      const data = new Float32Array(items.length * 3);
      const matrix = new Matrix4();
      const rotation = new Quaternion();
      const position = new Vector3();
      const scale = new Vector3();
      items.forEach((item, index) => {
        rotation.setFromAxisAngle(UP, item.turn);
        matrix.compose(position.set(item.x, item.y, item.z), rotation, scale.set(item.width, item.height, 1));
        mesh.setMatrixAt(index, matrix);
        data.set([item.seed, item.width, item.height], index * 3);
      });
      geometry.setAttribute("aScreen", new InstancedBufferAttribute(data, 3));
      mesh.frustumCulled = false;
      scene.add(mesh);
    },
  };
}

/** Hangs advertising screens on the tall fronts of the modern districts. */
export function layScreens({ fronts, random, screens, decals, palette }) {
  for (const front of fronts) {
    if (front.tier < 0.45 || front.height < 22 || !random.chance(0.38)) continue;
    const width = Math.min(front.along - 3, random.range(5, 8));
    const height = Math.min(front.height - 9, random.range(7, 12));
    if (width < 3 || height < 4) continue;
    screens.add({
      x: front.side * (STREET.front - 0.12),
      y: 7.5 + height / 2 + random.range(0, Math.max(0, front.height - height - 10) * 0.4),
      z: front.z,
      width,
      height,
      // The screen faces the street: toward -x on the right side, +x on the left.
      turn: front.side > 0 ? -Math.PI / 2 : Math.PI / 2,
      seed: random.range(0, 20),
    });
    decals.add({
      x: front.side * (STREET.front - 5),
      z: front.z,
      width: width * 1.3,
      length: 11,
      color: random.pick(palette.neon),
      strength: 0.16,
      streak: true,
      towardX: -front.side,
      towardZ: 0,
    });
  }
}
