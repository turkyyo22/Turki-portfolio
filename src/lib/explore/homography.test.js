import { describe, expect, it } from "vitest";

import { lerpQuad, mapPoint, quadTransform, rectQuad, squareToQuad } from "./homography";

const close = (a, b) => expect(a).toBeCloseTo(b, 6);

describe("squareToQuad", () => {
  it("takes the unit square's corners onto a rectangle", () => {
    const transform = squareToQuad(rectQuad(10, 20, 300, 200));
    expect(mapPoint(transform, 0, 0)).toEqual([10, 20]);
    expect(mapPoint(transform, 1, 1)).toEqual([310, 220]);
    expect(mapPoint(transform, 0.5, 0.5)).toEqual([160, 120]);
  });

  it("takes them onto a skewed screen seen in perspective", () => {
    const quad = [
      [100, 80],
      [420, 40],
      [430, 300],
      [90, 250],
    ];
    const transform = squareToQuad(quad);
    for (const [index, [u, v]] of [[0, 0], [1, 0], [1, 1], [0, 1]].entries()) {
      const [x, y] = mapPoint(transform, u, v);
      close(x, quad[index][0]);
      close(y, quad[index][1]);
    }
  });
});

describe("quadTransform", () => {
  it("is a plain translation when the quad is the element's own rectangle", () => {
    expect(quadTransform(200, 100, rectQuad(30, 40, 200, 100))).toBe("matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,30,40,0,1)");
  });

  it("puts the element's corners on the quad", () => {
    const quad = [
      [100, 80],
      [420, 40],
      [430, 300],
      [90, 250],
    ];
    const values = quadTransform(640, 400, quad).match(/-?[\d.e-]+/g).slice(1).map(Number);
    // Apply the column-major matrix to the element's corners.
    const apply = (x, y) => {
      const X = values[0] * x + values[4] * y + values[12];
      const Y = values[1] * x + values[5] * y + values[13];
      const W = values[3] * x + values[7] * y + values[15];
      return [X / W, Y / W];
    };
    for (const [index, [x, y]] of [[0, 0], [640, 0], [640, 400], [0, 400]].entries()) {
      const [px, py] = apply(x, y);
      expect(px).toBeCloseTo(quad[index][0], 3);
      expect(py).toBeCloseTo(quad[index][1], 3);
    }
  });
});

describe("lerpQuad", () => {
  it("moves every corner part of the way", () => {
    const from = rectQuad(0, 0, 10, 10);
    const to = rectQuad(100, 100, 20, 20);
    expect(lerpQuad(from, to, 0)).toEqual(from);
    expect(lerpQuad(from, to, 1)).toEqual(to);
    expect(lerpQuad(from, to, 0.5)[2]).toEqual([65, 65]);
  });
});
