"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

import { format } from "@/lib/i18n";

const panel = "rounded-2xl border border-white/10 bg-[#050A15]/80 shadow-[0_0_40px_rgb(0_0_0/0.45)] backdrop-blur-xl";
const chip = "rounded-full border border-white/10 bg-[#050A15]/70 backdrop-blur-xl";
const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-cyan to-blue px-4 py-2 text-xs font-bold text-[#050a15] transition-all hover:brightness-110 active:scale-95";
const ghostButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/85 transition-all hover:border-cyan/50 hover:text-cyan active:scale-95";
const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-white/80 transition-all hover:border-cyan/50 hover:text-cyan active:scale-95";
const roundButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#050A15]/75 text-white/85 shadow-[0_0_18px_rgb(0_0_0/0.35)] backdrop-blur-xl transition-all hover:border-cyan/50 hover:text-cyan active:scale-95";

const fade = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 }, transition: { duration: 0.25, ease: "easeOut" } };

/** The part of the city the visitor is in (a key of dict.districts). */
function districtOf(stage, tour) {
  if (stage.kind === "intro") return "start";
  if (stage.kind === "finale") return "frontier";
  return tour.stops[stage.index]?.district ?? "frontier";
}

/** "2023-12-05" as "Dec 2023" (or the Arabic month, with the same digits as the rest of the site). */
function monthAndYear(date, lang) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en", { month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function Chevron({ back = false }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${back ? "rotate-180 rtl:rotate-0" : "rtl:rotate-180"}`} aria-hidden="true">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}

function SpeakerIcon({ on }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
      />
      {on ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25" />
      )}
    </svg>
  );
}

/**
 * Everything drawn over the 3D city: the Exit button, the tour's progress, the
 * guide's speech bubble, the card of the stop in view, the sound, graphics and
 * recentre controls, and the end screen. `bubbleRef` and `barRef` are moved every
 * frame by ExploreMode. While a project's details are open (`hidden`), it fades
 * back and can't be reached.
 */
