"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";

import CoreBot from "@/components/assistant/CoreBot";
import { askAssistant } from "@/lib/assistant/events";
import { ASSISTANT_LIMITS } from "@/lib/assistant/limits";

const DECK_SIZE = 3;
// The card rests leaning toward the page content, then turns to face the cursor.
const REST_TILT = { x: 5, y: 7 };
const MAX_TILT_DEG = 10;
// The cursor starts to pull on the card this far (px) outside its edge.
const REACH_PX = 320;
// The robot's eyes turn fully toward a cursor this far (px) away, and less when it is closer.
const LOOK_RANGE_PX = 240;
// How far (px) the card rises toward the viewer while the cursor is over it.
const HOVER_LIFT_PX = 28;
// On touch screens the card turns this far (degrees) either way as it scrolls past,
// and its rim glows this brightly (0 to 1) while it is in the middle of the screen.
const SCROLL_TILT_DEG = 12;
const SCROLL_GLOW = 0.8;
const TILT_SPRING = { stiffness: 150, damping: 17, mass: 0.7 };
const LIGHT_SPRING = { stiffness: 260, damping: 28 };

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

const clampUnit = (value) => Math.max(-1, Math.min(1, value));

// 1 when the cursor is on the card, easing smoothly to 0 at REACH_PX away from it.
function nearnessAt(gap) {
  const t = Math.min(1, gap / REACH_PX);
  return 1 - t * t * (3 - 2 * t);
}

function toDecks(questions) {
  const decks = [];
  for (let start = 0; start < questions.length; start += DECK_SIZE) decks.push(questions.slice(start, start + DECK_SIZE));
  return decks.length > 0 ? decks : [[]];
}

/**
 * Hero card that sends a question straight to the assistant, drawn in 3D.
 * As the cursor comes near, the card turns toward it, its rim lights up on the
 * side facing the cursor and the robot's eyes follow it; over the card, it lifts
 * and a light follows the cursor across the glass. Touch screens have no cursor,
 * so there the card turns toward the middle of the screen as the page scrolls,
 * with the light and the robot's eyes following. These effects only move with
 * the visitor's own mouse or scrolling, so they stay on with reduced motion.
 */
