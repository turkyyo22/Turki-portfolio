// Shrinks images in the browser before upload, so a 5 MB screenshot becomes a
// few hundred KB and every visitor downloads less.

const DEFAULTS = { maxSize: 1920, quality: 0.82 };

/** Scales (width, height) down to fit inside a maxSize square, keeping the aspect ratio. Never scales up. */
export function fitWithin(width, height, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns a resized WebP (or JPEG where WebP encoding is unsupported).
 * Animated GIFs and anything that fails to decode are returned unchanged.
 */
export async function compressImage(file, { maxSize = DEFAULTS.maxSize, quality = DEFAULTS.quality } = {}) {
  if (!file?.type?.startsWith("image/") || file.type === "image/gif") return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSize);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = await canvasToBlob(canvas, "image/webp", quality);
  // Browsers that can't encode WebP silently return PNG; JPEG is far smaller then.
  if (!blob || blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", quality);
  if (!blob || blob.size >= file.size) return file;

  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const baseName = (file.name || "image").replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.${extension}`, { type: blob.type });
}
