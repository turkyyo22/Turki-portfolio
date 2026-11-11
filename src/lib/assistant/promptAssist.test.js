import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { AdminAiError } from "../ai/errors";
import { DEFAULT_PROMPT } from "./defaultPrompt";
import { buildPromptAssistTask, checkPlan, matchBulletStyle, planPromptEdit, validatePromptAssistRequest } from "./promptAssist";
import { applyPromptEdit, parsePrompt } from "./promptSections";

const SAMPLE = ["Intro.", "", "### 1. Skills:", "- Java", "- Python", "", "### 2. Reply style:", "- Be brief.", ""].join("\n");
const parsed = parsePrompt(SAMPLE);
const plan = (overrides) => ({ action: "edit", sectionId: "s1", newSectionTitle: "", afterSectionId: "", replaceLines: [], newLines: ["- Go"], explanation: "Added Go.", ...overrides });

function mockModel(answer, calls = []) {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      calls.push(options);
      return {
        content: [{ type: "text", text: JSON.stringify(answer) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

describe("validatePromptAssistRequest", () => {
  it("accepts the two modes", () => {
    expect(validatePromptAssistRequest({ mode: "add", prompt: SAMPLE, note: " New skill: Go " })).toEqual({
      ok: true,
      value: { mode: "add", prompt: SAMPLE, note: "New skill: Go", sectionId: null, action: "add" },
    });
    expect(validatePromptAssistRequest({ mode: "section", prompt: SAMPLE, note: "Shorter", sectionId: "s2", action: "replace" }).value).toMatchObject({
      sectionId: "s2",
      action: "replace",
    });
  });

  it.each([
    [null, "invalid_request"],
    [{ mode: "x", prompt: SAMPLE, note: "n" }, "invalid_mode"],
    [{ mode: "add", prompt: " ", note: "n" }, "prompt_required"],
    [{ mode: "add", prompt: "x".repeat(40001), note: "n" }, "prompt_too_long"],
    [{ mode: "add", prompt: SAMPLE, note: "" }, "note_required"],
    [{ mode: "add", prompt: SAMPLE, note: "x".repeat(2001) }, "note_too_long"],
    [{ mode: "section", prompt: SAMPLE, note: "n", sectionId: "s9" }, "unknown_section"],
    [{ mode: "section", prompt: SAMPLE, note: "n", sectionId: "s1", action: "delete" }, "invalid_action"],
  ])("rejects %j with %s", (body, error) => {
    expect(validatePromptAssistRequest(body)).toEqual({ ok: false, error });
  });
});

describe("buildPromptAssistTask", () => {
  it("includes the numbered prompt, the task and the note", () => {
    const task = buildPromptAssistTask({ mode: "section", prompt: SAMPLE, note: "No emojis.", sectionId: "s2", action: "replace" });
    expect(task).toContain("[s2] L7: ### 2. Reply style:");
    expect(task).toContain("«Reply style»");
    expect(task).toContain('"""\nNo emojis.\n"""');
  });
});

describe("checkPlan", () => {
  const add = { mode: "add", sectionId: null, action: "add" };

  it("turns line ids into numbers and keeps a valid plan", () => {
    expect(checkPlan(plan({ replaceLines: ["L4"], newLines: ["- Java 21"] }), parsed, add)).toEqual({
      action: "edit",
      sectionId: "s1",
      newLines: ["- Java 21"],
      explanation: "Added Go.",
      replaceLines: [4],
    });
  });

  it("forces the chosen section in section mode, and replaces it whole for 'replace'", () => {
    const result = checkPlan(plan({ sectionId: "s1", newLines: ["- Two lines max."] }), parsed, { mode: "section", sectionId: "s2", action: "replace" });
    expect(result).toMatchObject({ sectionId: "s2", replaceAll: true });
    expect(applyPromptEdit(SAMPLE, result).text).toContain("### 2. Reply style:\n- Two lines max.");
  });

  it("accepts a new section with a title", () => {
    const result = checkPlan(plan({ sectionId: "new", newSectionTitle: "Certificates", afterSectionId: "s1", newLines: ["- AWS"] }), parsed, add);
    expect(result).toMatchObject({ sectionId: "new", newSectionTitle: "Certificates", afterSectionId: "s1" });
  });

  it("passes 'none' through with the section it points to", () => {
    expect(checkPlan(plan({ action: "none", sectionId: "s1" }), parsed, add)).toEqual({ action: "none", sectionId: "s1", explanation: "Added Go." });
  });

  it.each([
    ["an unknown section", plan({ sectionId: "s7" })],
    ["a line from another section", plan({ replaceLines: ["L8"] })],
    ["a heading", plan({ newLines: ["### Hacked:"] })],
    ["a new section without a title", plan({ sectionId: "new" })],
    ["an unknown action", plan({ action: "delete_everything" })],
    ["a non-numeric line id", plan({ replaceLines: ["first"] })],
  ])("rejects %s", (_, raw) => {
    expect(() => checkPlan(raw, parsed, add)).toThrow(AdminAiError);
  });
});

describe("matchBulletStyle", () => {
  it("adds the bullet to new lines in a bulleted section", () => {
    expect(matchBulletStyle(["- a", "- b", ""], ["c", "- d", ""])).toEqual(["- c", "- d", ""]);
  });

  it("leaves sections written as paragraphs alone", () => {
    expect(matchBulletStyle(["First paragraph.", "Second paragraph."], ["New paragraph."])).toEqual(["New paragraph."]);
  });

  it("keeps the bullets when the model drops them in a rewrite", () => {
    const result = checkPlan(plan({ newLines: ["Two lines max.", "No emojis."] }), parsed, { mode: "section", sectionId: "s2", action: "replace" });
    expect(result.newLines).toEqual(["- Two lines max.", "- No emojis."]);
  });
});

describe("planPromptEdit", () => {
  it("asks the model for a JSON plan and validates it", async () => {
    const calls = [];
    const model = mockModel(plan({ sectionId: "s4", newLines: ["- ينزعج من الفوضى في التخطيط."] }), calls);
    const request = validatePromptAssistRequest({ mode: "add", prompt: DEFAULT_PROMPT, note: "I get stressed by messy planning" }).value;
    const result = await planPromptEdit({ model, request });
    expect(result).toMatchObject({ action: "edit", sectionId: "s4", replaceLines: [] });
    expect(calls[0].responseFormat?.type).toBe("json");
    const userText = calls[0].prompt.find((message) => message.role === "user").content[0].text;
    expect(userText).toContain("I get stressed by messy planning");
    expect(userText).toContain("[s5]");
  });
});
