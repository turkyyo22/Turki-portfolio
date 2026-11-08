"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { askAssistant } from "@/lib/assistant/events";
import { format } from "@/lib/i18n";
import { clearHash, scrollToId, scrollToY } from "@/lib/smoothScroll";

const itemClass =
  "shrink-0 whitespace-nowrap text-xs sm:text-sm font-bold tracking-wider uppercase text-white/80 px-2 sm:px-3 py-1.5 rounded-lg transition-all duration-200 hover:text-cyan hover:bg-cyan/15 hover:shadow-[0_0_16px_rgba(0,229,255,0.35)] active:scale-95";

export default function SiteNav({ lang, dict, projects, publishedSlugs, askQuestionTemplate }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const lastLogoClick = useRef(0);
  const router = useRouter();
  const published = new Set(publishedSlugs);

  // "T.A" scrolls to the top. A quick second click (or tap) opens the admin
  // sign-in: a quiet way in that isn't advertised to visitors.
  const onLogoClick = () => {
    const now = Date.now();
    if (now - lastLogoClick.current < 450) {
      lastLogoClick.current = 0;
      router.push(`/${lang}/admin`);
      return;
    }
    lastLogoClick.current = now;
    scrollToY(0);
  };

  const otherLang = lang === "en" ? "ar" : "en";
  const toggleText = lang === "en" ? "عربي" : "English";

  // Old shared links may still carry a #hash; drop it once the page settles.
  useEffect(() => {
    const started = performance.now();
    const clearId = window.setInterval(() => {
      clearHash();
      if (!window.location.hash || performance.now() - started > 5000) window.clearInterval(clearId);
    }, 300);
    return () => window.clearInterval(clearId);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointer = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const goTo = (id, fallbackId) => {
    scrollToId(id, fallbackId);
    setIsOpen(false);
  };

  const nameOf = (project) => (lang === "ar" ? project.arName : project.enName) || project.enName || project.arName;

  const askAbout = (project) => {
    setIsOpen(false);
    askAssistant(format(askQuestionTemplate, { title: nameOf(project) }), { source: "nav" });
  };

  return (
    <nav aria-label="Main" className="fixed top-0 inset-x-0 z-40 px-3 sm:px-6 pt-3">
      <div className="max-w-7xl mx-auto flex min-w-0 items-center gap-2 sm:gap-3 rounded-2xl border border-white/10 bg-[#050A15]/75 backdrop-blur-xl px-2 sm:px-4 py-2.5 shadow-[0_0_30px_rgba(0,229,255,0.08)]">
        <button
          type="button"
          onClick={onLogoClick}
          aria-label={dict.home}
          className="shrink-0 touch-manipulation select-none font-bold text-lg tracking-wider text-white transition-all duration-200 hover:text-cyan hover:drop-shadow-[0_0_8px_rgba(0,229,255,0.6)] active:scale-90"
        >
          T.A
        </button>

        <div className="relative flex min-w-0 flex-1 items-center" ref={menuRef}>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button type="button" onClick={() => goTo("cv")} className={itemClass}>
              {dict.cv}
            </button>
            <button type="button" onClick={() => goTo("log-coop", "logs")} className={itemClass}>
              {dict.coop}
            </button>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls="projects-menu"
              onClick={() => setIsOpen((open) => !open)}
              className={`${itemClass} inline-flex items-center gap-1.5 ${isOpen ? "text-cyan bg-cyan/15 shadow-[0_0_16px_rgba(0,229,255,0.35)]" : ""}`}
            >
              {dict.projects}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            <button type="button" onClick={() => goTo("contact")} className={`${itemClass} hidden sm:inline-flex`}>
              {dict.contact}
            </button>
          </div>

          {isOpen && (
            <div
              id="projects-menu"
              className="absolute top-full z-50 mt-3 w-80 max-w-[calc(100vw-1.5rem)] start-0 rounded-xl border border-cyan/20 bg-[#050A15]/95 backdrop-blur-xl p-3 shadow-[0_0_24px_rgba(0,229,255,0.18)]"
            >
              {projects.length === 0 ? (
                <p className="text-white/60 text-xs font-mono text-center py-4">{dict.emptyProjects}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {projects.map((project) => {
                    const isComplete = project.progress === 100;
                    const canOpen = isComplete && project.slug && published.has(project.slug);
                    const label = nameOf(project);
                    const rowClass = "block min-w-0 flex-1 rounded-lg px-3 py-2 transition-all duration-200 hover:bg-cyan/15";

                    const body = (
                      <>
                        <span className="flex items-center justify-between gap-3 mb-1.5">
                          <span className={`truncate text-sm ${canOpen ? "text-white" : "text-white/80"}`}>{label}</span>
                          <span className={`shrink-0 text-[10px] font-mono ${isComplete ? "text-cyan" : "text-white/50"}`}>{project.progress}%</span>
                        </span>
                        <span className="block h-1 w-full rounded-full bg-white/10 overflow-hidden">
                          <span className="block h-full rounded-full bg-cyan" style={{ width: `${project.progress}%` }} />
                        </span>
                      </>
                    );

                    return (
                      <li key={project.id} className="flex items-center gap-1">
                        {canOpen ? (
                          <button type="button" onClick={() => goTo(`log-${project.slug}`)} className={`${rowClass} text-start active:scale-[0.98]`}>
                            {body}
                          </button>
                        ) : (
                          <div className={rowClass}>{body}</div>
                        )}
                        <button
                          type="button"
                          onClick={() => askAbout(project)}
                          aria-label={format(dict.askAboutProject, { name: label })}
                          title={format(dict.askAboutProject, { name: label })}
                          className="shrink-0 rounded-lg p-2 text-cyan/80 transition-colors hover:bg-cyan/15 hover:text-cyan"
                        >
                          <span aria-hidden="true">✦</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <Link
          href={`/${otherLang}`}
          hrefLang={otherLang}
          lang={otherLang}
          title={dict.switchLanguage}
          className="shrink-0 whitespace-nowrap text-cyan text-xs sm:text-sm font-mono border border-cyan/50 px-2 sm:px-3 py-1.5 rounded-lg bg-glass backdrop-blur-md transition-all duration-200 hover:bg-cyan/15 hover:shadow-[0_0_16px_rgba(0,229,255,0.35)]"
        >
          {toggleText}
        </Link>
      </div>
    </nav>
  );
}
