import { describe, expect, it } from "vitest";

import { normalizePost } from "@/lib/content/normalize";
import {
  ROUTE,
  buildTour,
  legCount,
  progressOfStop,
  routeEnd,
  routeZ,
  signWords,
  stationZ,
  stopDistrict,
  stopKind,
  stopTheme,
  tourPosition,
  tourStage,
} from "./plan";

const post = (slug, date, title, extra = {}) =>
  normalizePost({ id: slug, slug, date, en: { title, description: `About ${title}` }, ar: { title: `عربي ${slug}` }, ...extra });

const POSTS = [
  post("cv-builder", "2026-10-01", "Seven Seconds: AI CV Builder"),
  post("ta-core", "2026-06-20", 'System Update: Introducing "T.A Core" AI Assistant'),
  post("munset", "2026-01-17", "Graduation Project: Munset"),
  post("coop", "2025-07-08", "Coop Training: Saudi National Bank"),
  post("car-rental", "2025-06-12", "Car Rental Web Platform"),
  post("students-management", "2023-12-05", "Student Management System (Data Structures)"),
];

const MENU = [
  { id: "a", enName: "Munset", arName: "منصت", progress: 100, slug: "munset" },
  { id: "b", enName: "Stores analytics system", arName: "نظام تحليلات المتاجر", progress: 45, slug: "stores" },
  { id: "c", enName: "Seven Seconds", arName: "سبع ثوان", progress: 20, slug: "cv-builder" },
];

describe("stopKind and stopTheme", () => {
  it("recognises the graduation project and the co-op training", () => {
    expect(stopKind(POSTS[2])).toBe("graduation");
    expect(stopKind(POSTS[3])).toBe("coop");
    expect(stopKind(POSTS[4])).toBe("project");
    expect(stopKind(post("x", "2026-01-01", "", { ar: { title: "مشروع التخرج" } }))).toBe("graduation");
    expect(stopKind(post("y", "2026-01-01", "Co-op at a bank"))).toBe("coop");
  });

  it("picks a hologram from the project's slug and title", () => {
    expect(stopTheme(POSTS[0])).toBe("document");
    expect(stopTheme(POSTS[1])).toBe("robot");
    expect(stopTheme(POSTS[2])).toBe("cap");
    expect(stopTheme(POSTS[3])).toBe("bank");
    expect(stopTheme(POSTS[4])).toBe("car");
    expect(stopTheme(POSTS[5])).toBe("nodes");
    expect(stopTheme(post("portfolio", "2026-06-18", "Central Command Portfolio Launch"))).toBe("globe");
    expect(stopTheme(post("misc", "2026-06-18", "Something else"))).toBe("gem");
  });
});

describe("stopDistrict", () => {
  it("moves from the old town to the neon district, with the landmarks apart", () => {
    expect(stopDistrict("project", 0)).toBe("old");
    expect(stopDistrict("project", 0.4)).toBe("mid");
    expect(stopDistrict("project", 0.8)).toBe("neon");
    expect(stopDistrict("graduation", 0.2)).toBe("graduation");
    expect(stopDistrict("coop", 0.2)).toBe("business");
  });
});

describe("buildTour", () => {
  const tour = buildTour({ posts: POSTS, menu: MENU, lang: "en" });

  it("orders projects from oldest to newest, then graduation, then the co-op", () => {
    expect(tour.stops.map((stop) => stop.slug)).toEqual(["students-management", "car-rental", "ta-core", "cv-builder", "munset", "coop"]);
  });

  it("grows the tier from 0 to 1 and alternates sides", () => {
    expect(tour.stops[0].tier).toBe(0);
    expect(tour.stops.at(-1).tier).toBe(1);
    for (let i = 1; i < tour.stops.length; i += 1) {
      expect(tour.stops[i].tier).toBeGreaterThan(tour.stops[i - 1].tier);
      expect(tour.stops[i].side).toBe(-tour.stops[i - 1].side);
    }
    expect(tour.stops[0].side).toBe(1);
  });

  it("marks unfinished projects from the projects menu", () => {
    const cv = tour.stops.find((stop) => stop.slug === "cv-builder");
    expect(cv.inProgress).toBe(true);
    expect(cv.progress).toBe(20);
    const munset = tour.stops.find((stop) => stop.slug === "munset");
    expect(munset.inProgress).toBe(false);
    const car = tour.stops.find((stop) => stop.slug === "car-rental");
    expect(car.progress).toBeNull();
    expect(car.inProgress).toBe(false);
  });

  it("lists unfinished projects without a post as upcoming", () => {
    expect(tour.upcoming).toEqual([{ id: "b", name: "Stores analytics system", progress: 45 }]);
    expect(buildTour({ posts: POSTS, menu: MENU, lang: "ar" }).upcoming[0].name).toBe("نظام تحليلات المتاجر");
  });

  it("uses the visitor's language, with the year for the signs", () => {
    expect(tour.stops[0].title).toBe("Student Management System (Data Structures)");
    expect(tour.stops[0].year).toBe("2023");
    expect(buildTour({ posts: POSTS, lang: "ar" }).stops[0].title).toBe("عربي students-management");
  });

  it("copes with no content at all", () => {
    const empty = buildTour();
    expect(empty.stops).toEqual([]);
    expect(empty.upcoming).toEqual([]);
    expect(empty.signs).toEqual([]);
    expect(buildTour({ posts: [POSTS[0]] }).stops[0].tier).toBe(0.5);
  });
});

