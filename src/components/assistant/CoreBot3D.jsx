"use client";

import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { accentById, currentAccent, onAccentChange } from "@/lib/accent";

const BLINK_EVERY_S = 3.6;
const BLINK_LENGTH_S = 0.14;

/** Builds the robot head. Returns the group plus the parts that animate. */
function buildBot() {
  const geometries = [];
  const materials = [];
  // Remember everything we create so it can be disposed of on unmount.
  const track = (item, list) => {
    list.push(item);
    return item;
  };

  const shell = track(
    new MeshPhysicalMaterial({
      color: "#2b4166",
      metalness: 0.45,
      roughness: 0.32,
      clearcoat: 0.9,
      clearcoatRoughness: 0.2,
      emissive: "#0b2847",
      emissiveIntensity: 0.35,
    }),
    materials
  );
  const glass = track(new MeshPhysicalMaterial({ color: "#02050b", metalness: 0.3, roughness: 0.08, clearcoat: 1 }), materials);
  // The accent-coloured parts. Their colours are set by paint() in CoreBot3D, from the picked accent.
  const accent = track(new MeshStandardMaterial({ metalness: 0.7, roughness: 0.3, emissiveIntensity: 0.35 }), materials);
  const glow = track(new MeshBasicMaterial(), materials);
  const tipGlow = track(new MeshBasicMaterial(), materials);

  const bot = new Group();
  const head = new Mesh(track(new RoundedBoxGeometry(1.7, 1.42, 1.25, 6, 0.42), geometries), shell);
  const visor = new Mesh(track(new RoundedBoxGeometry(1.32, 0.8, 0.22, 5, 0.1), geometries), glass);
  visor.position.set(0, 0.04, 0.56);

  const eyeGeometry = track(new CapsuleGeometry(0.085, 0.2, 6, 16), geometries);
  const leftEye = new Mesh(eyeGeometry, glow);
  const rightEye = new Mesh(eyeGeometry, glow);
  leftEye.position.set(-0.27, 0.1, 0.69);
  rightEye.position.set(0.27, 0.1, 0.69);

  const mouth = new Mesh(track(new CapsuleGeometry(0.03, 0.24, 4, 12), geometries), glow);
  mouth.rotation.z = Math.PI / 2;
  mouth.position.set(0, -0.2, 0.69);

  const earGeometry = track(new CylinderGeometry(0.17, 0.17, 0.16, 32), geometries);
  const leftEar = new Mesh(earGeometry, accent);
  const rightEar = new Mesh(earGeometry, accent);
  leftEar.rotation.z = Math.PI / 2;
  rightEar.rotation.z = Math.PI / 2;
  leftEar.position.set(-0.92, 0, 0);
  rightEar.position.set(0.92, 0, 0);

  const stem = new Mesh(track(new CylinderGeometry(0.03, 0.03, 0.34, 12), geometries), accent);
  stem.position.set(0, 0.86, 0);
  const tip = new Mesh(track(new SphereGeometry(0.1, 24, 16), geometries), tipGlow);
  tip.position.set(0, 1.07, 0);

  bot.add(head, visor, leftEye, rightEye, mouth, leftEar, rightEar, stem, tip);
  return { bot, eyes: [leftEye, rightEye], mouth, tip, metal: accent, glow, tipGlow, geometries, materials };
}

/**
 * The T.A Core robot, rendered with three.js. It floats, blinks, looks toward
 * the speech bubble and the cursor, and moves its mouth while `speaking`.
 * With `still`, it renders a single frame (used for reduced motion).
 * Calls `onUnsupported` when WebGL is unavailable so the caller can fall back.
 */
