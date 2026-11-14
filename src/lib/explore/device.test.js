import { describe, expect, it } from "vitest";

import { assessDevice } from "./device";

describe("assessDevice", () => {
  it("turns the visitor away only when 3D is not supported", () => {
    expect(assessDevice({ webgl: false, cores: 16, memory: 8 })).toEqual({ verdict: "unsupported", quality: "lite" });
    expect(assessDevice()).toEqual({ verdict: "unsupported", quality: "lite" });
  });

  it("asks on phones and offers the lite version", () => {
    expect(assessDevice({ webgl: true, touchOnly: true, shortSide: 390, cores: 6 })).toEqual({ verdict: "ask", quality: "lite" });
  });

  it("starts tablets and modest computers at medium quality", () => {
    expect(assessDevice({ webgl: true, touchOnly: true, shortSide: 820, cores: 8 })).toEqual({ verdict: "go", quality: "medium" });
    expect(assessDevice({ webgl: true, shortSide: 900, cores: 4, memory: 8 })).toEqual({ verdict: "go", quality: "medium" });
    expect(assessDevice({ webgl: true, shortSide: 900, cores: 8, memory: 4 })).toEqual({ verdict: "go", quality: "medium" });
  });

  it("starts capable computers at high quality", () => {
    expect(assessDevice({ webgl: true, shortSide: 1080, cores: 12, memory: 8 })).toEqual({ verdict: "go", quality: "high" });
    // Browsers that don't report memory or cores (0) aren't treated as weak.
    expect(assessDevice({ webgl: true, shortSide: 1080 })).toEqual({ verdict: "go", quality: "high" });
  });

  it("does not mistake a small desktop window for a phone", () => {
    expect(assessDevice({ webgl: true, touchOnly: false, shortSide: 500, cores: 8, memory: 8 })).toEqual({ verdict: "go", quality: "high" });
  });
});
