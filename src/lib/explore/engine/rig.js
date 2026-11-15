import { Vector3 } from "three";

import { grandnessAt } from "@/lib/explore/city";
import { routeDistance } from "@/lib/explore/plan";

import { clamp, lerp, smoothstep } from "./random";

// How far ahead along the route the camera looks while travelling, in metres.
const LOOK_AHEAD = 32;
// How far the visitor can turn the view by dragging: sideways, up and down (radians).
const LOOK_YAW = 1.2;
const LOOK_UP = 0.65;
const LOOK_DOWN = 0.2;
// How far round a building the camera can swing at a stop, either way (radians).
const ORBIT = 0.95;
// How quickly a turned view eases back once the visitor scrolls on.
const RECENTRE_RATE = 1.6;

/**
 * The camera: it rides the route as the page scrolls, slows and frames each
 * building at its stop, and rises over the plaza at the end. The visitor can
 * also drag to look around while travelling, or to swing round a building at a
 * stop, within limits, and it eases back once they scroll on. A "detail" mode
 * flies close to a building's screen when its details are open.
 *
 * `stops`: in route order, each { s (distance along the route), view (Vector3,
 * where the camera pauses), front (Vector3, the point on the building to frame),
 * lateral (metres to the right of the route), eye (camera height), area: the
 * [from, to] stretch of route over which the building stays in view, screen:
 * { centre: Vector3, normal: Vector3, width } }.
 */