export default function ExploreHud({
  lang,
  dict,
  tour,
  stage,
  ready,
  hidden,
  touch,
  slow,
  onDismissSlow,
  onFlyTo,
  onOpenDetails,
  bubbleRef,
  barRef,
  line,
  turned,
  onRecentre,
  dragHint,
  soundAvailable,
  soundOn,
  onSound,
  quality,
  onQuality,
}) {
  const total = tour.stops.length;
  const stop = stage.kind === "stop" ? tour.stops[stage.index] : null;
  const district = dict.districts[districtOf(stage, tour)];
  // The last stop the visitor has reached, for the dots at the top.
  const reached = stage.kind === "finale" ? total : stage.kind === "stop" ? stage.index : stage.kind === "cruise" ? stage.index - 1 : -1;
  const otherLang = lang === "en" ? "ar" : "en";
  const controls = dict.controls;

  return (
    <div inert={hidden} className={ready ? `transition-opacity duration-500 ${hidden ? "opacity-30" : "opacity-100"}` : "pointer-events-none opacity-0"}>
      {/* How far along the street the visitor is */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[3px] bg-white/5">
        <div ref={barRef} className="h-full origin-left scale-x-0 bg-gradient-to-r from-cyan to-blue shadow-[0_0_10px_rgb(var(--accent-cyan-rgb)/0.6)] rtl:origin-right rtl:bg-gradient-to-l" />
      </div>

      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 pt-4 sm:gap-3 sm:p-4 sm:pt-5">
        {/* The way out, always in reach */}
        <Link
          href={`/${lang}`}
          className="group pointer-events-auto relative inline-flex shrink-0 overflow-hidden rounded-full p-[1.5px] shadow-[0_0_22px_rgb(var(--accent-cyan-rgb)/0.28)] transition-transform hover:scale-[1.04] active:scale-95"
        >
          <span aria-hidden="true" className="explore-exit-ring absolute inset-[-120%]" />
          <span className="relative inline-flex items-center gap-2 rounded-full bg-[#050A15]/90 px-3.5 py-2 text-sm font-bold text-white backdrop-blur-xl transition-colors group-hover:text-cyan sm:px-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-4 w-4 rtl:rotate-180" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            <span className="sm:hidden">{dict.exit}</span>
            <span className="hidden sm:inline">{dict.exitLong}</span>
          </span>
        </Link>

        {/* One dot per stop; the last one is the end of the street */}
        <nav aria-label={dict.a11y.timeline} className={`${chip} pointer-events-auto hidden items-center gap-1.5 px-3 py-2.5 md:flex`}>
          {tour.stops.map((item, index) => {
            const active = stop === item;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onFlyTo(index)}
                title={item.title}
                aria-label={format(dict.a11y.goTo, { title: item.title })}
                aria-current={active ? "step" : undefined}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  active ? "w-7 bg-cyan shadow-[0_0_10px_rgb(var(--accent-cyan-rgb)/0.7)]" : index <= reached ? "w-2.5 bg-cyan/60 hover:bg-cyan" : "w-2.5 bg-white/25 hover:bg-white/60"
                }`}
              />
            );
          })}
          <button
            type="button"
            onClick={() => onFlyTo(total)}
            title={dict.districts.frontier}
            aria-label={dict.a11y.end}
            className={`h-2.5 w-2.5 rotate-45 rounded-[2px] transition-all duration-300 ${stage.kind === "finale" ? "scale-125 bg-cyan shadow-[0_0_10px_rgb(var(--accent-cyan-rgb)/0.7)]" : "bg-white/25 hover:bg-white/60"}`}
          />
        </nav>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <p className={`${chip} max-w-[38vw] truncate px-3 py-1.5 font-mono text-[11px] tracking-wide text-white/80 sm:max-w-[46vw] sm:text-xs`}>
            <span className="text-cyan">{district}</span>
            {stop && (
              <bdi dir="ltr" className="ms-2 text-white/50">
                {stage.index + 1}/{total}
              </bdi>
            )}
          </p>
          <Link
            href={`/${otherLang}/explore`}
            hrefLang={otherLang}
            lang={otherLang}
            className={`${chip} px-3 py-1.5 font-mono text-[11px] text-cyan transition-colors hover:bg-cyan/15 sm:text-xs`}
          >
            {lang === "en" ? "عربي" : "English"}
          </Link>
        </div>
      </header>

      {/* Sound, graphics and (when the view is turned) recentre, down the side */}
      <div className="pointer-events-none fixed end-3 top-16 z-30 flex flex-col items-end gap-2 sm:end-4 sm:top-[4.75rem]">
        {soundAvailable && (
          <button
            type="button"
            onClick={onSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? controls.soundOff : controls.soundOn}
            title={soundOn ? controls.soundOff : controls.soundOn}
            className={`${roundButton} pointer-events-auto ${soundOn ? "text-cyan" : ""}`}
          >
            <SpeakerIcon on={soundOn} />
          </button>
        )}
        <div role="group" aria-label={controls.quality} title={controls.quality} className={`${chip} pointer-events-auto flex items-center p-1 font-mono text-[10px] uppercase tracking-wider`}>
          {["low", "high"].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onQuality(level)}
              aria-pressed={quality === level}
              className={`rounded-full px-2.5 py-1 transition-colors ${quality === level ? "bg-cyan/20 text-cyan" : "text-white/55 hover:text-white"}`}
            >
              {controls[level]}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {turned && (
            <motion.button
              key="recentre"
              type="button"
              {...fade}
              onClick={onRecentre}
              aria-label={controls.recentre}
              title={controls.recentre}
              className={`${roundButton} pointer-events-auto text-cyan`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* At the first stops: the view can be turned */}
      <AnimatePresence>
        {dragHint && (
          <motion.div key="drag" {...fade} aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-20 flex justify-center sm:top-24">
            <span className={`${chip} inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white/85`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="explore-drag h-4 w-4 text-cyan" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              {controls.dragHint}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* T.A Core's speech bubble, kept above the robot by ExploreMode */}
      <div ref={bubbleRef} className="pointer-events-none fixed left-0 top-0 z-20 will-change-transform" style={{ transform: "translate3d(-999px, -999px, 0)" }}>
        {/* Centred above the point it is moved to; the line itself pops in from its bottom edge. */}
        <div aria-live="polite" aria-atomic="true" className="-translate-x-1/2 -translate-y-full">
          <AnimatePresence mode="wait">
            {line?.text && (
              <motion.p
                key={line.id}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="w-max max-w-[min(280px,calc(100vw-24px))] origin-bottom rounded-2xl border border-cyan/30 bg-[#050A15]/85 px-3.5 py-2.5 text-[13px] leading-snug text-white shadow-[0_0_18px_rgb(var(--accent-cyan-rgb)/0.18)] backdrop-blur-md"
              >
                <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-widest text-cyan">{dict.guide.name}</span>
                {line.text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* The card of the stop in view, on the side away from its building */}
      <div aria-live="polite">
        <AnimatePresence mode="wait">
          {stop && (
            <motion.article
              key={stop.id}
              {...fade}
              className={`${panel} pointer-events-auto fixed inset-x-3 bottom-3 z-20 p-4 sm:bottom-6 sm:w-[400px] sm:p-5 ${stop.side > 0 ? "sm:left-6 sm:right-auto" : "sm:left-auto sm:right-6"}`}
            >
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-widest text-cyan">
                <span>{format(dict.card.stop, { number: stage.index + 1, total })}</span>
                {stop.date && (
                  <>
                    <span className="text-white/25">·</span>
                    <time dateTime={stop.date} className="text-white/60">
                      {monthAndYear(stop.date, lang)}
                    </time>
                  </>
                )}
              </p>
              <h2 className="mt-2 text-lg font-bold leading-snug text-white sm:text-xl">{stop.title}</h2>
              {stop.inProgress && (
                <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {format(dict.card.inProgress, { progress: stop.progress })}
                </p>
              )}
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted sm:line-clamp-4">{stop.description}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onOpenDetails(stage.index)} className={primaryButton}>
                  {dict.card.details}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </button>
                {stop.githubUrl && (
                  <a href={stop.githubUrl} target="_blank" rel="noopener noreferrer" className={ghostButton}>
                    {dict.card.github}
                  </a>
                )}
                {stop.liveUrl && (
                  <a href={stop.liveUrl} target="_blank" rel="noopener noreferrer" className={ghostButton}>
                    {dict.card.live}
                  </a>
                )}
                <span className="ms-auto flex gap-1.5">
                  <button type="button" onClick={() => onFlyTo(stage.index - 1)} aria-label={dict.card.previous} title={dict.card.previous} className={iconButton}>
                    <Chevron back />
                  </button>
                  <button type="button" onClick={() => onFlyTo(stage.index + 1)} aria-label={dict.card.next} title={dict.card.next} className={iconButton}>
                    <Chevron />
                  </button>
                </span>
              </div>
            </motion.article>
          )}
        </AnimatePresence>
      </div>

      {/* At the start: how to move */}
      <AnimatePresence>
        {stage.kind === "intro" && (
          <motion.div key="hint" {...fade} className="pointer-events-none fixed inset-x-0 bottom-8 z-20 flex flex-col items-center gap-3 text-center">
            <span className="flex h-10 w-6 justify-center rounded-full border-2 border-white/50 pt-1.5">
              <span className="explore-wheel h-2 w-1 rounded-full bg-cyan" />
            </span>
            <span className={`${chip} px-4 py-1.5 text-sm font-semibold text-white/90`}>{touch ? dict.hint.swipe : dict.hint.scroll}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* At the end of the street */}
      <AnimatePresence>
        {stage.kind === "finale" && (
          <motion.section key="finale" {...fade} className={`${panel} pointer-events-auto fixed inset-x-3 bottom-3 z-20 mx-auto max-w-xl p-5 text-center sm:bottom-8 sm:p-6`}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-cyan">{dict.finale.eyebrow}</p>
            <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">{dict.finale.title}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{dict.finale.text}</p>
            {tour.upcoming.length > 0 && (
              <ul className="mt-3 flex flex-wrap items-center justify-center gap-2" aria-label={dict.finale.upcoming}>
                {tour.upcoming.map((item) => (
                  <li key={item.id} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
                    {item.name}{" "}
                    <bdi dir="ltr" className="font-mono text-amber-300">
                      {item.progress}%
                    </bdi>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Link href={`/${lang}#contact`} className={`${primaryButton} px-5 py-2.5 text-sm`}>
                {dict.finale.contact}
              </Link>
              <Link href={`/${lang}`} className={`${ghostButton} px-4 py-2.5 text-sm`}>
                {dict.finale.classic}
              </Link>
              <button type="button" onClick={() => onFlyTo(-1)} className={`${ghostButton} px-4 py-2.5 text-sm`}>
                {dict.finale.replay}
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Shown once, if the city keeps running slowly even at the lowest quality */}
      <AnimatePresence>
        {slow && (
          <motion.div
            key="slow"
            role="status"
            {...fade}
            className={`${panel} pointer-events-auto fixed end-16 start-3 top-16 z-30 mx-auto flex max-w-md flex-wrap items-center justify-center gap-2 px-4 py-3 text-sm text-white/90 sm:inset-x-3 sm:top-20`}
          >
            <span className="me-1">{dict.slow.text}</span>
            <Link href={`/${lang}`} className={primaryButton}>
              {dict.slow.action}
            </Link>
            <button type="button" onClick={onDismissSlow} className={ghostButton}>
              {dict.slow.dismiss}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
