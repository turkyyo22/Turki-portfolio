"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getImageProps } from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import Loader from "@/components/Loader";
import { assessDevice, probeDevice, savedQuality, saveQuality } from "@/lib/explore/device";
import { createDirector } from "@/lib/explore/director";
import { PIXELS_PER_METRE, SHOP_NAMES, createTour } from "@/lib/explore/plan";
import { createCitySound, savedSound, saveSound } from "@/lib/explore/sound";
import ExploreDetail from "./ExploreDetail";
import ExploreHud from "./ExploreHud";

const INTRO = { kind: "intro", index: 0 };
const VISIT_KEY = "explore-last-stop";
const LOOKED_KEY = "explore-looked-around";

const readStored = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private windows may not keep it.
  }
};

// What the device can do, and what the visitor chose last time, read once per
// visit. The server (and the first client render) don't know it yet and get null.
let deviceSnapshot = null;
const readDevice = () => {
  if (!deviceSnapshot) {
    const probe = probeDevice();
    deviceSnapshot = {
      ...assessDevice(probe),
      touchOnly: probe.touchOnly,
      saved: savedQuality(),
      sound: savedSound(),
      audio: Boolean(window.AudioContext || window.webkitAudioContext),
      lastStop: readStored(VISIT_KEY),
      looked: readStored(LOOKED_KEY) === "1",
    };
  }
  return deviceSnapshot;
};
const subscribe = () => () => {};
const noDevice = () => null;

const FLIGHT_INTERRUPTS = ["wheel", "touchstart", "keydown", "mousedown"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Scrolls the page to `targetY` over `duration` ms, easing in and out, so the
 * camera flies to a stop instead of jumping, then calls `onArrive`. Any scroll,
 * tap or key press by the visitor takes over (and `onArrive` is not called).
 * Returns a function that stops the flight.
 */
function animateScrollTo(targetY, duration, onArrive) {
  const startY = window.scrollY;
  const startedAt = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    FLIGHT_INTERRUPTS.forEach((type) => window.removeEventListener(type, stop));
  };
  const step = (now) => {
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    window.scrollTo({ top: startY + (targetY - startY) * eased, behavior: "instant" });
    if (t < 1) {
      frame = requestAnimationFrame(step);
    } else {
      stop();
      onArrive?.();
    }
  };
  FLIGHT_INTERRUPTS.forEach((type) => window.addEventListener(type, stop, { passive: true }));
  frame = requestAnimationFrame(step);
  return stop;
}

/** Puts `?stop=slug` in the address (or takes it out), so a project's details can be shared. */
function showStopInAddress(slug) {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set("stop", slug);
  else url.searchParams.delete("stop");
  window.history.replaceState(null, "", url);
}

/**
 * Explore mode: a 3D city where each project is a building. Scrolling drives the
 * visitor down the streets with T.A Core as the guide. This component checks that
 * the browser can draw 3D, loads the engine only then (a separate download), lets
 * the visitor in (with sound, or without), and draws the controls, the robot's
 * lines and the project details on top of the city.
 */
