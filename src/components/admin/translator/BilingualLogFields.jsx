"use client";

import { useState } from "react";

import { LANG_NAMES, OTHER_LANG } from "@/lib/content/bilingual";
import TranslateButton from "./TranslateButton";
import { useTranslator } from "./useTranslator";

const TABS = ["ar", "en"];
const PLACEHOLDERS = {
  title: { en: "Title", ar: "العنوان" },
  description: { en: "Short description", ar: "وصف مختصر" },
  content: { en: "Full content (Markdown supported)", ar: "المحتوى الكامل (يدعم Markdown)" },
};

const hasText = (value) => typeof value === "string" && value.trim() !== "";

/**
 * The Arabic and English text of a log, one tab per language, with the AI
 * translator: write one language, then fill the other with one click. The
 * translation stays editable and is marked until you change it.
 *
 * `value` is { ar: {...}, en: {...} }; `onChange(lang, patch)` merges `patch`
 * into that language. `missing` ([{ field, lang }]) outlines fields to fill.
 */
export default function BilingualLogFields({ value, onChange, fields, missing = [] }) {
  const [tab, setTab] = useState("ar");
  const [aiFields, setAiFields] = useState([]); // ["en.title", ...]
  const [undo, setUndo] = useState(null); // { lang, previous: { field: text } }
  const { translate, busy, error, clearError } = useTranslator();

  const other = OTHER_LANG[tab];
  const filled = (lang, field) => hasText(value[lang]?.[field]);
  const toOther = fields.filter((field) => filled(tab, field) && !filled(other, field));
  const fromOther = fields.filter((field) => filled(other, field) && !filled(tab, field));
  const canRetranslate = toOther.length === 0 && fields.some((field) => filled(tab, field));
  const isAi = (lang, field) => aiFields.includes(`${lang}.${field}`);
  const isMissing = (lang, field) => missing.some((gap) => gap.lang === lang && gap.field === field) && !filled(lang, field);

  const run = async (from, to, list, { overwrite = false } = {}) => {
    if (overwrite && !window.confirm(`Replace the ${LANG_NAMES[to]} text with a new translation of the ${LANG_NAMES[from]}?`)) return;
    const source = Object.fromEntries(list.map((field) => [field, value[from][field]]));
    const result = await translate({ from, to, context: "log", fields: source });
    if (!result) return;
    setUndo({ lang: to, previous: Object.fromEntries(list.map((field) => [field, value[to]?.[field] || ""])) });
    onChange(to, result);
    setAiFields((current) => [...new Set([...current, ...list.map((field) => `${to}.${field}`)])]);
    setTab(to);
  };

  const edit = (field, text) => {
    clearError();
    setAiFields((current) => current.filter((key) => key !== `${tab}.${field}`));
    onChange(tab, { [field]: text });
  };

  const undoTranslation = () => {
    if (!undo) return;
    onChange(undo.lang, undo.previous);
    setAiFields((current) => current.filter((key) => !key.startsWith(`${undo.lang}.`)));
    setUndo(null);
  };

  const inputClass = (field) =>
    `w-full rounded-lg border bg-black/50 p-3 text-white transition-colors focus:outline-none ${
      isAi(tab, field)
        ? "border-cyan/60 shadow-[0_0_0_1px_rgb(var(--accent-cyan-rgb)/0.35)]"
        : isMissing(tab, field)
          ? "border-amber-400/70"
          : "border-white/10 focus:border-cyan/50"
    }`;

  const showAiNote = fields.some((field) => isAi(tab, field));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Language" className="flex border-b border-white/10">
        {TABS.map((lang) => {
          const needsText = fields.some((field) => filled(OTHER_LANG[lang], field) && !filled(lang, field));
          const aiCount = fields.filter((field) => isAi(lang, field)).length;
          return (
            <button
              key={lang}
              type="button"
              role="tab"
              aria-selected={tab === lang}
              onClick={() => setTab(lang)}
              className={`flex flex-1 items-center justify-center gap-2 py-3 ${tab === lang ? "border-b-2 border-cyan text-cyan" : "text-white/50 hover:text-white/80"}`}
            >
              {lang.toUpperCase()}
              {aiCount > 0 && <span className="rounded bg-cyan/20 px-1.5 text-[10px] font-bold text-cyan">AI</span>}
              {needsText && <span className="h-2 w-2 rounded-full bg-amber-400" title={`${LANG_NAMES[lang]} is missing some text`} />}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-[2rem] flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {fromOther.length > 0 && (
            <TranslateButton busy={busy} onClick={() => run(other, tab, fromOther)}>
              Fill from {LANG_NAMES[other]}
            </TranslateButton>
          )}
          {toOther.length > 0 && (
            <TranslateButton busy={busy} onClick={() => run(tab, other, toOther)}>
              Translate to {LANG_NAMES[other]}
            </TranslateButton>
          )}
        </div>
        {canRetranslate && !busy && (
          <button
            type="button"
            onClick={() => run(tab, other, fields.filter((field) => filled(tab, field)), { overwrite: true })}
            className="text-xs text-white/50 transition-colors hover:text-cyan"
          >
            ↻ Re-translate to {LANG_NAMES[other]}
          </button>
        )}
      </div>

      {showAiNote && (
        <p className="rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs text-white/70">
          ✨ Translated by AI. Read it through and edit anything you like before saving.{" "}
          {undo?.lang === tab && (
            <button type="button" onClick={undoTranslation} className="font-semibold text-cyan hover:underline">
              Undo
            </button>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-4" dir={tab === "ar" ? "rtl" : "ltr"} lang={tab}>
        <input
          type="text"
          aria-label={`Title (${LANG_NAMES[tab]})`}
          placeholder={PLACEHOLDERS.title[tab]}
          value={value[tab]?.title || ""}
          onChange={(event) => edit("title", event.target.value)}
          className={inputClass("title")}
        />
        <textarea
          aria-label={`Description (${LANG_NAMES[tab]})`}
          placeholder={PLACEHOLDERS.description[tab]}
          value={value[tab]?.description || ""}
          onChange={(event) => edit("description", event.target.value)}
          className={`${inputClass("description")} h-24`}
        />
        {fields.includes("content") && (
          <textarea
            aria-label={`Full content (${LANG_NAMES[tab]})`}
            placeholder={PLACEHOLDERS.content[tab]}
            value={value[tab]?.content || ""}
            onChange={(event) => edit("content", event.target.value)}
            className={`${inputClass("content")} h-40`}
          />
        )}
      </div>
    </div>
  );
}
