"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";

import ar from "../../../dictionaries/ar.json";
import en from "../../../dictionaries/en.json";
import BilingualField from "@/components/admin/translator/BilingualField";
import TranslateButton from "@/components/admin/translator/TranslateButton";
import { useTranslator } from "@/components/admin/translator/useTranslator";
import { auth, db } from "@/lib/firebase";
import { refreshPublicSite } from "@/lib/adminApi";
import { OTHER_LANG } from "@/lib/content/bilingual";
import { defaultQuestions, normalizeQuestions, QUESTION_LIMITS, QUESTION_LISTS, QUESTIONS_DOC } from "@/lib/content/questions";

const DEFAULTS = defaultQuestions(en, ar);
const LIST_INFO = {
  card: { label: "AI card", hint: "The hero card shows 3 at a time; “More questions” flips through the rest." },
  chat: { label: "Chat", hint: "The chat shows 3 of these at random, and new ones after each answer." },
};

const questionsRef = () => doc(db, ...QUESTIONS_DOC.split("/"));
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}`);
const hasText = (value) => value.trim() !== "";

// Items written in one language only, as one translation request per direction.
function missingJobs(list) {
  const jobs = {};
  list.forEach((item, index) => {
    for (const lang of ["ar", "en"]) {
      const from = OTHER_LANG[lang];
      if (!hasText(item[lang]) && hasText(item[from])) {
        jobs[lang] ??= { from, to: lang, fields: {} };
        jobs[lang].fields[`q${index}`] = item[from];
      }
    }
  });
  return Object.values(jobs);
}

/** Admin editor for the suggested questions on the AI card and in the chat, in both languages. */
export default function QuestionsEditor() {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [saved, setSaved] = useState(null); // what the site shows now (null = the built-in defaults)
  const [draft, setDraft] = useState(DEFAULTS);
  const [list, setList] = useState("card");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text }
  const { translate, busy, error: translateError } = useTranslator();

  useEffect(() => {
    let cancelled = false;
    getDoc(questionsRef())
      .then((snapshot) => {
        if (cancelled) return;
        const stored = normalizeQuestions(snapshot.data());
        if (stored) {
          setSaved(stored);
          setDraft(stored);
        }
        setStatus("ready");
      })
      .catch((failure) => {
        console.error("Loading the questions failed:", failure);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const baseline = saved ?? DEFAULTS;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const items = draft[list];
  const incomplete = QUESTION_LISTS.flatMap((name) =>
    draft[name].map((item, index) => ({ name, index, item })).filter(({ item }) => hasText(item.ar) !== hasText(item.en))
  );

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const updateList = (name, update) => setDraft((current) => ({ ...current, [name]: update(current[name]) }));
  const changeItem = (index, lang, text) =>
    updateList(list, (current) => current.map((item, i) => (i === index ? { ...item, [lang]: text } : item)));
  const moveItem = (index, step) =>
    updateList(list, (current) => {
      const target = index + step;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const removeItem = (index) => updateList(list, (current) => current.filter((_, i) => i !== index));
  const addItem = () =>
    updateList(list, (current) => (current.length >= QUESTION_LIMITS[list] ? current : [...current, { id: newId(), en: "", ar: "" }]));

  // Fills every question in the selected list that has only one language
  // (at most one request per direction).
  const translateMissing = async () => {
    setNotice(null);
    const name = list;
    const snapshot = draft[name];
    const updates = {}; // item id -> { lang: text }
    for (const job of missingJobs(snapshot)) {
      const result = await translate({ from: job.from, to: job.to, context: "question", fields: job.fields });
      if (!result) return;
      for (const [key, text] of Object.entries(result)) {
        const item = snapshot[Number(key.slice(1))];
        if (item && text) updates[item.id] = { ...updates[item.id], [job.to]: text.slice(0, QUESTION_LIMITS.chars) };
      }
    }
    // Applied by id, and only to sides that are still empty, so edits made meanwhile are kept.
    updateList(name, (current) =>
      current.map((item) => {
        const patch = updates[item.id];
        if (!patch) return item;
        const next = { ...item };
        for (const [lang, text] of Object.entries(patch)) if (!hasText(next[lang])) next[lang] = text;
        return next;
      })
    );
  };

  const save = async () => {
    setNotice(null);
    if (incomplete.length > 0) {
      const first = incomplete[0];
      setList(first.name);
      setNotice({ tone: "error", text: `Question ${first.index + 1} in “${LIST_INFO[first.name].label}” has only one language. Use ✨ Translate missing, or write the other language.` });
      return;
    }
    const cleaned = normalizeQuestions(draft);
    setIsSaving(true);
    try {
      await setDoc(questionsRef(), {
        card: cleaned.card,
        chat: cleaned.chat,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || "admin",
      });
      setSaved(cleaned);
      setDraft(cleaned);
      const refreshed = await refreshPublicSite();
      setNotice({ tone: "success", text: refreshed ? "Questions saved. The site shows them now." : "Questions saved. The site shows them within 5 minutes." });
    } catch (failure) {
      console.error("Saving the questions failed:", failure);
      setNotice({
        tone: "error",
        text:
          failure?.code === "permission-denied"
            ? "Firebase blocked the save. Allow signed-in writes to /settings/{document} in your Firestore rules."
            : failure?.message || "Saving failed.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <section className="flex items-center justify-center rounded-2xl border border-white/10 bg-glass p-10 lg:col-span-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
      </section>
    );
  }

  const missingInList = missingJobs(items).length > 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-glass p-6 md:p-8 lg:col-span-3">
      <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-wide">Suggested Questions</h2>
          <p className="mt-1 text-sm text-white/60">Questions visitors can click to ask your AI assistant. Write one language and translate the other.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className={`rounded-full border px-3 py-1 ${saved ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/20 text-white/70"}`}>
            {saved ? "Live · your list" : "Live · built-in defaults"}
          </span>
          {isDirty && <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-amber-300">Unsaved changes</span>}
        </div>
      </div>

      {status === "error" && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load your saved questions. You&apos;re seeing the built-in defaults; saving still works if Firestore allows it.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Question list" className="flex rounded-lg border border-white/10 p-1">
          {QUESTION_LISTS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={list === name}
              onClick={() => setList(name)}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${list === name ? "bg-cyan/15 text-cyan" : "text-white/60 hover:text-white"}`}
            >
              {LIST_INFO[name].label} <span className="font-mono text-xs opacity-70">({draft[name].length})</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {missingInList && (
            <TranslateButton busy={busy} onClick={translateMissing}>
              Translate missing
            </TranslateButton>
          )}
          <button
            type="button"
            onClick={addItem}
            disabled={items.length >= QUESTION_LIMITS[list]}
            className="rounded-lg bg-cyan px-3 py-1.5 text-sm font-bold text-black transition-colors hover:bg-cyan/80 disabled:opacity-40"
          >
            + Add question
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-white/50">
        {LIST_INFO[list].hint} Up to {QUESTION_LIMITS[list]} questions, {QUESTION_LIMITS.chars} characters each.
      </p>
      {translateError && (
        <p role="alert" className="mb-3 text-xs text-red-400">
          {translateError}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-white/50">
          No questions here yet. Without any, the site uses the built-in ones.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/30 p-3">
              <span className="mt-3 w-6 shrink-0 text-center font-mono text-xs text-cyan">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <BilingualField
                  context="question"
                  value={{ ar: item.ar, en: item.en }}
                  onChange={(lang, text) => changeItem(index, lang, text)}
                  maxLength={QUESTION_LIMITS.chars}
                  placeholders={{ ar: "السؤال بالعربية", en: "The question in English" }}
                />
              </div>
              <div className="mt-2 flex shrink-0 flex-col gap-1 sm:flex-row">
                <IconButton label="Move up" onClick={() => moveItem(index, -1)} disabled={index === 0}>↑</IconButton>
                <IconButton label="Move down" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>↓</IconButton>
                <IconButton label="Delete" onClick={() => removeItem(index)} danger>✕</IconButton>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || isSaving || busy}
          className="rounded-lg bg-cyan px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-cyan/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? "Saving…" : "Save questions"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(baseline);
            setNotice(null);
          }}
          disabled={!isDirty || isSaving}
          className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-white/80 transition-colors hover:border-white/40 disabled:opacity-40"
        >
          Discard changes
        </button>
        <button
          type="button"
          onClick={() => {
            if (isDirty && !window.confirm("Replace your unsaved edits with the built-in questions?")) return;
            setDraft(DEFAULTS);
            setNotice({ tone: "success", text: "Built-in questions loaded. Press Save to use them." });
          }}
          disabled={isSaving}
          className="rounded-lg px-5 py-2.5 text-sm text-white/60 transition-colors hover:text-white disabled:opacity-40"
        >
          Reset to defaults
        </button>
      </div>

      {notice && (
        <p
          role="status"
          className={`mt-4 rounded-lg border p-3 text-sm ${
            notice.tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          }`}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}

function IconButton({ label, onClick, disabled = false, danger = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors disabled:opacity-30 ${
        danger ? "border-red-500/30 text-red-400 hover:bg-red-500/15" : "border-white/10 text-white/70 hover:border-cyan/40 hover:text-cyan"
      }`}
    >
      {children}
    </button>
  );
}
