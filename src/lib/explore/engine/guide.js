import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PointLight,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { bright } from "./palette";
import { clamp, lerp } from "./random";
import { canvasTexture, makeCanvas } from "./signs";

// The robot is the same head as on the main site (see CoreBot3D.jsx), this size in the city.
const SCALE = 0.45;
const BLINK_EVERY = 3.6;
const BLINK_LENGTH = 0.14;
const TRAIL_POINTS = 22;
// The size of the sphere a click must hit to reach the robot, in metres.
export const GUIDE_RADIUS = 0.75;

// How far ahead of the camera the robot flies, and the range it is kept within
// when the visitor scrolls faster than it can follow.
const CRUISE_DISTANCE = 7.2;
const STOP_DISTANCE = 6.4;
const NEAREST = 3.8;
const FURTHEST = 11;

// How long each mood plays, in seconds. "sleep" and "aside" last until the next mood.
const DURATIONS = { wave: 1.6, flinch: 0.7, dizzy: 1.8, "look-back": 1.4, nod: 0.9, wake: 0.8, celebrate: 2, present: 1.6, point: 1.6, lead: 0.1 };

const shortestTurn = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const pulse = (t) => Math.sin(Math.PI * clamp(t, 0, 1));

/**
 * T.A Core, the guide. It flies ahead of the camera on the side of the next
 * stop, turns to face the way it is going while the visitor scrolls, and at a
 * stop turns round and points at the building. `act(mood)` plays a short
 * reaction (see director.js): it waves, flinches, spins dizzy, looks back, nods,
 * dozes off, wakes up, celebrates, or moves aside. With `calm` (reduced motion)
 * the spins become gentle wobbles.
 */