export default function AskAiCard({ dict, lang }) {
  const [question, setQuestion] = useState("");
  const [deckIndex, setDeckIndex] = useState(0);
  const frameRef = useRef(null);
  const botRef = useRef(null);

  // Cursor readings, refreshed at most once per frame.
  const lookX = useMotionValue(0); // -1 (left) to 1 (right), weakened with distance
  const lookY = useMotionValue(0); // -1 (above) to 1 (below), weakened with distance
  const near = useMotionValue(0); // 0 far away, 1 on the card
  const over = useMotionValue(0); // 1 while the cursor is on the card
  const lightX = useMotionValue(0); // cursor position relative to the card, px
  const lightY = useMotionValue(0);
  const eyeX = useMotionValue(0); // where the robot looks, -1 to 1
  const eyeY = useMotionValue(0);

  const restY = REST_TILT.y * (lang === "ar" ? 1 : -1);
  const rotateY = useSpring(useTransform(lookX, (value) => restY + value * MAX_TILT_DEG), TILT_SPRING);
  const rotateX = useSpring(useTransform(lookY, (value) => REST_TILT.x - value * MAX_TILT_DEG), TILT_SPRING);
  const lift = useSpring(useTransform(over, [0, 1], [0, HOVER_LIFT_PX]), TILT_SPRING);

  const smoothX = useSpring(lightX, LIGHT_SPRING);
  const smoothY = useSpring(lightY, LIGHT_SPRING);
  const rimOpacity = useSpring(near, LIGHT_SPRING);
  const sheenOpacity = useSpring(useTransform([near, over], ([nearness, isOver]) => Math.max(isOver, nearness * 0.4)), LIGHT_SPRING);
  const rim = useMotionTemplate`radial-gradient(260px circle at ${smoothX}px ${smoothY}px, rgb(var(--accent-cyan-rgb) / 0.95), rgb(var(--accent-blue-rgb) / 0.5) 35%, transparent 70%)`;
  const sheen = useMotionTemplate`radial-gradient(420px circle at ${smoothX}px ${smoothY}px, rgb(var(--accent-cyan-rgb) / 0.16), transparent 62%)`;

  const botLookX = useSpring(eyeX, LIGHT_SPRING);
  const botLookY = useSpring(eyeY, LIGHT_SPRING);
  const botTurn = useTransform(botLookX, (value) => value * 6);

  useEffect(() => {
    const frameEl = frameRef.current;
    if (!frameEl) return undefined;

    let frame = 0;
    let pointer = null;
    // Phones and tablets: the main input cannot hover, so the card follows scrolling instead.
    const noHover = window.matchMedia("(hover: none)");

    const followCursor = () => {
      const box = frameEl.getBoundingClientRect();
      const halfWidth = box.width / 2;
      const halfHeight = box.height / 2;
      const dx = pointer.x - (box.left + halfWidth);
      const dy = pointer.y - (box.top + halfHeight);
      // Distance from the card's edge (0 while the cursor is on the card).
      const gap = Math.hypot(Math.max(0, Math.abs(dx) - halfWidth), Math.max(0, Math.abs(dy) - halfHeight));
      const nearness = nearnessAt(gap);

      lookX.set(clampUnit(dx / halfWidth) * nearness);
      lookY.set(clampUnit(dy / halfHeight) * nearness);
      near.set(nearness);
      over.set(gap === 0 ? 1 : 0);
      lightX.set(pointer.x - box.left);
      lightY.set(pointer.y - box.top);

      const bot = botRef.current?.getBoundingClientRect();
      if (bot) {
        const bx = pointer.x - (bot.left + bot.width / 2);
        const by = pointer.y - (bot.top + bot.height / 2);
        const distance = Math.hypot(bx, by) || 1;
        const reach = Math.min(1, distance / LOOK_RANGE_PX);
        eyeX.set((bx / distance) * reach);
        eyeY.set((by / distance) * reach);
      }
    };

    const followScroll = () => {
      const box = frameEl.getBoundingClientRect();
      const middle = window.innerHeight / 2;
      // The card makes its whole turn while most of it is on screen (until a quarter
      // of it is past the edge). On a phone the card nearly fills the screen, so
      // spreading the turn over its whole trip would leave it almost still.
      const room = Math.max(120, (window.innerHeight - box.height) / 2 + box.height / 4);
      // Where the middle of the screen is, seen from the card: -1 while the card is
      // coming in at the bottom, 0 when it is centred, 1 as it leaves at the top.
      const travel = clampUnit((middle - (box.top + box.height / 2)) / room);

      lookX.set(0);
      lookY.set((travel * SCROLL_TILT_DEG) / MAX_TILT_DEG);
      near.set((1 - travel * travel) * SCROLL_GLOW);
      over.set(0);
      // The light runs along the screen's middle line as it crosses the card.
      lightX.set(box.width / 2);
      lightY.set(Math.max(0, Math.min(box.height, middle - box.top)));
      eyeX.set(0);
      eyeY.set(travel);
    };

    const update = () => {
      frame = 0;
      if (pointer) followCursor();
      else if (noHover.matches) followScroll();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onMove = (event) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };
    // The cursor left the window: settle back into the resting pose.
    const onOut = (event) => {
      if (event.relatedTarget || event.pointerType === "touch") return;
      pointer = null;
      for (const value of [lookX, lookY, near, over, eyeX, eyeY]) value.set(0);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    // Scrolling moves the card under a still cursor, or past the middle of a touch screen.
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("pointerout", onOut);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("pointerout", onOut);
    };
  }, [lookX, lookY, near, over, lightX, lightY, eyeX, eyeY]);

  const decks = toDecks(dict.suggestions);
  const deck = decks[deckIndex % decks.length];

  const submit = (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    askAssistant(question, { source: "hero" });
    setQuestion("");
  };

  return (
    // The card's motion is small and driven by the visitor, so it plays even with reduced motion.
    <MotionConfig reducedMotion="never">
      <div ref={frameRef} className="w-full" style={{ perspective: 1100 }}>
        <motion.div style={{ rotateX, rotateY, z: lift, transformStyle: "preserve-3d" }} className="relative w-full rounded-2xl">
          {/* Glass and lights are separate layers: a backdrop blur on the 3D container would flatten it. */}
          <div className="absolute inset-0 rounded-2xl border border-cyan/20 bg-glass shadow-[0_40px_80px_-30px_rgba(0,0,0,0.85),0_0_40px_rgb(var(--accent-cyan-rgb)/0.08)] backdrop-blur-xl" />
          <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: sheen, opacity: sheenOpacity }} />
          {/* The rim lights up on the side nearest the cursor, even before the cursor reaches the card. */}
          <motion.div
            aria-hidden="true"
            className="glow-ring pointer-events-none absolute inset-0 rounded-2xl p-[1.5px]"
            style={{ background: rim, opacity: rimOpacity, z: 1 }}
          />
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan/60 to-transparent" />

          <div className="relative p-6 sm:p-7" style={{ transformStyle: "preserve-3d" }}>
            <div className="flex items-center gap-4" style={depth(50)}>
              <motion.span
                ref={botRef}
                className="inline-flex shrink-0"
                style={{ rotate: botTurn, "--bot-look-x": botLookX, "--bot-look-y": botLookY }}
              >
                <CoreBot size={58} floating />
              </motion.span>
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
                className="shrink-0 rounded-xl bg-gradient-to-br from-cyan to-blue px-5 text-sm font-bold text-[#050a15] shadow-[0_8px_20px_-6px_rgb(var(--accent-cyan-rgb)/0.6)] transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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
                        onAsk={(text) => askAssistant(text, { source: "hero" })}
                      />
                    </motion.li>
                  ))}
                </motion.ul>
              </AnimatePresence>
            </div>

            {decks.length > 1 && (
              <motion.button
                type="button"
                onClick={() => setDeckIndex((index) => index + 1)}
                initial="rest"
                animate="rest"
                whileHover="hover"
                className="mt-2 inline-flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-cyan/80 transition-colors hover:text-cyan"
                style={{ z: 20, transformStyle: "preserve-3d" }}
              >
                <motion.svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                  variants={{ rest: { rotate: 0 }, hover: { rotate: 180 } }}
                  transition={{ type: "spring", stiffness: 160, damping: 16 }}
                >
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                </motion.svg>
                {dict.more}
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}

/** A question drawn as a thick 3D tile that lifts toward the viewer on hover. */
function SuggestionCard({ text, number, onAsk }) {
  return (
    <motion.button
      type="button"
      onClick={() => onAsk(text)}
      whileHover={{ z: 26, y: -2 }}
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
