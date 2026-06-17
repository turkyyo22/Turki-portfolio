"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function CalendarWidget({ dict, lang }) {
  const [mounted, setMounted] = useState(false);
  const [systemDate, setSystemDate] = useState(null);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      setSystemDate(new Date());
      setMounted(true);
    }, 0);
    return () => clearTimeout(initTimer);
  }, []);

  if (!mounted || !systemDate) {
    return (
      <div className="w-full h-full aspect-square bg-glass border border-glass rounded-2xl flex items-center justify-center">
        <span className="text-blue font-mono text-xs animate-pulse tracking-widest">{dict?.loading || "LOADING_DATA..."}</span>
      </div>
    );
  }

  // تحديد صيغة التاريخ لتقرأ الأسابيع والشهور بالعربي أو الإنجليزي
  const localeFormat = lang === "ar" ? "ar-SA" : "en-US";
  const dayName = systemDate.toLocaleDateString(localeFormat, { weekday: "short" }).toUpperCase();
  const monthName = systemDate.toLocaleDateString(localeFormat, { month: "short" }).toUpperCase();
  const dayNumber = systemDate.getDate();
  const year = systemDate.getFullYear();

  return (
    <div className="relative w-full h-full aspect-square bg-glass border border-glass rounded-2xl backdrop-blur-md flex flex-col items-center justify-center shadow-lg overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-tr from-blue/10 to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute top-0 w-full bg-glass border-b border-glass py-2 px-4 flex justify-between items-center z-10">
        <span className="text-cyan text-[10px] font-mono tracking-widest">{monthName}</span>
        <span className="text-muted text-[10px] font-mono tracking-widest">{year}</span>
      </div>
      <div className="z-10 flex flex-col items-center mt-6 pointer-events-none">
        <span className="text-muted text-xs font-mono tracking-widest mb-1 opacity-70">{dayName}</span>
        <motion.div whileHover={{ scale: 1.1 }} className="text-5xl font-bold text-white tracking-tighter">
          {dayNumber}
        </motion.div>
        <div className="w-8 h-[1px] bg-cyan/30 mt-4 mb-2" />
        <span className="text-blue text-[9px] font-mono tracking-widest uppercase">{dict.session}</span>
      </div>
    </div>
  );
}