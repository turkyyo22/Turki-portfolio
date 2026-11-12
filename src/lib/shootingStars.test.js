import { describe, expect, it, vi } from "vitest";

import { BETWEEN_STARS_MS, FIRST_STAR_MS, launchShootingStar, nextDelay, planShootingStar } from "@/lib/shootingStars";

/** A repeatable stand-in for Math.random, so a failing case can be replayed. */
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function expectWithin(value, min, max, label) {
  expect(value, label).toBeGreaterThanOrEqual(min);
  expect(value, label).toBeLessThanOrEqual(max);
}

const SCREENS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
];

describe("planShootingStar", () => {
  it.each(SCREENS)("keeps every star within its limits on a $width × $height screen", (screen) => {
    const random = seededRandom(screen.width);
    const directions = new Set();

    for (let i = 0; i < 500; i += 1) {
      const star = planShootingStar(screen, random);
      const label = `star ${i}: ${JSON.stringify(star)}`;

      expectWithin(star.length, 70, 220, label);
      expectWithin(star.distance, 200, 700, label);
      expectWithin(star.duration, 700, 1600, label);

      // Slanting down 15° to 35°, to the right (angle 15–35) or the left (145–165).
      const toRight = star.angle < 90;
      directions.add(toRight);
      if (toRight) expectWithin(star.angle, 15, 35, label);
      else expectWithin(star.angle, 145, 165, label);

      // It starts in the upper half of the screen and ends before the side.
      expectWithin(star.y, screen.height * 0.05 - 1, screen.height * 0.55 + 1, label);
      expectWithin(star.x, 0, screen.width, label);
      const endX = star.x + star.distance * Math.cos((star.angle * Math.PI) / 180);
      expectWithin(endX, -1, screen.width + 1, label);
    }

    expect(directions, "stars should fly both ways").toEqual(new Set([true, false]));
  });
});

describe("nextDelay", () => {
  it.each([
    ["the first star", FIRST_STAR_MS],
    ["the stars after it", BETWEEN_STARS_MS],
  ])("picks a wait within the range for %s", (_, range) => {
    expect(nextDelay(range, () => 0)).toBe(range[0]);
    expect(nextDelay(range, () => 0.999999)).toBe(range[1]);

    const random = seededRandom(7);
    for (let i = 0; i < 200; i += 1) expectWithin(nextDelay(range, random), range[0], range[1]);
  });
});

/** Just enough DOM for launchShootingStar: a layer that collects stars, and Element.animate. */
function fakeLayer() {
  const stars = [];
  let flight;
  const document = {
    createElement: () => {
      const star = {
        className: "",
        style: {},
        remove: vi.fn(() => stars.splice(stars.indexOf(star), 1)),
        animate: vi.fn((keyframes, options) => {
          const listeners = {};
          flight = { keyframes, options, listeners, addEventListener: (type, listener) => (listeners[type] = listener) };
          return flight;
        }),
      };
      return star;
    },
  };
  return { layer: { ownerDocument: document, append: (star) => stars.push(star) }, stars, flight: () => flight };
}

describe("launchShootingStar", () => {
  const plan = { x: 600, y: 120, length: 150, distance: 400, angle: 25, duration: 900 };

  it("places the streak so its head starts at the planned point, and flies it along its direction", () => {
    const { layer, stars, flight } = fakeLayer();
    launchShootingStar(layer, plan);

    expect(stars).toHaveLength(1);
    expect(stars[0].className).toBe("shooting-star");
    expect(stars[0].style).toEqual({ width: "150px", left: "450px", top: "120px" });

    const { keyframes, options } = flight();
    expect(keyframes[0]).toEqual({ transform: "rotate(25deg) translateX(0px)", opacity: 0 });
    expect(keyframes.at(-1)).toEqual({ transform: "rotate(25deg) translateX(400px)", opacity: 0 });
    expect(options.duration).toBe(900);
  });

  it.each(["finish", "cancel"])("removes the star when its flight ends (%s)", (event) => {
    const { layer, stars, flight } = fakeLayer();
    launchShootingStar(layer, plan);

    flight().listeners[event]();
    expect(stars).toHaveLength(0);
  });
});
