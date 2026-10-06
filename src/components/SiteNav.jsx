"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { clearHash, scrollToId, scrollToY } from "@/lib/smoothScroll";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

const itemClass =
  "shrink-0 whitespace-nowrap text-xs sm:text-sm font-bold tracking-wider uppercase text-white/80 px-2 sm:px-3 py-1.5 rounded-lg transition-all duration-200 hover:text-cyan hover:bg-cyan/15 hover:shadow-[0_0_16px_rgba(0,229,255,0.35)] active:scale-95";

export default function SiteNav({ lang, dict, projectsDict }) {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [publishedSlugs, setPublishedSlugs] = useState(new Set());
  const menuRef = useRef(null);

  const toggleLang = lang === "en" ? "/ar" : "/en";
  const toggleText = lang === "en" ? "عربي" : "English";

  useEffect(() => {
    const load = async () => {
      try {
        const [projectDoc, postSnap] = await Promise.all([
          getDoc(doc(db, "settings", "projects")),
          getDocs(collection(db, "posts")),
        ]);
        const rows = Array.isArray(projectDoc.data()?.items) ? projectDoc.data().items : [];
        setProjects([...rows].sort((a, b) => (a.order || 0) - (b.order || 0)));
        const slugs = new Set();
        postSnap.forEach((entry) => {
          if (entry.data().slug) slugs.add(entry.data().slug);
        });
        setPublishedSlugs(slugs);
      } catch (error) {
        console.error("Error loading project menu:", error);
      }
    };
    load();
    const started = performance.now();
    const clearId = window.setInterval(() => {
      clearHash();
      if (!window.location.hash || performance.now() - started > 5000) window.clearInterval(clearId);
    }, 300);
    return () => window.clearInterval(clearId);
  }, []);

  useEffect(() => {
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
  }, []);

  if (!dict) return null;

  const goTo = (id, fallbackId) => {
    scrollToId(id, fallbackId);
    setIsOpen(false);
  };

  const nameOf = (project) => (lang === "ar" ? project.arName : project.enName) || project.enName || project.arName;

  return (
    <nav className="fixed top-0 inset-x-0 z-40 px-3 sm:px-6 pt-3">
      <div className="max-w-7xl mx-auto flex min-w-0 items-center gap-2 sm:gap-3 rounded-2xl border border-white/10 bg-[#050A15]/75 backdrop-blur-xl px-2 sm:px-4 py-2.5 shadow-[0_0_30px_rgba(0,229,255,0.08)]">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button type="button" onClick={() => scrollToY(0)} className="font-bold text-lg tracking-wider text-white transition-all duration-200 hover:text-cyan hover:drop-shadow-[0_0_8px_rgba(0,229,255,0.6)] active:scale-90">T.A</button>
          <Link
            href={`/${lang}/admin`}
            className="text-white/20 hover:text-red-500 transition-colors duration-300 flex items-center justify-center hover:scale-110"
            title="Restricted Access"
            aria-label="Restricted Access"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </Link>
        </div>

        <div className="relative flex min-w-0 flex-1 items-center" ref={menuRef}>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => goTo("cv")} className={itemClass}>{dict.cv}</button>
          <button type="button" onClick={() => goTo("log-coop", "logs")} className={itemClass}>{dict.coop}</button>

          <div className="relative">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setIsOpen((open) => !open)}
              className={`${itemClass} inline-flex items-center gap-1.5 ${isOpen ? "text-cyan bg-cyan/15 shadow-[0_0_16px_rgba(0,229,255,0.35)]" : ""}`}
            >
              {dict.projects}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          </div>

            {isOpen && (
              <div className="absolute top-full z-50 mt-3 w-72 max-w-[calc(100vw-1.5rem)] start-0 rounded-xl border border-cyan/20 bg-[#050A15]/95 backdrop-blur-xl p-3 shadow-[0_0_24px_rgba(0,229,255,0.18)]">
                {projects.length === 0 ? (
                  <p className="text-white/40 text-xs font-mono text-center py-4">{projectsDict?.emptyProjects}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {projects.map((project) => {
                      const progress = Math.max(0, Math.min(100, Number(project.progress) || 0));
                      const isComplete = progress === 100;
                      const canOpen = isComplete && project.slug && publishedSlugs.has(project.slug);
                      const label = nameOf(project);
                      const rowClass = "block rounded-lg px-3 py-2 transition-all duration-200 hover:bg-cyan/15 hover:shadow-[0_0_14px_rgba(0,229,255,0.28)]";
                      const openClass = `${rowClass} w-full text-start active:scale-[0.97]`;

                      const body = (
                        <>
                          <span className="flex items-center justify-between gap-3 mb-1.5">
                            <span className={`text-sm ${canOpen ? "text-white" : "text-white/80"}`}>{label}</span>
                            <span className={`text-[10px] font-mono ${isComplete ? "text-cyan" : "text-white/40"}`}>{progress}%</span>
                          </span>
                          <span className="block h-1 w-full rounded-full bg-white/10 overflow-hidden">
                            <span
                              className="block h-full rounded-full bg-cyan"
                              style={{ width: `${progress}%` }}
                            />
                          </span>
                        </>
                      );

                      return (
                        <li key={project.id}>
                          {canOpen ? (
                            <button type="button" onClick={() => goTo(`log-${project.slug}`)} className={openClass}>
                              {body}
                            </button>
                          ) : (
                            <div className={rowClass}>{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
        </div>

        <Link
          href={toggleLang}
          className="shrink-0 whitespace-nowrap text-cyan text-xs sm:text-sm font-mono border border-cyan/50 px-2 sm:px-3 py-1.5 rounded-lg bg-glass backdrop-blur-md transition-all duration-200 hover:bg-cyan/15 hover:shadow-[0_0_16px_rgba(0,229,255,0.35)]"
        >
          {toggleText}
        </Link>
      </div>
    </nav>
  );
}
