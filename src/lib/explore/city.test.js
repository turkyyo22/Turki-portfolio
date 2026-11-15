import { describe, expect, it } from "vitest";

import { normalizePost } from "@/lib/content/normalize";
import {
  FINALE_Z,
  LANDMARKS,
  LOTS,
  PLACES,
  TOUR_START_Z,
  assignPlaces,
  buildCity,
  cornersOf,
  districtAt,
  facadeOf,
  footprintOf,
  grandnessAt,
  lotSite,
  placeById,
  planRoute,
  sideStreetById,
  siteOf,
} from "./city";

const post = (slug, date, title, extra = {}) =>
  normalizePost({
    id: slug,
    slug,
    date,
    en: { title, description: `About ${title}`, content: `More about ${title}` },
    ar: { title: `عربي ${slug}` },
    tags: ["Next.js"],
    ...extra,
  });

// The site's content in the shape it has today.
const POSTS = [
  post("cv-builder", "2026-10-01", "Seven Seconds: AI CV Builder", { createdAt: "2026-10-01T15:13:53Z" }),
  post("ta-core", "2026-06-20", 'System Update: Introducing "T.A Core" AI Assistant', { createdAt: "2026-06-20T22:32:57Z" }),
  post("portfolio", "2026-06-18", "Central Command Portfolio Launch", { createdAt: "2026-06-18T17:02:31Z" }),
  post("car-rental", "2025-06-12", "Car Rental Web Platform", { createdAt: "2026-06-18T17:00:30Z" }),
  post("munset", "2026-01-17", "Graduation Project: Munset", { createdAt: "2026-06-18T16:52:42Z" }),
  post("coop", "2025-07-08", "Coop Training: Saudi National Bank", { createdAt: "2026-06-18T16:38:04Z" }),
  post("students-management", "2023-12-05", "Student Management System (Data Structures)", { createdAt: "2026-06-18T16:23:13Z" }),
];

const MENU = [
  { id: "m1", enName: "Munset", arName: "منصت", progress: 100, slug: "munset" },
  { id: "m2", enName: "Stores analytics system", arName: "نظام تحليلات المتاجر", progress: 45, slug: "stores" },
  { id: "m3", enName: "Seven Seconds", arName: "سبع ثوان", progress: 20, slug: "cv-builder" },
];

const slugsByPlace = (assigned) => Object.fromEntries([...assigned].map(([place, item]) => [place, item.slug]));

/** True when (x, z) lies within `margin` metres of a building's footprint. */
function isInside(site, x, z, margin) {
  const dx = x - site.x;
  const dz = z - site.z;
  const cos = Math.cos(site.turn);
  const sin = Math.sin(site.turn);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const { width, depth, apron } = site.footprint;
  return Math.abs(lx) < width / 2 + margin && lz > -depth / 2 - margin && lz < depth / 2 + apron + margin;
}

describe("assignPlaces", () => {
  it("puts the milestones at the centre and the projects around them by date", () => {
    expect(slugsByPlace(assignPlaces(POSTS))).toEqual({
      grad: "munset",
      coop: "coop",
      a1: "students-management",
      a2: "car-rental",
      b1: "portfolio",
      b2: "ta-core",
      b3: "cv-builder",
    });
  });

  it("gives a new post a free place without moving the others", () => {
    const before = slugsByPlace(assignPlaces(POSTS));
    const after = slugsByPlace(assignPlaces([...POSTS, post("new-app", "2027-02-01", "New App")]));
    expect(after.b4).toBe("new-app");
    for (const [place, slug] of Object.entries(before)) expect(after[place]).toBe(slug);
  });

  it("honours a place pinned in the dashboard", () => {
    const pinned = POSTS.map((item) => (item.slug === "car-rental" ? { ...item, explore: { ...item.explore, place: "a3" } } : item));
    const result = slugsByPlace(assignPlaces(pinned));
    expect(result.a3).toBe("car-rental");
    expect(result.a2).toBeUndefined();
  });

  it("fills places in order when there are no milestones, and leaves out posts beyond the last place", () => {
    const many = Array.from({ length: 12 }, (_, i) => post(`p${i}`, `2024-01-${String(i + 1).padStart(2, "0")}`, `Project ${i}`));
    const result = assignPlaces(many);
    expect(result.size).toBe(PLACES.length);
    expect(result.get("a1").slug).toBe("p0");
    expect(result.get("b5").slug).toBe("p7");
    expect(assignPlaces([]).size).toBe(0);
  });
});

describe("planRoute", () => {
  const assigned = assignPlaces(POSTS);
  const { path, order } = planRoute(new Set(assigned.keys()));

  it("reaches the stops in order along the route", () => {
    expect(order).toEqual(["a1", "a2", "grad", "coop", "b1", "b2", "b3"]);
    const distances = order.map((id) => path.marks[id]);
    for (let i = 1; i < distances.length; i += 1) expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    expect(path.marks.finale).toBeCloseTo(path.length, 6);
  });

  it("pauses for each stop at the place's view point", () => {
    for (const id of order) {
      const site = siteOf(placeById(id));
      const point = path.at(path.marks[id]);
      // On the main street the route stays on the centre line; the camera moves across from there.
      expect(point.z).toBeCloseTo(site.view.z, 6);
      if (placeById(id).at !== "main") expect(point.x).toBeCloseTo(site.view.x, 6);
    }
  });

  it("ends at the plaza, back on the main street", () => {
    const end = path.at(path.length);
    expect(end.x).toBeCloseTo(0, 6);
    expect(end.z).toBeCloseTo(FINALE_Z, 6);
    expect(end.hz).toBeCloseTo(-1, 6);
  });

  it("never drives through a building", () => {
    const sites = [...assigned.keys()].map((id) => siteOf(placeById(id)));
    for (let s = 0; s <= path.length; s += 0.5) {
      const point = path.at(s);
      for (const site of sites) expect(isInside(site, point.x, point.z, 2)).toBe(false);
    }
  });

  it("skips side streets with nothing on them", () => {
    expect(planRoute(new Set(["a2", "b1"])).order).toEqual(["a2", "b1"]);
    // With no stops at all it is one straight drive down the main street.
    expect(planRoute().path.length).toBeCloseTo(TOUR_START_Z - FINALE_Z, 6);
  });
});

