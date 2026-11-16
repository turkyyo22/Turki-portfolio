import { describe, expect, it } from "vitest";

import { normalizePost } from "@/lib/content/normalize";
import { SHOP_NAMES, createTour, signWords, stopKind, stopTheme } from "./plan";

const post = (slug, title, extra = {}) => normalizePost({ id: slug, slug, en: { title }, ...extra });

describe("stopKind and stopTheme", () => {
  it("recognises the graduation project and the co-op training", () => {
    expect(stopKind(post("munset", "Graduation Project: Munset"))).toBe("graduation");
    expect(stopKind(post("coop", "Coop Training: Saudi National Bank"))).toBe("coop");
    expect(stopKind(post("car-rental", "Car Rental Web Platform"))).toBe("project");
    expect(stopKind(post("x", "", { ar: { title: "مشروع التخرج" } }))).toBe("graduation");
    expect(stopKind(post("y", "Co-op at a bank"))).toBe("coop");
  });

  it("picks a hologram from the project's slug and title", () => {
    expect(stopTheme(post("cv-builder", "Seven Seconds: AI CV Builder"))).toBe("document");
    expect(stopTheme(post("ta-core", 'System Update: Introducing "T.A Core" AI Assistant'))).toBe("robot");
    expect(stopTheme(post("munset", "Graduation Project: Munset"))).toBe("cap");
    expect(stopTheme(post("coop", "Coop Training"))).toBe("bank");
    expect(stopTheme(post("car-rental", "Car Rental Web Platform"))).toBe("car");
    expect(stopTheme(post("students-management", "Student Management System"))).toBe("nodes");
    expect(stopTheme(post("portfolio", "Central Command Portfolio Launch"))).toBe("globe");
    expect(stopTheme(post("misc", "Something else"))).toBe("gem");
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

describe("SHOP_NAMES", () => {
  it("names the shops in both languages, turn and turn about, enough to fill the texture", () => {
    expect(SHOP_NAMES).toHaveLength(32);
    expect(new Set(SHOP_NAMES).size).toBe(32);
    SHOP_NAMES.forEach((name, index) => {
      expect(/[؀-ۿ]/.test(name)).toBe(index % 2 === 1);
      expect(name.length).toBeLessThanOrEqual(10);
    });
  });
});

describe("createTour", () => {
  // Three stops on a 600 m route, the last two close together.
  const tour = createTour([100, 420, 470], 600);

  it("drives from the start to the end, reaching each stop at its own scroll progress", () => {
    expect(tour.count).toBe(3);
    expect(tour.distanceAt(0)).toBe(0);
    expect(tour.distanceAt(1)).toBeCloseTo(600, 6);
    [100, 420, 470].forEach((distance, index) => {
      expect(tour.distanceAt(tour.progressOfStop(index))).toBeCloseTo(distance, 6);
    });
    expect(tour.progressOfStop(-1)).toBe(0);
    expect(tour.progressOfStop(3)).toBe(1);
    for (const distance of [0, 37.5, 100, 333.3, 599, 600]) expect(tour.distanceAt(tour.progressAt(distance))).toBeCloseTo(distance, 6);
  });

  it("never goes backwards and stays within the route", () => {
    let previous = -1;
    for (let step = 0; step <= 500; step += 1) {
      const distance = tour.distanceAt(step / 500);
      expect(distance).toBeGreaterThanOrEqual(previous);
      previous = distance;
    }
    expect(tour.distanceAt(-3)).toBe(0);
    expect(tour.distanceAt(9)).toBeCloseTo(600, 6);
    expect(tour.distanceAt("nonsense")).toBe(0);
  });

  it("covers the same ground for the same scroll while cruising, and less near a stop", () => {
    const metresFor = (distance) => {
      const progress = tour.progressAt(distance);
      const scroll = 1 / tour.scrollLength;
      return tour.distanceAt(progress + scroll / 2) - tour.distanceAt(progress - scroll / 2);
    };
    // A metre of scrolling is a metre of road far from any stop…
    expect(metresFor(250)).toBeCloseTo(1, 2);
    expect(metresFor(560)).toBeCloseTo(1, 2);
    // …and about a third of one at a stop.
    expect(metresFor(100)).toBeLessThan(0.4);
    expect(metresFor(100)).toBeGreaterThan(0.25);
    expect(tour.scrollLength).toBeGreaterThan(tour.length);
  });

  it("counts the same place in legs", () => {
    expect(tour.positionAt(0)).toBe(0);
    expect(tour.positionAt(50)).toBeCloseTo(0.5, 10);
    expect(tour.positionAt(100)).toBeCloseTo(1, 10);
    expect(tour.positionAt(445)).toBeCloseTo(2.5, 10);
    expect(tour.positionAt(600)).toBeCloseTo(4, 10);
    expect(tour.positionAt(900)).toBeCloseTo(4, 10);
  });

  it("names the start, the stops, the drive between them and the end", () => {
    expect(tour.stageAt(0)).toEqual({ kind: "intro", index: 0 });
    expect(tour.stageAt(50)).toEqual({ kind: "cruise", index: 0 });
    expect(tour.stageAt(85)).toEqual({ kind: "stop", index: 0 });
    expect(tour.stageAt(125)).toEqual({ kind: "stop", index: 0 });
    expect(tour.stageAt(250)).toEqual({ kind: "cruise", index: 1 });
    // Between two close stops, the nearer one is in view.
    expect(tour.stageAt(440)).toEqual({ kind: "stop", index: 1 });
    expect(tour.stageAt(450)).toEqual({ kind: "stop", index: 2 });
    expect(tour.stageAt(530)).toEqual({ kind: "cruise", index: 3 });
    expect(tour.stageAt(580)).toEqual({ kind: "finale", index: 3 });
    expect(tour.nearestStop(430)).toEqual({ index: 1, away: 10 });
  });

  it("copes with a route that has no stops, and with no route", () => {
    const straight = createTour([], 300);
    expect(straight.distanceAt(0.5)).toBeCloseTo(150, 6);
    expect(straight.scrollLength).toBeCloseTo(300, 6);
    expect(straight.stageAt(5)).toEqual({ kind: "intro", index: 0 });
    expect(straight.stageAt(150)).toEqual({ kind: "cruise", index: 0 });
    expect(straight.stageAt(290)).toEqual({ kind: "finale", index: 0 });
    expect(straight.nearestStop(10).index).toBe(-1);
    const none = createTour();
    expect(none.distanceAt(0.5)).toBe(0);
    expect(none.progressAt(10)).toBe(0);
    expect(none.progressOfStop(0)).toBe(1);
  });
});