export default function ExploreMode({ lang, dict, city }) {
  const device = useSyncExternalStore(subscribe, readDevice, noDevice);
  const [chosenQuality, setChosenQuality] = useState(null);
  const [status, setStatus] = useState("loading"); // "loading", "ready" or "failed"
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(INTRO);
  const [slow, setSlow] = useState(false);
  const [entered, setEntered] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  // What T.A Core says: the line for where the visitor is, and a passing reaction over it.
  const [base, setBase] = useState(null);
  const [aside, setAside] = useState(null);
  const [turned, setTurned] = useState(false);
  const [detail, setDetail] = useState(null); // { index, shown, note }
  const [lookedNow, setLookedNow] = useState(false);
  const [director] = useState(() => createDirector({ dict: dict.guide, stops: city.stops }));
  // How scrolling maps onto the route (the engine builds the same one for the camera).
  const [tour] = useState(() => createTour(city.route.stops, city.route.length));

  const hostRef = useRef(null);
  const bubbleRef = useRef(null);
  const barRef = useRef(null);
  const flightRef = useRef(null);
  const engineRef = useRef(null);
  const soundRef = useRef(null);
  const detailRef = useRef(false);
  const returnFocusRef = useRef(null);
  const lineCount = useRef(0);
  const timers = useRef({ ids: new Set(), aside: 0 });
  const router = useRouter();

  const total = city.stops.length;
  // The page is as long as the route, so the same scroll always covers the same ground.
  const travel = Math.round(tour.scrollLength * PIXELS_PER_METRE);
  const verdict = device?.verdict;
  const started = verdict === "go";
  const quality = chosenQuality || device?.saved || device?.quality || "low";
  const lookedAround = lookedNow || Boolean(device?.looked);

  const later = (callback, ms) => {
    const id = window.setTimeout(() => {
      timers.current.ids.delete(id);
      callback();
    }, ms);
    timers.current.ids.add(id);
  };

  /** The robot moves its mouth and beeps for a line. */
  const talk = (said) => {
    if (!said?.text) return;
    engineRef.current?.act(said.mood, clamp(0.9 + said.text.length * 0.045, 1.2, 4.5));
    soundRef.current?.chirp(said.mood);
  };

  /** Shows a reaction from the director in the bubble for `hold` seconds (Infinity: until the next one). */
  const speak = (said, hold = 4) => {
    if (!said?.text) return;
    lineCount.current += 1;
    setAside({ id: lineCount.current, text: said.text, at: performance.now() });
    window.clearTimeout(timers.current.aside);
    if (Number.isFinite(hold)) timers.current.aside = window.setTimeout(() => setAside(null), hold * 1000);
    talk(said);
  };

  const markLookedAround = () => {
    setLookedNow(true);
    store(LOOKED_KEY, "1");
  };

  /** Flies to stop `index`: -1 is the start of the street, `total` its end. */
  const flyToStop = (index, onArrive) => {
    flightRef.current?.();
    const range = document.documentElement.scrollHeight - window.innerHeight;
    const targetY = tour.progressOfStop(index) * range;
    const metresAway = (Math.abs(targetY - window.scrollY) / Math.max(1, range)) * tour.scrollLength;
    if (metresAway < 1) {
      onArrive?.();
      return;
    }
    const duration = Math.min(4500, Math.max(900, metresAway * 8));
    soundRef.current?.whoosh(Math.min(2, duration / 1000));
    flightRef.current = animateScrollTo(targetY, duration, onArrive);
  };

  /** Opens stop `index`'s details: the camera flies to its screen, which unfolds into the panel. */
  const openDetails = (index) => {
    const engine = engineRef.current;
    const stop = city.stops[index];
    if (!engine || !stop || detailRef.current) return;
    flightRef.current?.();
    detailRef.current = true;
    returnFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    engine.openDetail(index);
    const said = director.react({ type: "detail-open", index });
    talk(said);
    window.clearTimeout(timers.current.aside);
    setAside(null);
    // The panel shows the robot's own words about this building (not its generic ones).
    const own = said?.text && stop.lines?.detail?.includes(said.text) ? said.text : "";
    setDetail({ index, shown: false, note: own });
    soundRef.current?.duck(true);
    // Let the camera turn toward the screen first, so the panel unfolds out of it.
    later(() => {
      setDetail((current) => (current?.index === index ? { ...current, shown: true } : current));
      soundRef.current?.unfold();
    }, 380);
    if (stop.slug) showStopInAddress(stop.slug);
  };

  const onDetailClosing = () => {
    engineRef.current?.closeDetail();
    soundRef.current?.fold();
    soundRef.current?.duck(false);
    showStopInAddress(null);
  };

  const onDetailClosed = () => {
    detailRef.current = false;
    setDetail(null);
  };

  // Once the panel has gone (and the controls can be reached again), focus goes back to what opened it.
  useEffect(() => {
    if (detail) return;
    const opener = returnFocusRef.current;
    returnFocusRef.current = null;
    opener?.focus({ preventScroll: true });
  }, [detail]);

  const setSound = (on) => {
    if (on && !soundRef.current) soundRef.current = createCitySound();
    soundRef.current?.setOn(on);
    setSoundOn(on && Boolean(soundRef.current));
    saveSound(on);
  };

  /** Lets the visitor into the city (from the Start screen), with or without sound. */
  const enter = (withSound) => {
    setEntered(true);
    setSound(withSound);
    talk(base);
    const linked = city.stops.findIndex((stop) => stop.slug && stop.slug === new URLSearchParams(window.location.search).get("stop"));
    const last = device?.lastStop ? city.stops.findIndex((stop) => stop.slug === device.lastStop) : -1;
    if (linked >= 0) {
      // A shared link to a project: fly there and open it.
      later(() => flyToStop(linked, () => later(() => openDetails(linked), 450)), 700);
    } else if (last > 0) {
      later(() => speak(director.react({ type: "welcome-back", title: city.stops[last].title }), 6), 3600);
    } else {
      later(() => speak(director.react({ type: "greeting", hour: new Date().getHours() }), 5), 3600);
    }
  };

  const changeQuality = (next) => {
    if (next === quality) return;
    saveQuality(next);
    // The city is rebuilt at the new quality, behind the loading screen.
    setStatus("loading");
    setProgress(0);
    setTurned(false);
    setChosenQuality(next);
  };

  // Where the visitor is on the tour changed: the robot's line for it.
  const onStageChange = useEffectEvent((next) => {
    setStage(next);
    const said = director.react({ type: "stage", stage: next });
    if (said) {
      lineCount.current += 1;
      setBase({ id: lineCount.current, text: said.text, mood: said.mood });
      // A reaction said only a moment ago stays up a little longer.
      const keep = aside && performance.now() - aside.at < 2200;
      if (!keep) {
        window.clearTimeout(timers.current.aside);
        setAside(null);
        if (entered && !detailRef.current) talk(said);
      }
    }
    const stop = next.kind === "stop" ? city.stops[next.index] : null;
    if (stop?.slug) store(VISIT_KEY, stop.slug);
  });

  // Something happened in the city: the robot reacts.
  const onEngineEvent = useEffectEvent((type, info = {}) => {
    if (type === "view-turned") {
      setTurned(info.turned);
      if (info.turned) markLookedAround();
      return;
    }
    if (!entered || detailRef.current) return;
    switch (type) {
      case "pick-guide":
        speak(director.react({ type: "click-guide" }), 2.6);
        break;
      case "pick-stop":
        // The building in view opens; one further away is named, and the camera flies to it.
        if (stage.kind === "stop" && stage.index === info.index) {
          openDetails(info.index);
        } else {
          speak(director.react({ type: "click-stop", index: info.index }), 4);
          flyToStop(info.index);
        }
        break;
      case "fast":
      case "backwards":
      case "quality-lowered":
        speak(director.react({ type }), 3.2);
        break;
      case "skip":
        speak(director.react({ type: "skip", index: info.index }), 4);
        break;
      case "idle-stop":
        speak(director.react({ type: "idle-stop", index: info.index }), 9);
        break;
      case "idle":
        speak(director.react({ type: "idle" }), Infinity);
        break;
      case "active":
        speak(director.react({ type: "wake" }), 2.6);
        break;
      default:
        break;
    }
  });

  // Load the 3D engine (a separate download, so the main site never pays for it) and build the city.
  useEffect(() => {
    if (!started) return undefined;
    const host = hostRef.current;
    let engine = null;
    let cancelled = false;

    // The signs in the city are drawn with the page's font. Arabic letters come
    // in a separate font file, so ask for the exact text that will be drawn.
    const family = getComputedStyle(document.body).fontFamily;
    const drawn = [...city.stops.map((stop) => stop.title), ...city.upcoming.map((item) => item.name), ...dict.sign.finale, dict.sign.gate, ...SHOP_NAMES].join(" ");
    const fonts = Promise.race([document.fonts.load(`700 48px ${family}`, drawn), new Promise((resolve) => window.setTimeout(resolve, 2500))]).catch(() => {});

    // A resized copy of the project's picture from the site's own image service
    // (the same one the project cards use), so it can be used as a texture.
    const imageFor = (stop) => {
      if (!stop.imageUrl) return "";
      try {
        return getImageProps({ src: stop.imageUrl, alt: "", width: 640, height: 360 }).props.src;
      } catch {
        return "";
      }
    };

    // Runs every frame, so it moves elements directly instead of re-rendering.
    const onFrame = (frame) => {
      const bubble = bubbleRef.current;
      if (bubble) {
        const half = Math.min(140, (window.innerWidth - 24) / 2);
        const x = Math.min(window.innerWidth - half - 12, Math.max(half + 12, frame.guideX));
        const y = Math.max(150, frame.guideY);
        bubble.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        bubble.style.visibility = frame.guideVisible && !detailRef.current ? "visible" : "hidden";
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${frame.progress.toFixed(4)})`;
      soundRef.current?.setScene(frame);
    };

    Promise.all([import("@/lib/explore/engine/createExploreEngine"), fonts])
      .then(async ([{ createExploreEngine }]) => {
        if (cancelled) return;
        engine = await createExploreEngine({
          host,
          city,
          quality,
          calm: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          family,
          rtl: lang === "ar",
          text: { inProgress: dict.sign.inProgress, finaleSign: dict.sign.finale, gate: dict.sign.gate },
          imageFor,
          cancelled: () => cancelled,
          onProgress: setProgress,
          onReady: () => setStatus("ready"),
          onStage: (next) => onStageChange(next),
          onFrame,
          onSlow: () => setSlow(true),
          onEvent: (type, info) => onEngineEvent(type, info),
        });
        if (cancelled) engine?.dispose();
        else engineRef.current = engine;
      })
      .catch((error) => {
        console.error("Explore mode could not start:", error);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      engineRef.current = null;
      engine?.dispose();
      flightRef.current?.();
    };
  }, [started, quality, city, dict, lang]);

  // Esc leaves the city, like the Exit button (an open details panel closes first, itself).
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !detailRef.current) router.push(`/${lang}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, lang]);

  // The page holds still while the city loads, before the visitor comes in, and while details are open.
  const blocked = verdict === "unsupported" || status === "failed";
  const running = started && !blocked;
  const locked = running && (!entered || status !== "ready" || detail !== null);
  useEffect(() => {
    if (!locked) return undefined;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [locked]);

  // The "drag to look around" hint goes away by itself after a while.
  const dragHint = entered && status === "ready" && stage.kind === "stop" && !lookedAround && !detail;
  useEffect(() => {
    if (!dragHint) return undefined;
    const id = window.setTimeout(() => setLookedNow(true), 8000);
    return () => window.clearTimeout(id);
  }, [dragHint]);

  // Leaving the page: stop the timers and the sound, and read the device afresh next time.
  useEffect(() => {
    const pending = timers.current;
    const sound = soundRef;
    return () => {
      pending.ids.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(pending.aside);
      sound.current?.dispose();
      sound.current = null;
      deviceSnapshot = null;
    };
  }, []);

  const detailStop = detail ? city.stops[detail.index] : null;
  const line = detail ? null : (aside ?? base);

  return (
    <main className="relative">
      <h1 className="sr-only">{dict.heading}</h1>
      {running && <div aria-hidden="true" className="explore-track" style={{ "--travel": travel }} />}
      <div ref={hostRef} className="fixed inset-0 z-0 bg-deep" />
      {/* Darker corners keep the eye on the street and the text readable. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(2,4,12,0.6)_100%)]" />

      {running && (
        <ExploreHud
          lang={lang}
          dict={dict}
          tour={city}
          stage={stage}
          ready={status === "ready" && entered}
          hidden={detail !== null}
          touch={Boolean(device?.touchOnly)}
          slow={slow}
          onDismissSlow={() => setSlow(false)}
          onFlyTo={flyToStop}
          onOpenDetails={openDetails}
          bubbleRef={bubbleRef}
          barRef={barRef}
          line={line}
          turned={turned}
          onRecentre={() => engineRef.current?.recentre()}
          dragHint={dragHint}
          soundAvailable={Boolean(device?.audio)}
          soundOn={soundOn}
          onSound={() => {
            const next = !soundOn;
            setSound(next);
            speak(director.react({ type: "sound", on: next }), 3);
          }}
          quality={quality}
          onQuality={changeQuality}
        />
      )}

      {detailStop && detail.shown && (
        <ExploreDetail
          lang={lang}
          dict={dict.detail}
          cardDict={dict.card}
          guideName={dict.guide.name}
          note={detail.note}
          stop={detailStop}
          index={detail.index}
          total={total}
          getQuad={() => engineRef.current?.screenQuad(detail.index) ?? null}
          calm={typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches}
          onClosing={onDetailClosing}
          onClosed={onDetailClosed}
        />
      )}

      <AnimatePresence>
        {!blocked && status !== "ready" && (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-deep px-6 text-center"
          >
            <Loader label={dict.loading.title} />
            <div className="h-1 w-56 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="h-full rounded-full bg-gradient-to-r from-cyan to-blue transition-[width] duration-300 rtl:bg-gradient-to-l" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <Link href={`/${lang}`} className="text-sm font-semibold text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-cyan">
              {dict.loading.skip}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The city is built: come in, with sound or without */}
      <AnimatePresence>
        {running && status === "ready" && !entered && (
          <motion.div
            key="start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-40 flex items-end justify-center bg-[#02040c]/45 p-4 pb-10 sm:items-center sm:pb-4"
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="explore-start-title"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.45, delay: 0.15, ease: "easeOut" }}
              className="w-full max-w-sm rounded-3xl border border-cyan/25 bg-[#050A15]/85 p-6 text-center shadow-[0_0_60px_rgb(var(--accent-cyan-rgb)/0.18)] backdrop-blur-xl sm:p-7"
            >
              <p className="font-mono text-[11px] uppercase tracking-widest text-cyan">{dict.districts.start}</p>
              <h2 id="explore-start-title" className="mt-2 text-2xl font-bold text-white">
                {dict.start.title}
              </h2>
              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  autoFocus
                  onClick={() => enter(Boolean(device?.audio))}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-cyan to-blue px-6 py-3.5 text-sm font-bold text-[#050a15] shadow-[0_0_24px_rgb(var(--accent-cyan-rgb)/0.35)] transition-all hover:brightness-110 active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                  {dict.start.enter}
                </button>
                {device?.audio && (
                  <button
                    type="button"
                    onClick={() => enter(false)}
                    className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/80 transition-all hover:border-cyan/50 hover:text-cyan active:scale-95"
                  >
                    {dict.start.silent}
                  </button>
                )}
              </div>
              {device?.audio && <p className="mt-4 text-xs leading-relaxed text-white/50">{dict.start.hint}</p>}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {blocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep p-6">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-glass p-7 text-center backdrop-blur-xl">
            <h2 className="text-xl font-bold text-white">{dict.unsupported.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">{dict.unsupported.text}</p>
            <Link
              href={`/${lang}`}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-cyan to-blue px-6 py-3 text-sm font-bold text-[#050a15] transition-all hover:brightness-110 active:scale-95"
            >
              {dict.unsupported.back}
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
