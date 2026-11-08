"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

import CoreBot from "@/components/assistant/CoreBot";
import { askAssistant } from "@/lib/assistant/events";
import { ASSISTANT_LIMITS } from "@/lib/assistant/limits";

const DECK_SIZE = 3;
const MAX_TILT_DEG = 9;
const REST_TILT = { x: 5, y: 7 };
const SPRING = { stiffness: 170, damping: 18, mass: 0.6 };

// The question cards flip down into place one after another, and flip away
// (in reverse order) when the next set is shown.
const deckVariants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
  gone: { transition: { staggerChildren: 0.05, staggerDirection: -1 } },
};
const cardVariants = {
  hidden: { opacity: 0, rotateX: -88, y: -10 },
  shown: { opacity: 1, rotateX: 0, y: 0, transition: { type: "spring", stiffness: 210, damping: 19 } },
  gone: { opacity: 0, rotateX: 88, y: 10, transition: { duration: 0.2, ease: "easeIn" } },
};

const depth = (px) => ({ transform: `translateZ(${px}px)`, transformStyle: "preserve-3d" });

function toDecks(questions) {
  const decks = [];
  for (let start = 0; start < questions.length; start += DECK_SIZE) decks.push(questions.slice(start, start + DECK_SIZE));
  return decks.length > 0 ? decks : [[]];
}

/** Hero card that sends a question straight to the assistant, drawn in 3D. */
export default function AskAiCard({ dict, lang }) {
  const [question, setQuestion] = useState("");
  const [deckIndex, setDeckIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const cardRef = useRef(null);

  // The card rests leaning toward the page content, then follows the cursor.
  const lean = lang === "ar" ? 1 : -1;
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const hover = useMotionValue(0);
  const restY = REST_TILT.y * lean;
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [restY - MAX_TILT_DEG, restY + MAX_TILT_DEG]), SPRING);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [REST_TILT.x + MAX_TILT_DEG, REST_TILT.x - MAX_TILT_DEG]), SPRING);
  const glareX = useTransform(pointerX, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(pointerY, [-0.5, 0.5], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(380px circle at ${glareX}% ${glareY}%, rgba(0, 229, 255, 0.18), transparent 65%)`;
  const glareOpacity = useSpring(hover, SPRING);

  const decks = toDecks(dict.suggestions);
  const deck = decks[deckIndex % decks.length];

  const onPointerMove = (event) => {
    if (reduceMotion || event.pointerType === "touch" || !cardRef.current) return;
    const box = cardRef.current.getBoundingClientRect();
    pointerX.set((event.clientX - box.left) / box.width - 0.5);
    pointerY.set((event.clientY - box.top) / box.height - 0.5);
    hover.set(1);
  };
  const onPointerLeave = () => {
    pointerX.set(0);
    pointerY.set(0);
    hover.set(0);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    askAssistant(question, { source: "hero" });
    setQuestion("");
  };

  return (
    <div className="w-full" style={{ perspective: 1100 }}>
      <motion.div
        ref={cardRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative w-full rounded-2xl"
      >
        {/* Glass and glare are separate layers: a backdrop blur on the 3D container would flatten it. */}
        <div className="absolute inset-0 rounded-2xl border border-cyan/20 bg-glass shadow-[0_40px_80px_-30px_rgba(0,0,0,0.85),0_0_40px_rgba(0,229,255,0.08)] backdrop-blur-xl" />
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: glare, opacity: glareOpacity }} />
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan/60 to-transparent" />

        <div className="relative p-6 sm:p-7" style={{ transformStyle: "preserve-3d" }}>
          <div className="flex items-center gap-4" style={depth(50)}>
            <CoreBot size={58} floating />
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan">{dict.eyebrow}</p>
              <h2 className="text-xl font-bold text-white">{dict.title}</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted" style={depth(18)}>
            {dict.subtitle}
          </p>

          <form onSubmit={submit} className="mt-5 flex gap-2" style={depth(30)}>
            <label htmlFor="hero-ask" className="sr-only">
              {dict.title}
            </label>
            <input
              id="hero-ask"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={ASSISTANT_LIMITS.maxUserMessageChars}
              placeholder={dict.placeholder}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 transition-colors focus:border-cyan/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!question.trim()}
              className="shrink-0 rounded-xl bg-gradient-to-br from-cyan to-blue px-5 text-sm font-bold text-[#050a15] shadow-[0_8px_20px_-6px_rgba(0,229,255,0.6)] transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {dict.send}
            </button>
          </form>

          <div className="mt-5 min-h-[10.75rem]" style={depth(24)}>
            <AnimatePresence mode="wait" initial>
              <motion.ul
                key={deckIndex}
                variants={deckVariants}
                initial="hidden"
                animate="shown"
                exit="gone"
                className="flex flex-col gap-3"
                style={{ transformStyle: "preserve-3d" }}
              >
                {deck.map((suggestion, index) => (
                  <motion.li key={suggestion} variants={cardVariants} style={{ transformOrigin: "50% 0%", transformStyle: "preserve-3d" }}>
                    <SuggestionCard
                      text={suggestion}
                      number={(deckIndex % decks.length) * DECK_SIZE + index + 1}
                      reduceMotion={reduceMotion}
                      onAsk={(text) => askAssistant(text, { source: "hero" })}
                    />
                  </motion.li>
                ))}
              </motion.ul>
            </AnimatePresence>
          </div>

          {decks.length > 1 && (
            <button
              type="button"
              onClick={() => setDeckIndex((index) => index + 1)}
              className="group mt-2 inline-flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-cyan/80 transition-colors hover:text-cyan"
              style={depth(20)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" aria-hidden="true">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
              </svg>
              {dict.more}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/** A question drawn as a thick 3D tile that lifts toward the viewer on hover. */
function SuggestionCard({ text, number, reduceMotion, onAsk }) {
  return (
    <motion.button
      type="button"
      onClick={() => onAsk(text)}
      whileHover={reduceMotion ? undefined : { z: 26, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      style={{ transformStyle: "preserve-3d" }}
      className="group relative block w-full text-start"
    >
      {/* The tile's edge: a slab just behind and below the face. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-xl bg-gradient-to-b from-cyan/45 to-blue/45"
        style={{ transform: "translateZ(-12px) translateY(5px)" }}
      />
      <span className="relative flex items-center gap-3 rounded-xl border border-cyan/25 bg-[#0c1626] px-3.5 py-3 text-sm text-white/85 shadow-[0_14px_28px_-12px_rgba(0,0,0,0.9)] transition-colors duration-200 group-hover:border-cyan/70 group-hover:bg-[#10203a] group-hover:text-white">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan/15 font-mono text-[11px] font-bold text-cyan">
          {String(number).padStart(2, "0")}
        </span>
        <span className="flex-1">{text}</span>
        <span aria-hidden="true" className="text-lg leading-none text-cyan/70 rtl:rotate-180">
          ›
        </span>
      </span>
    </motion.button>
  );
}
