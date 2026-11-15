"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";

import ProjectImage from "@/components/projects/ProjectImage";
import ProjectLinks from "@/components/projects/ProjectLinks";
import { lerpQuad, quadTransform, rectQuad } from "@/lib/explore/homography";
import { format } from "@/lib/i18n";

const OPEN_MS = 680;
const CLOSE_MS = 480;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Where the panel ends up: centred on wide screens, a sheet along the bottom on narrow ones. */
function finalBox(contentHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 640) {
    const height = Math.min(contentHeight, vh * 0.88);
    return { left: 0, top: vh - height, width: vw, height };
  }
  const width = Math.min(680, vw - 48);
  const height = Math.min(contentHeight, vh * 0.84);
  return { left: (vw - width) / 2, top: Math.max(24, (vh - height) / 2), width, height };
}

const boxQuad = (box) => rectQuad(box.left, box.top, box.width, box.height);

/**
 * A project's details, opened inside the city. It unfolds out of the building's
 * screen: the panel starts drawn onto the screen's four corners (`getQuad()`, in
 * pixels, read every frame while the camera settles) and opens out to its own
 * place, and folds back into the screen when closed. It is plain HTML, so the
 * text stays sharp, selectable and right-to-left in Arabic.
 *
 * The unfolding answers the visitor's own click, so it plays for everyone; with
 * `calm` (reduced motion) it is only quicker. Without a screen to start from it
 * fades in. `onClosing` runs as it starts to fold away, `onClosed` once it has.
 * `note` is what the guide robot says about the project, if anything.
 */