export function createGuide({ scene, palette, calm }) {
  const shell = new MeshPhysicalMaterial({ color: "#2b4166", metalness: 0.45, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.2, emissive: "#0b2847", emissiveIntensity: 0.4 });
  const glass = new MeshPhysicalMaterial({ color: "#02050b", metalness: 0.3, roughness: 0.08, clearcoat: 1 });
  const metal = new MeshStandardMaterial({ color: palette.accentMetal, emissive: palette.accent, emissiveIntensity: 0.4, metalness: 0.7, roughness: 0.3 });
  const eyeGlow = new MeshBasicMaterial({ color: bright(palette.accentSoft, 1.5) });
  const tipGlow = new MeshBasicMaterial({ color: bright(palette.accent, 1.8) });
  const flameGlow = new MeshBasicMaterial({ color: bright(palette.accent, 1.2), transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false });

  // --- The head ---
  const head = new Group();
  const place = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    head.add(mesh);
    return mesh;
  };
  place(new Mesh(new RoundedBoxGeometry(1.7, 1.42, 1.25, 6, 0.42), shell), 0, 0, 0);
  place(new Mesh(new RoundedBoxGeometry(1.32, 0.8, 0.22, 5, 0.1), glass), 0, 0.04, 0.56);
  const eyeGeometry = new CapsuleGeometry(0.085, 0.2, 6, 16);
  const eyes = [place(new Mesh(eyeGeometry, eyeGlow), -0.27, 0.1, 0.69), place(new Mesh(eyeGeometry, eyeGlow), 0.27, 0.1, 0.69)];
  const mouth = place(new Mesh(new CapsuleGeometry(0.03, 0.24, 4, 12), eyeGlow), 0, -0.2, 0.69);
  mouth.rotation.z = Math.PI / 2;
  const earGeometry = new CylinderGeometry(0.17, 0.17, 0.16, 32);
  for (const x of [-0.92, 0.92]) place(new Mesh(earGeometry, metal), x, 0, 0).rotation.z = Math.PI / 2;
  place(new Mesh(new CylinderGeometry(0.03, 0.03, 0.34, 12), metal), 0, 0.86, 0);
  const tip = place(new Mesh(new SphereGeometry(0.1, 24, 16), tipGlow), 0, 1.07, 0);
  // A glowing vent on the back, seen while it flies ahead.
  place(new Mesh(new RoundedBoxGeometry(0.8, 0.14, 0.08, 3, 0.04), eyeGlow), 0, 0.12, -0.63);
  place(new Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.08, 3, 0.04), eyeGlow), 0, -0.14, -0.63);

  // Two floating hands, and a small thruster underneath.
  const handGeometry = new CapsuleGeometry(0.13, 0.16, 6, 12);
  const hands = [-1, 1].map((sign) => {
    const hand = place(new Mesh(handGeometry, shell), sign * 1.15, -0.6, 0.2);
    hand.userData.sign = sign;
    return hand;
  });
  place(new Mesh(new CylinderGeometry(0.3, 0.2, 0.2, 20), metal), 0, -0.8, 0);
  const flame = place(new Mesh(new ConeGeometry(0.2, 0.9, 16), flameGlow), 0, -1.3, 0);
  flame.rotation.x = Math.PI;

  // The lights that shape it: accent-coloured rims that travel with it.
  const rimLeft = new PointLight(palette.accent, 9, 0, 2);
  rimLeft.position.set(-2.4, 1.8, -1.2);
  const rimRight = new PointLight(palette.accent, 7, 0, 2);
  rimRight.position.set(2.4, 1.6, -1.6);
  const fill = new PointLight(palette.accentDeep, 6, 0, 2);
  fill.position.set(2.6, -1.4, 1.2);
  head.add(rimLeft, rimRight, fill);

  const root = new Group();
  root.rotation.order = "YXZ";
  head.scale.setScalar(SCALE);
  root.add(head);
  scene.add(root);
  scene.add(new HemisphereLight(palette.accentAmbient, new Color("#0a0f1e"), 1.3));
  const key = new DirectionalLight("#ffffff", 2.6);
  key.position.set(0.5, 1, 0.9);
  scene.add(key);

  // --- A short trail of light behind it ---
  const [dot, dotCtx] = makeCanvas(64, 64);
  const gradient = dotCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  dotCtx.fillStyle = gradient;
  dotCtx.fillRect(0, 0, 64, 64);
  const trailPositions = new Float32Array(TRAIL_POINTS * 3);
  const trailColors = new Float32Array(TRAIL_POINTS * 3);
  const trailGeometry = new BufferGeometry();
  trailGeometry.setAttribute("position", new BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute("color", new BufferAttribute(trailColors, 3));
  const trail = new Points(
    trailGeometry,
    new PointsMaterial({ size: 0.34, map: canvasTexture(dot), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true })
  );
  trail.frustumCulled = false;
  scene.add(trail);

  const forward = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const anchor = new Vector3();
  const offset = new Vector3();
  const previous = new Vector3();
  const WORLD_UP = new Vector3(0, 1, 0);
  let started = false;
  let lastX = 0;
  let yaw = 0;
  let talk = 0;
  let point = 0;
  let trailClock = 0;
  let clock = 0;
  const mood = { name: "", startedAt: 0 };
  let aside = 0;

  return {
    position: root.position,
    radius: GUIDE_RADIUS,
    get asleep() {
      return mood.name === "sleep";
    },

    /** Plays a short reaction (see the moods in director.js). */
    act(name) {
      mood.name = name;
      mood.startedAt = clock;
    },

    /**
     * `focus` is 0 while cruising and 1 at a stop. `side` is the side the
     * building in view (or the next one) is on: the robot leads toward it while
     * cruising, and keeps to the other side of the screen at a stop. `speed` is how
     * fast the camera travels along the route in metres per second (negative
     * when the visitor scrolls back). `detail` is 1 while a detail panel is open.
     */
    update({ time, dt, camera, focus, side, speed, speaking, detail = 0 }) {
      clock = time;
      camera.getWorldDirection(forward);
      right.crossVectors(forward, WORLD_UP).normalize();
      up.crossVectors(right, forward);
      const halfHeight = (distance) => Math.tan((camera.fov * Math.PI) / 360) * distance;
      const wide = camera.aspect >= 1;

      // The current mood, and how far through it the robot is (0 to 1).
      const duration = DURATIONS[mood.name];
      const elapsed = time - mood.startedAt;
      const m = duration ? elapsed / duration : 0;
      const active = Boolean(mood.name) && (!duration || m < 1);
      const now = active ? mood.name : "";
      aside += ((detail > 0.5 || now === "aside" ? 1 : 0) - aside) * (1 - Math.exp(-dt * 4));
      const sleeping = now === "sleep";

      // Where it wants to be: ahead on the next stop's side, or beside the building at
      // a stop, on the far side from it (on an upright phone, just above the card).
      const distance = lerp(CRUISE_DISTANCE, STOP_DISTANCE, focus);
      const height = halfHeight(distance);
      const across = (lerp(side * 0.42, -side * (wide ? 0.46 : 0.3), focus) - side * 0.12 * aside) * height * camera.aspect;
      let lift = lerp(-0.28, wide ? 0.02 : -0.3, focus) * height + Math.sin(time * 1.7) * 0.12;
      if (sleeping) lift -= 0.35 + Math.sin(time * 0.8) * 0.06;
      if (now === "wake") lift += pulse(m) * 0.4;
      if (now === "celebrate") lift += Math.abs(Math.sin(m * Math.PI * 3)) * 0.45;
      anchor.copy(camera.position).addScaledVector(forward, distance).addScaledVector(right, across).addScaledVector(up, lift);

      if (!started) {
        root.position.copy(anchor);
        previous.copy(anchor);
        lastX = anchor.x;
        started = true;
      }
      root.position.lerp(anchor, 1 - Math.exp(-dt * 5));
      // Never let it fall behind the camera or drift too far ahead.
      const depth = offset.copy(root.position).sub(camera.position).dot(forward);
      if (depth < NEAREST) root.position.addScaledVector(forward, NEAREST - depth);
      else if (depth > FURTHEST) root.position.addScaledVector(forward, FURTHEST - depth);
      // A flinch jolts it back, away from the visitor's finger.
      if (now === "flinch") root.position.addScaledVector(forward, pulse(m * 1.4) * 0.35);

      // Which way it faces: toward the visitor, turning away to lead while they scroll forward.
      offset.copy(camera.position).sub(root.position);
      const towardCamera = Math.atan2(offset.x, offset.z);
      const leading = clamp(speed / 7, 0, 1) * (1 - focus) * (sleeping ? 0 : 1);
      const glance = focus * side * (0.25 + 0.3 * (0.5 + 0.5 * Math.sin(time * 0.9)));
      let wanted = towardCamera + side * leading * (calm ? 1.3 : 2.5) + glance;
      if (now === "look-back") wanted += pulse(m) * Math.PI * 0.9;
      yaw += shortestTurn(wanted - yaw) * (1 - Math.exp(-dt * 6));
      let spin = 0;
      if (now === "dizzy") spin = calm ? Math.sin(m * Math.PI * 4) * 0.35 * (1 - m) : m * Math.PI * 4;
      if (now === "celebrate") spin = calm ? 0 : m * Math.PI * 2;
      // It banks a little into sideways movement.
      const drift = clamp((root.position.x - lastX) / Math.max(dt, 0.001), -6, 6);
      lastX = root.position.x;
      let roll = calm ? 0 : -drift * 0.05 + Math.sin(time * 9) * 0.14 * Math.max(0, 1 - time / 1.4);
      if (now === "dizzy") roll += Math.sin(time * 14) * 0.12 * (1 - m);
      if (now === "flinch") roll += Math.sin(m * 30) * 0.18 * (1 - m);
      if (sleeping) roll += 0.22;
      root.rotation.set(-0.08 + leading * 0.3, yaw + spin, roll);
      head.rotation.x = now === "nod" ? Math.sin(m * Math.PI * 4) * 0.28 : sleeping ? 0.25 : 0;

      // Face: blinking eyes (squinting, closed or wide with the mood), a mouth that
      // moves while it speaks, and a pulsing antenna.
      const blinking = time % BLINK_EVERY < BLINK_LENGTH;
      let eyeHeight = blinking ? 0.15 : 1;
      if (now === "flinch") eyeHeight = 0.3;
      if (sleeping) eyeHeight = 0.08;
      if (now === "wake") eyeHeight = 1.3;
      for (const [index, eye] of eyes.entries()) {
        eye.scale.y = eyeHeight;
        // Dizzy eyes roll round in circles.
        eye.position.x = (index === 0 ? -0.27 : 0.27) + (now === "dizzy" ? Math.cos(time * 12 + index * Math.PI) * 0.05 : 0);
        eye.position.y = 0.1 + (now === "dizzy" ? Math.sin(time * 12 + index * Math.PI) * 0.05 : 0);
      }
      talk += ((speaking && !sleeping ? 1 : 0) - talk) * 0.12;
      const open = talk * Math.abs(Math.sin(time * 16));
      mouth.scale.set(1 - open * 0.35, 1 + open * 2.2, 1);
      tip.scale.setScalar(1 + (0.5 + 0.5 * Math.sin(time * (3 + talk * 6))) * 0.25);

      // Hands bob at its sides; at a stop, the one nearer the building points at it.
      point += (focus - point) * (1 - Math.exp(-dt * 4));
      for (const hand of hands) {
        const { sign } = hand.userData;
        let pointing = sign === side ? point : 0;
        if (now === "point" || now === "present") pointing = Math.max(pointing, sign === side ? pulse(m) : 0);
        let x = lerp(sign * 1.15, sign * 1.5, pointing);
        let y = lerp(-0.6, 0.18, pointing) + Math.sin(time * 2.1 + sign) * 0.06;
        let z = lerp(0.2, -0.45, pointing);
        let tilt = -sign * lerp(0.2, 1.2, pointing);
        if ((now === "wave" && sign === -side) || now === "celebrate") {
          // A hand raised and waving.
          const raise = pulse(m * 1.2);
          x = lerp(x, sign * 1.35, raise);
          y = lerp(y, 0.9 + Math.sin(time * 14) * 0.18, raise);
          z = lerp(z, 0.25, raise);
          tilt = lerp(tilt, -sign * 0.6 + Math.sin(time * 14) * 0.4, raise);
        }
        if (sleeping) y -= 0.25;
        hand.position.set(x, y, z);
        hand.rotation.z = tilt;
      }
      flame.scale.set(1, (sleeping ? 0.4 : 0.7) + leading * 1.1 + Math.sin(time * 30) * 0.08, 1);

      // The trail: a new point every few hundredths of a second, each older one dimmer.
      trailClock += dt;
      if (trailClock > 0.035) {
        trailClock = 0;
        trailPositions.copyWithin(3, 0, (TRAIL_POINTS - 1) * 3);
        trailPositions.set([root.position.x, root.position.y - 0.45, root.position.z], 0);
        const moved = clamp(root.position.distanceTo(previous) * 4, 0, 1);
        trailColors.copyWithin(3, 0, (TRAIL_POINTS - 1) * 3);
        trailColors.set([palette.accent.r * moved, palette.accent.g * moved, palette.accent.b * moved], 0);
        for (let index = 3; index < TRAIL_POINTS * 3; index += 1) trailColors[index] *= 0.86;
        trailGeometry.attributes.position.needsUpdate = true;
        trailGeometry.attributes.color.needsUpdate = true;
        previous.copy(root.position);
      }
    },
  };
}
