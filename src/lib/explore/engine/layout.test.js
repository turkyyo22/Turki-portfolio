import { describe, expect, it } from "vitest";

import { normalizePost } from "@/lib/content/normalize";
import { ROUTE, buildTour, routeEnd, stationZ } from "@/lib/explore/plan";

import { STREET, createLayout } from "./layout";

// Only the stops' colours come from the palette, and the layout doesn't look at them.
const palette = { amber: "amber", accent: "accent", pink: "pink", violet: "violet", mint: "mint", blue: "blue", gold: "gold", emerald: "emerald" };

const post = (slug, date, title) => normalizePost({ id: slug, slug, date, en: { title } });

// The same shape as the real content: five projects, then the graduation project and the co-op.
const tour = buildTour({
  posts: [
    post("students", "2023-12-05", "Student Management System"),
    post("car-rental", "2025-06-12", "Car Rental Web Platform"),
    post("portfolio", "2026-06-18", "Portfolio Launch"),
    post("ta-core", "2026-06-20", "AI Assistant"),
    post("cv-builder", "2026-10-01", "AI CV Builder"),
    post("munset", "2026-01-17", "Graduation Project: Munset"),
    post("coop", "2025-07-08", "Coop Training: Saudi National Bank"),
  ],
  menu: [
    { id: "a", enName: "Stores analytics", arName: "", progress: 45, slug: "stores" },
    { id: "b", enName: "Another idea", arName: "", progress: 10, slug: "" },
  ],
});
const layout = createLayout(tour, palette);

/** The four corners of a stop's building (with its steps) on the map. */
const cornersOf = (station) => {
  const { width, depth, apron } = station;
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2 + apron],
    [-width / 2, depth / 2 + apron],
  ].map(([x, z]) => station.toWorld(x, z));
};

describe("createLayout", () => {
  it("places one building per stop, alternating sides, further down the street each time", () => {
    expect(layout.stations).toHaveLength(7);
    layout.stations.forEach((station, index) => {
      expect(station.cameraZ).toBe(stationZ(index));
      expect(Math.sign(station.x)).toBe(station.side);
      expect(station.z).toBeLessThan(station.cameraZ);
      if (index > 0) expect(station.side).toBe(-layout.stations[index - 1].side);
    });
  });

  it("keeps every building off the sidewalk", () => {
    for (const station of layout.stations) {
      for (const corner of cornersOf(station)) {
        expect(Math.abs(corner.x)).toBeGreaterThanOrEqual(STREET.front + 1);
      }
    }
  });

  it("puts a cross street between every two stops, clear of the buildings on both sides", () => {
    expect(layout.crossings).toHaveLength(6);
    const halfStreet = STREET.roadHalf + STREET.walk;
    layout.crossings.forEach((crossing, index) => {
      expect(crossing).toBeCloseTo(stationZ(index) - ROUTE.leg * ROUTE.crossAt, 10);
      const before = cornersOf(layout.stations[index]).map((corner) => corner.z);
      const after = cornersOf(layout.stations[index + 1]).map((corner) => corner.z);
      // The building just visited ends before the street; the next one starts after it.
      expect(Math.min(...before)).toBeGreaterThanOrEqual(crossing + halfStreet);
      expect(Math.max(...after)).toBeLessThanOrEqual(crossing - halfStreet);
    });
  });

  it("faces each building toward the spot where the camera pauses", () => {
    for (const station of layout.stations) {
      const toCamera = { x: station.cameraX - station.x, z: station.cameraZ - station.z };
      const length = Math.hypot(toCamera.x, toCamera.z);
      expect(station.facing.x).toBeCloseTo(toCamera.x / length, 6);
      expect(station.facing.z).toBeCloseTo(toCamera.z / length, 6);
      // Its square lies in front of it, between the building and the street.
      expect(Math.abs(station.plaza.x)).toBeLessThan(Math.abs(station.x));
    }
  });

  it("hangs every name sign above the shop fronts and aims the camera just below it", () => {
    for (const station of layout.stations) {
      expect(station.signY - (station.signWidth * (340 / 1024)) / 2).toBeGreaterThan(4.6);
      expect(station.focusY).toBeLessThan(station.signY);
    }
  });

  it("makes the street grander from the first stop to the landmarks", () => {
    expect(layout.tierAt(0)).toBe(0);
    expect(layout.tierAt(layout.stations[0].cameraZ)).toBe(0);
    expect(layout.tierAt(layout.stations[5].cameraZ)).toBe(1);
    expect(layout.tierAt(layout.stations[3].cameraZ)).toBeGreaterThan(layout.tierAt(layout.stations[2].cameraZ));
    expect(layout.stations[6].height).toBeGreaterThan(layout.stations[5].height);
    expect(layout.stations[5].height).toBeGreaterThan(layout.stations[0].height);
  });

  it("sets construction sites after the last stop and before the end plaza", () => {
    expect(layout.lots.map((lot) => lot.item.name)).toEqual(["Stores analytics", "Another idea"]);
    const last = layout.stations[6];
    expect(layout.lots[0].side).toBe(-last.side);
    expect(layout.lots[1].side).toBe(last.side);
    for (const lot of layout.lots) {
      expect(lot.z).toBeLessThan(last.cameraZ);
      expect(lot.clearTo).toBeGreaterThan(layout.plaza.z + layout.plaza.radius);
    }
    expect(layout.end).toBe(routeEnd(7));
    expect(layout.plaza.z).toBeLessThan(layout.end);
  });

  it("copes with a tour that has no stops", () => {
    const empty = createLayout(buildTour(), palette);
    expect(empty.stations).toEqual([]);
    expect(empty.crossings).toEqual([]);
    expect(empty.lots).toEqual([]);
    expect(empty.crossingDistance(-100)).toBe(Infinity);
    expect(empty.tierAt(-1000)).toBe(1);
  });
});
