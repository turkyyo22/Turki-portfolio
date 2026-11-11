import { describe, expect, it } from "vitest";

import { fitWithin } from "./imageCompression";

describe("fitWithin", () => {
  it("scales the longest side down to the limit and keeps the aspect ratio", () => {
    expect(fitWithin(2816, 1536, 1920)).toEqual({ width: 1920, height: 1047 });
    expect(fitWithin(1000, 3000, 1500)).toEqual({ width: 500, height: 1500 });
  });

  it("never scales small images up", () => {
    expect(fitWithin(637, 345, 1920)).toEqual({ width: 637, height: 345 });
  });
});
