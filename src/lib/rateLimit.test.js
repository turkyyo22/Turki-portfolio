import { describe, expect, it } from "vitest";

import { clientKey, createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit inside the window, then blocks with a retry time", () => {
    let time = 0;
    const check = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });

    expect(check("ip").ok).toBe(true);
    time = 100;
    expect(check("ip").ok).toBe(true);
    time = 200;
    expect(check("ip")).toEqual({ ok: false, retryAfterSeconds: 1 });

    time = 1001; // the first hit has left the window
    expect(check("ip").ok).toBe(true);
  });

  it("tracks each key separately", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(check("a").ok).toBe(true);
    expect(check("b").ok).toBe(true);
    expect(check("a").ok).toBe(false);
  });
});

describe("clientKey", () => {
  it("uses the first forwarded address", () => {
    const request = new Request("https://x.test", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } });
    expect(clientKey(request)).toBe("1.1.1.1");
  });

  it("falls back when no proxy header is present", () => {
    expect(clientKey(new Request("https://x.test"))).toBe("unknown");
  });
});
