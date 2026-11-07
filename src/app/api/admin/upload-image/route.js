import { verifyAdminRequest } from "@/lib/server/adminAuth";

// Images are already resized and compressed in the browser before upload,
// so anything larger than this is unexpected.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/webp", "image/jpeg", "image/png", "image/gif", "image/avif"]);

/**
 * Uploads a project image to imgbb on behalf of the signed-in admin.
 * The imgbb key stays on the server instead of being shipped in the site's JavaScript.
 */
export async function POST(request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const apiKey = process.env.IMGBB_API_KEY || process.env.NEXT_PUBLIC_IMGBB_API_KEY;
  if (!apiKey) return Response.json({ error: "upload_not_configured" }, { status: 503 });

  let file;
  try {
    file = (await request.formData()).get("image");
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }
  if (!file || typeof file === "string") return Response.json({ error: "image_required" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "unsupported_type" }, { status: 415 });
  if (file.size > MAX_IMAGE_BYTES) return Response.json({ error: "image_too_large" }, { status: 413 });

  const upload = new FormData();
  upload.append("image", file, file.name || "image.webp");

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      body: upload,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success || !result?.data?.url) {
      console.error("[upload-image] imgbb rejected the upload:", response.status, result?.error?.message);
      return Response.json({ error: "upload_failed" }, { status: 502 });
    }
    const { url, width, height } = result.data;
    return Response.json({ url, width: Number(width) || null, height: Number(height) || null });
  } catch (error) {
    console.error("[upload-image] imgbb unreachable:", error.message);
    return Response.json({ error: "upload_failed" }, { status: 502 });
  }
}