export default function ExploreDetail({ lang, dict, cardDict, guideName, note, stop, index, total, getQuad, calm, onClosing, onClosed }) {
  const panelRef = useRef(null);
  const contentRef = useRef(null);
  const glowRef = useRef(null);
  const backdropRef = useRef(null);
  const closeRef = useRef(null);
  const boxRef = useRef(null);
  const frameRef = useRef(0);
  const closingRef = useRef(false);
  const openMs = calm ? OPEN_MS * 0.7 : OPEN_MS;
  const closeMs = calm ? CLOSE_MS * 0.75 : CLOSE_MS;

  /** Moves the panel from quad `from` to quad `to` (either may be a function, read every frame). */
  const animate = (from, to, duration, onDone, { opening }) => {
    const panel = panelRef.current;
    const box = boxRef.current;
    if (!panel || !box) return;
    const startedAt = performance.now();
    const read = (quad) => (typeof quad === "function" ? quad() : quad);
    cancelAnimationFrame(frameRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const e = ease(t);
      const a = read(from);
      const b = read(to);
      // How open the panel is: 0 on the screen, 1 in its place.
      const open = opening ? e : 1 - e;
      if (a && b) {
        panel.style.transform = quadTransform(box.width, box.height, lerpQuad(a, b, e));
        panel.style.opacity = String(opening ? Math.min(1, 0.35 + t * 2) : Math.min(1, (1 - t) * 3));
      } else {
        panel.style.transform = quadTransform(box.width, box.height, boxQuad(box));
        panel.style.opacity = String(open);
      }
      // The screen's light fades as the panel opens; the text fades in once it is nearly open.
      if (glowRef.current) glowRef.current.style.opacity = String((1 - open) * 0.85);
      if (contentRef.current) contentRef.current.style.opacity = String(opening ? Math.max(0, (t - 0.45) / 0.55) : Math.max(0, 1 - t * 2.2));
      if (backdropRef.current) backdropRef.current.style.opacity = String(open);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else onDone?.();
    };
    frameRef.current = requestAnimationFrame(step);
  };

  // Measure where the panel goes, then unfold it out of the screen, before the first paint.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content) return undefined;
    const place = () => {
      const box = finalBox(content.scrollHeight + 2);
      boxRef.current = box;
      panel.style.width = `${box.width}px`;
      panel.style.height = `${box.height}px`;
      return box;
    };
    const box = place();
    const start = getQuad?.();
    panel.style.transform = quadTransform(box.width, box.height, start ?? boxQuad(box));
    panel.style.opacity = start ? "0.35" : "0";
    panel.style.visibility = "visible";
    animate(start ? getQuad : null, boxQuad(box), openMs, () => closeRef.current?.focus({ preventScroll: true }), { opening: true });

    // A turned phone or a resized window: move the open panel to its new place.
    const onResize = () => {
      if (closingRef.current) return;
      const next = place();
      panel.style.transform = quadTransform(next.width, next.height, boxQuad(next));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
    };
    // The panel opens once, when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClosing?.();
    const box = boxRef.current;
    animate(box ? boxQuad(box) : null, getQuad?.() ? getQuad : null, closeMs, onClosed, { opening: false });
  };

  // Esc closes the panel (and doesn't leave the city); Tab stays inside it.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = panelRef.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const date = stop.date ? new Date(`${stop.date}T00:00:00Z`) : null;
  const dateText =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)
      : stop.date;

  return (
    <div className="fixed inset-0 z-40">
      <div ref={backdropRef} aria-hidden="true" onClick={close} className="absolute inset-0 bg-[#02040c]/60 backdrop-blur-[2px]" style={{ opacity: 0 }} />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="explore-detail-title"
        className="fixed left-0 top-0 overflow-hidden rounded-2xl border border-cyan/30 bg-[#050A15]/95 shadow-[0_0_60px_rgb(var(--accent-cyan-rgb)/0.2)] backdrop-blur-xl"
        style={{ visibility: "hidden", transformOrigin: "0 0", width: "min(680px, 100vw)" }}
      >
        {/* Close, first in the tab order; it stays put while the content scrolls. */}
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label={dict.close}
          className="absolute end-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white/80 backdrop-blur transition-colors hover:text-cyan"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div
          ref={contentRef}
          className="h-full overflow-y-auto overscroll-contain [scrollbar-color:rgb(255_255_255/0.18)_transparent] [scrollbar-width:thin]"
          style={{ opacity: 0 }}
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/10 bg-black/50">
            <ProjectImage src={stop.imageUrl} alt={stop.title} sizes="(max-width: 700px) 100vw, 680px" unavailableLabel="" eager />
          </div>
          <div className="p-5 sm:p-7">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-widest text-cyan">
              <span>{format(cardDict.stop, { number: index + 1, total })}</span>
              {dateText && (
                <>
                  <span className="text-white/25">·</span>
                  <time dateTime={stop.date} className="text-white/60">
                    {dateText}
                  </time>
                </>
              )}
            </p>
            <h2 id="explore-detail-title" className="mt-2 text-2xl font-bold leading-snug text-white sm:text-3xl">
              {stop.title}
            </h2>
            {stop.inProgress && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {format(cardDict.inProgress, { progress: stop.progress })}
              </p>
            )}
            {stop.tags?.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label={dict.builtWith}>
                {stop.tags.map((tag) => (
                  <li key={tag} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/70">
                    {tag}
                  </li>
                ))}
              </ul>
            )}
            {note && (
              <p className="mt-5 rounded-xl border border-cyan/20 bg-cyan/[0.06] px-4 py-3 text-sm leading-relaxed text-white/85">
                <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-widest text-cyan">{guideName}</span>
                {note}
              </p>
            )}
            {stop.description && <p className="mt-5 leading-relaxed text-white/85">{stop.description}</p>}
            {stop.content && <p className="mt-4 whitespace-pre-wrap leading-relaxed text-white/75">{stop.content}</p>}
            <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-white/10 pt-5">
              <ProjectLinks githubUrl={stop.githubUrl} liveUrl={stop.liveUrl} dict={cardDict} />
              {stop.slug && (
                <Link
                  href={`/${lang}#log-${stop.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:text-cyan"
                >
                  {dict.mainSite}
                  <span aria-hidden="true" className="rtl:rotate-180">
                    →
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* The building screen's light, fading as the panel opens out of it */}
        <div
          ref={glowRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(var(--accent-cyan-rgb)/0.55),rgb(var(--accent-blue-rgb)/0.35)_60%,transparent)]"
          style={{ opacity: 0.85 }}
        />
      </section>
    </div>
  );
}
