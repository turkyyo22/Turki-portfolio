import { ACESFilmicToneMapping, FogExp2, HalfFloatType, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { routeZ, tourPosition, tourStage } from "@/lib/explore/plan";

import { createBlocks, createScreens, createStreetSigns, layBuildings, layScreens } from "./buildings";
import { bollardGeometry, createDecals, createGlows, createGround, createProps, lampGeometry, layStreetLamps, treeGeometry } from "./ground";
import { createGuide } from "./guide";
import { createLandmarks } from "./landmarks";
import { createLayout } from "./layout";
import { createLife } from "./life";
import { createPalette } from "./palette";
import { clamp, createRandom, lerp, smoothstep } from "./random";
import { createSharedUniforms } from "./shaders";
import { createSky } from "./sky";

// What each quality level draws. `pixelRatio` is the most device pixels drawn per
// CSS pixel; `samples` is the anti-aliasing of the post-processing buffer.
const QUALITY = {
  high: { pixelRatio: 1.75, bloom: true, samples: 4, bloomScale: 1, stars: 2600, traffic: 1, crowd: 1 },
  medium: { pixelRatio: 1.25, bloom: true, samples: 0, bloomScale: 0.6, stars: 1800, traffic: 0.75, crowd: 0.75 },
  lite: { pixelRatio: 1.5, bloom: false, samples: 0, bloomScale: 0.6, stars: 1100, traffic: 0.5, crowd: 0.5 },
};

const FOG_DENSITY = 0.0052;
// How quickly the camera catches up with the scroll position (higher is snappier).
const FOLLOW = 4.2;
// The frame rate below which the picture is made cheaper, measured over this many frames.
const SLOW_FPS = 27;
const SAMPLE_FRAMES = 90;
const WARM_UP_FRAMES = 60;

// The bloom pass normally picks bright pixels by luminance, which leaves blue,
// violet and pink neon without glow. This picks them by their brightest channel.
const BRIGHT_PASS = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 defaultColor;
  uniform float defaultOpacity;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    // Never let a broken or absurdly bright pixel spread into the glow.
    texel.rgb = clamp(texel.rgb, 0.0, 12.0);
    float brightest = max(texel.r, max(texel.g, texel.b));
    float amount = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, brightest);
    gl_FragColor = mix(vec4(defaultColor.rgb, defaultOpacity), texel, amount);
  }
