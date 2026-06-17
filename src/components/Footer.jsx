"use client";

import { motion } from "framer-motion";

export default function Footer({ dict }) {
  if (!dict) return null;

  return (
    <motion.footer 
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="w-full border-t border-white/5 bg-black/20 backdrop-blur-md py-6 mt-10 z-10 relative"
    >
      <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* حقوق النشر */}
        <p className="text-muted text-sm font-mono tracking-wide">
          {dict.copyright}
        </p>

        {/* حالة النظام والإصدار */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 group cursor-default">
            {/* النقطة النابضة */}
            <span className="w-2 h-2 rounded-full bg-cyan animate-pulse shadow-[0_0_8px_#00e5ff]"></span>
            <span className="text-cyan text-xs font-mono tracking-widest uppercase transition-colors group-hover:text-white">
              {dict.status}
            </span>
          </div>
          
          {/* فاصل زجاجي */}
          <div className="w-[1px] h-4 bg-white/10"></div>
          
          <span className="text-muted/50 text-xs font-mono tracking-widest">
            {dict.version}
          </span>
        </div>

      </div>
    </motion.footer>
  );
}