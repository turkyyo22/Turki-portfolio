"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

export default function TechStack({ dict }) {
  const [skillCategories, setSkillCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const params = useParams();
  const lang = params?.lang || "en";

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        // جلب الأقسام مرتبة حسب حقل order
        const q = query(collection(db, "skills"), orderBy("order", "asc"));
        const querySnapshot = await getDocs(q);
        const fetchedSkills = [];
        
        querySnapshot.forEach((doc) => {
          fetchedSkills.push({ id: doc.id, ...doc.data() });
        });
        
        setSkillCategories(fetchedSkills);
      } catch (error) {
        console.error("Error fetching skills: ", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSkills();
  }, []);

  if (!dict) return null;

  return (
    <section className="w-full max-w-7xl mx-auto mt-20 z-10 relative px-4 md:px-0">
      
      {/* عنوان القسم */}
      <div className="flex items-center gap-4 mb-12 flex-row-reverse md:flex-row">
        <div className="flex-1 h-[1px] bg-gradient-to-l md:bg-gradient-to-r from-cyan/40 to-transparent" />
        <h3 className="text-2xl md:text-3xl font-bold text-white tracking-wider text-center md:text-left">
          {dict.title || (lang === "ar" ? "الوحدات التقنية" : "Tech Stack")}
        </h3>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <div className="w-8 h-8 border-2 border-cyan border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : skillCategories.length === 0 ? (
        <div className="text-center py-10 text-white/50 font-mono border border-white/10 rounded-2xl bg-white/5">
          {lang === "ar" ? "جاري تهيئة الأنظمة..." : "Initializing Systems..."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {skillCategories.map((category, index) => {
            const categoryTitle = lang === "ar" ? category.arTitle : category.enTitle;

            return (
              <motion.div 
                key={category.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: false, amount: 0.1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-glass border border-glass rounded-2xl p-6 md:p-8 backdrop-blur-md hover:border-cyan/30 transition-colors group transform-gpu"
              >
                {/* اسم القسم */}
                <h4 className="text-cyan font-mono tracking-widest uppercase mb-6 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-cyan animate-pulse"></span>
                  {categoryTitle}
                </h4>

                {/* المهارات داخل القسم */}
                <div className="flex flex-wrap gap-3">
                  {category.items && category.items.map((skill, idx) => (
                    <span 
                      key={idx} 
                      className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 font-medium text-sm hover:bg-cyan/10 hover:border-cyan/50 hover:text-cyan transition-all duration-300 cursor-default"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}