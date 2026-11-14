"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getImageProps } from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import Loader from "@/components/Loader";
import { assessDevice, gateDismissed, probeDevice } from "@/lib/explore/device";
import { legCount, progressOfStop } from "@/lib/explore/plan";
import DeviceGate from "./DeviceGate";
import ExploreHud from "./ExploreHud";

const INTRO = { kind: "intro", index: 0 };

// What the device can do never changes during a visit, so it is read once.
// The server (and the first client render) don't know it yet and get null.
let deviceSnapshot = null;
const readDevice = () => {
  if (!deviceSnapshot) {
    const probe = probeDevice();
    deviceSnapshot = { ...assessDevice(probe), touchOnly: probe.touchOnly, skipGate: gateDismissed() };
  }
  return deviceSnapshot;
};
const subscribe = () => () => {};
const noDevice = () => null;
// "Don't show this again" also holds for the rest of this visit, without a reload.
const skipGateFromNowOn = () => {
  if (deviceSnapshot) deviceSnapshot = { ...deviceSnapshot, skipGate: true };
};

const FLIGHT_INTERRUPTS = ["wheel", "touchstart", "keydown", "mousedown"];

/**
 * Scrolls the page to `targetY` over `duration` ms, easing in and out, so the
 * camera flies to a stop instead of jumping. Any scroll, tap or key press by the
 * visitor takes over. Returns a function that stops the flight.
 */
function animateScrollTo(targetY, duration) {
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
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  FLIGHT_INTERRUPTS.forEach((type) => window.addEventListener(type, stop, { passive: true }));
  frame = requestAnimationFrame(step);
  return stop;
}

/**
 * Explore mode: a 3D city where each project is a building. Scrolling flies the
 * visitor down the street with T.A Core as the guide. This component decides
 * whether the device can run it (phones are asked first), loads the 3D engine
 * only then, and draws the controls on top of it.
 */
export default function ExploreMode({ lang, dict, tour }) {
  const device = useSyncExternalStore(subscribe, readDevice, noDevice);
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState("loading"); // "loading", "ready" or "failed"
  const [stage, setStage] = useState(INTRO);
  const [slow, setSlow] = useState(false);
  const hostRef = useRef(null);
  const bubbleRef = useRef(null);
  const barRef = useRef(null);
  const flightRef = useRef(null);
  const router = useRouter();

  const total = tour.stops.length;
  const legs = legCount(total);
  const verdict = device?.verdict;
  const started = verdict === "go" || (verdict === "ask" && (accepted || device.skipGate));
  const quality = device?.quality ?? "high";

  // Load the 3D engine (a separate download, so the main site never pays for it) and start the city.
  useEffect(() => {
    if (!started) return undefined;
    const host = hostRef.current;
    let engine = null;
    let cancelled = false;

    // The signs in the city are drawn with the page's font. Arabic letters come
    // in a separate font file, so ask for the exact text that will be drawn.
    const family = getComputedStyle(document.body).fontFamily;
    const drawn = [...tour.stops.map((stop) => stop.title), ...tour.upcoming.map((item) => item.name), ...dict.sign.finale, dict.sign.inProgress].join(" ");
    const fonts = Promise.race([document.fonts.load(`700 48px ${family}`, drawn), new Promise((resolve) => window.setTimeout(resolve, 2500))]).catch(() => {});

    // A resized copy of the project's picture from the site's own image service
    // (the same one the project cards use), so it can be used as a texture.
    const imageFor = (stop) => {
      if (!stop.imageUrl) return "";
      try {
        return getImageProps({ src: stop.imageUrl, alt: "", width: 320, height: 180 }).props.src;
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
        bubble.style.visibility = frame.guideVisible ? "visible" : "hidden";
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${frame.progress.toFixed(4)})`;
    };

    Promise.all([import("@/lib/explore/engine/createExploreEngine"), fonts])
      .then(([{ createExploreEngine }]) => {
        if (cancelled) return;
        engine = createExploreEngine({
          host,
          tour,
          quality,
          calm: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          family,
          rtl: lang === "ar",
          text: { inProgress: dict.sign.inProgress, finaleSign: dict.sign.finale },
          imageFor,
          onReady: () => setStatus("ready"),
          onStage: setStage,
          onFrame,
          onSlow: () => setSlow(true),
        });
      })
      .catch((error) => {
        console.error("Explore mode could not start:", error);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      engine?.dispose();
      flightRef.current?.();
    };
  }, [started, quality, tour, dict, lang]);

  // Esc leaves the city, like the Exit button.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") router.push(`/${lang}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, lang]);

  /** Flies to stop `index`: -1 is the start of the street, `total` its end. */
  const flyToStop = (index) => {
    flightRef.current?.();
    const range = document.documentElement.scrollHeight - window.innerHeight;
    const targetY = (index < 0 ? 0 : progressOfStop(index, total)) * range;
    const legsAway = (Math.abs(targetY - window.scrollY) / Math.max(1, range)) * legs;
    if (legsAway < 0.01) return;
    flightRef.current = animateScrollTo(targetY, Math.min(4500, Math.max(900, legsAway * 1500)));
  };

  const blocked = verdict === "unsupported" || status === "failed";
  const asking = verdict === "ask" && !started;
  const running = started && !blocked;

  return (
    <main className="relative">
      <h1 className="sr-only">{dict.heading}</h1>
      {running && <div aria-hidden="true" className="explore-track" style={{ "--legs": legs }} />}
      <div ref={hostRef} className="fixed inset-0 z-0 bg-deep" />
      {/* Darker corners keep the eye on the street and the text readable. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(2,4,12,0.6)_100%)]" />

      {running && (
        <ExploreHud
          lang={lang}
          dict={dict}
          tour={tour}
          stage={stage}
          ready={status === "ready"}
          touch={Boolean(device?.touchOnly)}
          slow={slow}
          onDismissSlow={() => setSlow(false)}
          onFlyTo={flyToStop}
          bubbleRef={bubbleRef}
          barRef={barRef}
        />
      )}

      <AnimatePresence>
        {!blocked && !asking && status !== "ready" && (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-deep px-6 text-center"
          >
            <Loader label={dict.loading.title} />
            <Link href={`/${lang}`} className="text-sm font-semibold text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-cyan">
              {dict.loading.skip}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {asking && (
        <DeviceGate
          lang={lang}
          dict={dict.gate}
          onAccept={(remember) => {
            if (remember) skipGateFromNowOn();
            setAccepted(true);
          }}
        />
      )}

      {blocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep p-6">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-glass p-7 text-center backdrop-blur-xl">
            <h1 className="text-xl font-bold text-white">{dict.unsupported.title}</h1>
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
