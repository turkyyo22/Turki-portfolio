// The city's sound, made in the browser with the Web Audio API: no sound files to
// download. A low city hum, hover cars passing from side to side, a slow synth
// pad with the odd chime, a faint neon buzz near the buildings and wind that rises
// with the flying speed; and short sounds for the robot's voice, flights and the
// details panel. It must be started from a click or a key press (browsers only
// allow sound after one), and it rests while the tab is hidden.

const SOUND_KEY = "explore-sound";

/** The visitor's last choice: true (on), false (off) or null (never chosen). */
export function savedSound() {
  try {
    const value = window.localStorage.getItem(SOUND_KEY);
    return value === "on" ? true : value === "off" ? false : null;
  } catch {
    return null;
  }
}

export function saveSound(on) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Private windows may not keep it; the choice then lasts for this visit only.
  }
}

const MASTER = 0.72;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// The pad's chords (Hz): A minor, F major and G major voicings, open and calm.
const CHORDS = [
  [110.0, 164.81, 196.0, 246.94],
  [87.31, 130.81, 164.81, 196.0],
  [98.0, 146.83, 220.0, 293.66],
  [110.0, 164.81, 261.63, 329.63],
];
const CHORD_SECONDS = 14;

/** `seconds` of noise ("white", "pink" or "brown") that loops without a click. */
function noiseBuffer(context, seconds, colour) {
  const length = Math.floor(context.sampleRate * seconds);
  const fade = Math.floor(context.sampleRate * 0.05);
  const raw = new Float32Array(length + fade);
  let brown = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (colour === "brown") {
      brown = (brown + 0.02 * white) / 1.02;
      raw[i] = brown * 3.5;
    } else if (colour === "pink") {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      raw[i] = white;
    }
  }
  // Blend the start with what would have come after the end, so the loop is seamless.
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    if (i < fade) {
      const w = i / fade;
      data[i] = raw[i] * w + raw[length + i] * (1 - w);
    } else {
      data[i] = raw[i];
    }
  }
  return buffer;
}

/** A soft, wide room: decaying stereo noise, for the reverb. */
function impulse(context, seconds, decay) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

/**
 * Makes the city's sound. Returns null where the browser has no Web Audio.
 * Call `start()` from a click; `setOn(false)` mutes it (and lets it rest).
 */
