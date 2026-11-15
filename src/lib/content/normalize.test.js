import { describe, expect, it } from "vitest";

import {
  exploreIsEmpty,
  localizePost,
  normalizeExplore,
  normalizePost,
  normalizeProjectsMenu,
  normalizeTags,
  parseDataUrl,
  safeUrl,
} from "./normalize";

describe("safeUrl", () => {
  it("keeps http and https links", () => {
    expect(safeUrl("https://github.com/x")).toBe("https://github.com/x");
    expect(safeUrl(" http://example.com ")).toBe("http://example.com/");
  });

  it("rejects script and malformed links", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,hi")).toBe("");
    expect(safeUrl("not a url")).toBe("");
    expect(safeUrl(undefined)).toBe("");
  });
});

describe("normalizeTags", () => {
  it("accepts arrays or comma-separated text and removes duplicates", () => {
    expect(normalizeTags("Next.js, Firebase, next.js, ")).toEqual(["Next.js", "Firebase"]);
    expect(normalizeTags(["Flutter", " Dart "])).toEqual(["Flutter", "Dart"]);
    expect(normalizeTags(null)).toEqual([]);
  });
});

describe("normalizePost", () => {
  it("fills defaults so the UI never reads undefined", () => {
    const post = normalizePost({ id: "1", en: { title: "Munset" }, imageUrl: "javascript:x" });
    expect(post).toMatchObject({
      id: "1",
      imageUrl: "",
      tags: [],
      isExpandable: false,
      en: { title: "Munset", description: "", content: "" },
      ar: { title: "", description: "", content: "" },
    });
  });
});

describe("normalizeExplore", () => {
  it("keeps valid settings and the robot's lines per language", () => {
    const explore = normalizeExplore({
      place: "A2",
      size: "large",
      type: "Tower",
      accent: "#FF00AA",
      lines: { en: { arrival: [" Hello ", "", 4], fact: ["a", "b", "c", "d"], tagline: "Drive on" }, fr: { arrival: ["x"] } },
    });
    expect(explore).toMatchObject({ place: "a2", size: "large", type: "tower", accent: "#ff00aa" });
    expect(explore.lines.en).toEqual({ arrival: ["Hello"], fact: ["a", "b", "c"], detail: [], tagline: "Drive on" });
    expect(explore.lines.ar).toEqual({ arrival: [], fact: [], detail: [], tagline: "" });
    expect(explore.lines.fr).toBeUndefined();
  });

  it("drops anything malformed", () => {
    expect(normalizeExplore({ place: "a2; drop", size: "huge", type: "<b>", accent: "red" })).toMatchObject({ place: "", size: "", type: "", accent: "" });
    expect(normalizeExplore(undefined).place).toBe("");
  });
});

describe("exploreIsEmpty", () => {
  it("is true only when nothing is set", () => {
    expect(exploreIsEmpty(normalizeExplore())).toBe(true);
    expect(exploreIsEmpty(undefined)).toBe(true);
    expect(exploreIsEmpty(normalizeExplore({ accent: "#00ff00" }))).toBe(false);
    expect(exploreIsEmpty(normalizeExplore({ lines: { ar: { tagline: "منصّت" } } }))).toBe(false);
    expect(exploreIsEmpty(normalizeExplore({ lines: { en: { detail: ["Read on"] } } }))).toBe(false);
  });
});

describe("localizePost", () => {
  it("falls back to the other language per field", () => {
    const post = normalizePost({ en: { title: "Car Rental", description: "EN desc" }, ar: { title: "تأجير" } });
    expect(localizePost(post, "ar")).toEqual({ title: "تأجير", description: "EN desc", content: "" });
  });
});

describe("normalizeProjectsMenu", () => {
  it("clamps progress, drops unnamed rows and sorts by order", () => {
    const menu = normalizeProjectsMenu({
      items: [
        { id: "b", enName: "B", progress: 140, order: 2 },
        { id: "x", progress: 50 },
        { id: "a", arName: "أ", progress: -5, order: 1 },
      ],
    });
    expect(menu.map((item) => [item.id, item.progress])).toEqual([
      ["a", 0],
      ["b", 100],
    ]);
  });
});

describe("parseDataUrl", () => {
  it("splits base64 data URLs", () => {
    expect(parseDataUrl("data:application/pdf;base64,QUJD")).toEqual({ mediaType: "application/pdf", base64: "QUJD" });
  });

  it("rejects non-base64 and non-data values", () => {
    expect(parseDataUrl("data:text/plain,hello")).toBeNull();
    expect(parseDataUrl("https://example.com/cv.pdf")).toBeNull();
  });
});
