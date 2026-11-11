import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodeDocument, decodeValue, encodeFields, getDocument, listDocuments } from "./rest";

describe("Firestore value encoding", () => {
  it("decodes every value type the site stores", () => {
    expect(decodeValue({ stringValue: "hi" })).toBe("hi");
    expect(decodeValue({ integerValue: "42" })).toBe(42);
    expect(decodeValue({ doubleValue: 1.5 })).toBe(1.5);
    expect(decodeValue({ booleanValue: false })).toBe(false);
    expect(decodeValue({ nullValue: null })).toBeNull();
    expect(decodeValue({ timestampValue: "2026-01-01T00:00:00Z" })).toBe("2026-01-01T00:00:00Z");
    expect(decodeValue({ arrayValue: {} })).toEqual([]);
    expect(
      decodeValue({ mapValue: { fields: { en: { mapValue: { fields: { title: { stringValue: "T" } } } } } } })
    ).toEqual({ en: { title: "T" } });
  });

  it("round-trips data through encodeFields and decodeDocument", () => {
    const data = { name: "Turki", count: 3, ratio: 0.5, isRead: false, tags: ["a", "b"], nested: { ok: true } };
    const document = { name: "projects/p/databases/(default)/documents/messages/abc", fields: encodeFields(data) };
    expect(decodeDocument(document)).toEqual({ id: "abc", ...data });
  });

  it("skips undefined fields when encoding", () => {
    expect(encodeFields({ a: undefined, b: "x" })).toEqual({ b: { stringValue: "x" } });
  });
});

describe("Firestore REST reads", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "demo-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns null for a missing document", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await expect(getDocument("settings/cv")).resolves.toBeNull();
  });

  it("passes Next.js cache options and follows pagination", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          documents: [{ name: "x/posts/1", fields: { slug: { stringValue: "one" } } }],
          nextPageToken: "next",
        })
      )
      .mockResolvedValueOnce(Response.json({ documents: [{ name: "x/posts/2", fields: {} }] }));
    vi.stubGlobal("fetch", fetchMock);

    const cache = { revalidate: 300, tags: ["content"] };
    const documents = await listDocuments("posts", { orderBy: "createdAt desc", cache });

    expect(documents).toEqual([{ id: "1", slug: "one" }, { id: "2" }]);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(String(firstUrl)).toContain("/projects/demo-project/databases/(default)/documents/posts");
    expect(String(firstUrl)).toContain("orderBy=createdAt+desc");
    expect(firstInit).toEqual({ next: cache });
    expect(String(fetchMock.mock.calls[1][0])).toContain("pageToken=next");
  });

  it("throws with the HTTP status on other errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "denied" } }, { status: 403 }))
    );
    await expect(getDocument("settings/cv")).rejects.toMatchObject({ status: 403 });
  });
});
