// The route the camera follows through the city, drawn like a turtle: it
// moves forward in straight lines and turns along circular arcs, so every join
// is smooth. Pure maths with no three.js: the server plans the tour with it and
// the tests check it.
//
// Coordinates are metres on the ground: +x is to the right and -z is ahead at
// the start of the tour. A heading is a unit vector (hx, hz).

/** Turns a heading (or any vector) to the left by `angle` radians, seen from above. */
export function rotateLeft(x, z, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, -x * s + z * c];
}

/** A finished route: its length, its named points, and the position and heading at any distance along it. */
function finishRoute(start, pieces, marks, length) {
  const at = (distance, out = {}) => {
    const s = Math.min(length, Math.max(0, Number(distance) || 0));
    if (pieces.length === 0) {
      out.x = start.x;
      out.z = start.z;
      out.hx = start.hx;
      out.hz = start.hz;
      return out;
    }
    // The last piece that starts at or before `s`.
    let low = 0;
    let high = pieces.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (pieces[middle].start <= s) low = middle;
      else high = middle - 1;
    }
    const piece = pieces[low];
    const along = Math.min(piece.length, s - piece.start);
    if (piece.kind === "line") {
      out.x = piece.x + piece.hx * along;
      out.z = piece.z + piece.hz * along;
      out.hx = piece.hx;
      out.hz = piece.hz;
    } else {
      const angle = piece.angle * (along / piece.length);
      const [ox, oz] = rotateLeft(piece.x - piece.cx, piece.z - piece.cz, angle);
      out.x = piece.cx + ox;
      out.z = piece.cz + oz;
      [out.hx, out.hz] = rotateLeft(piece.hx, piece.hz, angle);
    }
    return out;
  };

  return { length, marks, pieces, at };
}

/**
 * Starts a route at (x, z) heading along (hx, hz). Chain `forward`, `turn` and
 * `mark`, then call `build()`.
 */
export function createRoute(x, z, hx, hz) {
  const size = Math.hypot(hx, hz) || 1;
  const start = { x, z, hx: hx / size, hz: hz / size };
  const pieces = [];
  const marks = {};
  let px = x;
  let pz = z;
  let dx = start.hx;
  let dz = start.hz;
  let length = 0;

  const route = {
    /** A straight piece `distance` metres long. */
    forward(distance) {
      if (!(distance > 0)) return route;
      pieces.push({ kind: "line", start: length, length: distance, x: px, z: pz, hx: dx, hz: dz });
      px += dx * distance;
      pz += dz * distance;
      length += distance;
      return route;
    },
    /** An arc of `radius` metres turning by `angle` radians: positive turns left, negative right. */
    turn(radius, angle) {
      if (!angle || !(radius > 0)) return route;
      const side = Math.sign(angle);
      // The centre lies to the left of the heading for a left turn, to the right for a right one.
      const cx = px + side * radius * dz;
      const cz = pz - side * radius * dx;
      const arcLength = radius * Math.abs(angle);
      pieces.push({ kind: "arc", start: length, length: arcLength, x: px, z: pz, hx: dx, hz: dz, cx, cz, angle });
      const [ox, oz] = rotateLeft(px - cx, pz - cz, angle);
      px = cx + ox;
      pz = cz + oz;
      [dx, dz] = rotateLeft(dx, dz, angle);
      length += arcLength;
      return route;
    },
    /** Names the current distance along the route, to find it again later (a stop, a turn). */
    mark(name) {
      marks[name] = length;
      return route;
    },
    /** Moves straight on until the route reaches `targetZ` (it must be heading along z). */
    forwardToZ(targetZ) {
      return Math.abs(dz) > 0.5 ? route.forward((targetZ - pz) / dz) : route;
    },
    /** Moves straight on until the route reaches `targetX` (it must be heading along x). */
    forwardToX(targetX) {
      return Math.abs(dx) > 0.5 ? route.forward((targetX - px) / dx) : route;
    },
    get x() {
      return px;
    },
    get z() {
      return pz;
    },
    get length() {
      return length;
    },
    build() {
      return finishRoute(start, pieces.slice(), { ...marks }, length);
    },
  };
  return route;
}

/** The angle of the two short turns that lead onto and off a roundabout (see `driveBalloon`). */
export function balloonAngle(loopRadius, neckRadius) {
  return Math.acos(neckRadius / (neckRadius + loopRadius));
}

/** How far ahead of the point where a balloon starts its roundabout's centre lies. */
export function balloonReach(loopRadius, neckRadius) {
  return (neckRadius + loopRadius) * Math.sin(balloonAngle(loopRadius, neckRadius));
}

/**
 * Drives round a roundabout at the end of a dead-end street and back out the
 * same way, like a balloon on a string: a short turn one way onto the circle,
 * nearly a full loop the other way around its centre, and a short turn back
 * onto the street, now heading back. The roundabout's centre is
 * `balloonReach(loopRadius, neckRadius)` metres ahead of where it starts.
 * `hand` 1 loops to the left (anticlockwise seen from above), -1 to the right.
 * `farMark` names the point of the loop furthest from the street. `sideMark`
 * names the point a quarter turn before it, beside the roundabout's centre.
 */
export function driveBalloon(route, { loopRadius, neckRadius, hand = 1, farMark, sideMark }) {
  const alpha = balloonAngle(loopRadius, neckRadius);
  const loop = Math.PI + 2 * alpha;
  route.turn(neckRadius, -hand * alpha);
  route.turn(loopRadius, hand * (loop / 2 - Math.PI / 2));
  if (sideMark) route.mark(sideMark);
  route.turn(loopRadius, (hand * Math.PI) / 2);
  if (farMark) route.mark(farMark);
  route.turn(loopRadius, (hand * loop) / 2);
  route.turn(neckRadius, -hand * alpha);
  return route;
}
