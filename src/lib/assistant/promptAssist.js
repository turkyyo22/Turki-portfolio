// The admin's smart prompt editor: Gemini decides where a note belongs in the
// assistant prompt and how to word it; the code applies that plan to one
// section only (see promptSections.js). Nothing here is published: the result
// goes into the admin's draft for review.
import { generateText, jsonSchema, Output } from "ai";

import { AdminAiError } from "../ai/errors";
import { ASSISTANT_LIMITS } from "./limits";
import { applyPromptEdit, isSectionHeading, numberedPrompt, parsePrompt, PROMPT_EDIT_LIMITS } from "./promptSections";

const PLAN_SCHEMA = jsonSchema({
  type: "object",
  properties: {
    action: { type: "string", enum: ["edit", "none"] },
    sectionId: { type: "string" },
    newSectionTitle: { type: "string" },
    afterSectionId: { type: "string" },
    replaceLines: { type: "array", items: { type: "string" } },
    newLines: { type: "array", items: { type: "string" } },
    explanation: { type: "string" },
  },
  required: ["action", "sectionId", "newSectionTitle", "afterSectionId", "replaceLines", "newLines", "explanation"],
});

export const PROMPT_ASSIST_INSTRUCTIONS = `You help Turki Aloufi keep the system prompt of his portfolio's AI assistant ("T.A Core") up to date.
You receive the prompt with every line numbered (L1, L2, ...) and every section marked with its id in [brackets], then the owner's note.
Decide how to apply the note with the smallest, cleanest change, and answer with JSON only.

How to write:
- Write in the prompt's language (it is mostly Arabic): Arabic sentences, with technology, product and company names in their original Latin spelling.
- Match the section's style: usually short bullet lines starting with "- ", written about Turki in the third person.
- Keep the owner's facts exactly (names, numbers, dates, links). Never add facts the note does not contain, and never exaggerate.
- One fact per line, short lines. Never write headings (lines starting with #).

Where it goes:
- Facts about Turki go in the section they belong to: basic information, experience and projects, skills, strengths, weaknesses, interests.
- Instructions about how the assistant should answer (tone, length, format, emojis, language) go in the reply-style section.
- Facts about this website go in the "about this system" section.
- If the note updates or contradicts an existing line, replace that line (list it in replaceLines) instead of adding a conflicting one.
- If the note is already fully covered, use action "none" and say where it is.
- Use sectionId "new" only when no section fits; then give a short newSectionTitle in the prompt's language and the section to put it after in afterSectionId.
- Never change lines unrelated to the note. Never touch headings.

Fields:
- action: "edit" or "none"
- sectionId: the [id] of the section to change, or "new"
- newSectionTitle: the new section's title, or "" when not creating one
- afterSectionId: for a new section, the [id] to place it after, otherwise ""
- replaceLines: ids of existing lines in that section to replace or remove (e.g. ["L12"]), or [] to only add
- newLines: the lines to write; they take the place of the first replaced line, or go at the end of the section
- explanation: one short sentence for the owner, in the language of the note, saying what you changed and why there. Name the section by its title; never mention line or section ids.`;

/**
 * Checks a request body: `{ mode: "add" | "section", prompt, note, sectionId?, action? }`.
 * "add" lets the model pick the section; "section" targets `sectionId` with
 * action "add" (merge the note in) or "replace" (rewrite the section).
 */
export function validatePromptAssistRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_request" };
  const { mode, prompt, note, sectionId, action = "add" } = body;
  if (mode !== "add" && mode !== "section") return { ok: false, error: "invalid_mode" };
  if (typeof prompt !== "string" || !prompt.trim()) return { ok: false, error: "prompt_required" };
  if (prompt.length > ASSISTANT_LIMITS.maxPromptChars) return { ok: false, error: "prompt_too_long" };
  if (typeof note !== "string" || !note.trim()) return { ok: false, error: "note_required" };
  if (note.length > ASSISTANT_LIMITS.maxAssistNoteChars) return { ok: false, error: "note_too_long" };

  if (mode === "add") return { ok: true, value: { mode, prompt, note: note.trim(), sectionId: null, action: "add" } };

  if (action !== "add" && action !== "replace") return { ok: false, error: "invalid_action" };
  const section = parsePrompt(prompt).sections.find((candidate) => candidate.id === sectionId);
  if (!section) return { ok: false, error: "unknown_section" };
  return { ok: true, value: { mode, prompt, note: note.trim(), sectionId: section.id, action } };
}

