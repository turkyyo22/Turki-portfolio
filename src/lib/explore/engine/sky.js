import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  RingGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import { NOISE, OUTPUT } from "./shaders";
import { canvasTexture, makeCanvas } from "./signs";

const STAR_DISTANCE = 900;
const SKYLINE_RADIUS = 640;
const SKYLINE_HEIGHT = 150;

/**
 * Everything above and around the city: the night sky with its glow over the
 * horizon, neon clouds lit from below, a faint aurora, twinkling stars, a
 * crescent moon and a smaller second one, a ringed planet low over the far end
 * of the street, the odd shooting star, and a ring of far towers. All of it
 * travels with the camera, so it never gets closer.
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

  // --- Far towers, as a ring of silhouettes around the horizon ---
  const [lineCanvas, lineCtx] = makeCanvas(2048, 256);
  const silhouette = `#${palette.fogLow.clone().multiplyScalar(0.7).getHexString()}`;
  const windowTints = ["255, 205, 140", "190, 225, 255", "255, 120, 200", "120, 240, 255"];
  let cursor = 0;
  while (cursor < 2048) {
    const width = Math.round(random.range(14, 44));
    const u = (cursor + width / 2) / 2048;
    // The texture's middle faces down the street, where the towers are tallest.
    const centre = Math.max(0, 1 - Math.abs(u - 0.5) * 2.4);
    const height = Math.round(26 + random.range(0, 46) + centre ** 1.5 * random.range(50, 150));
    lineCtx.fillStyle = silhouette;
    lineCtx.fillRect(cursor, 256 - height, width + 1, height);
    for (let wy = 256 - height + 4; wy < 250; wy += 5) {
      for (let wx = cursor + 3; wx < cursor + width - 3; wx += 4) {
        if (random.chance(0.1 + 0.16 * centre)) {
          lineCtx.fillStyle = `rgba(${random.pick(windowTints)}, ${random.range(0.25, 0.6).toFixed(2)})`;
          lineCtx.fillRect(wx, wy, 2, 2);
        }
      }
    }
    if (height > 120 && random.chance(0.6)) {
      lineCtx.fillStyle = "rgba(255, 70, 90, 0.9)";
      lineCtx.fillRect(cursor + Math.round(width / 2), 256 - height - 4, 2, 2);
    }
    cursor += width;
  }
  const lineTexture = canvasTexture(lineCanvas);
  lineTexture.wrapS = RepeatWrapping;
  const skyline = new Mesh(
    new CylinderGeometry(SKYLINE_RADIUS, SKYLINE_RADIUS, SKYLINE_HEIGHT, 72, 1, true),
    new MeshBasicMaterial({ map: lineTexture, alphaTest: 0.5, side: BackSide, fog: false })
  );
  skyline.frustumCulled = false;
  scene.add(skyline);

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
      skyline.position.set(camera.position.x, SKYLINE_HEIGHT / 2 - 8, camera.position.z);
      updateStreak(time, camera);
    },
  };
}
