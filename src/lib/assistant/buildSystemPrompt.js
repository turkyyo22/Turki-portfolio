import { GUARDRAILS } from "./guardrails";
import { ASSISTANT_LIMITS } from "./limits";

const SECTION_BREAK = "\n\n---\n\n";

const CV_NOTE = `### Turki's CV
The conversation opens with Turki's CV as a PDF, added by the website (the visitor did not send it). Treat it as an authoritative source for his education, experience, and skills. The visitor's conversation starts after it: always answer the visitor's latest message. Do not mention the attachment unless the visitor asks about the CV.`;

function clip(value, maxChars) {
  return value.length > maxChars ? `${value.slice(0, maxChars).trimEnd()}…` : value;
}

function formatProject(post, maxContentChars) {
  const titles = [post.en?.title, post.ar?.title].filter(Boolean);
  const lines = [`#### ${[...new Set(titles)].join(" / ")}`];

  const meta = [];
  if (post.date) meta.push(`Date: ${post.date}`);
  if (post.tags?.length) meta.push(`Tech: ${post.tags.join(", ")}`);
  if (post.githubUrl) meta.push(`GitHub: ${post.githubUrl}`);
  if (post.liveUrl) meta.push(`Live: ${post.liveUrl}`);
  if (meta.length) lines.push(meta.join(" · "));

  for (const lang of ["en", "ar"]) {
    const entry = post[lang];
    const body = [entry?.description, entry?.content && clip(entry.content, maxContentChars)]
      .filter(Boolean)
      .join("\n");
    if (body) lines.push(`${lang.toUpperCase()}: ${body}`);
  }
  return lines.join("\n");
}

/** Formats the posts from the admin dashboard as a prompt section. Empty string when there are none. */
export function formatProjects(posts, { maxContentChars = ASSISTANT_LIMITS.maxProjectContentChars } = {}) {
  const entries = (posts || [])
    .filter((post) => post?.en?.title || post?.ar?.title)
    .map((post) => formatProject(post, maxContentChars));
  if (entries.length === 0) return "";
  return [
    "### Projects and updates published on the website",
    "This list is synced automatically from the admin dashboard. When a visitor asks about one of these, answer from it.",
    "",
    entries.join("\n\n"),
  ].join("\n");
}

const SITE_LANGUAGES = { en: "English", ar: "Arabic" };

function siteLanguageNote(siteLanguage) {
  const name = SITE_LANGUAGES[siteLanguage];
  return name ? `### Conversation context\nThe visitor is browsing the ${name} version of the website. Site language: ${name}.` : "";
}

/**
 * The full system prompt: the editable prompt, then the live project list, the
 * CV note and the site language, then the locked guardrails (last, so they take precedence).
 */
export function buildSystemPrompt({ prompt, posts = [], hasCv = false, siteLanguage }) {
  const sections = [
    String(prompt || "").trim(),
    formatProjects(posts),
    hasCv ? CV_NOTE : "",
    siteLanguageNote(siteLanguage),
    GUARDRAILS,
  ];
  return sections.filter(Boolean).join(SECTION_BREAK);
}
