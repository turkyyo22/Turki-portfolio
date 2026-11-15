// Live check of the guide robot's lines against the real Gemini API.
// Skipped by default (it uses your API quota). To run it:
//   PowerShell:  $env:LIVE_AI="1"; npx vitest run src/lib/ai/exploreLines.live.test.js
//   bash:        LIVE_AI=1 npx vitest run src/lib/ai/exploreLines.live.test.js
import { describe, expect, it } from "vitest";

const LIVE = process.env.LIVE_AI === "1";
const ARABIC = /[؀-ۿ]/;

// Next.js skips .env.local when NODE_ENV is "test", so read the Gemini settings from it directly.
async function loadGeminiEnv() {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(".env.local", "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(GOOGLE_GENERATIVE_AI_API_KEY|GEMINI_MODEL|GEMINI_ADMIN_MODEL)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

describe.skipIf(!LIVE)("writeExploreLines with Gemini (live)", () => {
  it("writes short, grounded lines in both languages", async () => {
    await loadGeminiEnv();
    const { google } = await import("@ai-sdk/google");
    const { providerOptionsFor, resolveAdminModelId } = await import("@/lib/assistant/model");
    const { writeExploreLines } = await import("./exploreLines");
    const modelId = resolveAdminModelId();

    const lines = await writeExploreLines({
      model: google(modelId),
      providerOptions: providerOptionsFor(modelId),
      post: {
        slug: "car-rental",
        date: "2025-06-10",
        tags: ["HTML", "CSS", "JavaScript", "Firebase"],
        en: {
          title: "Car Rental Web Platform",
          description: "An HTML, CSS, and JavaScript front end for browsing cars, booking, and issuing invoices, with Firebase Authentication and a Firebase database.",
          content: "The interface lists available cars, records a booking, stores it, and issues an invoice from the saved data.",
        },
        ar: { title: "منصة تأجير السيارات", description: "واجهة لتصفح السيارات والحجز وإصدار الفواتير، مع Firebase.", content: "" },
      },
    });
    console.log(JSON.stringify(lines, null, 2));

    for (const lang of ["en", "ar"]) {
      expect(lines[lang].arrival.length).toBeGreaterThan(0);
      expect(lines[lang].fact.length).toBeGreaterThan(0);
      expect(lines[lang].detail.length).toBeGreaterThan(0);
      expect(lines[lang].tagline).toBeTruthy();
    }
    expect(ARABIC.test(lines.ar.arrival[0])).toBe(true);
    // Nothing made up: no figures that aren't in the post.
    expect(JSON.stringify(lines)).not.toMatch(/\d{2,}%|\b\d{3,}\b users/i);
  }, 40_000);
});