export function createCitySound() {
  const AudioContext = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AudioContext) return null;
  let context;
  try {
    context = new AudioContext({ latencyHint: "playback" });
  } catch {
    return null;
  }

  let on = false;
  let disposed = false;
  const timers = new Set();
  const later = (callback, ms) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) callback();
    }, ms);
    timers.add(id);
  };
  const running = () => on && !disposed && context.state === "running";
  const panner = (value = 0) => {
    if (!context.createStereoPanner) return context.createGain();
    const node = context.createStereoPanner();
    node.pan.value = value;
    return node;
  };
  /** Disconnects `nodes` once `source` has finished. */
  const cleanUp = (source, ...nodes) => {
    source.onended = () => [source, ...nodes].forEach((node) => node.disconnect());
  };

  // --- The mix: master ← (ambience, effects) and a shared reverb ---
  const master = context.createGain();
  master.gain.value = 0;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.knee.value = 10;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.3;
  master.connect(limiter).connect(context.destination);

  const ambience = context.createGain();
  ambience.connect(master);
  const effects = context.createGain();
  effects.connect(master);
  const reverb = context.createConvolver();
  reverb.buffer = impulse(context, 2.6, 2.4);
  const reverbReturn = context.createGain();
  reverbReturn.gain.value = 0.55;
  reverb.connect(reverbReturn).connect(master);

  const brown = noiseBuffer(context, 6, "brown");
  const pink = noiseBuffer(context, 5, "pink");

  // --- The city hum: deep, slowly breathing rumble ---
  const hum = context.createBufferSource();
  hum.buffer = brown;
  hum.loop = true;
  const humLow = context.createBiquadFilter();
  humLow.type = "lowpass";
  humLow.frequency.value = 170;
  const humHigh = context.createBiquadFilter();
  humHigh.type = "highpass";
  humHigh.frequency.value = 28;
  const humGain = context.createGain();
  humGain.gain.value = 0.18;
  const breath = context.createOscillator();
  breath.frequency.value = 0.07;
  const breathDepth = context.createGain();
  breathDepth.gain.value = 0.05;
  breath.connect(breathDepth).connect(humGain.gain);
  hum.connect(humLow).connect(humHigh).connect(humGain).connect(ambience);

  // --- Wind, rising with the flying speed ---
  const wind = context.createBufferSource();
  wind.buffer = pink;
  wind.loop = true;
  const windBand = context.createBiquadFilter();
  windBand.type = "bandpass";
  windBand.frequency.value = 500;
  windBand.Q.value = 0.6;
  const windGain = context.createGain();
  windGain.gain.value = 0;
  wind.connect(windBand).connect(windGain).connect(ambience);

  // --- Neon buzz near the buildings (the 60 Hz mains, doubled) ---
  const buzz = context.createOscillator();
  buzz.type = "sawtooth";
  buzz.frequency.value = 120;
  const buzzBand = context.createBiquadFilter();
  buzzBand.type = "bandpass";
  buzzBand.frequency.value = 1900;
  buzzBand.Q.value = 1.6;
  const buzzGain = context.createGain();
  buzzGain.gain.value = 0;
  buzz.connect(buzzBand).connect(buzzGain).connect(ambience);

  // --- The pad: four voices of two detuned oscillators, through a slowly opening filter ---
  const padFilter = context.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 980;
  padFilter.Q.value = 0.8;
  const sweep = context.createOscillator();
  sweep.frequency.value = 0.035;
  const sweepDepth = context.createGain();
  sweepDepth.gain.value = 320;
  sweep.connect(sweepDepth).connect(padFilter.frequency);
  const padGain = context.createGain();
  padGain.gain.value = 0.05;
  const padSend = context.createGain();
  padSend.gain.value = 0.7;
  padFilter.connect(padGain);
  padGain.connect(ambience);
  padGain.connect(padSend).connect(reverb);
  const voices = CHORDS[0].map((frequency, index) => {
    const pair = ["sawtooth", "triangle"].map((type, side) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = side ? 7 : -7;
      const level = context.createGain();
      level.gain.value = type === "sawtooth" ? 0.12 : 0.22;
      oscillator.connect(level).connect(padFilter);
      return oscillator;
    });
    // Each voice drifts a little in and out, so the chord shimmers.
    const drift = context.createOscillator();
    drift.frequency.value = 0.05 + index * 0.017;
    const driftDepth = context.createGain();
    driftDepth.gain.value = 4;
    drift.connect(driftDepth);
    pair.forEach((oscillator) => driftDepth.connect(oscillator.detune));
    return { pair, drift };
  });

  const sources = [hum, breath, wind, buzz, sweep, ...voices.flatMap((voice) => [...voice.pair, voice.drift])];
  sources.forEach((source) => source.start());

  let chord = 0;
  const nextChord = () => {
    chord = (chord + 1) % CHORDS.length;
    const now = context.currentTime;
    voices.forEach((voice, index) => voice.pair.forEach((oscillator) => oscillator.frequency.setTargetAtTime(CHORDS[chord][index], now, 1.4)));
    later(nextChord, CHORD_SECONDS * 1000);
  };
  later(nextChord, CHORD_SECONDS * 1000);

  // --- A chime now and then: a high note of the chord, mostly reverb ---
  const chime = () => {
    if (running()) {
      const now = context.currentTime + 0.02;
      const notes = CHORDS[chord];
      const frequency = notes[Math.floor(Math.random() * notes.length)] * (Math.random() < 0.5 ? 4 : 8);
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const level = context.createGain();
      level.gain.setValueAtTime(0.0001, now);
      level.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
      level.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      const pan = panner(Math.random() * 1.2 - 0.6);
      oscillator.connect(level).connect(pan);
      pan.connect(ambience);
      pan.connect(reverb);
      oscillator.start(now);
      oscillator.stop(now + 2.3);
      cleanUp(oscillator, level, pan);
    }
    later(chime, 5000 + Math.random() * 7000);
  };
  later(chime, 4000);

  // --- Hover cars passing from one side to the other ---
  const traffic = context.createGain();
  traffic.gain.value = 1;
  traffic.connect(ambience);
  const carPass = () => {
    if (running()) {
      const now = context.currentTime + 0.02;
      const duration = 2.2 + Math.random() * 2.6;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const base = 380 + Math.random() * 700;
      const peak = 0.08 + Math.random() * 0.09;

      const tyres = context.createBufferSource();
      tyres.buffer = pink;
      tyres.loop = true;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 0.9;
      band.frequency.setValueAtTime(base * 1.3, now);
      band.frequency.linearRampToValueAtTime(base * 0.78, now + duration);
      const level = context.createGain();
      level.gain.setValueAtTime(0.0001, now);
      level.gain.exponentialRampToValueAtTime(peak, now + duration * 0.48);
      level.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      const pan = panner(-0.85 * direction);
      if (pan.pan) pan.pan.linearRampToValueAtTime(0.85 * direction, now + duration);
      tyres.connect(band).connect(level).connect(pan).connect(traffic);
      tyres.start(now, Math.random() * 4);
      tyres.stop(now + duration + 0.05);
      cleanUp(tyres, band, level, pan);

      // Some are hover cars: a low engine tone that drops as it passes (Doppler).
      if (Math.random() < 0.55) {
        const engine = context.createOscillator();
        engine.type = "triangle";
        const pitch = 85 + Math.random() * 70;
        engine.frequency.setValueAtTime(pitch * 1.12, now);
        engine.frequency.setValueAtTime(pitch * 1.12, now + duration * 0.42);
        engine.frequency.exponentialRampToValueAtTime(pitch * 0.88, now + duration * 0.58);
        const engineLevel = context.createGain();
        engineLevel.gain.setValueAtTime(0.0001, now);
        engineLevel.gain.exponentialRampToValueAtTime(peak * 0.35, now + duration * 0.48);
        engineLevel.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        engine.connect(engineLevel).connect(pan);
        engine.start(now);
        engine.stop(now + duration + 0.05);
        cleanUp(engine, engineLevel);
      }
    }
    later(carPass, 1600 + Math.random() * 4200);
  };
  later(carPass, 1200);

  // --- One-off sounds ---
  /** A short tone from `from` to `to` Hz, `length` seconds long, into `out`. */
  const tone = (out, start, from, to, length, type = "sine", peak = 1) => {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + length);
    const level = context.createGain();
    level.gain.setValueAtTime(0.0001, start);
    level.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.015, length / 4));
    level.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(level).connect(out);
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
    cleanUp(oscillator, level);
  };
  /** A gain into the effects (and a little reverb), removed after `seconds`. */
  const voice = (gain, seconds, wet = 0.3) => {
    const out = context.createGain();
    out.gain.value = gain;
    out.connect(effects);
    const send = context.createGain();
    send.gain.value = wet;
    out.connect(send).connect(reverb);
    later(() => {
      out.disconnect();
      send.disconnect();
    }, seconds * 1000 + 200);
    return out;
  };
  /** Filtered noise sweeping from `from` to `via` to `to` Hz over `length` seconds. */
  const swish = (out, start, from, via, to, length, peak) => {
    const noise = context.createBufferSource();
    noise.buffer = pink;
    noise.loop = true;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(from, start);
    band.frequency.exponentialRampToValueAtTime(via, start + length * 0.5);
    band.frequency.exponentialRampToValueAtTime(to, start + length);
    const level = context.createGain();
    level.gain.setValueAtTime(0.0001, start);
    level.gain.exponentialRampToValueAtTime(peak, start + length * 0.45);
    level.gain.exponentialRampToValueAtTime(0.0001, start + length);
    noise.connect(band).connect(level).connect(out);
    noise.start(start, Math.random() * 3);
    noise.stop(start + length + 0.05);
    cleanUp(noise, band, level);
  };

  const pauseWhenHidden = () => {
    if (disposed) return;
    if (document.hidden) context.suspend().catch(() => {});
    else if (on) context.resume().catch(() => {});
  };
  document.addEventListener("visibilitychange", pauseWhenHidden);

  let lastScene = 0;
  let ducked = false;

  return {
    get on() {
      return on;
    },

    /** Turns the sound on or off, fading. Turning it on must follow a click or key press. */
    setOn(next) {
      if (disposed) return;
      on = next;
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      if (next) {
        context.resume().catch(() => {});
        master.gain.setTargetAtTime(MASTER, now, 0.6);
      } else {
        master.gain.setTargetAtTime(0, now, 0.12);
        later(() => {
          if (!on) context.suspend().catch(() => {});
        }, 700);
      }
    },

    /** Follows the tour: `focus` (0 to 1, how close to a stop) and `speed` (route units per second). */
    setScene({ focus = 0, speed = 0 }) {
      if (!running()) return;
      const nowMs = performance.now();
      if (nowMs - lastScene < 100) return;
      lastScene = nowMs;
      const now = context.currentTime;
      const rush = clamp(Math.abs(speed) / 80, 0, 1);
      windGain.gain.setTargetAtTime(0.012 + 0.14 * rush ** 1.4, now, 0.25);
      windBand.frequency.setTargetAtTime(420 + 1500 * rush, now, 0.3);
      buzzGain.gain.setTargetAtTime(0.0025 + 0.009 * focus, now, 0.4);
    },

    /** Quietens the city while the visitor reads. */
    duck(down) {
      if (disposed || down === ducked) return;
      ducked = down;
      ambience.gain.setTargetAtTime(down ? 0.35 : 1, context.currentTime, 0.35);
    },

    /** The robot's voice: a few beeps, shaped by its mood (see director.js). */
    chirp(mood) {
      if (!running()) return;
      const now = context.currentTime + 0.02;
      const out = voice(0.07, 1.6);
      const random = (min, max) => min + Math.random() * (max - min);
      switch (mood) {
        case "flinch":
          tone(out, now, 1900, 420, 0.22, "square", 0.25);
          tone(out, now + 0.04, 1300, 320, 0.26, "sine", 0.9);
          break;
        case "dizzy":
          for (let i = 0; i < 6; i += 1) tone(out, now + i * 0.07, 1500 - i * 120 + (i % 2) * 320, 1100 - i * 110, 0.09, "sine", 0.7);
          break;
        case "sleep":
          tone(out, now, 520, 300, 0.55, "sine", 0.6);
          tone(out, now + 0.7, 470, 250, 0.7, "sine", 0.5);
          break;
        case "wake":
          tone(out, now, 380, 1500, 0.2, "sine", 0.8);
          tone(out, now + 0.22, 900, 2100, 0.13, "sine", 0.7);
          break;
        case "celebrate":
          [880, 1108.73, 1318.51, 1760].forEach((frequency, i) => tone(out, now + i * 0.085, frequency, frequency * 1.01, 0.2, "triangle", 0.7));
          break;
        case "look-back":
          tone(out, now, 1200, 700, 0.14, "sine", 0.8);
          tone(out, now + 0.16, 900, 1300, 0.12, "sine", 0.7);
          break;
        default: {
          const count = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < count; i += 1) {
            const from = random(850, 1900);
            tone(out, now + i * 0.078, from, from * random(0.8, 1.25), 0.065, "sine", 0.75);
          }
        }
      }
    },

    /** A flight to another stop. */
    whoosh(seconds = 1.2) {
      if (!running()) return;
      const length = clamp(seconds, 0.6, 2.2);
      swish(voice(1, length, 0.25), context.currentTime + 0.02, 320, 1700, 420, length, 0.1);
    },

    /** The building's screen opening into the details panel. */
    unfold() {
      if (!running()) return;
      const now = context.currentTime + 0.02;
      const out = voice(0.06, 1.8, 0.45);
      tone(out, now, 196, 784, 0.5, "triangle", 0.6);
      tone(out, now, 392, 1568, 0.5, "sine", 0.25);
      swish(out, now, 2600, 6200, 3800, 0.5, 0.25);
      tone(out, now + 0.5, 1568, 1572, 1.1, "sine", 0.45);
    },

    /** The panel folding back into the screen. */
    fold() {
      if (!running()) return;
      const now = context.currentTime + 0.02;
      const out = voice(0.05, 0.9, 0.3);
      tone(out, now, 784, 220, 0.42, "triangle", 0.6);
      swish(out, now, 4800, 2400, 1200, 0.4, 0.2);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      });
      context.close().catch(() => {});
    },
  };
}
