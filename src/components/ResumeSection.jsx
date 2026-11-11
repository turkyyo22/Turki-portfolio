"use client";

import { useEffect, useRef, useState } from "react";

import Dialog from "@/components/Dialog";
import SectionHeading from "@/components/SectionHeading";
import { downloadCv, loadCv } from "@/lib/cvClient";

/** Renders every page of the PDF to canvases with pdf.js. */
function PdfPages({ bytes, failedLabel }) {
  const hostRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !bytes) return undefined;
    let cancelled = false;
    host.replaceChildren();

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      // pdf.js takes ownership of the buffer it is given, so pass a copy.
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
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
  }, [bytes]);

  if (failed) return <p className="py-8 text-center font-mono text-sm text-slate-500">{failedLabel}</p>;
  return <div ref={hostRef} dir="ltr" className="flex flex-col" />;
}

export default function ResumeSection({ dict, cv }) {
  const sectionRef = useRef(null);
  const [bytes, setBytes] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // The PDF is only fetched when the section is about to scroll into view.
  useEffect(() => {
    const section = sectionRef.current;
    if (!cv.available || !section) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setStatus("loading");
        loadCv()
          .then((file) => {
            setBytes(file?.bytes ?? null);
            setStatus(file ? "ready" : "error");
          })
          .catch((error) => {
            console.error("Error loading CV:", error);
            setStatus("error");
          });
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [cv.available]);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadCv();
    } catch (error) {
      console.error("CV download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section ref={sectionRef} aria-labelledby="resume-title" className="w-full mt-24">
      <div id="cv" className="rounded-2xl border border-white/10 bg-glass p-6 backdrop-blur-md md:p-8">
        <SectionHeading id="resume-title" eyebrow={dict.eyebrow} title={dict.title} />

        {!cv.available ? (
          <p className="py-10 text-center font-mono text-sm text-white/60">{dict.empty}</p>
        ) : (
          <>
            <p className="mb-3 truncate font-mono text-xs text-white/60">{cv.fileName}</p>
            {/* The preview scrolls, so it is a clickable region rather than a <button>. */}
            <div
              role="button"
              tabIndex={status === "ready" ? 0 : -1}
              aria-label={dict.enlarge}
              aria-disabled={status !== "ready"}
              onClick={() => status === "ready" && setIsViewerOpen(true)}
              onKeyDown={(event) => {
                if (status === "ready" && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  setIsViewerOpen(true);
                }
              }}
              className={`group relative overflow-hidden rounded-xl border border-white/10 bg-white ${status === "ready" ? "cursor-zoom-in" : ""}`}
            >
              <div dir="ltr" className="max-h-[560px] min-h-[320px] overflow-y-auto">
                {status === "ready" ? (
                  <PdfPages bytes={bytes} failedLabel={dict.previewFailed} />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center font-mono text-sm text-slate-500">
                    {status === "error" ? dict.previewFailed : dict.loading}
                  </div>
                )}
              </div>
              {status === "ready" && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-12 w-12 text-cyan" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 md:mt-6">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="rounded-lg border border-white/15 px-5 py-2.5 font-mono text-sm text-white/85 transition-colors hover:border-cyan/50 hover:text-cyan disabled:opacity-50"
              >
                {isDownloading ? dict.downloading : dict.download}
              </button>
              <button
                type="button"
                onClick={() => setIsViewerOpen(true)}
                disabled={status !== "ready"}
                className="rounded-lg px-5 py-2.5 font-mono text-sm text-white/70 transition-colors hover:text-cyan disabled:opacity-40"
              >
                {dict.enlarge}
              </button>
            </div>
          </>
        )}
      </div>

      <Dialog open={isViewerOpen && status === "ready"} onClose={() => setIsViewerOpen(false)} label={dict.title} className="bg-white">
        <button
          type="button"
          onClick={() => setIsViewerOpen(false)}
          aria-label={dict.close}
          className="absolute end-3 top-3 z-10 rounded-full bg-black/70 p-2 text-white/90 transition-colors hover:text-cyan"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div dir="ltr" className="max-h-[90vh] overflow-y-auto">
          <PdfPages bytes={bytes} failedLabel={dict.previewFailed} />
        </div>
      </Dialog>
    </section>
  );
}
