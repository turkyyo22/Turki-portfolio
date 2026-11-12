// The shooting stars that cross the page background now and then
// (ShootingStars.jsx runs them, and globals.css styles them as .shooting-star).
// Planning is kept in pure functions here, so the numbers are easy to test.

/** How long to wait (ms) before the first star, and between stars after that. */
export const FIRST_STAR_MS = [2500, 5000];
export const BETWEEN_STARS_MS = [7000, 16000];

const between = (random, [min, max]) => min + random() * (max - min);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** A random wait in milliseconds, within `range` ([min, max]). */
export function nextDelay(range, random = Math.random) {
  return Math.round(between(random, range));
}

/**
 * Plans one star for a screen of `width` × `height` px: it starts somewhere in the
 * upper half and slants down 15° to 35°, to the left or right, ending before the
 * side of the screen when the screen is wide enough. Sizes and speed scale with
 * the screen, within limits.
 *
 * Returns where its head starts (`x`, `y`), the streak's `length`, how far it flies
 * (`distance`), its direction as a CSS angle (`angle`: 0 points right, 90 down)
 * and how long the flight takes (`duration`, ms).
 */
export function planShootingStar({ width, height }, random = Math.random) {
  const length = Math.round(clamp(between(random, [0.1, 0.16]) * width, 70, 220));
  const distance = Math.round(clamp(between(random, [0.35, 0.55]) * width, 200, 700));
  const slant = between(random, [15, 35]);
  const toRight = random() < 0.5;

  // Start far enough from the side it flies toward to end on screen.
  const across = distance * Math.cos((slant * Math.PI) / 180);
  const margin = width * 0.05;
  const xRange = toRight
    ? [margin, Math.max(margin, width - margin - across)]
    : [Math.min(width - margin, margin + across), width - margin];

  const speed = between(random, [450, 650]); // px per second
  return {
    x: Math.round(between(random, xRange)),
    y: Math.round(between(random, [height * 0.05, height * 0.55])),
    length,
    distance,
    angle: Math.round(toRight ? slant : 180 - slant),
    duration: Math.round(clamp((distance / speed) * 1000, 700, 1600)),
  };
}

/**
 * Draws one planned star in `layer` (an element covering the screen) and removes
 * it once it has flown. The streak is drawn pointing right and is turned around
 * its head, which is its right end, so `translateX` moves it along its direction.
 */
export function launchShootingStar(layer, plan) {
  const star = layer.ownerDocument.createElement("span");
  star.className = "shooting-star";
  star.style.width = `${plan.length}px`;
  star.style.left = `${plan.x - plan.length}px`;
  star.style.top = `${plan.y}px`;
  layer.append(star);

  const along = (px) => `rotate(${plan.angle}deg) translateX(${px}px)`;
  const flight = star.animate(
    [
      { transform: along(0), opacity: 0 },
      { opacity: 1, offset: 0.15 },
      { opacity: 1, offset: 0.65 },
      { transform: along(plan.distance), opacity: 0 },
    ],
    { duration: plan.duration, easing: "cubic-bezier(0.35, 0, 0.65, 1)" },
  );
  const remove = () => star.remove();
  flight.addEventListener("finish", remove);
  flight.addEventListener("cancel", remove);
  return star;
}
