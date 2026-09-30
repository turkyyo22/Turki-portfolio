"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

function pdfBytes(storedUrl) {
  const comma = storedUrl.indexOf(",");
  const binary = atob(storedUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pdfBlobUrl(storedUrl) {
  if (!storedUrl?.startsWith("data:")) return storedUrl;
  const comma = storedUrl.indexOf(",");
  const mime = /:(.*?);/.exec(storedUrl.slice(0, comma))?.[1] || "application/pdf";
  return URL.createObjectURL(new Blob([pdfBytes(storedUrl)], { type: mime }));
}

function PdfPages({ storedUrl }) {
  const hostRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !storedUrl) return undefined;
    let cancelled = false;
    host.replaceChildren();
    setFailed(false);

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const data = storedUrl.startsWith("data:")
        ? pdfBytes(storedUrl)
        : new Uint8Array(await (await fetch(storedUrl)).arrayBuffer());
      const pdf = await pdfjs.getDocument({ data }).promise;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (cancelled) return;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.45 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.dir = "ltr";
        context.direction = "ltr";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "w-full h-auto bg-white";
        host.appendChild(canvas);
        await page.render({ canvasContext: context, viewport }).promise;
      }
    })().catch((error) => {
      console.error("CV preview failed:", error);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [storedUrl]);

  if (failed) {
    return <p className="text-white/50 text-sm font-mono py-8 text-center">Could not preview this PDF.</p>;
  }

  return <div ref={hostRef} dir="ltr" className="flex flex-col" />;
}

export default function CvProjects({ dict }) {
  const [cv, setCv] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const cvSnap = await getDoc(doc(db, "settings", "cv"));
        if (cvSnap.exists() && cvSnap.data().url) setCv(cvSnap.data());
      } catch (error) {
        console.error("Error loading CV:", error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") setIsViewerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const downloadCv = async () => {
    if (!cv?.url || isDownloading) return;
    const fileName = cv.fileName?.toLowerCase().endsWith(".pdf") ? cv.fileName : `${cv.fileName || "Turki-CV"}.pdf`;
    setIsDownloading(true);
    try {
      const href = pdfBlobUrl(cv.url);
      const link = document.createElement("a");
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (href.startsWith("blob:")) URL.revokeObjectURL(href);
    } catch (error) {
      console.error("CV download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!dict) return null;

  return (
    <>
      <section className="w-full max-w-7xl mx-auto mt-20 z-10 relative px-4 md:px-0">
        <div id="cv" className="bg-glass border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md flex flex-col">
          <h3 className="text-2xl font-bold text-white tracking-wider mb-6">{dict.cvTitle}</h3>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !cv ? (
            <p className="text-white/50 font-mono text-sm py-10 text-center">{dict.emptyCv}</p>
          ) : (
            <>
              <p className="text-white/50 text-xs font-mono mb-3 truncate">{cv.fileName}</p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsViewerOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsViewerOpen(true);
                  }
                }}
                title="Click to enlarge"
                className="group relative cursor-pointer rounded-xl border border-white/10 bg-white"
              >
                <div dir="ltr" className="max-h-[560px] overflow-y-auto">
                  <PdfPages storedUrl={cv.url} />
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-cyan">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 md:mt-6">
                <button
                  type="button"
                  onClick={downloadCv}
                  disabled={isDownloading}
                  className="px-5 py-2.5 rounded-lg border border-white/15 text-white/80 hover:border-cyan/50 hover:text-cyan transition-colors font-mono text-sm disabled:opacity-50"
                >
                  {isDownloading ? "..." : dict.download}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <AnimatePresence>
        {isViewerOpen && cv && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 cursor-zoom-out" onClick={() => setIsViewerOpen(false)}>
            <button
              type="button"
              className="absolute top-6 right-6 text-white/50 hover:text-cyan transition-colors"
              onClick={() => setIsViewerOpen(false)}
              aria-label={dict.close}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              dir="ltr"
              className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white cursor-auto border border-cyan/20 shadow-[0_0_40px_rgba(34,211,238,0.15)]"
              onClick={(event) => event.stopPropagation()}
            >
              <PdfPages storedUrl={cv.url} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
