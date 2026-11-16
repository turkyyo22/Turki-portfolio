import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { FOG, LIGHTING, NOISE, OUTPUT } from "./shaders";

const UP = new Vector3(0, 1, 0);

/**
 * The ground under everything: asphalt after rain. Its stones, cracks and
 * patches show where a lamp lights them; everywhere else it is a dark mirror
 * that stretches the street's neon toward the eye, sharpest where water stands
 * in the hollows. Roads are this ground; sidewalks and squares are raised slabs
 * on top of it (see streets.js). `mirror`, when given, is a picture of the city
 * upside down (see mirror.js), shown in the wet road.
 */
export function createGround({ scene, shared, palette, bounds, low = false, mirror = null }) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const geometry = new PlaneGeometry(maxX - minX, maxZ - minZ);
  geometry.rotateX(-Math.PI / 2);
  const defines = {};
  if (low) defines.LOW = "";
  if (mirror) defines.MIRROR = "";
  const material = new ShaderMaterial({
    defines,
    uniforms: {
      ...shared,
      uAsphalt: { value: palette.asphalt },
      uMirror: { value: mirror?.texture ?? null },
      uMirrorMatrix: { value: mirror?.matrix ?? new Matrix4() },
      // 1 while the mirrored picture is kept up to date; 0 falls back to the cheaper sheen.
      uMirrorOn: { value: mirror ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uAsphalt;
      uniform sampler2D uMirror;
      uniform mat4 uMirrorMatrix;
      uniform float uMirrorOn;
      varying vec3 vWorld;
      varying float vDepth;
      ${FOG}
      ${NOISE}
      ${LIGHTING}
      void main() {
        vec2 g = vWorld.xz;
        float pixel = max(fwidth(g.x), fwidth(g.y)) + 1e-5;
        vec3 view = normalize(cameraPosition - vWorld);

        // --- The surface: stones in tar, newer patches, a few cracks ---
        float stones = noise21(g * 46.0);
        float coarse = fbm(g * 0.8);
        float fine = resolved(pixel, 0.035);
        vec3 albedo = uAsphalt * (0.7 + 0.6 * coarse) * mix(1.0, 0.6 + 0.8 * stones, fine);
        vec2 lot = vec2(9.0, 14.0);
        vec2 lotId = floor(g / lot);
        vec2 corner = hash22(lotId) * 0.45;
        float mended = boxMask(fract(g / lot), corner, corner + vec2(0.3, 0.26), vec2(pixel) / lot + 0.003) * step(0.55, hash21(lotId + 7.0));
        albedo *= 1.0 - 0.42 * mended;
        // Cracks run where one slow noise crosses its middle, and only in stretches of road that another picks out.
        float crack = (1.0 - smoothstep(0.0, 0.006 + pixel * 0.1, abs(fbm(g * 0.5 + 20.0) - 0.5)))
          * smoothstep(0.55, 0.7, fbm(g * 0.07 + 40.0)) * resolved(pixel, 0.05) * (1.0 - mended);
        albedo *= 1.0 - 0.5 * crack;

        // --- Wet: a film of water everywhere, standing in the hollows ---
        float puddle = smoothstep(0.5, 0.64, fbm(g * 0.085 + 11.0));
        albedo *= 1.0 - 0.5 * puddle;
        float roughness = mix(0.26, 0.015, puddle);
        float height = (stones * 0.004 * fine + coarse * 0.002 - crack * 0.006) * (1.0 - puddle);
        height += puddle * (noise21(g * 2.1 + uTime * 0.22) - 0.5) * 0.0014;
        vec3 n = vec3(0.0, 1.0, 0.0);
      #ifndef LOW
        n = bumped(n, vWorld, height, 2.2);
      #endif

        // --- Light that the surface scatters: little, as wet tar is nearly black ---
        vec4 field = lightField(g, 0.0);
        float built = lightField(g, 3.0).a;
        float open = 1.0 - 0.55 * built;
        float moon = max(dot(n, uMoonDir), 0.0);
        vec3 color = albedo * (uSkyLight * open + uMoonColor * moon * open + field.rgb * 0.8);

        // --- Light that it mirrors, the more so the lower the eye ---
        float cosine = clamp(dot(n, view), 0.0, 1.0);
        float fresnel = 0.04 + 0.96 * pow(1.0 - cosine, 4.0);
        vec3 r = reflect(-view, n);
        vec3 mirrored;
      #ifdef MIRROR
        // The city itself, upside down in the water: sharp in the puddles, and
        // drawn out toward the eye where the tar is rough.
        vec2 toEye = normalize(cameraPosition.xz - g + 1e-4);
        float smear = (vDepth * (0.012 + 0.2 * roughness) + 0.08) * uMirrorOn;
        float soft = 0.4 + roughness * 13.0;
        mirrored = vec3(0.0);
        for (int i = 0; i < 5; i++) {
          float t = float(i) * 0.5 - 1.0;
          vec2 p = g + toEye * t * smear;
          vec4 at = uMirrorMatrix * vec4(p.x, 0.0, p.y, 1.0);
          vec2 uv = at.xy / at.w + n.xz * 0.035;
          mirrored += textureLod(uMirror, uv, soft + abs(t) * 0.8).rgb * (0.3 - 0.11 * abs(t));
        }
        mirrored *= 1.0 / 1.17;
        if (uMirrorOn < 0.5) {
      #endif
        // The sky and the far city, where no building stands in the way, and the
        // street's lights stretched down the road toward the eye: a light some
        // metres up shows in the road that far along the mirrored ray.
        mirrored = skyAround(r, roughness) * (1.0 - 0.8 * built);
        float lift = max(r.y, 0.05);
        vec2 along = r.xz / lift;
        along *= min(1.0, 16.0 / max(length(along), 1e-4));
        float blur = 0.6 + roughness * 5.0;
        mirrored += (lightField(g + along * 0.5, blur).rgb * 0.38
          + lightField(g + along * 1.5, blur + 0.4).rgb * 0.34
          + lightField(g + along * 3.2, blur + 0.8).rgb * 0.28) * (0.7 + 1.2 * puddle);
      #ifdef MIRROR
        }
      #endif
        float glint = pow(max(dot(n, normalize(view + uMoonDir)), 0.0), 60.0 + 900.0 * puddle) * (1.0 + 12.0 * puddle) * moon;
        color += fresnel * (mirrored + uMoonColor * glint * open);

        gl_FragColor = vec4(applyFog(color, vDepth, 0.0), 1.0);
        ${OUTPUT}
      }
    `,
  });
  const ground = new Mesh(geometry, material);
  ground.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  ground.frustumCulled = false;
  scene.add(ground);
  return ground;
}

/**
 * Soft dots of light: lamp halos, beacons on rooftops, bollards. Drawn as points,
 * so hundreds of them cost a single draw call. `blink` makes one flash.
 */
export function createGlows({ scene, shared }) {
  const items = [];
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute vec3 aSpark;   // size in metres, blink speed, blink phase
      uniform float uTime;
      uniform float uPointScale;
      varying vec3 vColor;
      ${FOG}
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float depth = max(0.1, -mv.z);
        float blink = aSpark.y > 0.0 ? smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(uTime * aSpark.y + aSpark.z)) : 1.0;
        vColor = aColor * blink * (1.0 - fogAmount(depth));
        gl_PointSize = clamp(aSpark.x * uPointScale / depth, 1.0, 190.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float falloff = pow(max(0.0, 1.0 - length(gl_PointCoord - 0.5) * 2.0), 2.6);
        gl_FragColor = vec4(vColor * falloff, 1.0);
        ${OUTPUT}
      }
    `,
  });
  return {
    add({ x, y, z, color, size = 2, strength = 1, blink = 0, phase = 0 }) {
      items.push({ x, y, z, color, size, strength, blink, phase });
    },
    build() {
      if (items.length === 0) return;
      const positions = new Float32Array(items.length * 3);
      const colors = new Float32Array(items.length * 3);
      const sparks = new Float32Array(items.length * 3);
      items.forEach((item, index) => {
        positions.set([item.x, item.y, item.z], index * 3);
        colors.set([item.color.r * item.strength, item.color.g * item.strength, item.color.b * item.strength], index * 3);
        sparks.set([item.size, item.blink, item.phase], index * 3);
      });
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
      geometry.setAttribute("aSpark", new BufferAttribute(sparks, 3));
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 2;
      scene.add(points);
    },
  };
}

/** Marks every vertex of `geometry` with how much it glows: 0 is plain metal, 1 is all light. */
export function withEmit(source, emit) {
  // Every piece is merged unindexed, since some shapes come with an index and others without.
  const geometry = source.index ? source.toNonIndexed() : source;
  const values = new Float32Array(geometry.attributes.position.count).fill(emit);
  geometry.setAttribute("aEmit", new BufferAttribute(values, 1));
  return geometry;
}

/**
 * Many copies of one small street object (a lamp, a bollard), each with its own
 * light colour. Add them first, then call build().
 */
export function createProps({ scene, shared, palette, geometry, low = false }) {
  const items = [];
  return {
    add({ x, y = 0, z, turn = 0, scale = 1, color }) {
      items.push({ x, y, z, turn, scale, color });
    },
    build() {
      if (items.length === 0) {
        geometry.dispose();
        return;
      }
      const material = new ShaderMaterial({
        defines: low ? { LOW: "" } : {},
        uniforms: { ...shared, uBase: { value: palette.darkSteel } },
        vertexShader: /* glsl */ `
          attribute float aEmit;
          attribute vec3 aGlow;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying vec3 vGlow;
          varying float vEmit;
          varying float vDepth;
          void main() {
            vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
            vGlow = aGlow;
            vEmit = aEmit;
            vec4 mv = viewMatrix * world;
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uBase;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying vec3 vGlow;
          varying float vEmit;
          varying float vDepth;
          ${FOG}
          ${LIGHTING}
          void main() {
            vec3 n = normalize(vNormal);
            vec3 view = normalize(cameraPosition - vWorld);
            // Painted steel; the lit parts shine with their own colour.
            vec3 color = shade(uBase, n, vWorld, view, 0.42, 0.7, 1.0);
            color = mix(color, vGlow, vEmit);
            gl_FragColor = vec4(applyFog(color, vDepth, vWorld.y), 1.0);
            ${OUTPUT}
          }
        `,
      });
      const mesh = new InstancedMesh(geometry, material, items.length);
      const glow = new Float32Array(items.length * 3);
      const matrix = new Matrix4();
      const rotation = new Quaternion();
      const position = new Vector3();
      const scale = new Vector3();
      items.forEach((item, index) => {
        rotation.setFromAxisAngle(UP, item.turn);
        matrix.compose(position.set(item.x, item.y, item.z), rotation, scale.setScalar(item.scale));
        mesh.setMatrixAt(index, matrix);
        glow.set([item.color.r, item.color.g, item.color.b], index * 3);
      });
      geometry.setAttribute("aGlow", new InstancedBufferAttribute(glow, 3));
      mesh.frustumCulled = false;
      scene.add(mesh);
    },
  };
}

/**
 * A street lamp: a tapered pole on a cast base, a curved arm over the road, and
 * a shallow head with a lit lens underneath. The arm reaches toward +x.
 */
export function lampGeometry() {
  const pieces = [
    withEmit(new CylinderGeometry(0.17, 0.2, 0.5, 10).translate(0, 0.25, 0), 0),
    withEmit(new CylinderGeometry(0.12, 0.17, 0.12, 10).translate(0, 0.56, 0), 0),
    withEmit(new CylinderGeometry(0.06, 0.1, 6.0, 10).translate(0, 3.6, 0), 0),
    withEmit(new SphereGeometry(0.085, 10, 6).translate(0, 6.62, 0), 0),
  ];
  // The arm, as a few short lengths along a rising curve.
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const x0 = t0 * 1.55;
    const x1 = t1 * 1.55;
    const y0 = 6.55 + Math.sin(t0 * Math.PI * 0.5) * 0.28;
    const y1 = 6.55 + Math.sin(t1 * Math.PI * 0.5) * 0.28;
    const length = Math.hypot(x1 - x0, y1 - y0);
    const piece = new CylinderGeometry(0.038, 0.045, length + 0.03, 8);
    piece.rotateZ(-Math.PI / 2 + Math.atan2(y1 - y0, x1 - x0));
    piece.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    pieces.push(withEmit(piece, 0));
  }
  pieces.push(
    withEmit(new BoxGeometry(0.95, 0.09, 0.36).translate(1.75, 6.82, 0), 0),
    withEmit(new BoxGeometry(0.8, 0.035, 0.28).translate(1.77, 6.76, 0), 1)
  );
  return mergeGeometries(pieces);
}

/** A short post with a lit band near its top. */
export function bollardGeometry() {
  return mergeGeometries([
    withEmit(new CylinderGeometry(0.1, 0.12, 0.78, 10).translate(0, 0.39, 0), 0),
    withEmit(new CylinderGeometry(0.105, 0.105, 0.1, 10).translate(0, 0.83, 0), 1),
    withEmit(new CylinderGeometry(0.11, 0.1, 0.06, 10).translate(0, 0.91, 0), 0),
  ]);
}