/** The user message: the numbered prompt, the task and the note. Exported for tests. */
export function buildPromptAssistTask({ mode, prompt, note, sectionId, action }) {
  const parsed = parsePrompt(prompt);
  const section = parsed.sections.find((candidate) => candidate.id === sectionId);
  let task = "Add the owner's note to the prompt, in the section where it belongs.";
  if (mode === "section" && action === "add") {
    task = `The owner chose section [${section.id}] («${section.label}»). Add the note to that section only (sectionId "${section.id}"). Replace a line of that section only if the note updates or contradicts it.`;
  }
  if (mode === "section" && action === "replace") {
    task = `The owner chose section [${section.id}] («${section.label}») and wants it rewritten as the note says. Use sectionId "${section.id}", leave replaceLines empty, and put the complete new text of the section (without its heading) in newLines, in the same format as now (keep the "- " at the start of each bullet line). Keep every existing point the note does not change, unless the note says to drop it.`;
  }
  return `THE PROMPT:\n${numberedPrompt(parsed)}\n\nTASK: ${task}\n\nTHE OWNER'S NOTE:\n"""\n${note}\n"""`;
}

const BULLET = /^\s*[-*•]\s/;

/**
 * Keeps a bulleted section bulleted: when most of the section's lines start
 * with "- ", new lines that don't are given one. Exported for tests.
 */
export function matchBulletStyle(sectionLines, newLines) {
  const written = sectionLines.filter((line) => line.trim());
  const bullets = written.filter((line) => BULLET.test(line)).length;
  if (written.length === 0 || bullets / written.length < 0.6) return newLines;
  return newLines.map((line) => (line.trim() && !BULLET.test(line) ? `- ${line.trim()}` : line));
}

/**
 * Validates the model's plan against the prompt and the request, and returns
 * a plan applyPromptEdit() accepts. Throws AdminAiError("ai_bad_plan") when the
 * model asked for something the code won't do (unknown section, a line from
 * another section, a heading, too much text).
 */
export function checkPlan(raw, parsed, { mode, sectionId, action }) {
  const bad = () => new AdminAiError("ai_bad_plan");
  if (!raw || typeof raw !== "object") throw bad();
  const ids = new Set(parsed.sections.map((section) => section.id));
  const explanation = String(raw.explanation || "").trim().slice(0, 300);

  if (raw.action === "none") {
    const where = mode === "section" ? sectionId : ids.has(raw.sectionId) ? raw.sectionId : null;
    return { action: "none", sectionId: where, explanation };
  }
  if (raw.action !== "edit") throw bad();

  const target = mode === "section" ? sectionId : raw.sectionId;
  if (target !== "new" && !ids.has(target)) throw bad();

  const newLines = (Array.isArray(raw.newLines) ? raw.newLines : []).map((line) => String(line));
  if (newLines.length > PROMPT_EDIT_LIMITS.maxNewLines) throw bad();
  if (newLines.some((line) => line.length > PROMPT_EDIT_LIMITS.maxLineChars || isSectionHeading(line))) throw bad();

  const section = parsed.sections.find((candidate) => candidate.id === target);
  const styledLines = section ? matchBulletStyle(parsed.lines.slice(section.start, section.end), newLines) : newLines;
  const plan = { action: "edit", sectionId: target, newLines: styledLines, explanation };
  if (target === "new") {
    const title = String(raw.newSectionTitle || "").replace(/^#+\s*/, "").trim();
    if (!title || title.length > PROMPT_EDIT_LIMITS.maxTitleChars || /\n/.test(title)) throw bad();
    plan.newSectionTitle = title;
    if (ids.has(raw.afterSectionId)) plan.afterSectionId = raw.afterSectionId;
  } else if (mode === "section" && action === "replace") {
    plan.replaceAll = true;
  } else {
    const lineIds = Array.isArray(raw.replaceLines) ? raw.replaceLines : [];
    if (lineIds.length > PROMPT_EDIT_LIMITS.maxReplaceLines) throw bad();
    plan.replaceLines = lineIds.map((id) => Number(String(id).trim().replace(/^L/i, "")));
    if (plan.replaceLines.some((number) => !Number.isInteger(number))) throw bad();
  }

  const applied = applyPromptEdit(parsed.lines.join("\n"), plan);
  if (!applied.ok) throw bad();
  if (applied.text.length > ASSISTANT_LIMITS.maxPromptChars) throw new AdminAiError("prompt_too_long");
  return plan;
}

/** Asks the model for an edit plan and returns it validated. */
export async function planPromptEdit({ model, request, abortSignal, providerOptions }) {
  const parsed = parsePrompt(request.prompt);
  const { output } = await generateText({
    model,
    system: PROMPT_ASSIST_INSTRUCTIONS,
    prompt: buildPromptAssistTask(request),
    output: Output.object({ schema: PLAN_SCHEMA }),
    temperature: 0.2,
    maxOutputTokens: 4096,
    maxRetries: 1,
    abortSignal,
    providerOptions,
  });
  return checkPlan(output, parsed, request);
}