export function createRig({ camera, path, stops, finalePoint }) {
  const stopDistances = stops.map((stop) => stop.s);
  const count = stops.length;
  const here = { x: 0, z: 0, hx: 0, hz: -1 };
  const ahead = { x: 0, z: 0, hx: 0, hz: -1 };
  const look = new Vector3();
  const target = new Vector3();
  const position = new Vector3();
  const orbitOffset = new Vector3();
  const detailPosition = new Vector3();
  const detailLook = new Vector3();

  const state = {
    s: 0,
    focus: 0,
    finale: 0,
    stopIndex: -1,
    // Turned by dragging (radians), and how strongly the turn applies (eases back to 0).
    yaw: 0,
    pitch: 0,
    held: false,
    // 0 to 1: how far into "detail" mode the camera is, and for which stop.
    detail: 0,
    detailStop: -1,
    detailTarget: 0,
  };

  return {
    state,
    stopDistances,

    /** Turns the view by a drag: `dx` and `dy` in fractions of the screen. */
    drag(dx, dy) {
      state.yaw = clamp(state.yaw - dx * 2.4, -LOOK_YAW, LOOK_YAW);
      state.pitch = clamp(state.pitch + dy * 1.6, -LOOK_DOWN, LOOK_UP);
    },
    hold(held) {
      state.held = held;
    },
    /** Eases the view back to where the tour points it. */
    recentre() {
      state.held = false;
      state.recentring = true;
    },
    /** Flies close to stop `index`'s screen (or back, with -1). */
    setDetail(index) {
      if (index >= 0) state.detailStop = index;
      state.detailTarget = index >= 0 ? 1 : 0;
    },
    get turned() {
      return Math.abs(state.yaw) > 0.02 || Math.abs(state.pitch) > 0.02;
    },

    /**
     * Moves the camera for tour position `position` (in legs, see plan.js).
     * `moving` is true while the visitor scrolls, which eases a turned view back.
     */
    update(dt, tourPosition, { moving, pointerX = 0, pointerY = 0 }) {
      const s = routeDistance(tourPosition, stopDistances, path.length);
      state.s = s;
      path.at(s, here);
      const nearest = Math.round(tourPosition) - 1;
      const stop = stops[nearest];
      const focus = stop ? 1 - smoothstep(0.14, 0.46, Math.abs(tourPosition - (nearest + 1))) : 0;
      state.focus = focus;
      state.stopIndex = stop ? nearest : -1;
      const finale = smoothstep(count + 0.35, count + 0.95, tourPosition);
      state.finale = finale;

      // Height rises as the city grows grander, and over the plaza at the end.
      const grandness = grandnessAt(here.z);
      let eye = 4.4 + 3.6 * grandness;
      if (stop) eye = lerp(eye, stop.eye, focus);
      eye = lerp(eye, 9.5, finale);

      // Sideways: a gentle sway, and the stop's offset across the street.
      const rightX = -here.hz;
      const rightZ = here.hx;
      const lateral = Math.sin(s * 0.021) * 0.8 * (1 - focus) + (stop ? stop.lateral * focus : 0);
      position.set(here.x + rightX * (lateral + pointerX * 0.5), eye - pointerY * 0.3, here.z + rightZ * (lateral + pointerX * 0.5));

      // Look ahead along the route, toward the stop's building, or across the plaza.
      path.at(s + LOOK_AHEAD, ahead);
      look.set(ahead.x, eye * 0.82 + 2 * grandness, ahead.z);
      for (const other of stops) {
        // While driving round a square, keep its building in view.
        if (other.area && s > other.area[0] && s < other.area[1]) {
          const weight = smoothstep(other.area[0], other.area[0] + 8, s) * (1 - smoothstep(other.area[1] - 14, other.area[1], s)) * 0.65;
          look.lerp(other.front, weight);
        }
      }
      if (stop) {
        // Wide screens keep the building to one side, away from its card; tall screens
        // centre it, a little lower, above the card at the bottom.
        target.copy(stop.front);
        if (camera.aspect >= 1.15) {
          const dx = stop.front.x - position.x;
          const dz = stop.front.z - position.z;
          const distance = Math.hypot(dx, dz) || 1;
          // The screen's right, seen from the camera; aim to the building's left to put it on the right.
          const shift = distance * 0.3 * stop.cardSide;
          target.x -= (-dz / distance) * shift;
          target.z -= (dx / distance) * shift;
        } else {
          target.y -= 3;
        }
        look.lerp(target, focus);
      }
      look.lerp(finalePoint, finale);

      // Dragging: at a stop it swings the camera round the building, elsewhere it turns the view.
      const easeBack = state.recentring || (moving && !state.held);
      if (easeBack) {
        const rate = 1 - Math.exp(-dt * RECENTRE_RATE * (state.recentring ? 2.2 : 1));
        state.yaw += (0 - state.yaw) * rate;
        state.pitch += (0 - state.pitch) * rate;
        if (Math.abs(state.yaw) < 0.002 && Math.abs(state.pitch) < 0.002) {
          state.yaw = 0;
          state.pitch = 0;
          state.recentring = false;
        }
      }
      const orbitWeight = focus;
      if (state.yaw !== 0 || state.pitch !== 0) {
        // Swing round the look point (at a stop) …
        const yawOrbit = clamp(state.yaw, -ORBIT, ORBIT) * orbitWeight;
        orbitOffset.copy(position).sub(look);
        const cos = Math.cos(yawOrbit);
        const sin = Math.sin(yawOrbit);
        const ox = orbitOffset.x * cos + orbitOffset.z * sin;
        const oz = -orbitOffset.x * sin + orbitOffset.z * cos;
        orbitOffset.x = ox;
        orbitOffset.z = oz;
        orbitOffset.y += state.pitch * 14 * orbitWeight;
        position.copy(look).add(orbitOffset);
        position.y = Math.max(1.6, position.y);
        // … or turn the view where the camera stands (while travelling).
        const turn = state.yaw * (1 - orbitWeight);
        const tilt = state.pitch * (1 - orbitWeight);
        target.copy(look).sub(position);
        const distance = Math.hypot(target.x, target.z);
        const heading = Math.atan2(target.x, target.z) + turn;
        const rise = Math.atan2(target.y, distance) + tilt;
        look.set(position.x + Math.sin(heading) * distance, position.y + Math.tan(clamp(rise, -1.2, 1.2)) * distance, position.z + Math.cos(heading) * distance);
      }

      // Detail mode: fly in front of the building's screen.
      state.detail += (state.detailTarget - state.detail) * (1 - Math.exp(-dt * 3.2));
      if (Math.abs(state.detail - state.detailTarget) < 0.001) state.detail = state.detailTarget;
      const detailStop = stops[state.detailStop];
      if (state.detail > 0 && detailStop?.screen) {
        const { centre, normal, width } = detailStop.screen;
        const distance = width * 1.15 + 2;
        detailPosition.copy(centre).addScaledVector(normal, distance);
        detailPosition.y = Math.max(1.8, detailPosition.y);
        detailLook.copy(centre);
        const amount = state.detail * state.detail * (3 - 2 * state.detail);
        position.lerp(detailPosition, amount);
        look.lerp(detailLook, amount);
      }

      camera.position.copy(position);
      camera.lookAt(look);
      return state;
    },
  };
}
