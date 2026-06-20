"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  
  const params = useParams();
  const router = useRouter();
  const lang = params?.lang || "en";

  // البريد الإلكتروني المخفي للمسؤول
  const ADMIN_EMAIL = process.env.FIREBASE_ADMIN_EMAIL;

  // دالة تسجيل الدخول عبر Firebase
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // محاولة الاتصال بخوادم Firebase
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
      
      // في حال النجاح، التوجيه إلى غرفة التحكم الداخلية
      router.push(`/${lang}/admin/dashboard`);
      
    } catch (err) {
      // في حال كان المفتاح خاطئاً
      setError(lang === "ar" ? "تم رفض الوصول: المفتاح غير صالح" : "Access Denied: Invalid Key");
      setPassword(""); // مسح الحقل بعد الخطأ
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4">
      
      <div className="absolute inset-0 bg-[#050505] -z-20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] bg-red-600/10 blur-[150px] rounded-full pointer-events-none -z-10" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-black/40 border border-red-500/30 rounded-2xl p-8 backdrop-blur-xl relative overflow-hidden transform-gpu"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
      <Link 
        href={`/${lang}`}
        className="absolute top-6 left-6 md:top-8 md:left-8 z-50 p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:border-white/20 transition-all text-white/50 hover:text-white transform-gpu hover:scale-110"
        title={lang === "ar" ? "العودة للقاعدة الرئيسية" : "Return to Main Base"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      </Link>
        <div className="text-center mb-10">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.3)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </motion.div>

          <h1 className="text-2xl font-bold text-white tracking-widest uppercase mb-2">
            {lang === "ar" ? "صفحة المسؤول" : "Admin Page"}
          </h1>
          <p className="text-red-400/80 text-xs font-mono tracking-wider uppercase">
            {lang === "ar" ? "يتطلب مصادقة المسؤول" : "Admin Authentication Required"}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-3">
            <label className="text-red-400 text-xs font-mono tracking-widest uppercase flex justify-center">
              {lang === "ar" ? "مفتاح الوصول" : "Access Key"}
            </label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="w-full bg-black/50 border border-red-500/20 rounded-lg p-4 text-white font-mono text-center text-xl tracking-[0.5em] focus:outline-none focus:border-red-500/60 focus:bg-red-500/5 transition-colors placeholder:text-gray-700 placeholder:tracking-normal disabled:opacity-50"
              placeholder="••••••••"
              required
            />
          </div>

          {/* رسالة الخطأ إن وجدت */}
          {error && (
            <motion.p 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="text-red-500 text-sm text-center font-mono"
            >
              {error}
            </motion.p>
          )}

          <motion.button 
            whileHover={{ 
              scale: isLoading ? 1 : 1.02, 
              boxShadow: isLoading ? "none" : "0px 0px 20px rgba(239, 68, 68, 0.4)",
              transition: { duration: 0.15 }
            }}
            whileTap={{ scale: isLoading ? 1 : 0.98 }}
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-red-500/10 border border-red-500/50 text-red-500 font-bold tracking-widest uppercase rounded-lg backdrop-blur-md transition-colors duration-150 hover:bg-red-500 hover:text-white disabled:bg-red-900/20 disabled:text-red-500/50 transform-gpu backface-hidden antialiased flex justify-center items-center gap-2"
          >
            {isLoading ? (
               <span className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></span>
            ) : (
               lang === "ar" ? "تحقق من الهوية" : "Authenticate"
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}