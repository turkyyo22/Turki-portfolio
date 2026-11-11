import "server-only";

import { getDocument, listDocuments } from "@/lib/firestore/rest";
import {
  normalizeCvMeta,
  normalizePost,
  normalizeProjectsMenu,
  normalizeSkill,
  normalizeSocials,
  parseDataUrl,
} from "@/lib/content/normalize";
import { normalizeQuestions, QUESTIONS_DOC } from "@/lib/content/questions";

// Everything the admin dashboard edits is cached under one tag, so a single
// revalidation after a save refreshes the whole public site.
export const CONTENT_TAG = "content";
const CONTENT_CACHE = { revalidate: 300, tags: [CONTENT_TAG] };

export async function getPosts() {
  const documents = await listDocuments("posts", { orderBy: "createdAt desc", cache: CONTENT_CACHE });
  return documents.map(normalizePost);
}

export async function getSkills() {
  const documents = await listDocuments("skills", { orderBy: "order asc", cache: CONTENT_CACHE });
  return documents.map(normalizeSkill);
}

export async function getProjectsMenu() {
  return normalizeProjectsMenu(await getDocument("settings/projects", { cache: CONTENT_CACHE }));
}

export async function getSocials() {
  return normalizeSocials(await getDocument("settings/socials", { cache: CONTENT_CACHE }));
}

/**
 * The admin's suggested questions, or null when none are saved (the dictionary
 * defaults apply). Optional content: a failed read never breaks the page.
 */
export async function getQuestions() {
  try {
    return normalizeQuestions(await getDocument(QUESTIONS_DOC, { cache: CONTENT_CACHE }));
  } catch (error) {
    console.error("[content] Using the default questions:", error.message);
    return null;
  }
}

export async function getCvMeta() {
  return normalizeCvMeta(await getDocument("settings/cv", { cache: CONTENT_CACHE }));
}

/** The CV PDF as base64, for the assistant. Null when no PDF is published. */
export async function getCvFile() {
  const raw = await getDocument("settings/cv", { cache: CONTENT_CACHE });
  const file = parseDataUrl(raw?.url);
  return file?.mediaType === "application/pdf" ? file : null;
}
