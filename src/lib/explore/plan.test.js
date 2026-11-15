import { describe, expect, it } from "vitest";

import { normalizePost } from "@/lib/content/normalize";
import { legCount, progressOfStop, routeDistance, signWords, stopKind, stopTheme, tourPosition, tourStage } from "./plan";

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

describe("routeDistance", () => {
  it("maps legs onto the stretches of route between stops", () => {
    const stops = [100, 250, 260];
    expect(routeDistance(0, stops, 400)).toBe(0);
    expect(routeDistance(1, stops, 400)).toBe(100);
    expect(routeDistance(1.5, stops, 400)).toBe(175);
    expect(routeDistance(3, stops, 400)).toBe(260);
    expect(routeDistance(4, stops, 400)).toBe(400);
    expect(routeDistance(9, stops, 400)).toBe(400);
    expect(routeDistance(-1, stops, 400)).toBe(0);
    expect(routeDistance(0.5, [], 80)).toBe(40);
  });
});
