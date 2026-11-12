import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { describe, expect, it } from "vitest";

import { ACCENTS, DEFAULT_ACCENT } from "@/lib/accent";

const require = createRequire(import.meta.url);
const tailwindConfig = require("../../tailwind.config.js");
const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const srcDir = fileURLToPath(new URL("../", import.meta.url));

const customColors = tailwindConfig.theme.extend.colors;

/**
 * The custom properties declared in each rule of globals.css, keyed by selector,
 * e.g. { ":root": { "--accent-cyan": "#00E5FF", … }, ':root[data-accent="purple"]': { … } }.
 */
function cssVariableBlocks(css) {
  const blocks = {};
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // A selector is the text before "{" since the previous rule or statement ("}" or ";").
  for (const [, selector, body] of withoutComments.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const variables = {};
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      variables[name] = value.trim();
    }
    if (Object.keys(variables).length > 0) blocks[selector.trim()] = variables;
  }
  return blocks;
}

function hexToChannels(hex) {
  const digits = hex.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16)).join(" ");
}

async function compileUtilities(classes) {
  const { css } = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: classes.join(" ") }] })]).process(
    "@tailwind utilities;",
    { from: undefined },
  );
  return css;
}

const blocks = cssVariableBlocks(globalsCss);

describe("theme colours", () => {
  const variables = blocks[":root"];

  it.each(Object.entries(customColors))("%s is defined with RGB channels that match its hex variable", (_, value) => {
    // Tailwind 3 can only apply opacity modifiers (bg-cyan/15) to colours it can split into channels.
    const match = value.match(/^rgb\(var\((--[\w-]+)-rgb\) \/ <alpha-value>\)$/);
    expect(match, `"${value}" should use rgb(var(--name-rgb) / <alpha-value>)`).not.toBeNull();

    const name = match[1];
    expect(variables[name], `${name} should still be declared in globals.css`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(variables[`${name}-rgb`]).toBe(hexToChannels(variables[name]));
  });

  it("generates CSS for opacity modifiers on the custom colours", async () => {
    const classes = ["bg-cyan/15", "border-cyan/25", "text-cyan/80", "bg-blue/20", "ring-cyan/40", "text-muted/50", "bg-deep/80"];
    const css = await compileUtilities(classes);

    for (const className of classes) {
      expect(css, `${className} should produce a rule`).toContain(`.${className.replace("/", "\\/")}`);
    }
    expect(css).toContain("rgb(var(--accent-cyan-rgb) / 0.15)");
  });

  it("generates CSS for glows written with the accent variables", async () => {
    // The pattern the components use for coloured shadows, so the glows follow the picked accent.
    const css = await compileUtilities([
      "shadow-[0_0_16px_rgb(var(--accent-cyan-rgb)/0.35)]",
      "hover:shadow-[0_0_20px_rgb(var(--accent-cyan-rgb)/0.5)]",
      "drop-shadow-[0_0_10px_rgb(var(--accent-cyan-rgb)/0.45)]",
      "bg-[radial-gradient(circle_at_80%_90%,rgb(var(--accent-blue-rgb)/0.14),transparent_50%)]",
    ]);

    expect(css).toContain("0 0 16px rgb(var(--accent-cyan-rgb)/0.35)");
    expect(css).toContain("0 0 20px rgb(var(--accent-cyan-rgb)/0.5)");
    expect(css).toContain("drop-shadow(0 0 10px rgb(var(--accent-cyan-rgb)/0.45))");
    expect(css).toContain("radial-gradient(circle at 80% 90%,rgb(var(--accent-blue-rgb)/0.14),transparent 50%)");
  });
});

describe("accent colours", () => {
  it.each(ACCENTS.map((accent) => [accent.id, accent]))("%s has CSS variables matching src/lib/accent.js", (id, accent) => {
    const selector = id === DEFAULT_ACCENT ? ":root" : `:root[data-accent="${id}"]`;
    const variables = blocks[selector];
    expect(variables, `globals.css should have a ${selector} block`).toBeDefined();

    const expected = {
      "--accent-cyan": accent.primary,
      "--accent-blue": accent.secondary,
      "--accent-glow": accent.glow,
      "--accent-deep": accent.deep,
    };
    for (const [name, hex] of Object.entries(expected)) {
      expect(variables[name]?.toUpperCase(), `${selector} ${name}`).toBe(hex.toUpperCase());
    }
    expect(variables["--accent-cyan-rgb"], `${selector} --accent-cyan-rgb`).toBe(hexToChannels(accent.primary));
    expect(variables["--accent-blue-rgb"], `${selector} --accent-blue-rgb`).toBe(hexToChannels(accent.secondary));
  });

  it("has a CSS block only for colours the picker offers", () => {
    const styled = Object.keys(blocks)
      .map((selector) => selector.match(/^:root\[data-accent="([\w-]+)"\]$/)?.[1])
      .filter(Boolean)
      .sort();
    const offered = ACCENTS.map((accent) => accent.id)
      .filter((id) => id !== DEFAULT_ACCENT)
      .sort();
    expect(styled).toEqual(offered);
  });

  it("isn't hard-coded in components, so every glow follows the picked colour", () => {
    // Use the variables instead: rgb(var(--accent-cyan-rgb)/0.3) in a class, or the
    // ACCENTS table for code that needs the colour itself (three.js, particles).
    // The social share image keeps the brand cyan: it is drawn once, for everyone.
    const allowed = new Set(["app/globals.css", "lib/accent.js", "app/[lang]/opengraph-image.js"]);
    const hardCoded = /#00e5ff|#3b82f6|rgba?\(\s*0\s*,\s*229\s*,\s*255|rgba?\(\s*59\s*,\s*130\s*,\s*246/i;

    const offenders = readdirSync(srcDir, { recursive: true })
      .map((path) => path.replaceAll("\\", "/"))
      .filter((path) => /\.(jsx?|css)$/.test(path) && !path.includes(".test.") && !allowed.has(path))
      .filter((path) => hardCoded.test(readFileSync(join(srcDir, path), "utf8")));

    expect(offenders).toEqual([]);
  });
});
