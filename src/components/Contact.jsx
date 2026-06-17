"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, getDoc } from "firebase/firestore";

export default function Contact({ dict }) {
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // حالة لحفظ روابط السوشيال ميديا
  const [socials, setSocials] = useState({ github: "", linkedin: "", phone: "", email: "" });
  
  const params = useParams();
  const lang = params?.lang || "en";

  // جلب روابط السوشيال ميديا من Firebase عند تحميل الصفحة
  useEffect(() => {
    const fetchSocials = async () => {
      try {
        const docRef = doc(db, "settings", "socials");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSocials(docSnap.data());
        }
      } catch (error) {
        console.error("Error fetching socials:", error);
      }
    };
    fetchSocials();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "messages"), {
        ...formData,
        isRead: false,
        createdAt: new Date().toISOString()
      });
      setIsSuccess(true);
      setFormData({ name: "", email: "", message: "" });
      setTimeout(() => setIsSuccess(false), 5000);
    } catch (error) {
      console.error("Error sending message: ", error);
      alert(lang === "ar" ? "حدث خطأ أثناء الإرسال." : "Error sending message.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!dict) return null;

  return (
    <section className="w-full max-w-4xl mx-auto mt-20 mb-20 z-10 relative px-4 md:px-0" id="contact">
      
      {/* عنوان القسم */}
      <div className="flex items-center gap-4 mb-12">
        <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-cyan/40" />
        <h3 className="text-2xl md:text-3xl font-bold text-white tracking-wider">
          {dict.title || (lang === "ar" ? "بدء الاتصال" : "Secure Uplink")}
        </h3>
        <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-cyan/40" />
      </div>

      <div className="flex flex-col gap-8">
        {/* نموذج المراسلة الأساسي */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-glass border border-white/10 p-6 md:p-10 rounded-2xl backdrop-blur-xl shadow-2xl"
        >
          {isSuccess ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-16 h-16 bg-cyan/20 rounded-full flex items-center justify-center mb-4 border border-cyan/50 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-cyan"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-2 tracking-wide">{lang === "ar" ? "تم استلام رسالتك" : "Message Received"}</h4>
              <p className="text-white/60 font-mono text-sm">{lang === "ar" ? "سيتم مراجعة الإرسال والرد في أقرب وقت." : "Transmission logged. Will respond shortly."}</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs text-cyan mb-2 font-mono uppercase tracking-widest">{lang === "ar" ? "الاسم" : "Identification (Name)"}</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-cyan/50 outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-cyan mb-2 font-mono uppercase tracking-widest">{lang === "ar" ? "البريد الإلكتروني" : "Return Signal (Email)"}</label>
                  <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-cyan/50 outline-none transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-cyan mb-2 font-mono uppercase tracking-widest">{lang === "ar" ? "الرسالة" : "Transmission (Message)"}</label>
                <textarea required value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-4 text-white focus:border-cyan/50 outline-none h-32 resize-none transition-colors" />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-cyan/10 border border-cyan/50 text-cyan font-bold tracking-widest uppercase rounded-lg hover:bg-cyan hover:text-black transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3">
                {isSubmitting ? <span className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin"></span> : <>{lang === "ar" ? "إرسال البيانات" : "Transmit Data"} <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg></>}
              </button>
            </form>
          )}
        </motion.div>

        {/* شريط منصات التواصل الاجتماعي (الجديد) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap justify-center gap-4 md:gap-6"
        >
          {/* أيقونة GitHub */}
          {socials.github && (
            <a href={socials.github} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-cyan/10 hover:border-cyan/50 hover:text-cyan transition-all duration-300 group shadow-lg flex items-center justify-center" title="GitHub">
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6 text-white/70 group-hover:text-cyan transition-colors">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          )}

          {/* أيقونة LinkedIn */}
          {socials.linkedin && (
            <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-cyan/10 hover:border-cyan/50 hover:text-cyan transition-all duration-300 group shadow-lg flex items-center justify-center" title="LinkedIn">
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6 text-white/70 group-hover:text-cyan transition-colors">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
          )}

          {/* أيقونة الإيميل */}
          {socials.email && (
            <a href={`mailto:${socials.email}`} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-cyan/10 hover:border-cyan/50 hover:text-cyan transition-all duration-300 group shadow-lg flex items-center justify-center" title="Email">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white/70 group-hover:text-cyan transition-colors">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </a>
          )}

          {/* أيقونة الهاتف/واتساب */}
          {socials.phone && (
            <a href={`tel:${socials.phone}`} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-cyan/10 hover:border-cyan/50 hover:text-cyan transition-all duration-300 group shadow-lg flex items-center justify-center" title="Call">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white/70 group-hover:text-cyan transition-colors">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.864-1.051l-3.215-.536c-.538-.09-.997.109-1.32.518l-1.34 1.697c-1.958-1.01-3.66-2.712-4.67-4.67l1.697-1.34c.409-.323.608-.782.518-1.32l-.536-3.215C11.716 2.601 11.266 2.25 10.75 2.25H6.75A2.25 2.25 0 004.5 4.5v2.25z" />
              </svg>
            </a>
          )}
        </motion.div>
      </div>
    </section>
  );
}