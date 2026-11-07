"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import Dialog from "@/components/Dialog";
import SectionHeading from "@/components/SectionHeading";
import { localizePost } from "@/lib/content/normalize";
import { format } from "@/lib/i18n";
import AskAiButton from "./AskAiButton";
import ProjectImage from "./ProjectImage";
import ProjectLinks from "./ProjectLinks";

const CARD_IMAGE_SIZES = "(max-width: 768px) calc(100vw - 2rem), (max-width: 1280px) 50vw, 620px";
const DIALOG_IMAGE_SIZES = "(max-width: 960px) 100vw, 900px";

export default function ProjectsSection({ dict, lang, posts }) {
  const [openId, setOpenId] = useState(null);
  const openPost = posts.find((post) => post.id === openId);

  return (
    <section id="logs" aria-labelledby="projects-title" className="w-full mt-24">
      <SectionHeading id="projects-title" eyebrow={dict.eyebrow} title={dict.title} />

      {posts.length === 0 ? (
        <p className="py-16 text-center text-white/60 font-mono border border-white/10 rounded-2xl bg-white/5">{dict.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {posts.map((post, index) => (
            <ProjectCard
              key={post.id}
              post={post}
              lang={lang}
              dict={dict}
              isLatest={index === 0}
              index={index}
              onOpen={() => setOpenId(post.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={Boolean(openPost)} onClose={() => setOpenId(null)} labelledBy="project-dialog-title">
        {openPost && <ProjectDetails post={openPost} lang={lang} dict={dict} onClose={() => setOpenId(null)} />}
      </Dialog>
    </section>
  );
}

function ProjectCard({ post, lang, dict, isLatest, index, onOpen }) {
  const { title, description, content } = localizePost(post, lang);
  const hasDetails = post.isExpandable && Boolean(content);

  return (
    <motion.article
      id={post.slug ? `log-${post.slug}` : undefined}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.45, delay: (index % 2) * 0.08 }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-glass backdrop-blur-md transition-colors duration-300 hover:border-cyan/40"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${dict.enlarge}: ${title}`}
        className="relative block aspect-[16/9] w-full overflow-hidden border-b border-white/10 bg-black/40"
      >
        <ProjectImage src={post.imageUrl} alt={title} sizes={CARD_IMAGE_SIZES} unavailableLabel={dict.imageUnavailable} />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </button>

      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {post.date && (
            <time dateTime={post.date} className="rounded-full border border-cyan/30 bg-cyan/5 px-3 py-1 font-mono text-xs tracking-widest text-cyan">
              {post.date}
            </time>
          )}
          {isLatest && (
            <span className="rounded-full bg-cyan px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#050a15]">
              {dict.latest}
            </span>
          )}
        </div>

        <h3 className="text-xl font-bold leading-snug text-white">{title}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{description}</p>

        {post.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <li key={tag} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/70">
                {tag}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
          <AskAiButton question={format(dict.askQuestion, { title })} label={dict.askAi} />
          {hasDetails && (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/75 transition-colors hover:text-cyan"
            >
              {dict.details}
              <span aria-hidden="true" className="rtl:rotate-180">
                →
              </span>
            </button>
          )}
          <span className="ms-auto flex gap-2">
            <ProjectLinks githubUrl={post.githubUrl} liveUrl={post.liveUrl} dict={dict} />
          </span>
        </div>
      </div>
    </motion.article>
  );
}

function ProjectDetails({ post, lang, dict, onClose }) {
  const { title, description, content } = localizePost(post, lang);

  return (
    <>
      {/* Positioned against the dialog, so it stays visible while the content scrolls. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={dict.close}
        className="absolute end-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white/80 backdrop-blur transition-colors hover:text-cyan"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="max-h-[90vh] overflow-y-auto"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/10 bg-black/50">
          <ProjectImage src={post.imageUrl} alt={title} sizes={DIALOG_IMAGE_SIZES} unavailableLabel={dict.imageUnavailable} eager />
        </div>

        <div className="p-6 md:p-8">
          {post.date && <time dateTime={post.date} className="font-mono text-xs tracking-widest text-cyan">{post.date}</time>}
          <h3 id="project-dialog-title" className="mt-2 text-2xl font-bold text-white md:text-3xl">
            {title}
          </h3>
          {post.tags.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <li key={tag} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/70">
                  {tag}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 leading-relaxed text-white/85">{description}</p>
          {content && <p className="mt-4 whitespace-pre-wrap leading-relaxed text-white/75">{content}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-white/10 pt-6">
            <AskAiButton question={format(dict.askQuestion, { title })} label={dict.askAi} onBeforeAsk={onClose} />
            <ProjectLinks githubUrl={post.githubUrl} liveUrl={post.liveUrl} dict={dict} />
          </div>
        </div>
      </motion.div>
    </>
  );
}
