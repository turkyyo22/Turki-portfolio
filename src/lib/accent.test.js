import { afterEach, describe, expect, it, vi } from "vitest";

import { ACCENTS, DEFAULT_ACCENT, accentById, applySavedAccentScript, currentAccent, onAccentChange, setAccent } from "@/lib/accent";

/** Just enough of a browser for the accent code: <html>'s attributes, localStorage and events. */
function fakeBrowser({ saved = null, storageBlocked = false, viewTransitions = false } = {}) {
  const attributes = new Map();
  const stored = new Map(saved === null ? [] : [["accent", saved]]);
  const document = {
    documentElement: {
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, String(value)),
      removeAttribute: (name) => attributes.delete(name),
    },
  };
  if (viewTransitions) {
    // Returns a stand-in for a ViewTransition. With "skipped", the browser gave up on
    // the fade (it does that in hidden tabs or when the page is busy) and its promises reject.
    document.startViewTransition = vi.fn((update) => {
      update();
      const outcome = () =>
        viewTransitions === "skipped" ? Promise.reject(new DOMException("Transition was skipped", "AbortError")) : Promise.resolve();
      return { ready: outcome(), finished: outcome(), updateCallbackDone: Promise.resolve() };
    });
  }

  const blocked = () => {
    throw new Error("storage is blocked");
  };
  const localStorage = storageBlocked
    ? { getItem: blocked, setItem: blocked, removeItem: blocked }
    : {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, String(value)),
        removeItem: (key) => stored.delete(key),
      };
  return { attributes, stored, document, localStorage, window: new EventTarget() };
}

/** Puts a fake browser in place of the globals the module reads. */
function useFakeBrowser(options) {
  const browser = fakeBrowser(options);
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("window", browser.window);
  vi.stubGlobal("localStorage", browser.localStorage);
  return browser;
}

/** Runs the <head> script the way the browser would, against a fake browser. */
function runHeadScript(browser) {
  new Function("localStorage", "document", applySavedAccentScript)(browser.localStorage, browser.document);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ACCENTS", () => {
  it("has unique ids and six-digit hex colours, with the default first", () => {
    expect(new Set(ACCENTS.map((accent) => accent.id)).size).toBe(ACCENTS.length);
    expect(ACCENTS[0].id).toBe(DEFAULT_ACCENT);
    for (const accent of ACCENTS) {
      for (const field of ["primary", "secondary", "glow", "deep", "metal", "ambient"]) {
        expect(accent[field], `${accent.id}.${field}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it("falls back to the default colours for an unknown id", () => {
    expect(accentById("purple").id).toBe("purple");
    expect(accentById("red").id).toBe(DEFAULT_ACCENT);
    expect(accentById(undefined).id).toBe(DEFAULT_ACCENT);
  });

  it.each(ACCENTS.map((accent) => [accent.id, accent.primary]))(
    "%s is readable as text on the page and behind the dark button text",
    (_, primary) => {
      // The page background and the button text are both #050A15, and WCAG asks
      // for 4.5:1 for normal-size text.
      expect(contrastRatio(primary, "#050A15")).toBeGreaterThanOrEqual(4.5);
    },
  );
});

/** WCAG contrast ratio between two #RRGGBB colours (1 to 21). */
function contrastRatio(first, second) {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5]
      .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("the <head> script", () => {
  it("applies a colour saved on an earlier visit", () => {
    const browser = fakeBrowser({ saved: "purple" });
    runHeadScript(browser);
    expect(browser.attributes.get("data-accent")).toBe("purple");
  });

  it.each([
    ["nothing is saved", null],
    ["the default is saved", DEFAULT_ACCENT],
    ["an unknown value is saved", "red"],
    ["a crafted value is saved", 'purple" onload="alert(1)'],
  ])("leaves the page alone when %s", (_, saved) => {
    const browser = fakeBrowser({ saved });
    runHeadScript(browser);
    expect(browser.attributes.has("data-accent")).toBe(false);
  });

  it("doesn't throw when storage is blocked", () => {
    const browser = fakeBrowser({ storageBlocked: true });
    expect(() => runHeadScript(browser)).not.toThrow();
    expect(browser.attributes.has("data-accent")).toBe(false);
  });
});

describe("setAccent", () => {
  it("applies and remembers a colour, and tells listeners", () => {
    const browser = useFakeBrowser();
    const listener = vi.fn();
    const stop = onAccentChange(listener);

    setAccent("mint");

    expect(browser.attributes.get("data-accent")).toBe("mint");
    expect(browser.stored.get("accent")).toBe("mint");
    expect(currentAccent()).toBe("mint");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("goes back to the default by removing the attribute and the saved value", () => {
    const browser = useFakeBrowser({ saved: "amber" });
    setAccent("amber");
    setAccent(DEFAULT_ACCENT);

    expect(browser.attributes.has("data-accent")).toBe(false);
    expect(browser.stored.has("accent")).toBe(false);
    expect(currentAccent()).toBe(DEFAULT_ACCENT);
  });

  it("ignores unknown colours and the colour already showing", () => {
    const browser = useFakeBrowser();
    const listener = vi.fn();
    onAccentChange(listener);

    setAccent("red");
    setAccent(DEFAULT_ACCENT);

    expect(browser.attributes.has("data-accent")).toBe(false);
    expect(browser.stored.size).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("changes the colour inside a view transition when the browser has them", () => {
    const browser = useFakeBrowser({ viewTransitions: true });
    setAccent("purple");

    expect(browser.document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(browser.attributes.get("data-accent")).toBe("purple");
  });

  it("changes the colour without an uncaught error when the browser skips the fade", async () => {
    // Vitest fails the run on an unhandled promise rejection, so this also checks that
    // the rejected promises of a skipped transition are handled.
    const browser = useFakeBrowser({ viewTransitions: "skipped" });
    setAccent("amber");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(browser.attributes.get("data-accent")).toBe("amber");
  });

  it("still applies the colour when storage is blocked", () => {
    const browser = useFakeBrowser({ storageBlocked: true });
    expect(() => setAccent("amber")).not.toThrow();
    expect(browser.attributes.get("data-accent")).toBe("amber");
  });

  it("reports the default when <html> has an unknown value", () => {
    const browser = useFakeBrowser();
    browser.attributes.set("data-accent", "red");
    expect(currentAccent()).toBe(DEFAULT_ACCENT);
  });
});
