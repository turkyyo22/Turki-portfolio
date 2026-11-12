"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scrollToY } from "@/lib/smoothScroll";

export default function ScrollToTop({ label }) {
  const [isVisible, setIsVisible] = useState(false);
  const scrollingRef = useRef(false);

  // مراقبة حركة النزول (Scroll)
  useEffect(() => {
    const toggleVisibility = () => {
      if (scrollingRef.current) return;
      setIsVisible(window.scrollY > 300);
    };

    window.addEventListener("scroll", toggleVisibility, { passive: true });
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    scrollingRef.current = true;
    scrollToY(0).then(() => {
      scrollingRef.current = false;
      setIsVisible(window.scrollY > 300);
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          type="button"
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={scrollToTop}
          // The hover glow is in the class below: its colour comes from a CSS variable
          // (the picked accent), which framer-motion can't animate.
          whileHover={{
            scale: 1.1,
            transition: { duration: 0.15 }
          }}
          whileTap={{ scale: 0.9 }}
          // تم وضع الزر في أسفل اليمين ليكون مناسباً ولا يغطي المحتوى
          // z-40 keeps it under the chat (z-50), which fills the whole screen on phones
          // and has its send button in this same corner, and under open dialogs.
          className="fixed bottom-4 right-4 z-40 p-2.5 sm:bottom-8 sm:right-8 sm:p-3 bg-glass border border-cyan/50 text-cyan rounded-full backdrop-blur-md transition-[color,background-color,box-shadow] duration-200 hover:bg-cyan hover:text-black hover:shadow-[0_0_20px_rgb(var(--accent-cyan-rgb)/0.5)] transform-gpu backface-hidden antialiased flex items-center justify-center"
        >
          {/* أيقونة سهم للأعلى */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-6 h-6"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
