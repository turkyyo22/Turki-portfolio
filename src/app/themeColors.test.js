import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tailwindConfig = require("../../tailwind.config.js");
const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

const customColors = tailwindConfig.theme.extend.colors;

/** The custom properties declared in globals.css, e.g. { "--accent-cyan": "#00E5FF" }. */
function cssVariables(css) {
  const variables = {};
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    variables[name] = value.trim();
  }
  return variables;
}

function hexToChannels(hex) {
  const digits = hex.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16)).join(" ");
}

describe("theme colours", () => {
  const variables = cssVariables(globalsCss);

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
    const { css } = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: classes.join(" ") }] })]).process(
      "@tailwind utilities;",
      { from: undefined },
    );

    for (const className of classes) {
      expect(css, `${className} should produce a rule`).toContain(`.${className.replace("/", "\\/")}`);
    }
    expect(css).toContain("rgb(var(--accent-cyan-rgb) / 0.15)");
  });
});
