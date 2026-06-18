"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

export default function SystemLogs({ dict }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState({}); 
  const [selectedImage, setSelectedImage] = useState(null);
  
  const params = useParams();
  const lang = params?.lang || "en";

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const fetchedLogs = [];
        
        querySnapshot.forEach((doc) => {
          fetchedLogs.push({ id: doc.id, ...doc.data() });
        });
        
        setLogs(fetchedLogs);
      } catch (error) {
        console.error("Error fetching logs: ", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  const toggleExpand = (id) => {
    setExpandedLogs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setSelectedImage(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!dict) return null;

  return (
    <>
      {/* التعديل الأول: إضافة id="logs" هنا لكي يعمل زر Initialize Logs */}
      <section id="logs" className="w-full max-w-7xl mx-auto mt-20 z-10 relative px-4 md:px-0 scroll-mt-24">
        
        <div className="flex items-center gap-4 mb-12">
          <h3 className="text-2xl md:text-3xl font-bold text-white tracking-wider">
            {dict.title || (lang === "ar" ? "سجلات النظام" : "System Logs")}
          </h3>
          <div className="flex-1 h-[1px] bg-gradient-to-r from-cyan/40 to-transparent" />
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-10 h-10 border-4 border-cyan border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-white/50 font-mono border border-white/10 rounded-2xl bg-white/5 backdrop-blur-sm">
            {lang === "ar" ? "لا توجد سجلات حالياً..." : "No logs available..."}
          </div>
        ) : (
          <div className="flex flex-col gap-8 w-full">
            {logs.map((log, index) => {
              const isExpanded = expandedLogs[log.id];
              const currentLangData = log[lang] || log.en; 

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, amount: 0.1 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="group relative bg-glass border border-glass rounded-2xl hover:border-cyan/50 transition-colors duration-300 transform-gpu overflow-hidden flex flex-col w-full"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  {log.imageUrl && (
                    <div 
                      className="w-full relative z-10 border-b border-white/10 overflow-hidden bg-black/50 cursor-pointer"
                      onClick={() => setSelectedImage(log.imageUrl)}
                      title={lang === "ar" ? "اضغط لتكبير الصورة" : "Click to enlarge"}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={log.imageUrl} 
                        alt={currentLangData.title} 
                        className="w-full max-h-[400px] md:max-h-[500px] object-cover hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-cyan">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                      </div>
                    </div>
                  )}

                  <div className="p-6 md:p-8 flex flex-col flex-1 relative z-10">
                    
                    <div className="flex justify-between items-center mb-4">
                      {/* التعديل الثاني: إضافة علامة NEW النابضة للسجل الأول فقط */}
                      <div className="flex items-center gap-3">
                        <span className="text-cyan text-xs font-mono tracking-widest border border-cyan/30 px-3 py-1 rounded-full bg-cyan/5">
                          {log.date}
                        </span>
                        {index === 0 && (
                          <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-widest animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]">
                            {lang === "ar" ? "أحدث سجل" : "LATEST"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mb-2">
                      <h4 className="text-xl md:text-2xl font-bold text-white mb-3 tracking-wide">
                        {currentLangData.title}
                      </h4>
                      <p className="text-muted text-sm md:text-base leading-relaxed">
                        {currentLangData.description}
                      </p>
                    </div>

                    <AnimatePresence>
                      {isExpanded && log.isExpandable && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 mt-2 border-t border-white/10">
                            <p className="text-white/80 text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                              {currentLangData.content}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {log.isExpandable && (
                      <button 
                        onClick={() => toggleExpand(log.id)}
                        className="mt-6 flex items-center gap-2 text-cyan text-sm font-bold tracking-wider hover:text-white transition-colors w-fit"
                      >
                        {isExpanded 
                          ? (lang === "ar" ? "إخفاء التفاصيل" : "SHOW LESS") 
                          : (lang === "ar" ? "اقرأ المزيد" : "READ MORE")}
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          strokeWidth={2} 
                          stroke="currentColor" 
                          className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      <AnimatePresence>
        {selectedImage && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 cursor-zoom-out"
            onClick={() => setSelectedImage(null)}
          >
            <button 
              className="absolute top-6 right-6 text-white/50 hover:text-cyan transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center cursor-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={selectedImage} 
                alt="Enlarged system log view" 
                className="max-w-full max-h-[90vh] object-contain rounded-xl border border-cyan/20 shadow-[0_0_40px_rgba(34,211,238,0.15)]"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}