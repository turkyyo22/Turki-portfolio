import { Color } from "three";

import { accentById, currentAccent } from "@/lib/accent";

const color = (hex) => new Color(hex);

/**
 * The colours of the city. The site's accent (the one the visitor picked on the
 * main site) leads; the other neon colours stay the same so the street always
 * has variety. Colours are vivid on purpose; the glow around them is kept low.
 */
export function createPalette() {
  const accent = accentById(currentAccent());
  const palette = {
    accent: color(accent.primary),
    accentSoft: color(accent.glow),
    accentDeep: color(accent.secondary),
    accentMetal: color(accent.metal),
    accentAmbient: color(accent.ambient),

    pink: color("#ff3ea5"),
    amber: color("#ffb224"),
    violet: color("#9d6bff"),
    mint: color("#2ef2b6"),
    blue: color("#4d8dff"),
    red: color("#ff4050"),
    gold: color("#ffd166"),
    emerald: color("#1fd18a"),
    white: color("#ffffff"),

    // Windows, lamps and headlights
    warm: color("#ffc27a"),
    cool: color("#cfe6ff"),
    headlight: color("#fff1d0"),

    // Sky and haze
    zenith: color("#02040c"),
    horizon: color("#0b1030"),
    glowViolet: color("#40238a"),
    glowMagenta: color("#7a1f66"),
    fog: color("#090d24"),
    fogLow: color("#1b1647"),

    // Surfaces
    asphalt: color("#0b0e18"),
    pavement: color("#161c2e"),
    lot: color("#05070d"),
    wall: color("#0a0f1c"),
    wallHigh: color("#172038"),
    glass: color("#0a1324"),
    steel: color("#1b2336"),
  };

  // The colours of shop fronts and street signs.
  palette.neon = [palette.accent, palette.pink, palette.amber, palette.violet, palette.mint];
  return palette;
}

/** The neon colour of a stop: warm in the old town, gold for graduation, green for the bank. */
export function stopColor(palette, stop, index) {
  if (stop.kind === "graduation") return palette.gold;
  if (stop.kind === "coop") return palette.emerald;
  const cycle = [palette.amber, palette.accent, palette.pink, palette.violet, palette.mint, palette.blue];
  return cycle[index % cycle.length];
}

/** A copy of `source` made brighter than white can be, so it glows in the bloom pass. */
export const bright = (source, amount) => source.clone().multiplyScalar(amount);
