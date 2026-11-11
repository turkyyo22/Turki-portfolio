import { describe, expect, it } from "vitest";

import ar from "../../../dictionaries/ar.json";
import en from "../../../dictionaries/en.json";
import { defaultQuestions, localizeQuestions, normalizeQuestions, QUESTION_LIMITS } from "./questions";

describe("normalizeQuestions", () => {
  it("returns null when nothing has been saved", () => {
    expect(normalizeQuestions(null)).toBeNull();
    expect(normalizeQuestions(undefined)).toBeNull();
  });

  it("trims, drops empty and duplicate items, and fills missing ids", () => {
    const raw = {
      card: [
        { id: "a", en: "  When can he start? ", ar: "متى يمكنه البدء؟" },
        { en: "", ar: "  " },
        { id: "b", en: "When can he start?", ar: "متى يمكنه البدء؟" },
        { en: "Only English" },
        "not an object",
      ],
      chat: "not a list",
    };
    expect(normalizeQuestions(raw)).toEqual({
      card: [
        { id: "a", en: "When can he start?", ar: "متى يمكنه البدء؟" },
        { id: "q4", en: "Only English", ar: "" },
      ],
      chat: [],
    });
  });

  it("caps the list sizes and the text length", () => {
    const long = Array.from({ length: 40 }, (_, i) => ({ en: `Question ${i} ${"x".repeat(300)}`, ar: "" }));
    const result = normalizeQuestions({ card: long, chat: long });
    expect(result.card).toHaveLength(QUESTION_LIMITS.card);
    expect(result.chat).toHaveLength(QUESTION_LIMITS.chat);
    expect(result.card[0].en.length).toBe(QUESTION_LIMITS.chars);
  });
});

describe("localizeQuestions", () => {
  const list = [
    { en: "What roles fit him?", ar: "ما المناصب المناسبة له؟" },
    { en: "English only", ar: "" },
    { en: "", ar: "عربي فقط" },
  ];

  it("uses the requested language and falls back to the other one", () => {
    expect(localizeQuestions(list, "ar")).toEqual(["ما المناصب المناسبة له؟", "English only", "عربي فقط"]);
    expect(localizeQuestions(list, "en")).toEqual(["What roles fit him?", "English only", "عربي فقط"]);
  });

  it("returns null for an empty or missing list so the defaults are used", () => {
    expect(localizeQuestions([], "en")).toBeNull();
    expect(localizeQuestions(undefined, "en")).toBeNull();
  });
});

describe("defaultQuestions", () => {
  it("pairs the dictionary questions by position", () => {
    const defaults = defaultQuestions(en, ar);
    expect(defaults.card).toHaveLength(en.hero.aiCard.suggestions.length);
    expect(defaults.chat).toHaveLength(en.assistant.suggestions.length);
    expect(defaults.card[0]).toEqual({ id: "card1", en: en.hero.aiCard.suggestions[0], ar: ar.hero.aiCard.suggestions[0] });
    for (const item of [...defaults.card, ...defaults.chat]) {
      expect(item.en).toBeTruthy();
      expect(item.ar).toBeTruthy();
    }
  });
});
