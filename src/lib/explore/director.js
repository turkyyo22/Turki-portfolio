// The guide robot's "director": decides what T.A Core says, and how it moves,
// in reply to where the visitor is and what they do. A small table of rules,
// each with a condition, a pool of lines, a priority and a cooldown, so the robot
// reacts to the visitor without chattering. Pure: no DOM and no three.js.
//
// Lines come from two places: generic reactions written once in the site's
// dictionaries (dict.explore.guide), and each building's own lines, written by
// the owner's AI in the admin dashboard and saved with the post (stop.lines).

import { format } from "@/lib/i18n";

// What the robot does while it speaks (see guide.js).
export const MOODS = ["wave", "lead", "present", "point", "flinch", "dizzy", "look-back", "nod", "sleep", "wake", "celebrate", "aside"];

// Seconds before the same kind of reaction can come again.
const COOLDOWNS = {
  "click-guide": 0.7,
  fast: 14,
  backwards: 30,
  skip: 25,
  "idle-stop": 40,
  idle: 90,
  "click-stop": 4,
  "quality-lowered": 60,
};

const pickFrom = (list, random, avoid) => {
  const pool = (list ?? []).filter(Boolean);
  if (pool.length === 0) return "";
  if (pool.length === 1) return pool[0];
  const fresh = pool.filter((line) => line !== avoid);
  return fresh[Math.floor(random() * fresh.length) % fresh.length];
};

/**
 * `dict`: the robot's generic lines (dict.explore.guide). `stops`: the tour's
 * stops (each may carry `lines`, its building's own). `random` and `clock`
 * (seconds) can be replaced in tests. Call `react(event, situation)` for each
 * event; it returns { text, mood } or null when the robot should stay quiet.
 */
export function createDirector({ dict, stops = [], random = Math.random, clock = () => performance.now() / 1000 }) {
  const lastAt = new Map();
  let lastLine = "";
  let clicks = [];
  let asleep = false;

  const ready = (kind) => {
    const at = lastAt.get(kind);
    return at === undefined || clock() - at >= (COOLDOWNS[kind] ?? 0);
  };
  const say = (kind, text, mood) => {
    if (!text) return null;
    lastAt.set(kind, clock());
    lastLine = text;
    return { text, mood };
  };
  const line = (list, values = {}) => format(pickFrom(list, random, lastLine), values);
  const own = (stop, kind) => (kind === "tagline" ? stop?.lines?.tagline : pickFrom(stop?.lines?.[kind], random, lastLine)) || "";
  const reactions = dict.reactions ?? {};

  /** The line for arriving somewhere on the tour (the old static lines, plus each building's own). */
  const stageLine = (stage) => {
    if (stage.kind === "intro") return { text: dict.intro, mood: "wave" };
    if (stage.kind === "finale") return { text: dict.finale, mood: "celebrate" };
    const stop = stops[stage.index];
    if (stage.kind === "cruise") return { text: stop ? format(dict.next, { title: stop.title }) : dict.toFinale, mood: "lead" };
    if (!stop) return null;
    const saved = own(stop, "arrival");
    if (saved) return { text: saved, mood: "present" };
    if (stop.kind === "graduation") return { text: dict.graduation, mood: "present" };
    if (stop.kind === "coop") return { text: dict.coop, mood: "present" };
    if (stop.inProgress) return { text: format(dict.inProgress, { progress: stop.progress }), mood: "point" };
    if (stage.index === 0) return { text: dict.first, mood: "present" };
    return { text: dict.project[(stage.index - 1) % dict.project.length], mood: "present" };
  };

  return {
    get asleep() {
      return asleep;
    },

    /**
     * `event`: { type, ... }. Types: "stage" (with stage), "click-guide",
     * "fast", "backwards", "skip" (with index), "idle-stop" (with index),
     * "idle", "wake", "click-stop" (with index), "detail-open" (with index),
     * "quality-lowered", "sound" (with on), "welcome-back" (with title),
     * "greeting" (with hour).
     */
    react(event) {
      const { type } = event;
      if (asleep && type !== "idle" && type !== "sleep-check") {
        asleep = false;
        if (type !== "click-guide") return say("wake", line(reactions.wake), "wake");
      }
      switch (type) {
        case "stage": {
          const next = stageLine(event.stage);
          return next ? say("stage", next.text, next.mood) : null;
        }
        case "click-guide": {
          if (!ready("click-guide")) return null;
          const now = clock();
          clicks = [...clicks.filter((at) => now - at < 10), now];
          if (asleep) {
            asleep = false;
            return say("click-guide", line(reactions.wake), "wake");
          }
          const annoyed = clicks.length >= 4;
          return say("click-guide", line(annoyed ? reactions.annoyed : reactions.ouch), annoyed ? "dizzy" : "flinch");
        }
        case "fast":
          return ready("fast") ? say("fast", line(reactions.fast), "dizzy") : null;
        case "backwards":
          return ready("backwards") ? say("backwards", line(reactions.backwards), "look-back") : null;
        case "skip": {
          const stop = stops[event.index];
          return stop && ready("skip") ? say("skip", line(reactions.skipped, { title: stop.title }), "look-back") : null;
        }
        case "idle-stop": {
          if (!ready("idle-stop")) return null;
          const stop = stops[event.index];
          const fact = own(stop, "fact");
          return say("idle-stop", fact || line(reactions.idleStop), "point");
        }
        case "idle": {
          if (!ready("idle")) return null;
          asleep = true;
          return say("idle", line(reactions.sleep), "sleep");
        }
        case "click-stop": {
          if (!ready("click-stop")) return null;
          const stop = stops[event.index];
          const text = own(stop, "tagline") || own(stop, "fact") || (stop ? format(reactions.thisIs?.[0] ?? "{title}", { title: stop.title }) : "");
          return say("click-stop", text, "nod");
        }
        case "detail-open": {
          const stop = stops[event.index];
          return say("detail-open", own(stop, "detail") || line(reactions.details), "aside");
        }
        case "quality-lowered":
          return ready("quality-lowered") ? say("quality-lowered", line(reactions.dimmed), "nod") : null;
        case "sound":
          return say("sound", line(event.on ? reactions.soundOn : reactions.soundOff), "nod");
        case "welcome-back":
          return say("welcome-back", line(reactions.welcomeBack, { title: event.title }), "wave");
        case "greeting": {
          const hour = event.hour;
          const list = hour >= 0 && hour < 5 ? reactions.lateNight : hour >= 5 && hour < 11 ? reactions.morning : null;
          return list ? say("greeting", line(list), "wave") : null;
        }
        default:
          return null;
      }
    },
  };
}
