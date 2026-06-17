"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function ClockWidget({ dict, lang }) {
  const [time, setTime] = useState(null);

  useEffect(() => {
    const initTimer = setTimeout(() => setTime(new Date()), 0);
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => { clearTimeout(initTimer); clearInterval(interval); };
  }, []);

  if (!time) return null;

  const rawHours = time.getHours();
  // تحديد ص/م للعربي، و AM/PM للإنجليزي
  const ampm = rawHours >= 12 
    ? (lang === "ar" ? "م" : "PM") 
    : (lang === "ar" ? "ص" : "AM");
  const hours12 = rawHours % 12 || 12; 
  
  const hours = hours12.toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  return (
    <div className="relative w-full h-full aspect-square bg-glass border border-glass rounded-2xl backdrop-blur-md flex flex-col items-center justify-center shadow-lg overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan/10 to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="z-10 flex flex-col items-center pointer-events-none">
        <span className="text-cyan text-[10px] font-mono tracking-widest uppercase mb-3 opacity-70">
          {dict.title}
        </span>
        {/* أضفنا dir="ltr" هنا في الحاوية الأب */}
            <div dir="ltr" className="text-4xl md:text-5xl font-bold text-white tracking-wider flex items-center justify-center">
              <span>{hours}</span>
              <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="text-cyan mx-1 relative -top-1">:</motion.span>
              <span>{minutes}</span>
            </div>
        <span className="text-muted font-mono text-xs mt-3 tracking-widest flex gap-1 items-center" dir="ltr">
           <span>{seconds}</span> <span>{dict.suffix}</span> • <span>{ampm}</span>
        </span>
      </div>
    </div>
  );
}