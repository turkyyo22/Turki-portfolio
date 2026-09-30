"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scrollToY } from "@/lib/smoothScroll";

export default function ScrollToTop() {
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
          onMouseDown={(event) => event.preventDefault()}
          onClick={scrollToTop}
          whileHover={{
            scale: 1.1,
            boxShadow: "0px 0px 20px rgba(0, 229, 255, 0.5)",
            transition: { duration: 0.15 }
          }}
          whileTap={{ scale: 0.9 }}
          // تم وضع الزر في أسفل اليمين ليكون مناسباً ولا يغطي المحتوى
          className="fixed bottom-8 right-8 z-50 p-3 bg-glass border border-cyan/50 text-cyan rounded-full backdrop-blur-md transition-colors duration-200 hover:bg-cyan hover:text-black transform-gpu backface-hidden antialiased flex items-center justify-center"
        >
          {/* أيقونة سهم للأعلى */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
