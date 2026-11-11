// The assistant prompt is plain text divided into sections by "#", "##" or "###"
// headings (for example "### 6. أسلوب الرد:"). These helpers split it into
// sections and apply an edit to exactly one section, so an AI suggestion can
// never touch the rest of the prompt. Pure functions, used by the admin
// dashboard and the server, and covered by unit tests.

const SECTION_HEADING = /^ {0,3}#{1,3}\s+\S/;
const MAX_LABEL_CHARS = 60;

export const PROMPT_EDIT_LIMITS = Object.freeze({
  maxNewLines: 60,
  maxLineChars: 1000,
  maxReplaceLines: 30,
  maxTitleChars: 60,
});

export const isSectionHeading = (line) => SECTION_HEADING.test(line);

/** A short, readable name for a heading: no "###", numbering, trailing colon or long instructions in brackets. */
export function sectionLabel(heading) {
  const label = String(heading)
    .replace(/^\s*#{1,6}\s*/, "")
    .replace(/^[\d٠-٩]+\s*[.)\-–]\s*/, "")
    .replace(/\s*\([^)]{21,}\)/g, "")
    .replace(/\s*[:：]\s*$/, "")
    .trim();
  return label.slice(0, MAX_LABEL_CHARS) || String(heading).trim();
}

/**
 * Splits the prompt into lines and sections. Text before the first heading is
 * the "intro" section. Section ids ("intro", "s1", "s2", …) depend only on the
 * text, so the dashboard and the server agree on them.
 */
export function parsePrompt(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let current = { id: "intro", label: "Introduction", heading: "", headingLine: -1, start: 0, end: lines.length, isIntro: true };
  let count = 0;
  lines.forEach((line, index) => {
    if (!isSectionHeading(line)) return;
    sections.push({ ...current, end: index });
    count += 1;
    current = { id: `s${count}`, label: sectionLabel(line), heading: line.trim(), headingLine: index, start: index + 1, end: lines.length, isIntro: false };
  });
  sections.push(current);
  const hasContent = (section) => lines.slice(section.start, section.end).some((line) => line.trim());
  return { lines, sections: sections.filter((section) => !section.isIntro || hasContent(section)) };
}

/** The section's text without its heading and without blank lines at the end. */
export function sectionBody(parsed, section) {
  const end = lastContentLine(parsed.lines, section) + 1;
  return parsed.lines.slice(section.start, Math.max(section.start, end)).join("\n");
}

// Index of the last non-empty line in the section's body, or the heading line when the body is empty.
function lastContentLine(lines, section) {
  for (let index = section.end - 1; index >= section.start; index -= 1) {
    if (lines[index].trim()) return index;
  }
  return section.start - 1;
}

/** The prompt with numbered lines and marked sections, as the model sees it. */
export function numberedPrompt({ lines, sections }) {
  const output = [];
  for (const section of sections) {
    output.push(section.isIntro ? `[${section.id}] (introduction, no heading)` : `[${section.id}] L${section.headingLine + 1}: ${lines[section.headingLine]}`);
    for (let index = section.start; index < section.end; index += 1) output.push(`L${index + 1}: ${lines[index]}`);
  }
  return output.join("\n");
}

function cleanLines(newLines) {
  const lines = (Array.isArray(newLines) ? newLines : []).map((line) => String(line).replace(/\s+$/, ""));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

function charOffset(lines, lineIndex) {
  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) offset += lines[index].length + 1;
  return offset;
}

function done(nextLines, startLine, endLine, section, removed, added) {
  const text = nextLines.join("\n");
  const start = charOffset(nextLines, startLine);
  const end = endLine > startLine ? charOffset(nextLines, endLine - 1) + nextLines[endLine - 1].length : start;
  return { ok: true, text, section, removed, added, range: { start, end } };
}

/**
 * Applies an edit plan to the prompt and reports exactly what changed.
 *
 * plan: { action: "edit" | "none", sectionId ("intro", "s3", or "new"),
 *         newSectionTitle, afterSectionId, replaceLines (1-based line numbers),
 *         replaceAll (replace the whole section body), newLines }
 *
 * Returns { ok: true, text, section: { id, label, isNew }, removed, added,
 * range: { start, end } (characters of the new text to highlight) }, or
 * { ok: false, error }.
 */
export function applyPromptEdit(text, plan) {
  const parsed = parsePrompt(text);
  const { lines, sections } = parsed;
  const newLines = cleanLines(plan?.newLines);

  if (plan?.action === "none") {
    const section = sections.find((candidate) => candidate.id === plan.sectionId);
    return { ok: true, unchanged: true, text: lines.join("\n"), section: section ? { id: section.id, label: section.label, isNew: false } : null, removed: [], added: [], range: null };
  }

  if (plan?.sectionId === "new") {
    const title = String(plan.newSectionTitle || "").replace(/^#+\s*/, "").replace(/[:：]\s*$/, "").trim();
    if (!title) return { ok: false, error: "missing_title" };
    if (newLines.length === 0) return { ok: false, error: "nothing_to_add" };
    const after = sections.find((candidate) => candidate.id === plan.afterSectionId) || sections[sections.length - 1];
    const insertAt = after ? lastContentLine(lines, after) + 1 : lines.length;
    const block = ["", `### ${title}:`, ...newLines];
    const nextLines = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)];
    return done(nextLines, insertAt + 1, insertAt + block.length, { id: "new", label: sectionLabel(title), isNew: true }, [], newLines);
  }

  const section = sections.find((candidate) => candidate.id === plan?.sectionId);
  if (!section) return { ok: false, error: "unknown_section" };
  const info = { id: section.id, label: section.label, isNew: false };

  if (plan.replaceAll) {
    const bodyEnd = lastContentLine(lines, section) + 1;
    const from = section.start;
    const to = Math.max(from, bodyEnd);
    const nextLines = [...lines.slice(0, from), ...newLines, ...lines.slice(to)];
    return done(nextLines, from, from + newLines.length, info, lines.slice(from, to), newLines);
  }

  const replace = [...new Set((plan.replaceLines || []).map(Number))].sort((a, b) => a - b).map((number) => number - 1);
  if (replace.some((index) => !Number.isInteger(index) || index < section.start || index >= section.end)) {
    return { ok: false, error: "line_outside_section" };
  }

  if (replace.length > 0) {
    const removing = new Set(replace);
    const nextLines = [];
    let insertedAt = -1;
    lines.forEach((line, index) => {
      if (index === replace[0]) {
        insertedAt = nextLines.length;
        nextLines.push(...newLines);
      }
      if (!removing.has(index)) nextLines.push(line);
    });
    return done(nextLines, insertedAt, insertedAt + newLines.length, info, replace.map((index) => lines[index]), newLines);
  }

  if (newLines.length === 0) return { ok: false, error: "nothing_to_add" };
  const insertAt = lastContentLine(lines, section) + 1;
  const nextLines = [...lines.slice(0, insertAt), ...newLines, ...lines.slice(insertAt)];
  return done(nextLines, insertAt, insertAt + newLines.length, info, [], newLines);
}
