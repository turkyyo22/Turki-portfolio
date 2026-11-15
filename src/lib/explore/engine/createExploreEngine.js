import { ACESFilmicToneMapping, FogExp2, HalfFloatType, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { END_PLAZA, LOTS, SIDE_STREETS, footprintOf, placeById, planRoute, siteOf } from "@/lib/explore/city";
import { tourPosition, tourStage } from "@/lib/explore/plan";

import { lineStreets } from "./fillers";
import { bollardGeometry, createDecals, createGlows, createGround, createProps, lampGeometry } from "./ground";
import { createGuide } from "./guide";
import { createKit } from "./kit";
import { createLife } from "./life";
import { createNature } from "./nature";
import { createPalette, stopColor } from "./palette";
import { buildPlaces } from "./places";
import { clamp, createRandom } from "./random";
import { createRig } from "./rig";
import { createSharedUniforms } from "./shaders";
import { createSky } from "./sky";
import { createStreetSigns } from "./signage";
import { buildStreets } from "./streets";

// What each quality level draws. `pixelRatio` is the most device pixels drawn per
// CSS pixel; `samples` is the anti-aliasing of the post-processing buffer.
// Low is the default on phones; High on capable computers.
export const QUALITY = {
  high: { pixelRatio: 1.75, bloom: true, samples: 4, bloomScale: 1, stars: 2600, traffic: 1, crowd: 1, detail: true },
  low: { pixelRatio: 1.3, bloom: true, samples: 0, bloomScale: 0.5, stars: 1300, traffic: 0.55, crowd: 0.55, detail: false },
};

const FOG_DENSITY = 0.0048;
// How quickly the camera catches up with the scroll position (higher is snappier).
const FOLLOW = 4.2;
// The frame rate below which the picture is made cheaper, measured over this many frames.
const SLOW_FPS = 27;
const SAMPLE_FRAMES = 90;
const WARM_UP_FRAMES = 60;

// The bloom pass normally picks bright pixels by luminance, which leaves blue,
// violet and pink neon without glow. This picks them by their brightest channel,
// and never lets a broken or absurdly bright pixel spread.
const BRIGHT_PASS = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 defaultColor;
  uniform float defaultOpacity;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    texel.rgb = clamp(texel.rgb, 0.0, 12.0);
    float brightest = max(texel.r, max(texel.g, texel.b));
    float amount = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, brightest);
    gl_FragColor = mix(vec4(defaultColor.rgb, defaultOpacity), texel, amount);
  }
