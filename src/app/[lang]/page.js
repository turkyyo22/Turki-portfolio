import Hero from "@/components/Hero";
import { getDictionary } from "@/get-dictionary"; 
import SystemLogs from "@/components/SystemLogs";
import TechStack from "@/components/TechStack";
import Contact from "@/components/Contact";
import NetworkBackground from "@/components/NetworkBackground";
import ScrollToTop from "@/components/ScrollToTop";
import Footer from "@/components/Footer";
import AICore from "@/components/AICore";
import MouseSpotlight from "@/components/MouseSpotlight";

export default async function Home({ params }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  
  const toggleLang = lang === "en" ? "/ar" : "/en";
  const toggleText = lang === "en" ? "عربي" : "English";

  return (
    <main className="min-h-screen p-8 relative overflow-hidden flex flex-col items-center">
      
      <NetworkBackground />
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue/20 blur-[150px] rounded-full pointer-events-none -z-10" />
      <div className="absolute bottom-[20%] right-[-5%] w-[30rem] h-[30rem] bg-cyan/10 blur-[150px] rounded-full pointer-events-none -z-10" />

      {/* شريط التنقل وزر اللغة */}
      {/* شريط التنقل وزر اللغة مع الباب المخفي للأدمن */}
      <nav className="w-full max-w-7xl mx-auto flex justify-between items-center py-6 z-10">
        
        <div className="flex items-center gap-4">
          <div className="font-bold text-xl tracking-wider text-white">T.A</div>
          
          {/* زر الأدمن السري (يظهر كقفل باهت ويضيء بالأحمر عند التمرير) */}
          <a 
            href={`/${lang}/admin`} 
            className="text-white/20 hover:text-red-500 transition-colors duration-300 flex items-center justify-center transform hover:scale-110"
            title="Restricted Access"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </a>
        </div>

        <a 
          href={toggleLang} 
          className="text-cyan text-sm font-mono border border-cyan/50 px-4 py-1.5 rounded-lg bg-glass backdrop-blur-md transition-all hover:bg-cyan/10"
        >
          {toggleText}
        </a>
      </nav>

      <Hero dict={dict} lang={lang} />
      
      <SystemLogs dict={dict.logs} />
      
      <TechStack dict={dict.tech} />
      {/* قسم التواصل */}
      <Contact dict={dict.contact} />
      {/* التذييل */}
      <Footer dict={dict.footer} />
      {/* زر الصعود للأعلى */}
      <ScrollToTop />
      {/* المساعد الذكي */}
      <AICore lang={lang} />
      
      {/* زر الصعود للأعلى */}
      <ScrollToTop />
      {/* المكونات السابقة... */}
      <MouseSpotlight />
      <AICore lang={lang} />
      <ScrollToTop />
    </main>
  );
}