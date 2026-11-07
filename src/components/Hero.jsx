"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import AskAiCard from "@/components/AskAiCard";
import { openAssistant } from "@/lib/assistant/events";
import { downloadCv } from "@/lib/cvClient";
import { scrollToId } from "@/lib/smoothScroll";

const secondaryButton =
  "inline-flex items-center gap-2 rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold text-white/85 transition-all hover:border-cyan/50 hover:text-cyan active:scale-95 disabled:opacity-50";

export default function Hero({ dict, lang, cvAvailable }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const fromStart = lang === "ar" ? 40 : -40;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadCv();
    } catch (error) {
      console.error("CV download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section className="relative grid w-full items-center gap-10 pt-6 lg:min-h-[78vh] lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
      <motion.div
        initial={{ opacity: 0, x: fromStart }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="space-y-6"
      >
        <p className="text-cyan tracking-widest uppercase text-sm font-semibold drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]">
          {dict.eyebrow}
        </p>
        <h1 className="text-6xl md:text-7xl font-bold text-white tracking-tight">
          {dict.titleFirst} <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan to-blue">{dict.titleLast}</span>
        </h1>
        <p className="text-lg md:text-xl font-semibold text-white/90">{dict.role}</p>
        <p className="max-w-xl text-muted text-base md:text-lg leading-relaxed">{dict.description}</p>

        <p className="inline-flex items-center gap-2.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {dict.status}
        </p>

        <dl className="grid max-w-xl grid-cols-3 gap-3">
          {dict.facts.map((fact) => (
            <div key={fact.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:px-4">
              <dt className="text-[11px] sm:text-xs leading-snug text-muted">{fact.label}</dt>
              <dd className="mt-1 font-mono text-base sm:text-lg font-bold text-white">
                {/* Keeps "4.51 / 5" in reading order on the Arabic site. */}
                <bdi dir="ltr">{fact.value}</bdi>
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={openAssistant}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-cyan to-blue px-6 py-3 text-sm font-bold text-[#050a15] shadow-[0_0_24px_rgba(0,229,255,0.35)] transition-all hover:brightness-110 hover:shadow-[0_0_32px_rgba(0,229,255,0.55)] active:scale-95"
          >
            <span aria-hidden="true">✦</span>
            {dict.ctaAsk}
          </button>
          {cvAvailable && (
            <button type="button" onClick={handleDownload} disabled={isDownloading} aria-busy={isDownloading} className={secondaryButton}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {dict.ctaCv}
            </button>
          )}
          <button type="button" onClick={() => scrollToId("contact")} className={secondaryButton}>
            {dict.ctaContact}
          </button>
        </div>
        <button
          type="button"
          onClick={() => scrollToId("logs")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan/90 transition-colors hover:text-white"
        >
          {dict.ctaProjects}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
          </svg>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -fromStart }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
        className="w-full max-w-md lg:justify-self-end"
      >
        <AskAiCard dict={dict.aiCard} />
      </motion.div>
    </section>
  );
}
