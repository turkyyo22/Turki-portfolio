import { describe, expect, it } from "vitest";

import { assessDevice } from "./device";

describe("assessDevice", () => {
  it("turns the visitor away only when 3D is not supported", () => {
    expect(assessDevice({ webgl: false, cores: 16, memory: 8 })).toEqual({ verdict: "unsupported", quality: "low" });
    expect(assessDevice()).toEqual({ verdict: "unsupported", quality: "low" });
  });

  it("starts phones and tablets straight away, at Low quality", () => {
    expect(assessDevice({ webgl: true, touchOnly: true, cores: 6 })).toEqual({ verdict: "go", quality: "low" });
    expect(assessDevice({ webgl: true, touchOnly: true, cores: 8, memory: 8 })).toEqual({ verdict: "go", quality: "low" });
  });

  it("starts modest computers at Low and capable ones at High", () => {
    expect(assessDevice({ webgl: true, cores: 4, memory: 8 })).toEqual({ verdict: "go", quality: "low" });
    expect(assessDevice({ webgl: true, cores: 8, memory: 4 })).toEqual({ verdict: "go", quality: "low" });
    expect(assessDevice({ webgl: true, cores: 12, memory: 8 })).toEqual({ verdict: "go", quality: "high" });
    // Browsers that don't report memory or cores (0) aren't treated as weak.
    expect(assessDevice({ webgl: true })).toEqual({ verdict: "go", quality: "high" });
  });
});
