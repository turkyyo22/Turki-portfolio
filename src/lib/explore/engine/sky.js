import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  RingGeometry,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import { END_PLAZA, MAIN_STREET } from "@/lib/explore/city";

import { FOG, NOISE, OUTPUT } from "./shaders";
import { canvasTexture, makeCanvas } from "./signs";

const STAR_DISTANCE = 900;
// The far city stands in a band this far from the main street, all round it.
const FAR_FROM = 215;
const FAR_TO = 780;
const FAR_CELL = 36;

/**
 * The far city: hundreds of towers standing all round, beyond the streets the
 * tour drives. They are real shapes, so they slide past one another as the
 * camera moves, with lit windows, strips of light and warning lamps, and they
 * fade into the haze of the horizon instead of vanishing in it.
 */
function createFarCity({ scene, shared, palette, random }) {
  const towers = [];
  // How far a point lies from the main street, measured to the nearest point of its centre line.
  const fromStreet = (x, z) => Math.hypot(x, z - Math.min(MAIN_STREET.fromZ - 30, Math.max(END_PLAZA.z, z)));
  const tones = [palette.accent, palette.pink, palette.amber, palette.violet, palette.mint, palette.blue];
  const block = (x, y, z, w, h, d, turn, seed, lit, tone, kind = 0) => towers.push({ x, y, z, w, h, d, turn, seed, lit, tone, kind });

  for (let x = -FAR_TO; x <= FAR_TO; x += FAR_CELL) {
    for (let z = END_PLAZA.z - FAR_TO; z <= MAIN_STREET.fromZ + FAR_TO; z += FAR_CELL) {
      const px = x + random.range(-0.4, 0.4) * FAR_CELL;
      const pz = z + random.range(-0.4, 0.4) * FAR_CELL;
      const away = fromStreet(px, pz);
      if (away < FAR_FROM || away > FAR_TO) continue;
      // Thick near the city, thinning toward the horizon.
      const share = (away - FAR_FROM) / (FAR_TO - FAR_FROM);
      if (!random.chance(0.86 - 0.5 * share)) continue;
      // Tallest beyond the far end of the street and abreast of the centre.
      const ahead = pz < END_PLAZA.z ? 1 : 0;
      const grand = Math.max(ahead, Math.exp(-(((pz + 340) / 260) ** 2)));
      const giant = random.chance(0.05 + 0.07 * grand);
      const height = giant ? random.range(190, 330) : random.range(34, 80) + grand * random.range(10, 110);
      const width = random.range(16, 30) * (giant ? 1.25 : 1);
      const depth = random.range(16, 30) * (giant ? 1.25 : 1);
      const turn = random.chance(0.75) ? 0 : random.range(0, Math.PI / 2);
      const seed = random.range(0, 90);
      const lit = random.range(0.14, 0.42);
      const tone = random.pick(tones);
      // One block, or two or three stepped back as it rises, and sometimes a mast with a lamp.
      const steps = height > 110 ? random.int(2, 3) : random.chance(0.4) ? 2 : 1;
      let base = 0;
      let scale = 1;
      for (let step = 0; step < steps; step += 1) {
        const part = (height / steps) * (step === 0 ? 1.25 : 1) * (steps === 1 ? 0.8 : 0.87);
        block(px, base, pz, width * scale, part, depth * scale, turn, seed + step * 7, lit, tone);
        base += part;
        scale *= random.range(0.62, 0.8);
      }
      if (base > 90 && random.chance(0.75)) {
        const mast = random.range(14, 44);
        block(px, base, pz, 1.6, mast, 1.6, turn, seed, 0, tone);
        block(px, base + mast, pz, 3.2, 3.2, 3.2, turn, seed, 1, palette.red, 1);
      }
    }
  }

  const count = towers.length;
  const geometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const look = new Float32Array(count * 3);
  const tone = new Float32Array(count * 3);
  const material = new ShaderMaterial({
    uniforms: { ...shared, uGlow: { value: palette.glowViolet } },
    vertexShader: /* glsl */ `
      attribute vec3 aLook;    // seed, share of lit windows, kind (0 a tower, 1 a warning lamp)
      attribute vec3 aTone;
      flat varying vec3 vLook;
      flat varying vec3 vTone;
      flat varying vec3 vSize;
      varying vec3 vLocal;
      varying vec3 vNormalLocal;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vLook = aLook;
        vTone = aTone;
        vLocal = position;
        vNormalLocal = normal;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uGlow;
      flat varying vec3 vLook;
      flat varying vec3 vTone;
      flat varying vec3 vSize;
      varying vec3 vLocal;
      varying vec3 vNormalLocal;
      varying vec3 vWorld;
      varying float vDepth;
      ${FOG}
      ${NOISE}
      void main() {
        float seed = vLook.x;
        // The haze thickens with distance, but never swallows a tower whole.
        float haze = min(fogAmount(vDepth * 0.62), 0.9);
        vec3 mist = mix(uFogLow, uFogColor, smoothstep(0.0, 110.0, vWorld.y));
        if (vLook.z > 0.5) {
          // A warning lamp on a mast, flashing slowly.
          float flash = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(uTime * 1.7 + seed));
          gl_FragColor = vec4(vTone * (0.4 + 4.0 * flash) * (1.0 - haze * 0.75), 1.0);
          ${OUTPUT}
          return;
        }
        // The wall: dark, lighter low down where the city's glow reaches it.
        vec3 color = vec3(0.012, 0.014, 0.03) + uGlow * 0.05 * exp(-vWorld.y * 0.02);
        bool side = abs(vNormalLocal.y) < 0.5;
        if (side) {
          // Windows, floor by floor: some lit warm, some cool, a few in colour.
          float across = (abs(vNormalLocal.x) > 0.5 ? vLocal.z * vSize.z : vLocal.x * vSize.x) + seed;
          vec2 m = vec2(across / 2.6, vLocal.y * vSize.y / 3.6);
          vec2 id = floor(m);
          vec2 cell = fract(m);
          float pixel = max(fwidth(m.x), fwidth(m.y));
          float sharp = clamp(1.4 - pixel * 1.6, 0.0, 1.0);
          float pick = hash21(id + seed * 3.1);
          // Whole floors go dark together, as offices do.
          float floorOn = step(0.3, hash21(vec2(id.y, seed)));
          float on = step(pick, vLook.y) * floorOn;
          float pane = boxMask(cell, vec2(0.14, 0.2), vec2(0.86, 0.8), vec2(pixel));
          vec3 lamp = pick < vLook.y * 0.62 ? vec3(1.0, 0.74, 0.44) : (pick < vLook.y * 0.9 ? vec3(0.7, 0.85, 1.0) : vTone * 1.3);
          color += lamp * mix(vLook.y * 0.3 * floorOn, on * pane, sharp) * 0.9;
          // A strip of light up the corners of some, and a line under the crown.
          float flair = hash21(vec2(seed, 9.0));
          float width = abs(vNormalLocal.x) > 0.5 ? vSize.z : vSize.x;
          float edge = (0.5 - abs(abs(vNormalLocal.x) > 0.5 ? vLocal.z : vLocal.x)) * width;
          if (flair > 0.55) color += vTone * (1.0 - smoothstep(0.5, 1.4, edge)) * 0.9;
          if (fract(flair * 7.0) > 0.5) color += vTone * (1.0 - smoothstep(0.6, 1.6, abs((1.0 - vLocal.y) * vSize.y - 3.0))) * 0.8;
        }
        gl_FragColor = vec4(mix(color, mist, haze), 1.0);
        ${OUTPUT}
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, count);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  towers.forEach((tower, index) => {
    rotation.setFromAxisAngle(up, tower.turn);
    mesh.setMatrixAt(index, matrix.compose(position.set(tower.x, tower.y, tower.z), rotation, scale.set(tower.w, tower.h, tower.d)));
    look.set([tower.seed, tower.lit, tower.kind], index * 3);
    tone.set([tower.tone.r, tower.tone.g, tower.tone.b], index * 3);
  });
  geometry.setAttribute("aLook", new InstancedBufferAttribute(look, 3));
  geometry.setAttribute("aTone", new InstancedBufferAttribute(tone, 3));
  mesh.frustumCulled = false;
  scene.add(mesh);
}

/**
 * Everything above and around the city: the night sky with its glow over the
 * horizon, neon clouds lit from below, a faint aurora, twinkling stars, a
 * crescent moon and a smaller second one, a ringed planet low over the far end
 * of the street, the odd shooting star, and the far city all round. The sky
 * travels with the camera, so it never gets closer; the far city stands still.
 */
export function createSky({ scene, shared, palette, random, settings }) {
  // --- The dome ---
  const dome = new Mesh(
    new SphereGeometry(100, 40, 20),
    new ShaderMaterial({
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: shared.uTime,
        uZenith: { value: palette.zenith },
        uHorizon: { value: palette.horizon },
        uGlowA: { value: palette.glowViolet },
        uGlowB: { value: palette.glowMagenta },
        uRim: { value: palette.accent },
        uFogLow: shared.uFogLow,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uGlowA;
        uniform vec3 uGlowB;
        uniform vec3 uRim;
        uniform vec3 uFogLow;
        varying vec3 vDir;
        ${NOISE}

        float clouds(vec2 p) {
          float value = 0.0;
          float weight = 0.5;
          for (int i = 0; i < 4; i++) {
            value += weight * noise21(p);
            p = p * 2.03 + 17.0;
            weight *= 0.5;
          }
          return value;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = max(dir.y, 0.0);
          // 1 looking down the street toward the city centre, 0 looking back.
          float ahead = 0.5 - 0.5 * dir.z;

          vec3 color = mix(uHorizon, uZenith, pow(h, 0.42));
          color += uGlowA * exp(-h * 7.0) * (0.25 + 0.75 * ahead * ahead);
          color += uGlowB * exp(-h * 15.0) * (0.3 + 0.7 * ahead);

          // A faint aurora: slow curtains of light high over the far end of the city.
          float band = smoothstep(0.18, 0.32, h) * (1.0 - smoothstep(0.42, 0.62, h)) * smoothstep(0.1, 0.8, ahead);
          float curtain = 0.5 + 0.5 * sin(dir.x * 26.0 + sin(dir.x * 7.0 + uTime * 0.05) * 3.0 + uTime * 0.12);
          float sheet = pow(curtain, 3.0) * (0.55 + 0.45 * noise21(vec2(dir.x * 14.0, uTime * 0.03)));
          color += mix(vec3(0.05, 0.42, 0.32), vec3(0.32, 0.1, 0.52), smoothstep(0.25, 0.55, h)) * band * sheet * 0.22;

          // Neon clouds: dark bodies whose undersides catch the glow of the city, with a rim of the accent colour.
          vec2 cloudUv = dir.xz / (h + 0.12) * 0.55 + vec2(uTime * 0.004, 0.0);
          float density = clouds(cloudUv);
          float cloud = smoothstep(0.48, 0.82, density) * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.42, 0.85, h));
          float edge = smoothstep(0.42, 0.55, density) - smoothstep(0.55, 0.7, density);
          float lowness = 1.0 - smoothstep(0.02, 0.35, h);
          vec3 under = mix(uGlowA * 0.9, uGlowB * 1.4, lowness);
          color = mix(color, color * 0.55 + under * 0.5, cloud * 0.85);
          color += uRim * edge * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.4, 0.8, h)) * (0.3 + 0.7 * ahead) * 0.12;

          // Below the horizon the sky meets the haze over the ground.
          color = mix(color, uFogLow, smoothstep(0.0, -0.05, dir.y));

          gl_FragColor = vec4(color, 1.0);
          ${OUTPUT}
        }
      `,
    })
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  // --- Stars ---
  const starCount = settings.stars;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const looks = new Float32Array(starCount * 2);
  const tints = [
    [1, 1, 1],
    [0.74, 0.85, 1],
    [1, 0.88, 0.72],
    [0.8, 0.95, 1],
  ];
  for (let i = 0; i < starCount; i += 1) {
    const y = random.range(0.03, 1);
    const ring = Math.sqrt(1 - y * y);
    const angle = random() * Math.PI * 2;
    positions.set([Math.cos(angle) * ring * STAR_DISTANCE, y * STAR_DISTANCE, Math.sin(angle) * ring * STAR_DISTANCE], i * 3);
    const large = random.chance(0.06);
    const brightness = large ? random.range(1.1, 1.6) : random.range(0.35, 0.95);
    const tint = random.pick(tints);
    colors.set([tint[0] * brightness, tint[1] * brightness, tint[2] * brightness], i * 3);
    looks.set([large ? random.range(2.4, 3.3) : random.range(1, 2), random.range(0, 40)], i * 2);
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  starGeometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  starGeometry.setAttribute("aLook", new BufferAttribute(looks, 2));
  const starMaterial = new ShaderMaterial({
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: shared.uTime, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute vec2 aLook;   // size in pixels, twinkle phase
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.72 + 0.28 * sin(uTime * (0.6 + fract(aLook.y) * 1.7) + aLook.y * 6.283);
        // Stars fade out toward the glow of the horizon.
        float clear = smoothstep(0.03, 0.24, normalize(position).y);
        vColor = aColor * twinkle * clear;
        gl_PointSize = aLook.x * uPixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float falloff = max(0.0, 1.0 - length(gl_PointCoord - 0.5) * 2.0);
        gl_FragColor = vec4(vColor * falloff * falloff, 1.0);
        ${OUTPUT}
      }
    `,
  });
  const stars = new Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  stars.renderOrder = -8;
  scene.add(stars);

  // --- Crescent moon ---
  const [moonCanvas, moonCtx] = makeCanvas(512, 512);
  moonCtx.fillStyle = "#000";
  moonCtx.fillRect(0, 0, 512, 512);
  const halo = moonCtx.createRadialGradient(256, 256, 70, 256, 256, 250);
  halo.addColorStop(0, "rgba(170, 190, 255, 0.16)");
  halo.addColorStop(0.5, "rgba(120, 140, 255, 0.05)");
  halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  moonCtx.fillStyle = halo;
  moonCtx.fillRect(0, 0, 512, 512);
  moonCtx.fillStyle = "#fff3d4";
  moonCtx.beginPath();
  moonCtx.arc(256, 256, 92, 0, Math.PI * 2);
  moonCtx.fill();
  // The part of the disc in shadow, a little brighter than the sky (earthshine).
  moonCtx.fillStyle = "rgba(7, 10, 26, 0.94)";
  moonCtx.beginPath();
  moonCtx.arc(298, 234, 88, 0, Math.PI * 2);
  moonCtx.fill();
  const moon = new Mesh(
    new PlaneGeometry(120, 120),
    new MeshBasicMaterial({ map: canvasTexture(moonCanvas), blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false })
  );
  moon.renderOrder = -7;
  const moonDirection = new Vector3(-0.3, 0.36, -0.88).normalize();
  scene.add(moon);

  // --- The far city, all round ---
  createFarCity({ scene, shared, palette, random });

  // --- A ringed planet low over the far end of the street, lit from the side of the moon ---
  const planetDirection = new Vector3(0.32, 0.2, -1).normalize();
  const planetDistance = 760;
  const planet = new Mesh(
    new SphereGeometry(62, 48, 24),
    new ShaderMaterial({
      depthWrite: false,
      uniforms: { uLight: { value: new Vector3(-0.6, 0.45, 0.65).normalize() }, uA: { value: new Color("#3b2a6e") }, uB: { value: new Color("#b0567a") }, uC: { value: new Color("#2e8a8a") } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vLocal;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight;
        uniform vec3 uA;
        uniform vec3 uB;
        uniform vec3 uC;
        varying vec3 vNormal;
        varying vec3 vLocal;
        ${NOISE}
        void main() {
          float latitude = vLocal.y / 62.0;
          float bands = sin(latitude * 18.0 + noise21(vec2(latitude * 30.0, vLocal.x * 0.05)) * 2.5);
          vec3 albedo = mix(uA, uB, 0.5 + 0.5 * bands);
          albedo = mix(albedo, uC, smoothstep(0.55, 0.9, noise21(vec2(vLocal.x * 0.04, latitude * 9.0))));
          vec3 n = normalize(vNormal);
          float light = smoothstep(-0.15, 0.6, dot(n, uLight));
          vec3 color = albedo * (0.04 + 0.62 * light);
          // A thin bright atmosphere round the lit edge.
          float rim = pow(1.0 - abs(n.z), 3.0) * light;
          color += uB * rim * 0.35;
          gl_FragColor = vec4(color, 1.0);
          ${OUTPUT}
        }
      `,
    })
  );
  planet.renderOrder = -7;
  scene.add(planet);
  const ring = new Mesh(
    new RingGeometry(80, 128, 96, 1),
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: new Color("#c98fb8") } },
      vertexShader: /* glsl */ `
        varying vec2 vPosition;
        void main() {
          vPosition = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vPosition;
        void main() {
          float r = (length(vPosition) - 80.0) / 48.0;
          float bands = 0.55 + 0.45 * sin(r * 40.0) * sin(r * 13.0 + 1.0);
          float fade = smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.85, 1.0, r));
          gl_FragColor = vec4(uColor * bands * fade * 0.22, 1.0);
          ${OUTPUT}
        }
      `,
    })
  );
  ring.rotation.set(-1.25, 0.35, 0.25);
  ring.renderOrder = -7;
  scene.add(ring);

  // --- A small second moon, pale blue ---
  const [moonletCanvas, moonletCtx] = makeCanvas(128, 128);
  moonletCtx.fillStyle = "#000";
  moonletCtx.fillRect(0, 0, 128, 128);
  const moonletGlow = moonletCtx.createRadialGradient(64, 64, 10, 64, 64, 62);
  moonletGlow.addColorStop(0, "rgba(170, 220, 255, 0.9)");
  moonletGlow.addColorStop(0.32, "rgba(150, 200, 255, 0.85)");
  moonletGlow.addColorStop(0.36, "rgba(120, 170, 255, 0.12)");
  moonletGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  moonletCtx.fillStyle = moonletGlow;
  moonletCtx.fillRect(0, 0, 128, 128);
  const moonlet = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshBasicMaterial({ map: canvasTexture(moonletCanvas), blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false })
  );
  moonlet.renderOrder = -7;
  const moonletDirection = new Vector3(0.55, 0.5, -0.67).normalize();
  scene.add(moonlet);

  // --- Shooting stars: rare, quick and faint ---
  const streakMaterial = new ShaderMaterial({
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: palette.accentSoft }, uAlpha: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        float along = pow(clamp(vUv.x, 0.0, 1.0), 3.0);
        float across = pow(max(0.0, 1.0 - abs(vUv.y - 0.5) * 2.0), 2.0);
        vec3 color = mix(uColor, vec3(1.0), smoothstep(0.85, 1.0, vUv.x));
        gl_FragColor = vec4(color * along * across * uAlpha, 1.0);
        ${OUTPUT}
      }
    `,
  });
  const streak = new Mesh(new PlaneGeometry(1, 1), streakMaterial);
  streak.frustumCulled = false;
  streak.visible = false;
  streak.renderOrder = -6;
  scene.add(streak);

  const flight = { from: new Vector3(), travel: new Vector3(), startedAt: 0, length: 1, nextAt: random.range(3, 7) };
  const dir = new Vector3();
  const tangent = new Vector3();
  const side = new Vector3();
  const facing = new Vector3();
  const basis = new Matrix4();

  const updateStreak = (time, camera) => {
    if (!streak.visible) {
      if (time < flight.nextAt) return;
      flight.from.set(random.range(-0.75, 0.75), random.range(0.32, 0.7), -1).normalize();
      flight.travel.set(random.chance(0.5) ? 1 : -1, random.range(-0.55, -0.2), random.range(-0.1, 0.1)).normalize();
      flight.startedAt = time;
      flight.length = random.range(0.75, 1.1);
      streak.visible = true;
    }
    const progress = (time - flight.startedAt) / flight.length;
    if (progress >= 1) {
      streak.visible = false;
      flight.nextAt = time + random.range(6, 14);
      return;
    }
    dir.copy(flight.from).addScaledVector(flight.travel, progress * 0.32).normalize();
    facing.copy(dir).negate();
    tangent.copy(flight.travel).addScaledVector(facing, -flight.travel.dot(facing)).normalize();
    side.crossVectors(facing, tangent);
    basis.makeBasis(tangent, side, facing);
    streak.quaternion.setFromRotationMatrix(basis);
    streak.position.copy(camera.position).addScaledVector(dir, STAR_DISTANCE - 40);
    streak.scale.set(95, 2.4, 1);
    streakMaterial.uniforms.uAlpha.value = Math.sin(Math.PI * progress) * 0.75;
  };

  return {
    setPixelRatio(ratio) {
      starMaterial.uniforms.uPixelRatio.value = ratio;
    },
    update(time, camera) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      moon.position.copy(camera.position).addScaledVector(moonDirection, STAR_DISTANCE - 60);
      moon.quaternion.copy(camera.quaternion);
      moonlet.position.copy(camera.position).addScaledVector(moonletDirection, STAR_DISTANCE - 80);
      moonlet.quaternion.copy(camera.quaternion);
      planet.position.copy(camera.position).addScaledVector(planetDirection, planetDistance);
      planet.rotation.y = time * 0.004;
      ring.position.copy(planet.position);
      updateStreak(time, camera);
    },
  };
}
