import { describe, expect, it } from "vitest";

import {
  localizePost,
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
