// Loads the published CV PDF in the browser, once, and shares it between the
// resume preview and the hero's "Download CV" button.
import { getDocument } from "@/lib/firestore/rest";

let pending = null;

/** Resolves to { bytes: Uint8Array, fileName } or null when no CV is published. */
export function loadCv() {
  pending ??= getDocument("settings/cv")
    .then(async (doc) => {
      if (!doc?.url) return null;
      const fileName = doc.fileName || "Turki-Aloufi-CV.pdf";
      if (doc.url.startsWith("data:")) {
        const binary = atob(doc.url.slice(doc.url.indexOf(",") + 1));
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return { bytes, fileName };
      }
      const response = await fetch(doc.url);
      if (!response.ok) throw new Error(`CV download failed (${response.status})`);
      return { bytes: new Uint8Array(await response.arrayBuffer()), fileName };
    })
    .catch((error) => {
      pending = null; // allow a retry
      throw error;
    });
  return pending;
}

export async function downloadCv() {
  const cv = await loadCv();
  if (!cv) return false;
  const fileName = cv.fileName.toLowerCase().endsWith(".pdf") ? cv.fileName : `${cv.fileName}.pdf`;
  const href = URL.createObjectURL(new Blob([cv.bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return true;
}
