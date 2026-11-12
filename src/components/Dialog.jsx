"use client";

import { useEffect, useRef } from "react";

/**
 * Modal built on the native <dialog> element, which gives focus trapping,
 * Escape-to-close and screen-reader semantics for free.
 */
export default function Dialog({ open, onClose, label, labelledBy, className = "", children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Keep the page behind the modal from scrolling.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === ref.current) onClose();
      }}
      className={`max-h-[90vh] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-cyan/20 bg-[#070d1a] p-0 text-white shadow-[0_0_60px_rgb(var(--accent-cyan-rgb)/0.15)] backdrop:bg-black/80 backdrop:backdrop-blur-sm ${className}`}
    >
      {open && children}
    </dialog>
  );
}
