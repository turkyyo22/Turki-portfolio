// Minimal Firestore REST client.
//
// The public site only needs a handful of reads (and one create for the contact
// form), so it talks to Firestore over plain HTTPS instead of shipping the
// Firebase SDK to every visitor. The same security rules apply as with the SDK.
// Works on the server (where Next.js can cache the responses) and in the browser.

const API_ROOT = "https://firestore.googleapis.com/v1";
const MAX_PAGES = 10;

export class FirestoreRestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "FirestoreRestError";
    this.status = status;
  }
}

function config() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    throw new FirestoreRestError("Firebase project id or API key is not configured.", 500);
  }
  return { projectId, apiKey };
}

function documentsUrl(path, params = {}) {
  const { projectId, apiKey } = config();
  const url = new URL(`${API_ROOT}/projects/${projectId}/databases/(default)/documents/${path}`);
  url.searchParams.set("key", apiKey);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
  }
  return url;
}

// `cache` is passed through as Next.js fetch options ({ revalidate, tags }).
// Browsers ignore the unknown `next` key.
function fetchOptions(cache) {
  return cache ? { next: cache } : { cache: "no-store" };
}

export function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return decodeFields(value.mapValue.fields);
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("referenceValue" in value) return value.referenceValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  return null;
}

export function decodeFields(fields) {
  const result = {};
  for (const [name, value] of Object.entries(fields || {})) result[name] = decodeValue(value);
  return result;
}

export function decodeDocument(document) {
  return { id: document.name.split("/").pop(), ...decodeFields(document.fields) };
}

export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
  throw new TypeError(`Cannot encode ${typeof value} for Firestore.`);
}

export function encodeFields(data) {
  const fields = {};
  for (const [name, value] of Object.entries(data)) {
    if (value !== undefined) fields[name] = encodeValue(value);
  }
  return fields;
}

async function readError(response) {
  try {
    const body = await response.json();
    return body?.error?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

/** Returns the decoded document, or null when it does not exist. */
export async function getDocument(path, { cache } = {}) {
  const response = await fetch(documentsUrl(path), fetchOptions(cache));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new FirestoreRestError(`Reading ${path} failed: ${await readError(response)}`, response.status);
  }
  return decodeDocument(await response.json());
}

/** Lists a collection, following pagination. `orderBy` uses REST syntax, e.g. "createdAt desc". */
export async function listDocuments(collection, { orderBy, pageSize = 100, cache } = {}) {
  const documents = [];
  let pageToken;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = documentsUrl(collection, { orderBy, pageSize, pageToken });
    const response = await fetch(url, fetchOptions(cache));
    if (!response.ok) {
      throw new FirestoreRestError(`Listing ${collection} failed: ${await readError(response)}`, response.status);
    }
    const body = await response.json();
    for (const document of body.documents || []) documents.push(decodeDocument(document));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return documents;
}

/** Creates a document with an auto-generated id. Allowed only where the security rules permit it. */
export async function createDocument(collection, data) {
  const response = await fetch(documentsUrl(collection), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!response.ok) {
    throw new FirestoreRestError(`Creating a document in ${collection} failed: ${await readError(response)}`, response.status);
  }
  return decodeDocument(await response.json());
}
