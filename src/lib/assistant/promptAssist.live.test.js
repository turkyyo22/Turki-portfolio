// Live check of the smart prompt editor against the real Gemini API.
// Skipped by default (it uses your API quota). To run it:
//   PowerShell:  $env:LIVE_AI="1"; npx vitest run src/lib/assistant/promptAssist.live.test.js
//   bash:        LIVE_AI=1 npx vitest run src/lib/assistant/promptAssist.live.test.js
import { describe, expect, it } from "vitest";

import { DEFAULT_PROMPT } from "./defaultPrompt";
import { applyPromptEdit, parsePrompt } from "./promptSections";

const LIVE = process.env.LIVE_AI === "1";
const ARABIC = /[؀-ۿ]/;

// Next.js skips .env.local when NODE_ENV is "test", so read the Gemini settings from it directly.
async function loadGeminiEnv() {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(".env.local", "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(GOOGLE_GENERATIVE_AI_API_KEY|GEMINI_MODEL|GEMINI_ADMIN_MODEL)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

async function plan(body) {
  await loadGeminiEnv();
  const { google } = await import("@ai-sdk/google");
  const { reasoningOptionsFor, resolveAdminModelId } = await import("./model");
  const { planPromptEdit, validatePromptAssistRequest } = await import("./promptAssist");
  const modelId = resolveAdminModelId();
  const request = validatePromptAssistRequest({ prompt: DEFAULT_PROMPT, ...body }).value;
  const result = await planPromptEdit({ model: google(modelId), request, providerOptions: reasoningOptionsFor(modelId) });
  const applied = applyPromptEdit(DEFAULT_PROMPT, result);
  console.log(JSON.stringify({ note: body.note, plan: result, section: applied.section, removed: applied.removed, added: applied.added }, null, 2));
  return { result, applied };
}

const sectionId = (label) => parsePrompt(DEFAULT_PROMPT).sections.find((section) => section.label === label).id;

describe.skipIf(!LIVE)("planPromptEdit with Gemini (live)", () => {
  it("puts a new certificate with the skills (or a new section) in Arabic", async () => {
    const { result, applied } = await plan({ mode: "add", note: "I got the AWS Certified Cloud Practitioner certificate in October 2026." });
    expect(result.action).toBe("edit");
    expect([sectionId("المهارات والتوجه المهني"), "new"]).toContain(result.sectionId);
    expect(applied.added.join("\n")).toMatch(ARABIC);
    expect(applied.added.join("\n")).toContain("AWS");
  }, 60_000);

  it("puts a reply-style instruction in أسلوب الرد", async () => {
    const { result } = await plan({ mode: "add", note: "Don't use emojis in your answers." });
    expect(result.sectionId).toBe(sectionId("أسلوب الرد"));
  }, 60_000);

  it("replaces the GPA line instead of adding a contradiction", async () => {
    const { result, applied } = await plan({ mode: "add", note: "My GPA is now 4.60 out of 5." });
    expect(result.sectionId).toBe(sectionId("معلومات أساسية"));
    expect(applied.removed.join("\n")).toContain("4.51");
    expect(applied.added.join("\n")).toContain("4.60");
  }, 60_000);

  it("rewrites a whole section on request", async () => {
    const { result, applied } = await plan({ mode: "section", sectionId: sectionId("أسلوب الرد"), action: "replace", note: "Answers must be at most 2 lines, and never use emojis." });
    expect(result.replaceAll).toBe(true);
    expect(applied.added.join("\n")).toMatch(ARABIC);
    for (const line of applied.added) expect(line).toMatch(/^- /);
    expect(applied.text).toContain("### 6. أسلوب الرد:");
  }, 60_000);

  it("notices a fact that is already there", async () => {
    const { result } = await plan({ mode: "add", note: "Turki is 23 years old and lives in Jeddah." });
    if (result.action === "edit") expect(result.sectionId).toBe(sectionId("معلومات أساسية"));
    else expect(result.action).toBe("none");
    expect(result.explanation).not.toMatch(/\bL\d+|\[s\d+\]/);
  }, 60_000);
});
