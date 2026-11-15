"use client";

import { useEffect, useRef, useState } from "react";

import { draftExploreLines } from "@/lib/adminApi";
import { EXPLORE_LINE_KINDS, EXPLORE_SIZES, LINE_MAX_CHARS, TAGLINE_MAX_CHARS } from "@/lib/content/normalize";
import { BUILDING_TYPES, districtOf, PLACES, sideStreetById } from "@/lib/explore/city";

const DISTRICT_NAMES = { start: "City Gate", old: "Old Town", mid: "Midtown", centre: "City Centre", new: "New District", frontier: "The Frontier" };
const ORDINALS = { j1: "1st", j2: "2nd", j3: "3rd" };
const LANDMARK_NAMES = { graduation: "the Academy on Graduation Square", coop: "the Bank tower on Co-op Square" };
const LANGS = [
  { key: "en", name: "English", dir: "ltr" },
  { key: "ar", name: "العربية", dir: "rtl" },
];
const KIND_LABELS = {
  arrival: { title: "Arriving", hint: "said when the visitor reaches the building" },
  fact: { title: "Facts", hint: "said when the visitor stays a while" },
  detail: { title: "Details", hint: "shown at the top of the project's details" },
};

/** "A2 · Old Town, main street (right) · studio" */
export function placeLabel(place) {
  const district = DISTRICT_NAMES[districtOf(place)] ?? "";
  let where = `main street (${place.side > 0 ? "right" : "left"})`;
  if (place.at !== "main") {
    const street = sideStreetById(place.at);
    where = `${street?.end === "square" ? "square" : "court"} off the ${ORDINALS[street?.junction] ?? ""} crossing (${street?.side > 0 ? "right" : "left"})`;
  }
  return `${place.id.toUpperCase()} · ${district}, ${where} · ${place.type}`;
}

const hasLines = (lines) =>
  ["en", "ar"].some((lang) => Object.keys(EXPLORE_LINE_KINDS).some((kind) => lines?.[lang]?.[kind]?.some((line) => line?.trim())) || lines?.[lang]?.tagline?.trim());

const inputClass = "w-full rounded-lg border border-white/10 bg-black/50 p-2 text-sm text-white focus:border-cyan/50 focus:outline-none";
const labelClass = "text-xs font-mono text-cyan";

/**
 * The "3D city" part of the post editor: where the post's building stands in
 * Explore mode, how it looks, and what the guide robot says about it. Every
 * field is optional; empty ones fall back to the city's own choices and the
 * robot's general lines.
 *
 * `value`: the post's `explore` settings (see normalizeExplore). `onChange(next)`
 * replaces them. `post`: the post being edited (its texts, tags, slug and date),
 * for the AI draft. `kind`: "graduation", "coop" or "project". `standsAt`: the
 * place id the city would give it now, and `pinnedBy`: a Map of place id to the
 * title of another post pinned there.
 */
