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
