"use client";

import { motion } from "framer-motion";
import ClockWidget from "./ClockWidget";
import CalendarWidget from "./CalendarWidget";

export default function Hero({ dict, lang }) {
  
  // دالة النزول السلس إلى قسم السجلات
  const scrollToLogs = () => {
    const logsSection = document.getElementById("logs");
    if (logsSection) {
      logsSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative w-full max-w-7xl mx-auto min-h-[70vh] flex flex-col lg:flex-row items-center justify-between gap-12 mt-10 z-10">
      
      {/* قسم النصوص */}
      <motion.div 
        initial={{ opacity: 0, x: lang === "ar" ? 50 : -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex-1 space-y-6"
      >
        <h2 className="text-cyan tracking-widest uppercase text-sm font-semibold drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]">
          {dict.hero.systemInitialized}
        </h2>
        <h1 className="text-6xl md:text-7xl font-bold text-white tracking-tight">
          {dict.hero.titleFirst} <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan to-blue drop-shadow-lg">
            {dict.hero.titleLast}
          </span>
        </h1>
        <p className="text-muted text-lg max-w-md leading-relaxed">
          {dict.hero.description}
        </p>
        
        {/* الزر بعد تحسين الأداء وإلغاء البكسلة */}
        <motion.button 
          onClick={scrollToLogs}
          whileHover={{ 
            scale: 1.05, 
            boxShadow: "0px 0px 25px rgba(0, 229, 255, 0.6)",
            transition: { duration: 0.15, ease: "easeOut" }
          }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-3 bg-glass border border-cyan/50 text-cyan rounded-lg backdrop-blur-md transition-colors duration-150 hover:bg-cyan/30 hover:border-cyan hover:text-white transform-gpu backface-hidden antialiased"
        >
          {dict.hero.button}
        </motion.button>
      </motion.div>

      {/* قسم الـ Widgets */}
      <motion.div 
        initial={{ opacity: 0, x: lang === "ar" ? -50 : 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        className="flex-1 grid grid-cols-2 gap-4 w-full max-w-md"
      >
        <div className="col-span-2 md:col-span-1">
          <ClockWidget dict={dict.clock} lang={lang} />
        </div>

        <div className="col-span-2 md:col-span-1">
          <CalendarWidget dict={dict.calendar} lang={lang} />
        </div>
      </motion.div>

    </section>
  );
}