export default function ExploreCityFields({ value, onChange, post, kind, standsAt, pinnedBy }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafted, setDrafted] = useState(false);
  const running = useRef(null);

  useEffect(() => () => running.current?.abort(), []);

  const landmark = kind === "graduation" || kind === "coop";
  const set = (patch) => onChange({ ...value, ...patch });
  const setLine = (lang, lineKind, index, text) => {
    const list = Array.from({ length: EXPLORE_LINE_KINDS[lineKind] }, (_, i) => value.lines?.[lang]?.[lineKind]?.[i] ?? "");
    list[index] = text;
    set({ lines: { ...value.lines, [lang]: { ...value.lines?.[lang], [lineKind]: list } } });
  };
  const setTagline = (lang, text) => set({ lines: { ...value.lines, [lang]: { ...value.lines?.[lang], tagline: text } } });

  const draft = async () => {
    if (hasLines(value.lines) && !window.confirm("Replace the robot's current lines with a new draft from the AI?")) return;
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError("");
    try {
      const lines = await draftExploreLines({ post, signal: controller.signal });
      onChange({ ...value, lines });
      setDrafted(true);
    } catch (failure) {
      if (failure?.name !== "AbortError") setError(failure?.message || "The AI couldn't write the lines. Try again.");
    } finally {
      if (running.current === controller) {
        running.current = null;
        setBusy(false);
      }
    }
  };

  const standing = landmark
    ? `Stands at ${LANDMARK_NAMES[kind]} (a landmark; it always stands there).`
    : standsAt
      ? `Stands at ${placeLabel(PLACES.find((place) => place.id === standsAt) ?? { id: standsAt, at: "main" })}${value.place ? "" : " (chosen by date)"}.`
      : "No free place left: the city holds up to 10 posts, so this one isn't shown.";

  return (
    <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
      <div>
        <h4 className={labelClass}>3D CITY · EXPLORE MODE</h4>
        <p className="mt-1 text-xs text-white/50">Where this post&apos;s building stands, how it looks, and what the guide robot says. All optional.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>PLACE</span>
          <select value={landmark ? "" : value.place} onChange={(event) => set({ place: event.target.value })} disabled={landmark} className={`${inputClass} mt-1 disabled:opacity-50`}>
            <option value="">Automatic (older projects first, newer after the milestones)</option>
            {PLACES.map((place) => (
              <option key={place.id} value={place.id}>
                {placeLabel(place)}
                {pinnedBy?.has(place.id) ? ` (pinned: ${pinnedBy.get(place.id)})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>BUILDING</span>
          <select value={value.type} onChange={(event) => set({ type: event.target.value })} disabled={landmark} className={`${inputClass} mt-1 disabled:opacity-50`}>
            <option value="">The place&apos;s own</option>
            {BUILDING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>SIZE</span>
          <select value={value.size} onChange={(event) => set({ size: event.target.value })} disabled={landmark} className={`${inputClass} mt-1 disabled:opacity-50`}>
            <option value="">The place&apos;s own</option>
            {EXPLORE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className={labelClass}>NEON COLOUR</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              aria-label="Neon colour"
              value={value.accent || "#ff3df2"}
              onChange={(event) => set({ accent: event.target.value })}
              className="h-9 w-12 cursor-pointer rounded border border-white/10 bg-black/50"
            />
            {value.accent ? (
              <button type="button" onClick={() => set({ accent: "" })} className="text-xs text-white/60 underline decoration-white/20 underline-offset-4 hover:text-cyan">
                Use the automatic colour
              </button>
            ) : (
              <span className="text-xs text-white/40">Automatic</span>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-white/50">{standing}</p>

      <div className="space-y-3 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h5 className={labelClass}>ROBOT LINES</h5>
            <p className="mt-0.5 text-xs text-white/50">Empty lines are fine: the robot then uses its general ones.</p>
          </div>
          <button
            type="button"
            onClick={draft}
            disabled={busy}
            className="rounded-lg border border-cyan/40 bg-cyan/10 px-3 py-2 text-xs font-bold text-cyan transition-colors hover:bg-cyan hover:text-black disabled:opacity-50"
          >
            {busy ? "Writing…" : hasLines(value.lines) ? "✨ Rewrite with AI" : "✨ Write with AI"}
          </button>
        </div>
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
        {drafted && !error && <p className="rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs text-cyan">Drafted by the AI from this post. Read each line, edit what you like, then save the log.</p>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {LANGS.map((lang) => (
            <fieldset key={lang.key} dir={lang.dir} className="space-y-3 rounded-lg border border-white/10 p-3">
              <legend className="px-1 text-xs font-bold text-white/70">{lang.name}</legend>
              {Object.entries(EXPLORE_LINE_KINDS).map(([lineKind, count]) => (
                <div key={lineKind} className="space-y-1.5">
                  <p className="text-[11px] text-white/60" dir="ltr">
                    <span className="font-bold text-white/80">{KIND_LABELS[lineKind].title}</span> · {KIND_LABELS[lineKind].hint}
                  </p>
                  {Array.from({ length: count }, (_, index) => (
                    <input
                      key={index}
                      type="text"
                      dir={lang.dir}
                      lang={lang.key}
                      maxLength={LINE_MAX_CHARS}
                      value={value.lines?.[lang.key]?.[lineKind]?.[index] ?? ""}
                      onChange={(event) => setLine(lang.key, lineKind, index, event.target.value)}
                      aria-label={`${lang.name}: ${KIND_LABELS[lineKind].title} ${index + 1}`}
                      className={inputClass}
                    />
                  ))}
                </div>
              ))}
              <label className="block space-y-1.5">
                <span className="block text-[11px] text-white/60" dir="ltr">
                  <span className="font-bold text-white/80">Tagline</span> · said when the building is clicked from afar
                </span>
                <input
                  type="text"
                  dir={lang.dir}
                  lang={lang.key}
                  maxLength={TAGLINE_MAX_CHARS}
                  value={value.lines?.[lang.key]?.tagline ?? ""}
                  onChange={(event) => setTagline(lang.key, event.target.value)}
                  className={inputClass}
                />
              </label>
            </fieldset>
          ))}
        </div>
      </div>
    </section>
  );
}
