import { describe, expect, it } from "vitest";

import { balloonReach, createRoute, driveBalloon, rotateLeft } from "./path";

const close = (a, b, digits = 6) => expect(a).toBeCloseTo(b, digits);

describe("rotateLeft", () => {
  it("turns north (-z) to west (-x) and back", () => {
    const [x, z] = rotateLeft(0, -1, Math.PI / 2);
    close(x, -1);
    close(z, 0);
    const [bx, bz] = rotateLeft(x, z, -Math.PI / 2);
    close(bx, 0);
    close(bz, -1);
  });
});

describe("createRoute", () => {
  it("measures straight pieces and arcs, and finds points along them", () => {
    const route = createRoute(0, 0, 0, -1).forward(10).mark("corner").turn(5, Math.PI / 2).forward(20).build();
    close(route.length, 10 + 5 * (Math.PI / 2) + 20);
    close(route.marks.corner, 10);

    const corner = route.at(10);
    close(corner.x, 0);
    close(corner.z, -10);

    // A left turn from north ends heading west, 5 m to the left and 5 m further on.
    const end = route.at(route.length);
    close(end.x, -5 - 20);
    close(end.z, -15);
    close(end.hx, -1);
    close(end.hz, 0);
  });

  it("is continuous: nearby distances give nearby points", () => {
    const route = createRoute(3, 4, 1, 0).forward(7).turn(6, -1.2).forward(2).turn(9, 2.5).build();
    let previous = route.at(0);
    for (let s = 0.05; s <= route.length; s += 0.05) {
      const point = route.at(s);
      expect(Math.hypot(point.x - previous.x, point.z - previous.z)).toBeLessThan(0.051);
      expect(Math.hypot(point.hx, point.hz)).toBeCloseTo(1, 9);
      previous = point;
    }
  });

  it("clamps distances outside the route and copes with an empty route", () => {
    const route = createRoute(1, 2, 0, -1).forward(5).build();
    close(route.at(-3).z, 2);
    close(route.at(99).z, -3);
    const empty = createRoute(1, 2, 0, -1).build();
    expect(empty.length).toBe(0);
    expect(empty.at(4)).toEqual({ x: 1, z: 2, hx: 0, hz: -1 });
  });

  it("moves straight on to a given z or x", () => {
    const route = createRoute(0, 10, 0, -1).forwardToZ(-30).turn(4, Math.PI / 2).forwardToX(-50);
    close(route.z, -34);
    close(route.x, -50);
  });
});

describe("driveBalloon", () => {
  for (const hand of [1, -1]) {
    it(`comes back to where it started, heading the other way (hand ${hand})`, () => {
      const built = driveBalloon(createRoute(0, 0, 1, 0), { loopRadius: 11, neckRadius: 6, hand, farMark: "far" }).build();
      const end = built.at(built.length);
      close(end.x, 0, 5);
      close(end.z, 0, 5);
      close(end.hx, -1, 6);
      close(end.hz, 0, 6);

      // The loop circles a centre straight ahead, at the loop radius.
      const centreX = balloonReach(11, 6);
      const far = built.at(built.marks.far);
      close(Math.hypot(far.x - centreX, far.z), 11, 5);
      // Its far point lies beyond the centre, on the street's line.
      close(far.x, centreX + 11, 5);
      close(far.z, 0, 5);
    });
  }
});
