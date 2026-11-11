"use client";

import { LANG_NAMES } from "@/lib/content/bilingual";
import TranslateButton from "./TranslateButton";

const FIELD_LABELS = { title: "title", description: "description", content: "full content" };
const listFields = (fields) => fields.map((field) => FIELD_LABELS[field] || field).join(", ");

/**
 * Shown after a save attempt when a language is incomplete. It names what's
 * missing and offers to translate it and save in one step.
 * `gaps` comes from bilingualGaps().
 */
export default function MissingLanguageNotice({ gaps, busy, error, onTranslateAndSave }) {
  if (gaps.blank.length === 0 && gaps.missing.length === 0) return null;
  const byLang = ["en", "ar"]
    .map((lang) => ({ lang, fields: gaps.missing.filter((gap) => gap.lang === lang).map((gap) => gap.field) }))
    .filter((entry) => entry.fields.length > 0);

  return (
    <div role="alert" className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
      {gaps.blank.length > 0 && <p>Write the {listFields(gaps.blank)} first, in Arabic or English.</p>}
      {byLang.map(({ lang, fields }) => (
        <p key={lang}>
          The {LANG_NAMES[lang]} version is missing the {listFields(fields)}.
        </p>
      ))}
      {gaps.blank.length === 0 && byLang.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <TranslateButton busy={busy} onClick={onTranslateAndSave}>
            Translate missing and save
          </TranslateButton>
          <span className="text-xs text-amber-100/70">or fill it in yourself in the other tab.</span>
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
