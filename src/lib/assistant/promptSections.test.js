import { describe, expect, it } from "vitest";

import { DEFAULT_PROMPT } from "./defaultPrompt";
import { applyPromptEdit, numberedPrompt, parsePrompt, sectionBody, sectionLabel } from "./promptSections";

const SAMPLE = ["Intro line.", "", "### 1. Skills:", "- Java", "- Python", "", "### 2. Reply style:", "- Be brief.", ""].join("\n");

describe("sectionLabel", () => {
  it.each([
    ["### 1. معلومات أساسية:", "معلومات أساسية"],
    ["### 5. عن هذا النظام (الموقع):", "عن هذا النظام (الموقع)"],
    ["### نقاط الضعف (أجب منها فقط عند السؤال عن الضعف، بلا اختلاق نقاط إضافية):", "نقاط الضعف"],
    ["## Reply style", "Reply style"],
    ["### ١. البداية:", "البداية"],
  ])("%s → %s", (heading, label) => {
    expect(sectionLabel(heading)).toBe(label);
  });
});

describe("parsePrompt", () => {
  it("finds the default prompt's sections, including the ones the owner named", () => {
    const labels = parsePrompt(DEFAULT_PROMPT).sections.map((section) => section.label);
    expect(labels[0]).toBe("Introduction");
    expect(labels).toEqual(expect.arrayContaining(["نقاط الضعف", "عن هذا النظام (الموقع)", "أسلوب الرد", "نقاط القوة", "معلومات أساسية"]));
    expect(labels).toHaveLength(9);
  });

  it("gives stable ids and ignores #### sub-headings", () => {
    const { sections } = parsePrompt("### A\n- a\n#### detail\n- b\n### B\n- c");
    expect(sections.map((section) => [section.id, section.label])).toEqual([["s1", "A"], ["s2", "B"]]);
  });

  it("returns the body of a section without trailing blank lines", () => {
    const parsed = parsePrompt(SAMPLE);
    expect(sectionBody(parsed, parsed.sections[1])).toBe("- Java\n- Python");
  });
});

describe("numberedPrompt", () => {
  it("numbers every line and marks the sections", () => {
    const text = numberedPrompt(parsePrompt(SAMPLE));
    expect(text).toContain("[intro] (introduction, no heading)\nL1: Intro line.");
    expect(text).toContain("[s1] L3: ### 1. Skills:\nL4: - Java");
    expect(text).toContain("[s2] L7: ### 2. Reply style:");
  });
});

describe("applyPromptEdit", () => {
  it("adds lines at the end of a section, before its blank lines", () => {
    const result = applyPromptEdit(SAMPLE, { action: "edit", sectionId: "s1", replaceLines: [], newLines: ["- Go"] });
    expect(result.ok).toBe(true);
    expect(result.text).toBe(SAMPLE.replace("- Python\n", "- Python\n- Go\n"));
    expect(result.section).toEqual({ id: "s1", label: "Skills", isNew: false });
    expect(result.added).toEqual(["- Go"]);
    expect(result.text.slice(result.range.start, result.range.end)).toBe("- Go");
  });

  it("replaces a contradicting line in place and reports it", () => {
    const result = applyPromptEdit(SAMPLE, { action: "edit", sectionId: "s1", replaceLines: [4], newLines: ["- Java 21"] });
    expect(result.text).toBe(SAMPLE.replace("- Java\n", "- Java 21\n"));
    expect(result.removed).toEqual(["- Java"]);
    expect(result.text.slice(result.range.start, result.range.end)).toBe("- Java 21");
  });

  it("replaces a whole section body", () => {
    const result = applyPromptEdit(SAMPLE, { action: "edit", sectionId: "s2", replaceAll: true, newLines: ["- Answer in 2 lines.", "- No emojis."] });
    expect(result.text).toBe(SAMPLE.replace("- Be brief.", "- Answer in 2 lines.\n- No emojis."));
    expect(result.removed).toEqual(["- Be brief."]);
  });

  it("creates a new section after the chosen one", () => {
    const result = applyPromptEdit(SAMPLE, { action: "edit", sectionId: "new", newSectionTitle: "Certificates", afterSectionId: "s1", newLines: ["- AWS"] });
    expect(result.text).toBe(SAMPLE.replace("- Python\n", "- Python\n\n### Certificates:\n- AWS\n"));
    expect(result.section).toEqual({ id: "new", label: "Certificates", isNew: true });
    expect(result.text.slice(result.range.start, result.range.end)).toBe("### Certificates:\n- AWS");
  });

  it("refuses lines outside the section and unknown sections", () => {
    expect(applyPromptEdit(SAMPLE, { action: "edit", sectionId: "s1", replaceLines: [8], newLines: ["x"] })).toEqual({ ok: false, error: "line_outside_section" });
    expect(applyPromptEdit(SAMPLE, { action: "edit", sectionId: "s9", newLines: ["x"] })).toEqual({ ok: false, error: "unknown_section" });
    expect(applyPromptEdit(SAMPLE, { action: "edit", sectionId: "s1", newLines: [] })).toEqual({ ok: false, error: "nothing_to_add" });
  });

  it("leaves everything else in the prompt untouched", () => {
    const result = applyPromptEdit(DEFAULT_PROMPT, { action: "edit", sectionId: "s5", replaceLines: [], newLines: ["- سطر جديد"] });
    const before = DEFAULT_PROMPT.split("\n");
    const after = result.text.split("\n");
    expect(after).toHaveLength(before.length + 1);
    const inserted = after.indexOf("- سطر جديد");
    expect([...after.slice(0, inserted), ...after.slice(inserted + 1)]).toEqual(before);
  });

  it("reports 'none' without changing the text", () => {
    const result = applyPromptEdit(SAMPLE, { action: "none", sectionId: "s1" });
    expect(result).toMatchObject({ ok: true, unchanged: true, text: SAMPLE, section: { id: "s1" } });
  });
});
