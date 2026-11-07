import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

// Firebase ID tokens are JWTs signed by Google. Verifying them only needs
// Google's public keys, so no service-account secret is required.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

function allowedAdminEmails() {
  const configured = process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL || "";
  return configured
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Checks the `Authorization: Bearer <Firebase ID token>` header and that the
 * signed-in user is the site admin. Denies by default when no admin email is configured.
 */
export async function verifyAdminRequest(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "missing_token" };

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const admins = allowedAdminEmails();
  if (!projectId || admins.length === 0) return { ok: false, status: 503, error: "admin_not_configured" };

  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    });
    const email = String(payload.email || "").toLowerCase();
    if (!payload.sub || !admins.includes(email)) return { ok: false, status: 403, error: "not_admin" };
    return { ok: true, email };
  } catch {
    return { ok: false, status: 401, error: "invalid_token" };
  }
}
