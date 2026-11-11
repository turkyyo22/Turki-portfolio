// Calls from the admin dashboard to the site's admin-only API routes.
// Each request carries the signed-in admin's Firebase ID token.
import { auth } from "@/lib/firebase";

const UPLOAD_ERRORS = {
  unsupported_type: "This image type isn't supported. Use JPG, PNG, WebP or GIF.",
  image_too_large: "The image is still too large after compression (max 4 MB).",
  upload_not_configured: "Image upload isn't configured on the server (IMGBB_API_KEY is missing).",
  upload_failed: "The image host rejected the upload. Please try again.",
  not_admin: "This account isn't allowed to upload images.",
};

const AI_ERRORS = {
  rate_limited: "Too many AI requests in a short time. Wait a minute and try again.",
  ai_busy: "Gemini's quota is used up right now. Try again in a minute.",
  ai_unavailable: "The AI service isn't available right now. Try again shortly.",
  ai_timeout: "The AI took too long to answer. Try again.",
  ai_bad_output: "The AI's answer couldn't be used. Try again.",
  translation_incomplete: "The translation came back incomplete. Try again.",
  too_long: "This text is too long to translate in one go.",
  nothing_to_translate: "There's nothing to translate yet.",
  body_too_large: "This text is too long to send in one go.",
  missing_token: "Your session expired. Sign in again.",
  invalid_token: "Your session expired. Sign in again.",
  not_admin: "This account isn't the site admin.",
  admin_not_configured: "No admin email is configured on the server.",
  network: "Can't reach the server. Check your connection and try again.",
};

/** A failed admin API call, with a readable message and a stable `code`. */
export class AdminApiError extends Error {
  constructor(code) {
    super(AI_ERRORS[code] || `The request failed (${code}).`);
    this.name = "AdminApiError";
    this.code = code;
  }
}

export async function getAdminIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("You are signed out. Please sign in again.");
  return user.getIdToken();
}

async function postWithToken(url, init = {}) {
  const token = await getAdminIdToken();
  return fetch(url, { ...init, method: "POST", headers: { ...init.headers, Authorization: `Bearer ${token}` } });
}

/**
 * Tells the public site to drop its cache so visitors see a change right away.
 * Never throws: if it fails, the site still refreshes on its own within 5 minutes.
 */
export async function refreshPublicSite(scope = "content") {
  try {
    const response = await postWithToken("/api/revalidate", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (error) {
    console.warn("[admin] Couldn't refresh the public site now; it will update within 5 minutes.", error);
    return false;
  }
}

async function postJson(url, payload, { signal } = {}) {
  let response;
  try {
    response = await postWithToken(url, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new AdminApiError(auth.currentUser ? "network" : "missing_token");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AdminApiError(body.error || `http_${response.status}`);
  return body;
}

/**
 * Translates `fields` ({ key: text }) between "en" and "ar" with Gemini and
 * returns the translations under the same keys. Throws an AdminApiError.
 */
export async function translateFields({ from, to, context, fields, signal }) {
  const body = await postJson("/api/admin/translate", { from, to, context, fields }, { signal });
  return body.fields;
}

/** Uploads a (pre-compressed) project image and returns its public URL. Throws a readable error. */
export async function uploadProjectImage(file) {
  const form = new FormData();
  form.append("image", file, file.name);
  const response = await postWithToken("/api/admin/upload-image", { body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.url) {
    throw new Error(UPLOAD_ERRORS[body.error] || `Image upload failed (${response.status}).`);
  }
  return body.url;
}
