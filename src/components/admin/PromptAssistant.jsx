"use client";

import { useEffect, useRef, useState } from "react";

import { planPromptEdit } from "@/lib/adminApi";
import { ASSISTANT_LIMITS } from "@/lib/assistant/limits";
import { applyPromptEdit, parsePrompt, sectionBody } from "@/lib/assistant/promptSections";

const toLines = (text) => text.replace(/\r\n?/g, "\n").split("\n");
const isCtrlEnter = (event) => event.key === "Enter" && (event.ctrlKey || event.metaKey);

/**
 * "＋ Add info" and "✎ Edit a section" for the assistant prompt.
 * The AI suggests a change to one section, you see exactly what will change,
 * and only "Apply" puts it in the draft (it goes live when you publish).
 */
export default function PromptAssistant({ prompt, disabled = false, onApply }) {
  const [panel, setPanel] = useState(null); // null | "add" | "edit"
  const [note, setNote] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [editMode, setEditMode] = useState("change"); // change | direct
  const [change, setChange] = useState("");
  const [direct, setDirect] = useState(null); // null until edited: shows the section's current text
  const [polish, setPolish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState(null); // { snapshot, plan, result, note, edited }
  const running = useRef(null);

  useEffect(() => () => running.current?.abort(), []);

  const parsed = parsePrompt(prompt);
  const sections = parsed.sections;
  const selected = sections.find((section) => section.id === sectionId) || sections.find((section) => !section.isIntro) || sections[0];
  const currentBody = selected ? sectionBody(parsed, selected) : "";

  const clearProposal = () => {
    setProposal(null);
    setError("");
  };

  const open = (next) => {
    running.current?.abort();
    setPanel((current) => (current === next ? null : next));
    clearProposal();
  };

  const propose = (snapshot, plan, sourceNote) => {
    const result = applyPromptEdit(snapshot, plan);
    if (!result.ok) {
      setError("This change couldn't be applied to the prompt. Try again.");
      return;
    }
    if (!result.unchanged && result.text === snapshot) {
      setError("That doesn't change anything in this section yet.");
      return;
    }
    setProposal({ snapshot, plan, result, note: sourceNote, edited: null });
  };

  const askAi = async (request) => {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const snapshot = prompt;
    setBusy(true);
    clearProposal();
    try {
      const plan = await planPromptEdit({ ...request, prompt: snapshot, signal: controller.signal });
      propose(snapshot, plan, request.note);
    } catch (failure) {
      if (failure?.name !== "AbortError") setError(failure?.message || "Something went wrong. Try again.");
    } finally {
      if (running.current === controller) {
        running.current = null;
        setBusy(false);
      }
    }
  };

  const findPlace = () => {
    if (note.trim()) askAi({ mode: "add", note });
  };

  const changeSection = (action) => {
    if (!change.trim() || !selected) return;
    if (polish) {
      askAi({ mode: "section", note: change, sectionId: selected.id, action });
      return;
    }
    clearProposal();
    const newLines = toLines(change.trim());
    propose(prompt, action === "replace" ? { action: "edit", sectionId: selected.id, replaceAll: true, newLines } : { action: "edit", sectionId: selected.id, replaceLines: [], newLines }, change);
  };

  const previewDirect = () => {
    if (!selected || direct === null) return;
    clearProposal();
    propose(prompt, { action: "edit", sectionId: selected.id, replaceAll: true, newLines: toLines(direct) }, "");
  };

  const apply = () => {
    if (!proposal || proposal.result.unchanged) return;
    if (prompt !== proposal.snapshot) {
      setError("The prompt changed while you were reviewing. Run it again so nothing is overwritten.");
      return;
    }
    const result =
      proposal.edited === null ? proposal.result : applyPromptEdit(proposal.snapshot, { ...proposal.plan, newLines: toLines(proposal.edited) });
    if (!result.ok) {
      setError("This change couldn't be applied to the prompt.");
      return;
    }
    onApply(result.text, { range: result.range, label: result.section.label, isNew: result.section.isNew });
    setProposal(null);
    setNote("");
    setChange("");
    setDirect(null);
    setPanel(null);
  };

  const moveTo = (targetId) => {
    if (!targetId || !proposal?.note) return;
    askAi({ mode: "section", note: proposal.note, sectionId: targetId, action: "add" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarButton active={panel === "add"} disabled={disabled} onClick={() => open("add")}>
          <span aria-hidden="true" className="text-base leading-none">＋</span> Add info
        </ToolbarButton>
        <ToolbarButton active={panel === "edit"} disabled={disabled} onClick={() => open("edit")}>
          <span aria-hidden="true">✎</span> Edit a section
        </ToolbarButton>
        <span className="text-xs text-white/40">The AI suggests, you approve. Changes go to the draft, not live.</span>
      </div>

      {panel === "add" && (
        <div className="rounded-xl border border-cyan/25 bg-cyan/[0.04] p-4">
          <label htmlFor="assist-note" className="text-sm font-semibold text-white/90">
            What should T.A Core know or do?
          </label>
          <p className="mt-1 text-xs text-white/50">Write it in Arabic or English. The AI finds the right section and writes it in the prompt&apos;s style.</p>
          <textarea
            id="assist-note"
            dir="auto"
            value={note}
            maxLength={ASSISTANT_LIMITS.maxAssistNoteChars}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (!isCtrlEnter(event)) return;
              event.preventDefault();
              findPlace();
            }}
            placeholder="e.g. I got the AWS Cloud Practitioner certificate. / مثال: لا تستخدم الإيموجي في الردود."
            className="mt-3 h-24 w-full resize-y rounded-lg border border-white/10 bg-black/50 p-3 text-sm text-white focus:border-cyan/50 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-white/40">
              {note.length.toLocaleString()} / {ASSISTANT_LIMITS.maxAssistNoteChars.toLocaleString()} · Ctrl+Enter
            </span>
            <AiButton busy={busy} disabled={!note.trim()} onClick={findPlace}>
              Find the right place
            </AiButton>
          </div>
        </div>
      )}

      {panel === "edit" && selected && (
        <div className="rounded-xl border border-cyan/25 bg-cyan/[0.04] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="assist-section" className="text-sm font-semibold text-white/90">
              Section
            </label>
            <select
              id="assist-section"
              dir="auto"
              value={selected.id}
              onChange={(event) => {
                setSectionId(event.target.value);
                setDirect(null);
                clearProposal();
              }}
              className="min-w-0 max-w-full flex-1 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:outline-none"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>

          <div role="tablist" aria-label="How to edit" className="mt-3 flex gap-1 border-b border-white/10">
            {[
              ["change", "Describe a change"],
              ["direct", "Edit directly"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={editMode === value}
                onClick={() => {
                  setEditMode(value);
                  clearProposal();
                }}
                className={`px-3 py-2 text-xs font-semibold ${editMode === value ? "border-b-2 border-cyan text-cyan" : "text-white/50 hover:text-white/80"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {editMode === "change" ? (
            <div className="mt-3">
              <details className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <summary className="cursor-pointer text-xs text-white/60">Current text of this section</summary>
                <pre dir="auto" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/70">
                  {currentBody || "(empty)"}
                </pre>
              </details>
              <textarea
                aria-label="The change or the new text"
                dir="auto"
                value={change}
                maxLength={ASSISTANT_LIMITS.maxAssistNoteChars}
                onChange={(event) => setChange(event.target.value)}
                onKeyDown={(event) => {
                  if (!isCtrlEnter(event)) return;
                  event.preventDefault();
                  changeSection("add");
                }}
                placeholder="Write new text, or describe the change. e.g. Answers must be at most 2 lines. / أضف أنه يتحسن في العرض أمام الجمهور."
                className="mt-3 h-24 w-full resize-y rounded-lg border border-white/10 bg-black/50 p-3 text-sm text-white focus:border-cyan/50 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={polish} onChange={(event) => setPolish(event.target.checked)} className="accent-cyan" />
                  Polish with AI (matches the style, avoids duplicates and contradictions)
                </label>
                <div className="flex flex-wrap gap-2">
                  <AiButton busy={busy} disabled={!change.trim()} onClick={() => changeSection("add")} plain={!polish}>
                    Add to it
                  </AiButton>
                  <AiButton busy={busy} disabled={!change.trim()} onClick={() => changeSection("replace")} plain={!polish}>
                    Replace it
                  </AiButton>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <textarea
                aria-label={`Text of ${selected.label}`}
                dir="auto"
                value={direct ?? currentBody}
                onChange={(event) => setDirect(event.target.value)}
                spellCheck={false}
                className="h-48 w-full resize-y rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-sm leading-relaxed text-white focus:border-cyan/50 focus:outline-none"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={previewDirect}
                  disabled={direct === null || direct === currentBody}
                  className="rounded-lg border border-cyan/40 px-4 py-2 text-sm font-semibold text-cyan transition-colors hover:bg-cyan/10 disabled:opacity-40"
                >
                  Preview changes
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {proposal && (
        <ProposalCard
          proposal={proposal}
          sections={sections}
          busy={busy}
          onEdit={(edited) => setProposal((current) => ({ ...current, edited }))}
          onApply={apply}
          onMove={moveTo}
          onCancel={clearProposal}
        />
      )}
    </div>
  );
}

/** What the AI (or you) suggested: where it goes and exactly which lines change. */
function ProposalCard({ proposal, sections, busy, onEdit, onApply, onMove, onCancel }) {
  const { result, plan, note, edited } = proposal;
  const label = result.section?.label;
  const title = result.unchanged
    ? label
      ? `Already covered in «${label}»`
      : "Already covered"
    : result.section.isNew
      ? `New section «${label}»`
      : result.removed.length > 0
        ? `Will change «${label}»`
        : `Will be added to «${label}»`;
  const canMove = Boolean(note) && !result.section?.isNew;

  return (
    <div role="region" aria-label="Suggested change" className="rounded-xl border border-white/15 bg-black/40 p-4">
      <p className="text-sm font-semibold text-cyan" dir="auto">
        {title}
      </p>
      {plan.explanation && (
        <p className="mt-1 text-xs text-white/60" dir="auto">
          {plan.explanation}
        </p>
      )}

      {!result.unchanged && (
        <div className="mt-3 overflow-hidden rounded-lg border border-white/10 font-mono text-xs leading-relaxed">
          {result.removed.map((line, index) => (
            <p key={`r${index}`} dir="auto" className="whitespace-pre-wrap bg-red-500/10 px-3 py-1 text-red-200/90 line-through decoration-red-300/50">
              <span aria-hidden="true" className="me-2 select-none text-red-400 no-underline">−</span>
              {line || " "}
            </p>
          ))}
          {edited === null ? (
            result.added.map((line, index) => (
              <p key={`a${index}`} dir="auto" className="whitespace-pre-wrap bg-emerald-500/10 px-3 py-1 text-emerald-100">
                <span aria-hidden="true" className="me-2 select-none text-emerald-400">+</span>
                {line || " "}
              </p>
            ))
          ) : (
            <textarea
              aria-label="Edit the new text"
              dir="auto"
              value={edited}
              onChange={(event) => onEdit(event.target.value)}
              className="block h-32 w-full resize-y bg-emerald-500/10 p-3 text-xs text-emerald-50 focus:outline-none"
            />
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!result.unchanged && (
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            className="rounded-lg bg-cyan px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-cyan/80 disabled:opacity-40"
          >
            Apply to draft
          </button>
        )}
        {!result.unchanged && edited === null && (
          <button
            type="button"
            onClick={() => onEdit(result.added.join("\n"))}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition-colors hover:border-white/40"
          >
            Edit the text
          </button>
        )}
        {canMove && (
          <select
            aria-label={result.unchanged ? "Add it anyway to a section" : "Put it in another section"}
            dir="auto"
            value=""
            disabled={busy}
            onChange={(event) => onMove(event.target.value)}
            className="rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-sm text-white/80"
          >
            <option value="">{result.unchanged ? "Add it anyway to…" : "Put it in another section…"}</option>
            {sections
              .filter((section) => section.id !== result.section?.id)
              .map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
          </select>
        )}
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-white/50 transition-colors hover:text-white">
          {result.unchanged ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
        active ? "border-cyan bg-cyan/15 text-cyan" : "border-white/15 text-white/80 hover:border-cyan/50 hover:text-cyan"
      }`}
    >
      {children}
    </button>
  );
}

function AiButton({ busy, disabled, onClick, plain = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/40 bg-cyan/10 px-3 py-2 text-sm font-semibold text-cyan transition-colors hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? (
        <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
      ) : (
        !plain && <span aria-hidden="true">✨</span>
      )}
      {busy ? "Thinking…" : children}
    </button>
  );
}
