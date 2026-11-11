"use client";

import { motion } from "framer-motion";

import SectionHeading from "@/components/SectionHeading";

export default function TechStack({ dict, lang, skills }) {
  return (
    <section id="tech" aria-labelledby="tech-title" className="w-full mt-24">
      <SectionHeading id="tech-title" eyebrow={dict.eyebrow} title={dict.title} />

      {skills.length === 0 ? (
        <p className="py-10 text-center font-mono text-white/60 border border-white/10 rounded-2xl bg-white/5">{dict.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {skills.map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: (index % 2) * 0.08 }}
              className="rounded-2xl border border-glass bg-glass p-6 backdrop-blur-md transition-colors hover:border-cyan/30 md:p-8"
            >
              <h3 className="mb-6 flex items-center gap-3 font-mono uppercase tracking-widest text-cyan">
                <span className="h-2 w-2 rounded-full bg-cyan" aria-hidden="true" />
                {(lang === "ar" ? category.arTitle : category.enTitle) || category.enTitle || category.arTitle}
              </h3>
              <ul className="flex flex-wrap gap-3">
                {category.items.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-colors duration-300 hover:border-cyan/50 hover:bg-cyan/10 hover:text-cyan"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