describe("signWords", () => {
  it("keeps short tech names once each, without the bracketed part", () => {
    const skills = [
      { items: ["Android Development (Android Studio)", "Flutter", "Java"] },
      { items: ["React.js", "flutter", "Git & GitHub", ""] },
    ];
    expect(signWords(skills)).toEqual(["Flutter", "Java", "React.js", "Git & GitHub"]);
    expect(signWords(skills, 2)).toHaveLength(2);
    expect(signWords(undefined)).toEqual([]);
  });
});

describe("tourPosition", () => {
  it("starts at 0, ends at the last leg, and reaches each stop at its own progress", () => {
    expect(tourPosition(0, 6)).toBe(0);
    expect(tourPosition(1, 6)).toBeCloseTo(7, 10);
    for (let index = 0; index < 6; index += 1) {
      expect(tourPosition(progressOfStop(index, 6), 6)).toBeCloseTo(index + 1, 10);
    }
    expect(progressOfStop(6, 6)).toBe(1);
  });

  it("never goes backwards and stays within the tour", () => {
    let previous = -1;
    for (let step = 0; step <= 400; step += 1) {
      const position = tourPosition(step / 400, 5);
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    }
    expect(tourPosition(-3, 5)).toBe(0);
    expect(tourPosition(9, 5)).toBeCloseTo(legCount(5), 10);
    expect(tourPosition("nonsense", 5)).toBe(0);
  });

  it("moves slower near a stop than halfway between two stops", () => {
    const speedAt = (progress) => (tourPosition(progress + 0.0005, 4) - tourPosition(progress - 0.0005, 4)) / 0.001;
    expect(speedAt(progressOfStop(1, 4))).toBeLessThan(speedAt(progressOfStop(1, 4) + 0.1) * 0.4);
  });

  it("works with no stops", () => {
    expect(tourPosition(0.5, 0)).toBeCloseTo(0.5, 10);
    expect(routeZ(1, 0)).toBe(routeEnd(0));
  });
});

describe("tourStage", () => {
  it("names the start, the stops, the flight between them and the end", () => {
    expect(tourStage(0, 4)).toEqual({ kind: "intro", index: 0 });
    expect(tourStage(0.5, 4)).toEqual({ kind: "cruise", index: 0 });
    expect(tourStage(1.1, 4)).toEqual({ kind: "stop", index: 0 });
    expect(tourStage(2.5, 4)).toEqual({ kind: "cruise", index: 2 });
    expect(tourStage(3.9, 4)).toEqual({ kind: "stop", index: 3 });
    expect(tourStage(4.5, 4)).toEqual({ kind: "cruise", index: 4 });
    expect(tourStage(4.9, 4)).toEqual({ kind: "finale", index: 4 });
    expect(tourStage(0.9, 0)).toEqual({ kind: "finale", index: 0 });
  });
});

describe("the street", () => {
  it("puts the stations one leg apart and the end past the last one", () => {
    expect(stationZ(0)).toBe(-ROUTE.intro);
    expect(stationZ(3) - stationZ(4)).toBe(ROUTE.leg);
    expect(routeEnd(5)).toBe(stationZ(4) - ROUTE.finale);
  });

  it("maps tour positions to the camera's place on the street", () => {
    expect(routeZ(0, 5)).toBe(0);
    expect(routeZ(1, 5)).toBe(stationZ(0));
    expect(routeZ(3, 5)).toBe(stationZ(2));
    expect(routeZ(2.5, 5)).toBeCloseTo((stationZ(1) + stationZ(2)) / 2, 10);
    expect(routeZ(6, 5)).toBe(routeEnd(5));
    expect(routeZ(99, 5)).toBe(routeEnd(5));
    expect(routeZ(-1, 5)).toBe(0);
  });
});
