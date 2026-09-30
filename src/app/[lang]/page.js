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
import SiteNav from "@/components/SiteNav";
import CvProjects from "@/components/CvProjects";

export default async function Home({ params }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <main id="top" className="min-h-screen px-4 sm:px-8 pb-8 pt-24 relative overflow-hidden flex flex-col items-center">
      
      <NetworkBackground />
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue/20 blur-[150px] rounded-full pointer-events-none -z-10" />
      <div className="absolute bottom-[20%] right-[-5%] w-[30rem] h-[30rem] bg-cyan/10 blur-[150px] rounded-full pointer-events-none -z-10" />

      <SiteNav lang={lang} dict={dict.nav} projectsDict={dict.cvProjects} />

      <Hero dict={dict} lang={lang} />
      
      <SystemLogs dict={dict.logs} />

      <CvProjects dict={dict.cvProjects} />
      
      <TechStack dict={dict.tech} />
      {/* قسم التواصل */}
      <Contact dict={dict.contact} />
      {/* التذييل */}
      <Footer dict={dict.footer} />
      <MouseSpotlight />
      {/* المساعد الذكي */}
      <AICore lang={lang} />
      {/* زر الصعود للأعلى */}
      <ScrollToTop />
    </main>
  );
}