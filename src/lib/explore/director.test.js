import { describe, expect, it } from "vitest";

import en from "../../../dictionaries/en.json";
import { createDirector } from "./director";

const stops = [
  { title: "Student Management System", kind: "project", lines: null },
  { title: "Car Rental", kind: "project", lines: { arrival: ["Vroom! My first real web app."], fact: ["It issued invoices."], detail: ["Have a look round."], tagline: "Cars on rent" } },
  { title: "Munset", kind: "graduation", lines: null },
  { title: "Seven Seconds", kind: "project", inProgress: true, progress: 20, lines: null },
];

/** A director with a clock the test moves by hand, and a fixed "random". */
function setUp() {
  const time = { now: 0 };
  const director = createDirector({ dict: en.explore.guide, stops, random: () => 0, clock: () => time.now });
  return { director, time };
}

describe("createDirector", () => {
  it("says the stage line on arrival, and the building's own arrival line when it has one", () => {
    const { director } = setUp();
    expect(director.react({ type: "stage", stage: { kind: "intro", index: 0 } })).toEqual({ text: en.explore.guide.intro, mood: "wave" });
    expect(director.react({ type: "stage", stage: { kind: "stop", index: 0 } })).toEqual({ text: en.explore.guide.first, mood: "present" });
    expect(director.react({ type: "stage", stage: { kind: "stop", index: 1 } })).toEqual({ text: "Vroom! My first real web app.", mood: "present" });
    expect(director.react({ type: "stage", stage: { kind: "stop", index: 2 } }).text).toBe(en.explore.guide.graduation);
    expect(director.react({ type: "stage", stage: { kind: "stop", index: 3 } }).text).toContain("20");
    expect(director.react({ type: "stage", stage: { kind: "cruise", index: 1 } }).text).toContain("Car Rental");
    expect(director.react({ type: "stage", stage: { kind: "finale", index: 4 } }).mood).toBe("celebrate");
  });

  it("says ouch when clicked, and gets dizzy when clicked again and again", () => {
    const { director, time } = setUp();
    const first = director.react({ type: "click-guide" });
    expect(en.explore.guide.reactions.ouch).toContain(first.text);
    expect(first.mood).toBe("flinch");
    // Too soon after the last click: no new line.
    expect(director.react({ type: "click-guide" })).toBeNull();
    for (let i = 0; i < 3; i += 1) {
      time.now += 1;
      director.react({ type: "click-guide" });
    }
    time.now += 1;
    expect(director.react({ type: "click-guide" }).mood).toBe("dizzy");
  });

  it("asks the visitor to slow down, but not every time", () => {
    const { director, time } = setUp();
    const first = director.react({ type: "fast" });
    expect(en.explore.guide.reactions.fast).toContain(first.text);
    time.now += 3;
    expect(director.react({ type: "fast" })).toBeNull();
    time.now += 20;
    expect(director.react({ type: "fast" })).not.toBeNull();
  });

  it("names a stop the visitor rushed past, and shares a building's own facts", () => {
    const { director } = setUp();
    expect(director.react({ type: "skip", index: 1 }).text).toContain("Car Rental");
    expect(director.react({ type: "idle-stop", index: 1 }).text).toBe("It issued invoices.");
    expect(director.react({ type: "click-stop", index: 1 }).text).toBe("Cars on rent");
    expect(director.react({ type: "detail-open", index: 1 }).text).toBe("Have a look round.");
    // A building without its own lines falls back to the generic ones.
    expect(en.explore.guide.reactions.details).toContain(director.react({ type: "detail-open", index: 0 }).text);
  });

  it("falls asleep when left alone, and wakes up on the next event", () => {
    const { director } = setUp();
    expect(director.react({ type: "idle" }).mood).toBe("sleep");
    expect(director.asleep).toBe(true);
    const woken = director.react({ type: "fast" });
    expect(woken.mood).toBe("wake");
    expect(director.asleep).toBe(false);
  });

  it("greets late at night and in the morning, and stays quiet otherwise", () => {
    const { director } = setUp();
    expect(director.react({ type: "greeting", hour: 2 }).mood).toBe("wave");
    expect(director.react({ type: "greeting", hour: 15 })).toBeNull();
    expect(director.react({ type: "welcome-back", title: "Munset" }).text).toContain("Munset");
    expect(director.react({ type: "nonsense" })).toBeNull();
  });
});
