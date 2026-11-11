"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Project screenshot inside a fixed frame:
 * - Next.js serves a resized WebP sized for the visitor's screen.
 * - The whole image is shown (no cropping); a blurred copy fills the empty space.
 * - A shimmer shows while loading, and a placeholder if the image fails.
 */
export default function ProjectImage({ src, alt, sizes, unavailableLabel, eager = false }) {
  const [status, setStatus] = useState("loading");

  if (!src || status === "error") {
    return <ImageFallback label={src ? unavailableLabel : ""} />;
  }

  return (
    <div className={`absolute inset-0 ${status === "loading" ? "shimmer" : ""}`}>
      <Image src={src} alt="" aria-hidden="true" fill sizes="64px" className="scale-110 object-cover opacity-40 blur-2xl" />
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={`object-contain transition-opacity duration-500 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

function ImageFallback({ label }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_20%,rgba(0,229,255,0.12),transparent_55%),radial-gradient(circle_at_80%_90%,rgba(59,130,246,0.14),transparent_50%)]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="h-10 w-10 text-cyan/40" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
      </svg>
      {label && <span className="text-xs font-mono text-white/40">{label}</span>}
    </div>
  );
}
