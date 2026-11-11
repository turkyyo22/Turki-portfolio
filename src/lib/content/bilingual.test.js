import { describe, expect, it } from "vitest";

import { bilingualGaps, translationJobs } from "./bilingual";

const fields = ["title", "description", "content"];

describe("bilingualGaps", () => {
  it("finds fields written in one language only, and fields written in neither", () => {
    const value = {
      ar: { title: "منصّت", description: "", content: "  " },
      en: { title: "Munset", description: "A mental health app.", content: "" },
    };
    expect(bilingualGaps(value, fields)).toEqual({
      missing: [{ field: "description", lang: "ar" }],
      blank: ["content"],
    });
  });

  it("reports nothing when both languages are complete", () => {
    const value = { ar: { title: "أ", description: "ب" }, en: { title: "A", description: "B" } };
    expect(bilingualGaps(value, ["title", "description"])).toEqual({ missing: [], blank: [] });
  });

  it("copes with a missing language object", () => {
    expect(bilingualGaps({ en: { title: "A" } }, ["title"])).toEqual({ missing: [{ field: "title", lang: "ar" }], blank: [] });
  });
});

describe("translationJobs", () => {
  it("makes one request per direction", () => {
    const value = {
      ar: { title: "منصّت", description: "", content: "محتوى" },
      en: { title: "", description: "A mental health app.", content: "" },
    };
    const { missing } = bilingualGaps(value, fields);
    expect(translationJobs(value, missing)).toEqual([
      { from: "ar", to: "en", fields: { title: "منصّت", content: "محتوى" } },
      { from: "en", to: "ar", fields: { description: "A mental health app." } },
    ]);
  });
});
