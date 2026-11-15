import { Color, Vector3 } from "three";

import { accentById, currentAccent } from "@/lib/accent";

const color = (hex) => new Color(hex);

/**
 * The colours of the city. The site's accent (the one the visitor picked on the
 * main site) leads; the other neon colours stay the same so the streets always
 * have variety. Neon is vivid on purpose; the glow around it is kept low.
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
    gold: color("#ffcf5a"),
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
    fog: color("#0a0e26"),
    fogLow: color("#1d1748"),

    // Light on surfaces that have none of their own (linear values, see LIGHTING in shaders.js)
    moonDir: new Vector3(-0.35, 0.62, -0.7).normalize(),
    moonLight: new Color(0.16, 0.19, 0.34),
    skyLight: new Color(0.05, 0.055, 0.12),
    bounceLight: new Color(0.11, 0.05, 0.11),
    streetLight: new Color(0.62, 0.38, 0.22),

    // Surfaces
    asphalt: color("#10131d"),
    pavement: color("#3a3f4f"),
    kerb: color("#5d6274"),
    steel: color("#2a3142"),
    darkSteel: color("#161b27"),
    glass: color("#0a1324"),
  };

  // Building walls by district, as albedo (they are lit by the night lighting).
  palette.walls = {
    old: ["#6b4a36", "#7a5a3c", "#5c4a3e", "#80624a", "#4f4a44", "#6e3f34"].map(color),
    mid: ["#4a4f5c", "#5a5d66", "#3f4655", "#615a54", "#4a5160"].map(color),
    centre: ["#2c3445", "#363d4f", "#262c3a", "#3b3f4b"].map(color),
    new: ["#e2e6ee", "#c8ced8", "#3a4152", "#d9d4cc"].map(color),
    frontier: ["#4a4d55", "#3d4049", "#55524c"].map(color),
  };
  // Trim, cornices and stone details.
  palette.stone = ["#8c8174", "#9a9488", "#7c7468", "#a39a8a"].map(color);
  // Awning fabrics and shop shutters.
  palette.fabric = ["#b8323a", "#1f8a8a", "#c2862c", "#5a3fa0", "#2f6fb0", "#3a8a4a"].map(color);

  // The colours of shop fronts, signs and holograms.
  palette.neon = [palette.accent, palette.pink, palette.amber, palette.violet, palette.mint];
  return palette;
}

/** The neon colour of a stop: warm in the old town, gold for graduation, green for the bank. */
export function stopColor(palette, stop, index) {
  if (stop.accent) return new Color(stop.accent);
  if (stop.kind === "graduation") return palette.gold;
  if (stop.kind === "coop") return palette.emerald;
  const cycle = [palette.amber, palette.accent, palette.pink, palette.violet, palette.mint, palette.blue];
  return cycle[index % cycle.length];
}

/** A copy of `source` made brighter than white can be, so it glows in the bloom pass. */
export const bright = (source, amount) => source.clone().multiplyScalar(amount);