`;

function disposeScene(scene) {
  scene.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      material.map?.dispose();
      for (const uniform of Object.values(material.uniforms ?? {})) {
        if (uniform.value?.isTexture) uniform.value.dispose();
      }
      material.dispose();
    }
  });
}

/**
 * Builds the 3D city in `host` and flies the camera through it as the page
 * scrolls. Throws when WebGL is unavailable. Returns { dispose }.
 *
 * - `tour`: the stops, from buildTour() in plan.js.
 * - `quality`: "high", "medium" or "lite"; lowered automatically if frames are slow.
 * - `calm`: the visitor prefers reduced motion; the robot turns and banks less.
 * - `text`: the few words drawn inside the city (see ExploreMode.jsx).
 * - `imageFor(stop)`: the URL of a stop's picture, or "".
 * - `onReady()`, `onStage(stage)`, `onFrame(frame)`, `onSlow()`: callbacks.
 */
export function createExploreEngine({ host, tour, quality = "high", calm = false, family, rtl = false, text, imageFor, onReady, onStage, onFrame, onSlow }) {
  const settings = QUALITY[quality] ?? QUALITY.high;
  const count = tour.stops.length;

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const palette = createPalette();
  const shared = createSharedUniforms(palette, FOG_DENSITY);
  const scene = new Scene();
  // For the few built-in materials (signs, screens, holograms); the city's own shaders use `shared`.
  scene.fog = new FogExp2(palette.fog.clone().lerp(palette.fogLow, 0.6), FOG_DENSITY);
  renderer.setClearColor(palette.zenith);
  const camera = new PerspectiveCamera(60, 1, 0.3, 1600);

  // --- Build the city. The same seed gives the same streets on every visit. ---
  const random = createRandom(20260112);
  const layout = createLayout(tour, palette);
  const life = { disposed: false };
  const base = { scene, shared, palette, random, layout, settings };
  const blocks = createBlocks(base);
  const decals = createDecals(base);
  const glows = createGlows(base);
  const lamps = createProps({ ...base, geometry: lampGeometry() });
  const bollards = createProps({ ...base, geometry: bollardGeometry() });
  const trees = createProps({ ...base, geometry: treeGeometry() });
  const screens = createScreens(base);

  const sky = createSky(base);
  createGround(base);
  layStreetLamps({ ...base, lamps, glows, decals });
  const fronts = layBuildings({ ...base, blocks, glows });
  createStreetSigns({ ...base, fronts, words: tour.signs, family, decals });
  layScreens({ ...base, fronts, screens, decals });
  const traffic = createLife({ ...base, blocks, decals });
  const landmarks = createLandmarks({ ...base, blocks, decals, glows, bollards, trees, family, rtl, text, imageFor, life });
  for (const batch of [blocks, decals, glows, lamps, bollards, trees, screens]) batch.build();
  const guide = createGuide({ scene, palette, calm });

  // --- Glow: the scene is drawn into a buffer, bright parts are blurred over it ---
  let composer = null;
  let bloom = null;
  if (settings.bloom) {
    composer = new EffectComposer(renderer, new WebGLRenderTarget(2, 2, { type: HalfFloatType, samples: settings.samples }));
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new Vector2(2, 2), 0.34, 0.45, 1.05);
    bloom.materialHighPassFilter.fragmentShader = BRIGHT_PASS;
    bloom.highPassUniforms.smoothWidth.value = 0.35;
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const dropGlow = () => {
    if (!composer) return;
    for (const pass of composer.passes) pass.dispose?.();
    composer.dispose();
    composer = null;
    bloom = null;
  };

  // Steps taken, in order, when the frame rate stays low: fewer pixels, then no
  // glow, then fewer pixels again.
  let pixelScale = 1;
  const savings = [
    () => {
      pixelScale = 0.8;
    },
    dropGlow,
    () => {
      pixelScale = 0.62;
    },
  ];
  let width = 1;
  let height = 1;

  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, settings.pixelRatio) * pixelScale;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    if (composer) {
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
      bloom.setSize(width * ratio * settings.bloomScale, height * ratio * settings.bloomScale);
    }
    camera.aspect = width / height;
    // A taller field of view on phones held upright, where the picture is narrow.
    camera.fov = camera.aspect < 1 ? 72 : 60;
    camera.updateProjectionMatrix();
    shared.uPointScale.value = (height * ratio) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    sky.setPixelRatio(ratio);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // The mouse nudges the view a little, like leaning to look around.
  const pointer = { x: 0, y: 0, easedX: 0, easedY: 0 };
  const onPointerMove = (event) => {
    if (event.pointerType === "touch") return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const readProgress = () => {
    const range = document.documentElement.scrollHeight - window.innerHeight;
    return range > 0 ? clamp(window.scrollY / range, 0, 1) : 0;
  };

  const ahead = new Vector3();
  const focusPoint = new Vector3();
  const look = new Vector3();
  const finalePoint = new Vector3(0, 20, layout.plaza.z);
  const projected = new Vector3();
  const frameInfo = { progress: 0, guideX: 0, guideY: 0, guideVisible: false };
  const lastSide = count > 0 ? tour.stops[count - 1].side : 1;

  let position = tourPosition(readProgress(), count);
  let lastZ = routeZ(position, count);
  let speed = 0;
  let time = 0;
  let lastNow = performance.now();
  let stageKey = "";
  let speakUntil = 0;
  let frames = 0;
  let sampleFrames = 0;
  let sampleTime = 0;
  let savingStep = 0;
  let frameId = 0;

  const frame = (now) => {
    frameId = requestAnimationFrame(frame);
    const elapsed = (now - lastNow) / 1000;
    lastNow = now;
    const dt = Math.min(elapsed, 0.1);
    time += dt;
    shared.uTime.value = time;

    // --- Where the visitor is on the tour ---
    const progress = readProgress();
    const target = tourPosition(progress, count);
    position += (target - position) * (1 - Math.exp(-dt * FOLLOW));
    if (Math.abs(target - position) < 0.0003) position = target;
    const z = routeZ(position, count);
    const tier = layout.tierAt(z);
    speed += ((lastZ - z) / Math.max(dt, 0.001) - speed) * (1 - Math.exp(-dt * 8));
    lastZ = z;

    // How much the nearest stop holds the camera's attention (0 to 1), and the same for the end plaza.
    const nearest = Math.round(position) - 1;
    const station = layout.stations[nearest];
    const focus = station ? 1 - smoothstep(0.14, 0.46, Math.abs(position - (nearest + 1))) : 0;
    const finale = smoothstep(count + 0.35, count + 0.95, position);

    // --- Camera: down the middle of the street, swaying gently, rising as the city grows ---
    pointer.easedX += (pointer.x - pointer.easedX) * (1 - Math.exp(-dt * 3));
    pointer.easedY += (pointer.y - pointer.easedY) * (1 - Math.exp(-dt * 3));
    const sway = Math.sin(z * 0.021) * 0.9;
    const eyeHeight = 4.3 + 3.9 * tier;
    let cameraX = station ? lerp(sway, station.cameraX, focus) : sway;
    cameraX = lerp(cameraX, 0, finale);
    camera.position.set(cameraX + pointer.easedX * 0.6, lerp(eyeHeight, 9.5, finale) - pointer.easedY * 0.35, z);

    ahead.set(Math.sin((z - 40) * 0.021) * 0.6, eyeHeight * 0.82 + 2 * tier, z - 40);
    look.copy(ahead);
    if (station && focus > 0) {
      // Wide screens keep the building to one side, leaving room for its card;
      // tall screens centre it above the card.
      // On an upright phone the card fills the bottom of the screen, so the camera
      // also looks lower there, which lifts the sign toward the top.
      const wide = camera.aspect >= 1.15;
      const frontX = station.x + station.facing.x * (station.depth / 2);
      const frontZ = station.z + station.facing.z * (station.depth / 2);
      focusPoint.set(lerp(station.cameraX, frontX, wide ? 0.62 : 0.97), station.focusY - (wide ? 0 : 3), frontZ);
      look.lerp(focusPoint, focus);
    }
    look.lerp(finalePoint, finale);
    camera.lookAt(look);

    // --- Everything that moves ---
    sky.update(time, camera);
    traffic.update(time);
    landmarks.update(time, z);
    const side = station && focus > 0.5 ? station.side : (layout.stations[clamp(Math.floor(position), 0, count - 1)]?.side ?? lastSide);
    guide.update({ time, dt, camera, focus, side: finale > 0.5 ? -lastSide : side, speed, speaking: time < speakUntil });

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);

    // --- Tell the page what changed ---
    const stage = tourStage(position, count);
    const key = `${stage.kind}:${stage.index}`;
    if (key !== stageKey) {
      stageKey = key;
      speakUntil = time + 2.6;
      onStage?.(stage);
    }
    projected.copy(guide.position);
    projected.y += 0.62;
    projected.project(camera);
    frameInfo.progress = progress;
    frameInfo.guideX = (projected.x * 0.5 + 0.5) * width;
    frameInfo.guideY = (-projected.y * 0.5 + 0.5) * height;
    frameInfo.guideVisible = projected.z < 1;
    onFrame?.(frameInfo);

    frames += 1;
    if (frames === 2) onReady?.();

    // --- Keep it smooth: if frames stay slow, draw fewer pixels, then drop the glow ---
    if (frames > WARM_UP_FRAMES && elapsed < 0.25) {
      sampleFrames += 1;
      sampleTime += elapsed;
      if (sampleFrames >= SAMPLE_FRAMES) {
        const fps = sampleFrames / sampleTime;
        sampleFrames = 0;
        sampleTime = 0;
        if (fps < SLOW_FPS) {
          if (savingStep < savings.length) {
            savings[savingStep]();
            savingStep += 1;
            resize();
          } else if (savingStep === savings.length) {
            savingStep += 1;
            onSlow?.();
          }
        }
      }
    }
  };
  renderer.compile(scene, camera);
  frameId = requestAnimationFrame(frame);

  return {
    dispose() {
      life.disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      disposeScene(scene);
      dropGlow();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
