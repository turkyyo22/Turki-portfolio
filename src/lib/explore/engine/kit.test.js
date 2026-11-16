import { describe, expect, it } from "vitest";

import { SHOP_HEIGHT, shopsOf } from "./kit";

describe("shopsOf", () => {
  it("splits a front into shops side by side, none wider than the material draws them", () => {
    for (const width of [3, 9.4, 14, 22.5]) {
      const shops = shopsOf(17, width);
      expect(shops.length).toBe(Math.max(1, Math.floor(width / 3.6)));
      const each = width / shops.length;
      shops.forEach((shop, index) => {
        expect(shop.width).toBeCloseTo(each, 9);
        expect(shop.x).toBeCloseTo(-width / 2 + (index + 0.5) * each, 9);
        expect([0, 1, 2, 3, 4]).toContain(shop.neon);
        expect(typeof shop.shut).toBe("boolean");
      });
    }
  });

  it("depends only on the whole part of the seed, as the material's own sums do", () => {
    expect(shopsOf(42.1, 18)).toEqual(shopsOf(42.9, 18));
    expect(shopsOf(42.5, 18)).not.toEqual(shopsOf(43.5, 18));
  });

  it("leaves most shops open, and gives a street more than one colour of sign", () => {
    const shops = Array.from({ length: 40 }, (_, seed) => shopsOf(seed, 36)).flat();
    const shut = shops.filter((shop) => shop.shut).length;
    expect(shut).toBeGreaterThan(0);
    expect(shut / shops.length).toBeLessThan(0.4);
    expect(new Set(shops.map((shop) => shop.neon)).size).toBe(5);
    expect(SHOP_HEIGHT).toBeGreaterThan(3);
  });
});
