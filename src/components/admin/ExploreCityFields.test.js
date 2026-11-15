import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { normalizeExplore } from "@/lib/content/normalize";
import { PLACES } from "@/lib/explore/city";

// The dashboard's API client signs requests with Firebase; it isn't needed to draw the form.
vi.mock("@/lib/adminApi", () => ({ draftExploreLines: vi.fn() }));

const { default: ExploreCityFields, placeLabel } = await import("./ExploreCityFields");

const render = (props) =>
  renderToStaticMarkup(
    createElement(ExploreCityFields, {
      value: normalizeExplore(),
      onChange: () => {},
      post: {},
      kind: "project",
      standsAt: "a2",
      pinnedBy: new Map(),
      ...props,
    })
  );

describe("placeLabel", () => {
  it("names each place by district and street", () => {
    const label = (id) => placeLabel(PLACES.find((place) => place.id === id));
    expect(label("a1")).toBe("A1 · Old Town, court off the 1st crossing (left) · workshop");
    expect(label("a2")).toBe("A2 · Old Town, main street (right) · studio");
    expect(label("b2")).toMatch(/^B2 · .+, court off the 3rd crossing \(right\) · lab$/);
  });
});

describe("ExploreCityFields", () => {
  it("offers every place, says where the building stands, and has a field for every line", () => {
    const html = render({ pinnedBy: new Map([["b1", "Portfolio"]]) });
    for (const place of PLACES) expect(html).toContain(`value="${place.id}"`);
    expect(html).toContain("(pinned: Portfolio)");
    expect(html).toContain("Stands at A2 · Old Town, main street (right) · studio (chosen by date).");
    expect(html).toContain("Write with AI");
    // 3 arrival + 3 fact + 2 detail + 1 tagline, in each language.
    expect(html.match(/<input type="text"/g)).toHaveLength(18);
    expect(html).toContain('dir="rtl"');
  });

  it("keeps landmarks in their place", () => {
    const html = render({ kind: "graduation", standsAt: "grad" });
    expect(html).toContain("Stands at the Academy on Graduation Square");
    expect(html).toMatch(/<select disabled=""/);
  });

  it("says when a post is left out of the full city", () => {
    expect(render({ standsAt: "" })).toContain("No free place left");
  });

  it("offers a rewrite once there are lines", () => {
    const value = normalizeExplore({ lines: { en: { arrival: ["Hi"] } } });
    expect(render({ value })).toContain("Rewrite with AI");
  });
});
