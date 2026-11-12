"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, runTransaction } from "firebase/firestore";

import PromptAssistant from "@/components/admin/PromptAssistant";
import ChatMessage from "@/components/assistant/ChatMessage";
import { refreshPublicSite, getAdminIdToken } from "@/lib/adminApi";
import { DEFAULT_PROMPT } from "@/lib/assistant/defaultPrompt";
import { GUARDRAILS } from "@/lib/assistant/guardrails";
import { ASSISTANT_HISTORY_DOC, ASSISTANT_HISTORY_SIZE, ASSISTANT_LIMITS, ASSISTANT_SETTINGS_DOC } from "@/lib/assistant/limits";
import { useAssistantChat } from "@/lib/assistant/useAssistantChat";
import { auth, db } from "@/lib/firebase";

const DEFAULT_DRAFT = { prompt: DEFAULT_PROMPT, includeProjects: true, includeCv: true };

const TEST_ERRORS = {
  rate_limited: "Too many test messages. Wait a minute and try again.",
  ai_busy: "The AI quota is exhausted right now. Try again in a minute.",
  ai_unavailable: "The AI service is unavailable right now.",
  network: "Can't reach the server.",
  interrupted: "The answer was cut off.",
  empty_response: "The model returned an empty answer.",
  invalid_token: "Your session expired. Sign in again.",
  missing_token: "Your session expired. Sign in again.",
  not_admin: "This account isn't the configured admin.",
  admin_not_configured: "No admin email is configured on the server.",
  draft_prompt_required: "The prompt is empty.",
  draft_prompt_too_long: "The prompt is too long.",
};

const settingsRef = () => doc(db, ...ASSISTANT_SETTINGS_DOC.split("/"));
const historyRef = () => doc(db, ...ASSISTANT_HISTORY_DOC.split("/"));