export default function CoreBot3D({ size = 120, speaking = false, still = false, onUnsupported }) {
  const hostRef = useRef(null);
  const speakingRef = useRef(speaking);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      onUnsupported?.();
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size);
    renderer.toneMapping = ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.15, 6.4);

    // Key light from the front, accent-coloured rim lights behind so the head stands
    // out from the dark page. paint() below gives the coloured lights their colours.
    const ambient = new AmbientLight(undefined, 1.1);
    const key = new DirectionalLight("#ffffff", 3);
    key.position.set(2, 3, 4);
    const rimLeft = new PointLight(undefined, 45, 0, 2);
    rimLeft.position.set(-2.4, 1.8, -1.2);
    const rimRight = new PointLight(undefined, 35, 0, 2);
    rimRight.position.set(2.4, 1.6, -1.6);
    const fill = new PointLight(undefined, 30, 0, 2);
    fill.position.set(2.6, -1.4, 1.2);
    const eyeLight = new PointLight(undefined, 2.5, 3, 2);
    eyeLight.position.set(0, 0.05, 1.3);
    scene.add(ambient, key, rimLeft, rimRight, fill, eyeLight);

    const { bot, eyes, mouth, tip, metal, glow, tipGlow, geometries, materials } = buildBot();
    scene.add(bot);

    // Colours the lights and the accent parts with the site's accent colour, and
    // again whenever the visitor picks another one.
    const tipColor = new Color();
    const white = new Color("#ffffff");
    const paint = () => {
      const colors = accentById(currentAccent());
      ambient.color.set(colors.ambient);
      for (const light of [rimLeft, rimRight, eyeLight]) light.color.set(colors.primary);
      fill.color.set(colors.secondary);
      metal.color.set(colors.metal);
      metal.emissive.set(colors.primary);
      glow.color.set(colors.glow);
      tipColor.set(colors.primary);
      tipGlow.color.copy(tipColor);
    };
    paint();
    const stopRepainting = onAccentChange(() => {
      paint();
      if (still) renderer.render(scene, camera);
    });

    // Resting pose: turned slightly toward the speech bubble on its right.
    const base = { x: -0.06, y: 0.32 };
    bot.rotation.set(base.x, base.y, 0);

    if (still) {
      renderer.render(scene, camera);
    }

    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (event) => {
      pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const startedAt = performance.now();
    let talk = 0;
    let frame = 0;
    const renderFrame = (now) => {
      const time = (now - startedAt) / 1000;
      talk += ((speakingRef.current ? 1 : 0) - talk) * 0.12;

      // Float, sway, and turn a little toward the cursor.
      bot.position.y = Math.sin(time * 1.5) * 0.07;
      const targetY = base.y + pointerX * 0.35 + Math.sin(time * 0.7) * 0.06;
      const targetX = base.x + pointerY * 0.2 + Math.sin(time * 0.9) * 0.04;
      bot.rotation.y += (targetY - bot.rotation.y) * 0.06;
      bot.rotation.x += (targetX - bot.rotation.x) * 0.06;
      // A little "hello" head tilt as it appears.
      const hello = Math.max(0, 1 - time / 1.4);
      bot.rotation.z = Math.sin(time * 9) * 0.14 * hello;

      const blinking = time % BLINK_EVERY_S < BLINK_LENGTH_S;
      for (const eye of eyes) eye.scale.y = blinking ? 0.15 : 1;

      const mouthOpen = talk * Math.abs(Math.sin(time * 16));
      mouth.scale.set(1 - mouthOpen * 0.35, 1 + mouthOpen * 2.2, 1);

      const pulse = 0.5 + 0.5 * Math.sin(time * (3 + talk * 6));
      tip.scale.setScalar(1 + pulse * 0.25);
      // The antenna tip pulses between the accent and a lighter shade of it.
      tipGlow.color.copy(tipColor).lerp(white, 0.3 * pulse);

      renderer.render(scene, camera);
      frame = requestAnimationFrame(renderFrame);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame && !still) {
        frame = requestAnimationFrame(renderFrame);
      }
    };

    if (!still) {
      frame = requestAnimationFrame(renderFrame);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      cancelAnimationFrame(frame);
      stopRepainting();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [size, still, onUnsupported]);

  return <div ref={hostRef} aria-hidden="true" style={{ width: size, height: size }} />;
}
