import AssistantWidget from "@/components/assistant/AssistantWidget";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import MouseSpotlight from "@/components/MouseSpotlight";
import NetworkBackground from "@/components/NetworkBackground";
import ProjectsSection from "@/components/projects/ProjectsSection";
import ResumeSection from "@/components/ResumeSection";
import ScrollToTop from "@/components/ScrollToTop";
import SiteNav from "@/components/SiteNav";
import TechStack from "@/components/TechStack";
import { getDictionary } from "@/get-dictionary";
import { localizeQuestions } from "@/lib/content/questions";
import { getCvMeta, getPosts, getProjectsMenu, getQuestions, getSkills, getSocials } from "@/lib/server/content";

// Content is rendered on the server and cached. The admin dashboard refreshes it
// on save; this is the fallback refresh interval (in seconds).
export const revalidate = 300;

export default async function Home({ params }) {
  const { lang } = await params;
  const [dict, posts, skills, projectsMenu, socials, cv, questions] = await Promise.all([
    getDictionary(lang),
    getPosts(),
    getSkills(),
    getProjectsMenu(),
    getSocials(),
    getCvMeta(),
    getQuestions(),
  ]);
  const publishedSlugs = posts.map((post) => post.slug).filter(Boolean);

  // Suggested questions come from the admin dashboard when saved there, otherwise from the dictionary.
  const heroDict = {
    ...dict.hero,
    aiCard: { ...dict.hero.aiCard, suggestions: localizeQuestions(questions?.card, lang) ?? dict.hero.aiCard.suggestions },
  };
  const assistantDict = {
    ...dict.assistant,
    suggestions: localizeQuestions(questions?.chat, lang) ?? dict.assistant.suggestions,
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-cyan focus:px-4 focus:py-2 focus:font-bold focus:text-[#050a15]"
      >
        {dict.a11y.skipToContent}
      </a>

      <NetworkBackground />
      <div aria-hidden="true" className="pointer-events-none absolute -left-[10%] -top-[10%] -z-10 h-96 w-96 rounded-full bg-blue/20 blur-[150px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-[5%] bottom-[20%] -z-10 h-[30rem] w-[30rem] rounded-full bg-cyan/10 blur-[150px]" />

      <SiteNav
        lang={lang}
        dict={dict.nav}
        projects={projectsMenu}
        publishedSlugs={publishedSlugs}
        askQuestionTemplate={dict.projects.askQuestion}
      />

      <main id="main" tabIndex={-1} className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-4 pb-8 pt-24 outline-none sm:px-8">
        <Hero dict={heroDict} lang={lang} cvAvailable={cv.available} />
        <ProjectsSection dict={dict.projects} lang={lang} posts={posts} />
        <ResumeSection dict={dict.resume} cv={cv} />
        <TechStack dict={dict.tech} lang={lang} skills={skills} />
        <Contact dict={dict.contact} socials={socials} />
      </main>

      <Footer dict={dict.footer} lang={lang} />
      <MouseSpotlight />
      <AssistantWidget lang={lang} dict={assistantDict} />
      <ScrollToTop label={dict.nav.home} />
    </div>
  );
}
