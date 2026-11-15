// Maps a flat HTML element onto any four-cornered shape on screen, so a panel
// can appear to unfold out of a screen in the 3D city and fold back into it.
// Pure maths: no DOM.
//
// A quad is four [x, y] points in pixels: top left, top right, bottom right,
// bottom left.

/** The corners of a rectangle as a quad. */
export function rectQuad(left, top, width, height) {
  return [
    [left, top],
    [left + width, top],
    [left + width, top + height],
    [left, top + height],
  ];
}

/** A quad part of the way (`t`, 0 to 1) from quad `a` to quad `b`. */
export function lerpQuad(a, b, t) {
  return a.map(([x, y], index) => [x + (b[index][0] - x) * t, y + (b[index][1] - y) * t]);
}

/**
 * The projective transform taking the unit square onto `quad`, as the
 * coefficients of x' = (a·u + b·v + c) / (g·u + h·v + 1) and
 * y' = (d·u + e·v + f) / (g·u + h·v + 1).
 */
export function squareToQuad(quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return { a: x1 - x0, b: x3 - x0, c: x0, d: y1 - y0, e: y3 - y0, f: y0, g: 0, h: 0 };
  }
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return { a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0, d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0, g, h };
}

/** Where the point (u, v) of the unit square lands under `transform` (from squareToQuad). */
export function mapPoint({ a, b, c, d, e, f, g, h }, u, v) {
  const w = g * u + h * v + 1;
  return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
}

/**
 * A CSS transform that draws an element `width` by `height` pixels, placed at
 * the top left of the viewport with `transform-origin: 0 0`, onto `quad`.
 */
export function quadTransform(width, height, quad) {
  const { a, b, c, d, e, f, g, h } = squareToQuad(quad);
  const w = Math.max(width, 1);
  const hh = Math.max(height, 1);
  const values = [a / w, d / w, 0, g / w, b / hh, e / hh, 0, h / hh, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${values.map((value) => (Number.isFinite(value) ? Number(value.toPrecision(12)) : 0)).join(",")})`;
}