`;

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

// Behaviour the guide robot reacts to (see director.js): scrolling faster than
// this (metres a second along the route) for a moment, scrolling back, rushing
// past a stop, and leaving the city alone for a while.
const FAST_SPEED = 70;
const RUSH_SPEED = 45;
const BACK_SPEED = -12;
const IDLE_SECONDS = 45;
const IDLE_AT_STOP_SECONDS = 18;
// A press that moves less than this (pixels) and is this quick (ms) is a click, not a drag.
const CLICK_TRAVEL = 8;
const CLICK_TIME = 450;

/** Where a ray first enters a box standing on the ground, in the box's own frame; Infinity if it misses. */
function rayBoxDistance(origin, direction, site, top) {
  const cos = Math.cos(site.turn);
  const sin = Math.sin(site.turn);
  const toLocal = (x, z) => [x * cos - z * sin, x * sin + z * cos];
  const [ox, oz] = toLocal(origin.x - site.x, origin.z - site.z);
  const [dx, dz] = toLocal(direction.x, direction.z);
  const { width, depth, apron } = site.footprint;
  const lo = [-width / 2, 0, -depth / 2];
  const hi = [width / 2, top, depth / 2 + apron];
  const o = [ox, origin.y, oz];
  const d = [dx, direction.y, dz];
  let near = 0;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(d[axis]) < 1e-9) {
      if (o[axis] < lo[axis] || o[axis] > hi[axis]) return Infinity;
      continue;
    }
    let t1 = (lo[axis] - o[axis]) / d[axis];
    let t2 = (hi[axis] - o[axis]) / d[axis];
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return Infinity;
  }
  return near;
}

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
 * scrolls. Building takes a moment, so this is async and reports its progress;
 * it resolves to the engine, or to null if `cancelled()` became true meanwhile.
 * Throws when WebGL is unavailable.
 *
 * - `city`: the plan from buildCity() in city.js.
 * - `quality`: "high" or "low"; lowered further automatically if frames are slow.
 * - `calm`: the visitor prefers reduced motion; the robot turns and banks less.
 * - `text`: the few words drawn inside the city (see ExploreMode.jsx).
 * - `imageFor(stop)`: the URL of a stop's picture, or "".
 * - callbacks: onProgress(0..1), onReady(), onStage(stage), onFrame(frame), onSlow(), onEvent(type, detail).
 */
export async function createExploreEngine(options) {
  const { host, city, quality = "high", calm = false, family, rtl = false, text, imageFor, cancelled = () => false } = options;
  const { onProgress, onReady, onStage, onFrame, onSlow, onEvent } = options;
  const settings = QUALITY[quality] ?? QUALITY.high;
  const stops = city.stops;
  const count = stops.length;
  const life = { disposed: false };

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y";
  canvas.setAttribute("aria-hidden", "true");

  const palette = createPalette();
  const shared = createSharedUniforms(palette, FOG_DENSITY);
  const scene = new Scene();
  // For the few built-in materials (signs, screens, holograms); the city's own shaders use `shared`.
  scene.fog = new FogExp2(palette.fog.clone().lerp(palette.fogLow, 0.6), FOG_DENSITY);
  renderer.setClearColor(palette.zenith);
  const camera = new PerspectiveCamera(60, 1, 0.3, 1600);

  const abandon = () => {
    life.disposed = true;
    disposeScene(scene);
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  };
  const progress = async (fraction) => {
    onProgress?.(fraction);
    await nextFrame();
    return cancelled();
  };

  // --- The route and the buildings the tour stops at ---
  const occupied = new Set(stops.map((stop) => stop.place));
  const { path } = planRoute(occupied);
  const sites = stops.map((stop) => siteOf(placeById(stop.place), footprintOf(placeById(stop.place), stop.size)));
  const colors = stops.map((stop, index) => stopColor(palette, stop, index));
  if (await progress(0.05)) return abandon();

  // --- Build the city. The same seed gives the same streets on every visit. ---
  const random = createRandom(20260112);
  const base = { scene, shared, palette, random, settings };
  const kit = createKit({ scene, shared, low: !settings.detail });
  const decals = createDecals(base);
  const glows = createGlows(base);
  const lamps = createProps({ ...base, geometry: lampGeometry() });
  const bollards = createProps({ ...base, geometry: bollardGeometry() });

  const sky = createSky(base);
  createGround({ ...base, bounds: { minX: -300, maxX: 300, minZ: -1150, maxZ: 380 } });
  buildStreets({ scene, kit, palette, lamps, glows, decals, text: { gate: text.gate, family, rtl } });
  if (await progress(0.15)) return abandon();

  const lotsInUse = LOTS.slice(0, city.upcoming.length);
  const placeSites = stops.map((stop, index) => ({ place: placeById(stop.place), site: sites[index] }));
  const emptyEnds = new Set(SIDE_STREETS.filter((street) => street.end !== "stub" && !stops.some((stop) => placeById(stop.place).at === street.id)).map((street) => street.id));
  const fronts = lineStreets({ kit, random, palette, detail: settings.detail, glows, placeSites, lotsInUse, emptyEnds });
  if (await progress(0.45)) return abandon();

  const places = buildPlaces({ ...base, kit, detail: settings.detail, sites, stops, upcoming: city.upcoming, decals, glows, bollards, family, rtl, text, imageFor, life, colors });
  createStreetSigns({ ...base, fronts, words: city.signs, family, decals });
  const nature = createNature({ ...base, sites, emptyEnds, detail: settings.detail });
  const traffic = createLife({ ...base, kit, sites, stops });
  if (await progress(0.7)) return abandon();

  kit.build();
  for (const batch of [decals, glows, lamps, bollards]) batch.build();
  const guide = createGuide({ scene, palette, calm });
  if (await progress(0.8)) return abandon();

  // --- The camera, along the route ---
  const rigStops = stops.map((stop, index) => {
    const site = sites[index];
    const frame = places.frames[index];
    const s = path.marks[stop.place];
    const far = path.marks[`${stop.place}:far`];
    const onMain = placeById(stop.place).at === "main";
    return {
      s,
      view: new Vector3(site.view.x, frame.eye, site.view.z),
      front: frame.front,
      lateral: onMain ? site.view.x : 0,
      eye: frame.eye,
      // The stop's card sits on the left when the building is on the right of the street, otherwise on the right.
      cardSide: stop.side > 0 ? 1 : -1,
      // In a square, keep the building in view for the rest of the drive round it.
      area: far ? [s, far + (far - s) * 1.6] : null,
      screen: frame.screen,
    };
  });
  const rig = createRig({ camera, path, stops: rigStops, finalePoint: new Vector3(0, 20, END_PLAZA.z) });

  // --- Glow: the scene is drawn into a buffer, bright parts are blurred over it ---
  host.appendChild(canvas);
  let composer = null;
  let bloom = null;
  if (settings.bloom) {
    composer = new EffectComposer(renderer, new WebGLRenderTarget(2, 2, { type: HalfFloatType, samples: settings.samples }));
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new Vector2(2, 2), 0.36, 0.45, 1.05);
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

  // --- Input: drag to look around (or to swing round a building at a stop), click to pick ---
  let lastActivity = 0;
  const press = { id: null, x: 0, y: 0, startX: 0, startY: 0, startedAt: 0, touch: false };
  const rayOrigin = new Vector3();
  const rayDirection = new Vector3();
  const pick = (clientX, clientY) => {
    const rect = host.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    rayOrigin.copy(camera.position);
    rayDirection.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    // The robot first: it flies in front of everything.
    const toGuide = guide.position.clone().sub(rayOrigin);
    const along = toGuide.dot(rayDirection);
    if (along > 0 && toGuide.lengthSq() - along * along < guide.radius * guide.radius) {
      onEvent?.("pick-guide");
      return;
    }
    let nearest = Infinity;
    let picked = -1;
    sites.forEach((site, index) => {
      const distance = rayBoxDistance(rayOrigin, rayDirection, site, places.frames[index].top);
      if (distance < nearest) {
        nearest = distance;
        picked = index;
      }
    });
    if (picked >= 0) onEvent?.("pick-stop", { index: picked });
  };
  const onPointerDown = (event) => {
    if (event.button > 0) return;
    lastActivity = time;
    press.id = event.pointerId;
    press.x = press.startX = event.clientX;
    press.y = press.startY = event.clientY;
    press.startedAt = performance.now();
    press.touch = event.pointerType === "touch";
    rig.hold(true);
    host.style.cursor = "grabbing";
  };
  const onPointerDrag = (event) => {
    if (event.pointerId !== press.id) return;
    lastActivity = time;
    const dx = (event.clientX - press.x) / Math.max(1, width);
    const dy = (event.clientY - press.y) / Math.max(1, height);
    press.x = event.clientX;
    press.y = event.clientY;
    // On touch screens, upward and downward swipes scroll the page; only sideways ones look around.
    rig.drag(dx, press.touch ? 0 : dy);
  };
  const release = (event, cancelled) => {
    if (event.pointerId !== press.id) return;
    press.id = null;
    rig.hold(false);
    host.style.cursor = "grab";
    const travel = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (!cancelled && travel < CLICK_TRAVEL && performance.now() - press.startedAt < CLICK_TIME) pick(event.clientX, event.clientY);
  };
  const onPointerUp = (event) => release(event, false);
  const onPointerCancel = (event) => release(event, true);
  host.style.cursor = "grab";
  host.style.touchAction = "pan-y";
  host.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerDrag, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);

  // --- Behaviour the robot reacts to ---
  const behaviour = { fastFor: 0, backFor: 0, fastSent: false, backSent: false, idleSent: false, stopIdleFor: 0, stopIdleSent: -1, turned: false };
  const watchBehaviour = (dt, moving, previousPosition, view) => {
    if (moving) lastActivity = time;
    // Scrolling fast, or back, for a moment.
    behaviour.fastFor = Math.abs(speed) > FAST_SPEED ? behaviour.fastFor + dt : 0;
    if (behaviour.fastFor > 0.35 && !behaviour.fastSent) {
      behaviour.fastSent = true;
      onEvent?.("fast");
    }
    if (behaviour.fastFor === 0) behaviour.fastSent = false;
    behaviour.backFor = speed < BACK_SPEED ? behaviour.backFor + dt : 0;
    if (behaviour.backFor > 0.5 && !behaviour.backSent) {
      behaviour.backSent = true;
      onEvent?.("backwards");
    }
    if (behaviour.backFor === 0) behaviour.backSent = false;
    // Rushing past a stop without slowing down.
    const passed = Math.floor(position) - Math.floor(previousPosition);
    if (passed > 0 && speed > RUSH_SPEED) {
      const index = Math.floor(position) - 1;
      if (index >= 0 && index < count) onEvent?.("skip", { index });
    }
    // Left alone at a stop, or anywhere.
    if (view.focus > 0.9 && !moving) {
      behaviour.stopIdleFor += dt;
      if (behaviour.stopIdleFor > IDLE_AT_STOP_SECONDS && behaviour.stopIdleSent !== view.stopIndex) {
        behaviour.stopIdleSent = view.stopIndex;
        onEvent?.("idle-stop", { index: view.stopIndex });
      }
    } else {
      behaviour.stopIdleFor = 0;
    }
    if (time - lastActivity > IDLE_SECONDS && !behaviour.idleSent) {
      behaviour.idleSent = true;
      onEvent?.("idle");
    } else if (time - lastActivity < 0.5 && behaviour.idleSent) {
      behaviour.idleSent = false;
      onEvent?.("active");
    }
    // Whether the view is turned away from where the tour points it.
    if (rig.turned !== behaviour.turned) {
      behaviour.turned = rig.turned;
      onEvent?.("view-turned", { turned: behaviour.turned });
    }
  };

  const projected = new Vector3();
  const frameInfo = { progress: 0, guideX: 0, guideY: 0, guideVisible: false, speed: 0, focus: 0 };

  let position = tourPosition(readProgress(), count);
  let lastS = 0;
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
  let frozen = null;

  // One step of the city: `elapsed` seconds since the last one.
  const tick = (elapsed) => {
    const dt = Math.min(Math.max(elapsed, 0), 0.1);
    time += dt;
    shared.uTime.value = time;

    // --- Where the visitor is on the tour (held still while a detail panel is open) ---
    const progressNow = frozen ?? readProgress();
    const target = tourPosition(progressNow, count);
    const moving = Math.abs(target - position) > 0.002;
    const previousPosition = position;
    position += (target - position) * (1 - Math.exp(-dt * FOLLOW));
    if (Math.abs(target - position) < 0.0003) position = target;

    pointer.easedX += (pointer.x - pointer.easedX) * (1 - Math.exp(-dt * 3));
    pointer.easedY += (pointer.y - pointer.easedY) * (1 - Math.exp(-dt * 3));
    const view = rig.update(dt, position, { moving, pointerX: pointer.easedX, pointerY: pointer.easedY });
    speed += ((view.s - lastS) / Math.max(dt, 0.001) - speed) * (1 - Math.exp(-dt * 8));
    lastS = view.s;

    // --- Everything that moves ---
    sky.update(time, camera);
    places.update(time, camera.position.x, camera.position.z);
    traffic.update(time);
    nature.update?.(time);
    const stop = stops[view.stopIndex];
    const nextStop = stops[clamp(Math.floor(position), 0, Math.max(0, count - 1))];
    // The robot keeps to the side of the screen away from the building: where the stop's card is.
    const side = (stop && view.focus > 0.5 ? stop.side : nextStop?.side) || -1;
    guide.update({ time, dt, camera, focus: view.focus, side: view.finale > 0.5 ? -1 : side, speed, speaking: time < speakUntil, detail: view.detail });
    watchBehaviour(dt, moving, previousPosition, view);

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);

    // --- Tell the page what changed ---
    const stage = tourStage(position, count);
    const key = `${stage.kind}:${stage.index}`;
    if (key !== stageKey) {
      stageKey = key;
      onStage?.(stage);
    }
    projected.copy(guide.position);
    projected.y += 0.62;
    projected.project(camera);
    frameInfo.progress = progressNow;
    frameInfo.guideX = (projected.x * 0.5 + 0.5) * width;
    frameInfo.guideY = (-projected.y * 0.5 + 0.5) * height;
    frameInfo.guideVisible = projected.z < 1;
    frameInfo.speed = speed;
    frameInfo.focus = view.focus;
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
            onEvent?.("quality-lowered");
          } else if (savingStep === savings.length) {
            savingStep += 1;
            onSlow?.();
          }
        }
      }
    }
  };

  const frame = (now) => {
    frameId = requestAnimationFrame(frame);
    const elapsed = (now - lastNow) / 1000;
    lastNow = now;
    tick(elapsed);
  };

  await renderer.compileAsync(scene, camera);
  if (await progress(1)) {
    observer.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerDrag);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    canvas.remove();
    return abandon();
  }
  frameId = requestAnimationFrame(frame);

  const corner = new Vector3();
  const api = {
    /** Plays one of the robot's moods (see director.js) and moves its mouth for `seconds`. */
    act(mood, seconds = 2.6) {
      if (mood) guide.act(mood);
      speakUntil = time + seconds;
    },
    /** Eases a turned view back to where the tour points it. */
    recentre() {
      rig.recentre();
    },
    /** Flies close to stop `index`'s screen and holds the tour there. */
    openDetail(index) {
      frozen = readProgress();
      rig.setDetail(index);
    },
    /** Flies back from the screen and lets the tour follow the scroll again. */
    closeDetail() {
      rig.setDetail(-1);
      frozen = null;
    },
    /**
     * The four corners of stop `index`'s screen as seen now, in pixels within the
     * canvas: top left, top right, bottom right, bottom left.
     */
    screenQuad(index) {
      const screen = places.frames[index]?.screen;
      if (!screen) return null;
      const { centre, normal, width: w, height: h } = screen;
      const rightX = normal.z;
      const rightZ = -normal.x;
      return [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
      ].map(([sx, sy]) => {
        corner.set(centre.x + rightX * sx * (w / 2), centre.y + sy * (h / 2), centre.z + rightZ * sx * (w / 2)).project(camera);
        return [(corner.x * 0.5 + 0.5) * width, (-corner.y * 0.5 + 0.5) * height];
      });
    },
    dispose() {
      life.disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerDrag);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      disposeScene(scene);
      dropGlow();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      if (window.__exploreDebug?.engine === api) delete window.__exploreDebug;
    },
  };

  // In development only: lets tests and screenshots move the city's clock on
  // without waiting for real frames (browsers slow frames down in hidden windows).
  if (process.env.NODE_ENV === "development") {
    window.__exploreDebug = {
      advance(seconds, step = 1 / 30) {
        for (let t = 0; t < seconds; t += step) tick(step);
      },
      renderer,
      engine: api,
    };
  }
  return api;
}