describe("siteOf", () => {
  it("keeps buildings on the main street off the sidewalk, facing the camera's pause point", () => {
    for (const place of PLACES.filter((item) => item.at === "main")) {
      for (const size of ["small", "medium", "large"]) {
        const site = siteOf(place, footprintOf(place, size));
        for (const corner of cornersOf(site.footprint, site.turn)) {
          expect(Math.abs(site.x + corner.x)).toBeGreaterThanOrEqual(facadeOf("main") + 1);
        }
        expect(site.turn).toBeCloseTo(Math.atan2(site.view.x - site.x, site.view.z - site.z), 6);
      }
    }
  });

  it("puts buildings at the end of side streets beyond their square, facing back down the street", () => {
    for (const place of [...PLACES, ...LANDMARKS].filter((item) => item.at !== "main")) {
      const street = sideStreetById(place.at);
      const site = siteOf(place, footprintOf(place, "large"));
      const front = Math.abs(site.x) - site.footprint.depth / 2 - site.footprint.apron;
      expect(front).toBeGreaterThanOrEqual(street.reach + street.square);
      expect(Math.sin(site.turn)).toBeCloseTo(-street.side, 6);
    }
  });

  it("keeps construction lots off the sidewalk", () => {
    for (const lot of LOTS) {
      const site = lotSite(lot);
      expect(Math.abs(site.x) - site.footprint.depth / 2).toBeGreaterThanOrEqual(facadeOf("main"));
    }
  });
});

describe("districts", () => {
  it("grow grander from the gate to the centre and ease off after it", () => {
    expect(grandnessAt(TOUR_START_Z)).toBe(0);
    expect(grandnessAt(-340)).toBe(1);
    expect(grandnessAt(-200)).toBeLessThan(grandnessAt(-300));
    expect(grandnessAt(-500)).toBeLessThan(1);
    expect(grandnessAt(-800)).toBeCloseTo(0.5, 6);
    expect(districtAt(0)).toBe("old");
    expect(districtAt(-340)).toBe("centre");
    expect(districtAt(-600)).toBe("new");
    expect(districtAt(-760)).toBe("frontier");
  });
});

describe("buildCity", () => {
  const city = buildCity({ posts: POSTS, menu: MENU, lang: "en" });

  it("lists the stops in route order with what the city and the card need", () => {
    expect(city.stops.map((stop) => stop.slug)).toEqual(["students-management", "car-rental", "munset", "coop", "portfolio", "ta-core", "cv-builder"]);
    const grad = city.stops[2];
    expect(grad).toMatchObject({ kind: "graduation", type: "academy", place: "grad", side: 0, district: "centre", theme: "cap" });
    expect(city.stops[1]).toMatchObject({ place: "a2", side: 1, type: "studio", size: "medium", district: "old" });
    const cv = city.stops.at(-1);
    expect(cv).toMatchObject({ inProgress: true, progress: 20, type: "tower", year: "2026", tags: ["Next.js"] });
    expect(cv.content).toBe("More about Seven Seconds: AI CV Builder");
    expect(city.stops[0].inProgress).toBe(false);
  });

  it("lists unfinished projects without a post as construction sites", () => {
    expect(city.upcoming).toEqual([{ id: "m2", name: "Stores analytics system", progress: 45 }]);
    expect(buildCity({ posts: POSTS, menu: MENU, lang: "ar" }).upcoming[0].name).toBe("نظام تحليلات المتاجر");
  });

  it("uses the size, type and robot lines chosen in the dashboard, in the visitor's language", () => {
    const custom = POSTS.map((item) =>
      item.slug === "car-rental"
        ? normalizePost({
            ...item,
            explore: { size: "large", type: "lab", accent: "#FF00AA", lines: { en: { arrival: ["Welcome!"], tagline: "Cars" }, ar: { arrival: ["أهلاً"] } } },
          })
        : item
    );
    const en = buildCity({ posts: custom, lang: "en" }).stops.find((stop) => stop.slug === "car-rental");
    expect(en).toMatchObject({ size: "large", type: "lab", accent: "#ff00aa" });
    expect(en.lines.arrival).toEqual(["Welcome!"]);
    expect(en.lines.tagline).toBe("Cars");
    const ar = buildCity({ posts: custom, lang: "ar" }).stops.find((stop) => stop.slug === "car-rental");
    expect(ar.lines.arrival).toEqual(["أهلاً"]);
    // A landmark keeps its own building whatever is chosen.
    const grad = buildCity({ posts: POSTS.map((item) => (item.slug === "munset" ? normalizePost({ ...item, explore: { type: "lab" } }) : item)) }).stops[2];
    expect(grad.type).toBe("academy");
  });

  it("copes with no content", () => {
    const empty = buildCity();
    expect(empty.stops).toEqual([]);
    expect(empty.upcoming).toEqual([]);
    expect(empty.signs).toEqual([]);
  });
});
