"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

export default function SystemLogs({ dict }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // تتبع أي الأخبار تم تمديدها (فتحها)
  const [expandedLogs, setExpandedLogs] = useState({}); 
  
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

  // دالة لتبديل حالة تمديد الخبر (إظهار/إخفاء التفاصيل)
  const toggleExpand = (id) => {
    setExpandedLogs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (!dict) return null;

  return (
    <section className="w-full max-w-7xl mx-auto mt-20 z-10 relative px-4 md:px-0">
      
      {/* عنوان القسم */}
      <div className="flex items-center gap-4 mb-12">
        <h3 className="text-2xl md:text-3xl font-bold text-white tracking-wider">
          {dict.title || (lang === "ar" ? "سجلات النظام" : "System Logs")}
        </h3>
        <div className="flex-1 h-[1px] bg-gradient-to-r from-cyan/40 to-transparent" />
      </div>

      {isLoading ? (
        // شاشة تحميل أثناء جلب البيانات
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-cyan border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : logs.length === 0 ? (
        // في حال عدم وجود أخبار
        <div className="text-center py-20 text-white/50 font-mono border border-white/10 rounded-2xl bg-white/5 backdrop-blur-sm">
          {lang === "ar" ? "لا توجد سجلات حالياً..." : "No logs available..."}
        </div>
      ) : (
        // التعديل الأول: تغيير التخطيط من شبكة (Grid) إلى قائمة عمودية (Flex Column) مع تصغير العرض قليلاً ليكون مقروءاً
        <div className="flex flex-col gap-8 w-full">
          {logs.map((log, index) => {
            const isExpanded = expandedLogs[log.id];
            // تحديد بيانات اللغة الحالية للخبر
            const currentLangData = log[lang] || log.en; 

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative bg-glass border border-glass p-6 md:p-8 rounded-2xl hover:border-cyan/50 transition-colors duration-300 transform-gpu overflow-hidden flex flex-col w-full"
              >
                {/* تأثير الإضاءة عند التمرير */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                {/* التعديل الثاني: الصورة في الأعلى وبعرض كامل المستطيل (إذا كانت موجودة) */}
                {log.imageUrl && (
                  <div className="w-full mb-6 overflow-hidden rounded-xl border border-white/10 relative z-10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={log.imageUrl} 
                      alt={currentLangData.title} 
                      className="w-full max-h-[400px] object-cover hover:scale-105 transition-transform duration-700 shadow-lg"
                    />
                  </div>
                )}

                {/* تاريخ السجل */}
                <div className="flex justify-between items-center mb-4 relative z-10">
                  <span className="text-cyan text-xs font-mono tracking-widest border border-cyan/30 px-3 py-1 rounded-full bg-cyan/5">
                    {log.date}
                  </span>
                </div>

                {/* النصوص الأساسية */}
                <div className="relative z-10 mb-2">
                  <h4 className="text-xl md:text-2xl font-bold text-white mb-3 tracking-wide">
                    {currentLangData.title}
                  </h4>
                  <p className="text-muted text-sm md:text-base leading-relaxed">
                    {currentLangData.description}
                  </p>
                </div>

                {/* التفاصيل الممتدة (Read More) */}
                <AnimatePresence>
                  {isExpanded && log.isExpandable && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="relative z-10 overflow-hidden"
                    >
                      <div className="pt-4 mt-2 border-t border-white/10">
                        <p className="text-white/80 text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                          {currentLangData.content}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* زر التمديد (يظهر فقط إذا كان الخبر قابلاً للتمديد) */}
                {log.isExpandable && (
                  <button 
                    onClick={() => toggleExpand(log.id)}
                    className="mt-6 flex items-center gap-2 text-cyan text-sm font-bold tracking-wider hover:text-white transition-colors relative z-10 w-fit"
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
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}