"use client";

import { useState } from "react";

import { LANG_NAMES, OTHER_LANG } from "@/lib/content/bilingual";
import TranslateButton from "./TranslateButton";
import { useTranslator } from "./useTranslator";

const ORDER = ["ar", "en"];

/**
 * An Arabic and an English box for the same short text (a name, a title, a
 * question). Fill one, and the empty one offers ✨ Translate. The result stays
 * editable and is marked "AI" until you change it.
 */
export default function BilingualField({ label, value, onChange, context, required = false, maxLength = 200, placeholders = {} }) {
  const { translate, busy, error, clearError } = useTranslator();
  const [aiLang, setAiLang] = useState(null);
  const [undo, setUndo] = useState(null); // { lang, previous }

  const run = async (to) => {
    const from = OTHER_LANG[to];
    const result = await translate({ from, to, context, fields: { text: value[from] } });
    if (!result) return;
    setUndo({ lang: to, previous: value[to] });
    setAiLang(to);
    onChange(to, result.text.slice(0, maxLength));
  };

  const edit = (lang, text) => {
    clearError();
    if (aiLang === lang) {
      setAiLang(null);
      setUndo(null);
    }
    onChange(lang, text);
  };

  const undoTranslation = () => {
    if (!undo) return;
    onChange(undo.lang, undo.previous);
    setAiLang(null);
    setUndo(null);
  };

  return (
    <div className="space-y-1.5">
      {label && <p className="font-mono text-xs text-cyan">{label}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ORDER.map((lang) => {
          const other = OTHER_LANG[lang];
          const canTranslate = !value[lang].trim() && Boolean(value[other].trim());
          const isAi = aiLang === lang;
          return (
            <div key={lang} className="relative">
              <input
                type="text"
                lang={lang}
                dir={lang === "ar" ? "rtl" : "ltr"}
                aria-label={`${label || "Text"} (${LANG_NAMES[lang]})`}
                value={value[lang]}
                maxLength={maxLength}
                required={required}
                placeholder={placeholders[lang] || LANG_NAMES[lang]}
                onChange={(event) => edit(lang, event.target.value)}
                className={`w-full rounded-lg border bg-black/50 p-3 text-white transition-colors focus:outline-none ${
                  isAi ? "border-cyan/60 shadow-[0_0_0_1px_rgba(0,229,255,0.35)]" : "border-white/10 focus:border-cyan/50"
                } ${canTranslate ? (lang === "ar" ? "pl-28" : "pr-28") : ""}`}
              />
              {canTranslate && (
                <span className={`absolute top-1/2 -translate-y-1/2 ${lang === "ar" ? "left-2" : "right-2"}`}>
                  <TranslateButton compact busy={busy} onClick={() => run(lang)} title={`Translate from ${LANG_NAMES[other]}`}>
                    Translate
                  </TranslateButton>
                </span>
              )}
              {isAi && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute -top-2 rounded bg-cyan px-1.5 text-[10px] font-bold leading-4 text-black ${lang === "ar" ? "left-3" : "right-3"}`}
                >
                  AI
                </span>
              )}
            </div>
          );
        })}
      </div>
      {aiLang && (
        <p className="text-[11px] text-white/50">
          Translated by AI. Check it and edit if needed.{" "}
          <button type="button" onClick={undoTranslation} className="text-cyan hover:underline">
            Undo
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
