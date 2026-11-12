"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Footer({ dict, lang }) {
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
            <span className="w-2 h-2 rounded-full bg-cyan animate-pulse shadow-[0_0_8px_rgb(var(--accent-cyan-rgb))]"></span>
            <span className="text-cyan text-xs font-mono tracking-widest uppercase transition-colors group-hover:text-white">
              {dict.status}
            </span>
          </div>
          
          {/* فاصل زجاجي */}
          <div className="w-[1px] h-4 bg-white/10"></div>
          
          {/* The version number doubles as a quiet link to the admin sign-in. */}
          <Link
            href={`/${lang}/admin`}
            aria-label={dict.admin}
            className="text-muted/50 text-xs font-mono tracking-widest transition-colors hover:text-cyan"
          >
            {dict.version}
          </Link>
        </div>

      </div>
    </motion.footer>
  );
}