const sameDraft = (a, b) =>
  a.prompt === b.prompt && a.includeProjects === b.includeProjects && a.includeCv === b.includeCv;

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** Admin editor for the assistant's prompt: edit, test, publish, and roll back. */
export default function AssistantSettings() {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [live, setLive] = useState(null); // null = the built-in default is live
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [history, setHistory] = useState([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [notice, setNotice] = useState(null); // { tone: "success" | "error", text, undo? }
  // The last change made with "＋ Add info" / "✎ Edit a section": highlighted in the editor, and undoable.
  const [highlight, setHighlight] = useState(null); // { text, start, end }
  const [undoPrompt, setUndoPrompt] = useState(null);
  const editorRef = useRef(null);
  const backdropRef = useRef(null);

  const baseline = live ?? DEFAULT_DRAFT;
  const isDirty = !sameDraft(draft, baseline);
  const promptLength = draft.prompt.length;
  const isTooLong = promptLength > ASSISTANT_LIMITS.maxPromptChars;
  const canPublish = isDirty && !isPublishing && draft.prompt.trim() && !isTooLong;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDoc(settingsRef()), getDoc(historyRef())])
      .then(([settingsSnap, historySnap]) => {
        if (cancelled) return;
        const stored = settingsSnap.data();
        if (stored?.prompt?.trim()) {
          const current = {
            prompt: stored.prompt,
            includeProjects: stored.includeProjects !== false,
            includeCv: stored.includeCv !== false,
            version: stored.version || 0,
            updatedAt: stored.updatedAt || "",
            updatedBy: stored.updatedBy || "",
          };
          setLive(current);
          setDraft({ prompt: current.prompt, includeProjects: current.includeProjects, includeCv: current.includeCv });
        }
        setHistory(Array.isArray(historySnap.data()?.versions) ? historySnap.data().versions : []);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("Loading assistant settings failed:", error);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Warn before leaving the page with unpublished edits.
  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const publish = async () => {
    if (!canPublish) return;
    setIsPublishing(true);
    setNotice(null);
    try {
      const savedBy = auth.currentUser?.email || "admin";
      const savedAt = new Date().toISOString();
      const entry = { ...draft, prompt: draft.prompt.trim(), savedAt, savedBy };

      // One atomic write: the live settings and the version history never disagree.
      const published = await runTransaction(db, async (transaction) => {
        const [currentSnap, historySnap] = await Promise.all([transaction.get(settingsRef()), transaction.get(historyRef())]);
        const version = (Number(currentSnap.data()?.version) || 0) + 1;
        const versions = [{ ...entry, version }, ...(historySnap.data()?.versions || [])].slice(0, ASSISTANT_HISTORY_SIZE);
        transaction.set(settingsRef(), {
          prompt: entry.prompt,
          includeProjects: entry.includeProjects,
          includeCv: entry.includeCv,
          version,
          updatedAt: savedAt,
          updatedBy: savedBy,
        });
        transaction.set(historyRef(), { versions });
        return { version, versions };
      });

      const refreshed = await refreshPublicSite("assistant");
      setLive({ ...entry, version: published.version, updatedAt: savedAt, updatedBy: savedBy });
      setDraft({ prompt: entry.prompt, includeProjects: entry.includeProjects, includeCv: entry.includeCv });
      setHistory(published.versions);
      setNotice({
        tone: "success",
        text: refreshed
          ? `Version ${published.version} is live. Visitors get it on their next message.`
          : `Version ${published.version} is saved. It reaches visitors within a minute.`,
      });
    } catch (error) {
      console.error("Publishing the prompt failed:", error);
      setNotice({
        tone: "error",
        text:
          error?.code === "permission-denied"
            ? "Firebase blocked the save. Allow signed-in writes to /settings/{document} in your Firestore rules."
            : error?.message || "Publishing failed.",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const discard = () => {
    setDraft({ prompt: baseline.prompt, includeProjects: baseline.includeProjects, includeCv: baseline.includeCv });
    setNotice(null);
  };

  // A change approved in the smart editor: put it in the draft and show where it went.
  const applyAssist = (text, { range, label, isNew }) => {
    setUndoPrompt(draft.prompt);
    setDraft((current) => ({ ...current, prompt: text }));
    setHighlight(range ? { text, ...range } : null);
    setNotice({
      tone: "success",
      text: `${isNew ? `Added the section «${label}»` : `Updated «${label}»`}. It's highlighted in the editor. Test it, then press Publish to make it live.`,
      undo: true,
    });
  };

  const undoAssist = () => {
    if (undoPrompt === null) return;
    setDraft((current) => ({ ...current, prompt: undoPrompt }));
    setUndoPrompt(null);
    setHighlight(null);
    setNotice({ tone: "success", text: "Change undone." });
  };

  const visibleHighlight = highlight && highlight.text === draft.prompt ? highlight : null;

  // Scroll the editor to the highlighted change.
  useEffect(() => {
    const textarea = editorRef.current;
    const mark = backdropRef.current?.querySelector("mark");
    if (!visibleHighlight || !textarea || !mark) return;
    textarea.scrollTop = Math.max(0, mark.offsetTop - 64);
    backdropRef.current.scrollTop = textarea.scrollTop;
    textarea.scrollIntoView({ block: "nearest" });
  }, [visibleHighlight]);

  const loadIntoEditor = (next, label) => {
    if (isDirty && !window.confirm("Replace your unpublished edits in the editor?")) return;
    setDraft({ prompt: next.prompt, includeProjects: next.includeProjects !== false, includeCv: next.includeCv !== false });
    setNotice({ tone: "success", text: `${label} loaded into the editor. Test it, then press Publish to make it live.` });
  };

  if (status === "loading") {
    return (
      <section className="lg:col-span-3 flex items-center justify-center rounded-2xl border border-white/10 bg-glass p-10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
      </section>
    );
  }

  return (
    <section className="lg:col-span-3 rounded-2xl border border-cyan/20 bg-glass p-6 md:p-8">
      <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-wide">AI Assistant Prompt</h2>
          <p className="mt-1 text-sm text-white/60">
            Who T.A Core is, the facts about you, and how it answers. Published changes reach visitors within seconds.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {live ? (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-emerald-300">
              Live · v{live.version} · {formatWhen(live.updatedAt)}
            </span>
          ) : (
            <span className="rounded-full border border-white/20 px-3 py-1 text-white/70">Live · built-in default</span>
          )}
          {isDirty && <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-amber-300">Unpublished changes</span>}
        </div>
      </div>

      {status === "error" && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load the saved prompt. You&apos;re seeing the built-in default; publishing will still work if Firestore allows it.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PromptAssistant prompt={draft.prompt} disabled={isPublishing} onApply={applyAssist} />

          <label htmlFor="assistant-prompt" className="sr-only">
            Assistant prompt
          </label>
          {/* A copy of the text sits behind the transparent editor and paints the highlight. */}
          <div className="relative rounded-xl bg-black/50">
            {visibleHighlight && (
              <div
                ref={backdropRef}
                aria-hidden="true"
                dir="auto"
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-xl border border-transparent p-4 font-mono text-sm leading-relaxed text-transparent [scrollbar-gutter:stable]"
              >
                {visibleHighlight.text.slice(0, visibleHighlight.start)}
                <mark className="rounded-sm bg-cyan/25 text-transparent shadow-[0_0_0_2px_rgb(var(--accent-cyan-rgb)/0.35)]">
                  {visibleHighlight.text.slice(visibleHighlight.start, visibleHighlight.end)}
                </mark>
                {visibleHighlight.text.slice(visibleHighlight.end)}
                {"\n"}
              </div>
            )}
            <textarea
              ref={editorRef}
              id="assistant-prompt"
              value={draft.prompt}
              onChange={(event) => {
                setHighlight(null);
                setDraft((current) => ({ ...current, prompt: event.target.value }));
              }}
              onScroll={(event) => {
                if (backdropRef.current) backdropRef.current.scrollTop = event.currentTarget.scrollTop;
              }}
              dir="auto"
              spellCheck={false}
              className="relative block h-[460px] w-full resize-y rounded-xl border border-white/10 bg-transparent p-4 font-mono text-sm leading-relaxed text-white [scrollbar-gutter:stable] focus:border-cyan/50 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-white/80">
                <input
                  type="checkbox"
                  checked={draft.includeProjects}
                  onChange={(event) => setDraft((current) => ({ ...current, includeProjects: event.target.checked }))}
                  className="accent-cyan"
                />
                Add my projects (System Logs) automatically
              </label>
              <label className="flex items-center gap-2 text-white/80">
                <input
                  type="checkbox"
                  checked={draft.includeCv}
                  onChange={(event) => setDraft((current) => ({ ...current, includeCv: event.target.checked }))}
                  className="accent-cyan"
                />
                Let it read my CV (PDF)
              </label>
            </div>
            <span className={`font-mono text-xs ${isTooLong ? "text-red-400" : "text-white/50"}`}>
              {promptLength.toLocaleString()} / {ASSISTANT_LIMITS.maxPromptChars.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={publish}
              disabled={!canPublish}
              className="rounded-lg bg-cyan px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-cyan/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPublishing ? "Publishing…" : "Publish"}
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={!isDirty || isPublishing}
              className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-white/80 transition-colors hover:border-white/40 disabled:opacity-40"
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={() => loadIntoEditor(DEFAULT_DRAFT, "The built-in default")}
              disabled={isPublishing}
              className="rounded-lg px-5 py-2.5 text-sm text-white/60 transition-colors hover:text-white disabled:opacity-40"
            >
              Reset to default
            </button>
          </div>

          {notice && (
            <p
              role="status"
              className={`rounded-lg border p-3 text-sm ${
                notice.tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              }`}
            >
              {notice.text}
              {notice.undo && undoPrompt !== null && (
                <>
                  {" "}
                  <button type="button" onClick={undoAssist} className="font-semibold underline underline-offset-2 hover:text-white">
                    Undo
                  </button>
                </>
              )}
            </p>
          )}

          <details className="rounded-xl border border-white/10 bg-black/30 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-white/80">Always-on safety rules (locked in code)</summary>
            <p className="mt-3 text-xs text-white/60">
              These are added after your prompt on every request, so an edit here can&apos;t remove them. Your projects and CV are added between your prompt and these rules.
            </p>
            <pre dir="auto" className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/70">{GUARDRAILS}</pre>
          </details>

          <details className="rounded-xl border border-white/10 bg-black/30 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-white/80">
              Version history ({history.length}/{ASSISTANT_HISTORY_SIZE})
            </summary>
            {history.length === 0 ? (
              <p className="mt-3 text-xs text-white/50">No published versions yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {history.map((entry) => (
                  <li key={`${entry.version}-${entry.savedAt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs">
                    <span className="font-mono text-white/80">
                      v{entry.version} · {formatWhen(entry.savedAt)} · {entry.savedBy} · {entry.prompt?.length?.toLocaleString()} chars
                    </span>
                    <button type="button" onClick={() => loadIntoEditor(entry, `Version ${entry.version}`)} className="text-cyan hover:underline">
                      Load into editor
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>

        <TestConsole draft={draft} />
      </div>
    </section>
  );
}

/** Chats with the assistant using the unpublished draft. Visitors are not affected. */
function TestConsole({ draft }) {
  const [text, setText] = useState("");
  const [siteLanguage, setSiteLanguage] = useState("en");
  const getRequestOptions = useCallback(
    async () => ({
      idToken: await getAdminIdToken(),
      options: {
        draftPrompt: draft.prompt,
        includeProjects: draft.includeProjects,
        includeCv: draft.includeCv,
        lang: siteLanguage,
      },
    }),
    [draft, siteLanguage]
  );
  const errorText = useCallback((code) => TEST_ERRORS[code] || `Request failed (${code}).`, []);
  const { messages, isLoading, send, reset } = useAssistantChat({ errorText, getRequestOptions });

  const submit = (event) => {
    event.preventDefault();
    if (!text.trim() || isLoading) return;
    send(text);
    setText("");
  };

  return (
    <aside className="flex h-[640px] min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Test your draft</h3>
          <p className="text-xs text-white/50">Uses the text in the editor. Visitors aren&apos;t affected.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-white/60">
            Visitor&apos;s site
            <select
              value={siteLanguage}
              onChange={(event) => setSiteLanguage(event.target.value)}
              className="rounded border border-white/10 bg-black/60 px-1.5 py-1 text-xs text-white"
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </label>
          <button type="button" onClick={reset} disabled={messages.length === 0} className="text-xs text-white/60 hover:text-white disabled:opacity-40">
            Clear
          </button>
        </div>
      </div>
      <div aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-xs text-white/40">Ask something a visitor might ask, in English or Arabic.</p>
        )}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-3">
        <label htmlFor="assistant-test-input" className="sr-only">
          Test message
        </label>
        <input
          id="assistant-test-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={ASSISTANT_LIMITS.maxUserMessageChars}
          dir="auto"
          placeholder="Ask a test question…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-cyan/60 focus:outline-none"
        />
        <button type="submit" disabled={!text.trim() || isLoading} className="rounded-lg bg-cyan px-4 text-sm font-bold text-black disabled:opacity-40">
          Send
        </button>
      </form>
    </aside>
  );
}
