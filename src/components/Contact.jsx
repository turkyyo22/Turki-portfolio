"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

import SectionHeading from "@/components/SectionHeading";
import { createDocument } from "@/lib/firestore/rest";

// Basic spam protection that needs no third-party service:
// a hidden "honeypot" field bots fill in, a minimum time to fill the form,
// length limits, and a short cooldown between messages from the same browser.
const MIN_FILL_MS = 3000;
const COOLDOWN_MS = 60_000;
const COOLDOWN_KEY = "contact:lastSentAt";
const LIMITS = { name: 100, email: 254, message: 2000 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/50 p-3 text-white outline-none transition-colors focus:border-cyan/50";

function lastSentAt() {
  try {
    return Number(localStorage.getItem(COOLDOWN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export default function Contact({ dict, socials }) {
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");
  const startedAt = useRef(null);

  const update = (field) => (event) => {
    startedAt.current ??= Date.now();
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    // Bots fill the hidden field: pretend it worked and store nothing.
    if (form.website) {
      setStatus("sent");
      return;
    }
    if (!startedAt.current || Date.now() - startedAt.current < MIN_FILL_MS) {
      setError(dict.errors.tooFast);
      return;
    }
    if (Date.now() - lastSentAt() < COOLDOWN_MS) {
      setError(dict.errors.cooldown);
      return;
    }
    const email = form.email.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setError(dict.errors.invalidEmail);
      return;
    }

    setStatus("sending");
    try {
      await createDocument("messages", {
        name: form.name.trim().slice(0, LIMITS.name),
        email: email.slice(0, LIMITS.email),
        message: form.message.trim().slice(0, LIMITS.message),
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      try {
        localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      } catch {
        // Storage can be unavailable (private mode); the cooldown is best-effort.
      }
      setStatus("sent");
      setForm({ name: "", email: "", message: "", website: "" });
      startedAt.current = null;
    } catch (submitError) {
      console.error("Error sending message:", submitError);
      setError(dict.errors.generic);
      setStatus("idle");
    }
  };

  return (
    <section id="contact" aria-labelledby="contact-title" className="relative z-10 mx-auto mt-24 mb-20 w-full max-w-4xl">
      <SectionHeading id="contact-title" eyebrow={dict.eyebrow} title={dict.title} centered />
      <p className="-mt-6 mb-10 text-center text-muted">{dict.description}</p>

      <div className="flex flex-col gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl border border-white/10 bg-glass p-6 shadow-2xl backdrop-blur-xl md:p-10"
        >
          {status === "sent" ? (
            <div role="status" className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-cyan/50 bg-cyan/20 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-8 w-8 text-cyan" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-bold tracking-wide text-white">{dict.successTitle}</h3>
              <p className="text-white/70">{dict.successText}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="contact-name" className="mb-2 block text-sm font-semibold text-white/85">
                    {dict.nameLabel}
                  </label>
                  <input id="contact-name" type="text" required autoComplete="name" maxLength={LIMITS.name} value={form.name} onChange={update("name")} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="contact-email" className="mb-2 block text-sm font-semibold text-white/85">
                    {dict.emailLabel}
                  </label>
                  <input id="contact-email" type="email" required autoComplete="email" maxLength={LIMITS.email} value={form.email} onChange={update("email")} className={inputClass} />
                </div>
              </div>
              <div>
                <label htmlFor="contact-message" className="mb-2 block text-sm font-semibold text-white/85">
                  {dict.messageLabel}
                </label>
                <textarea id="contact-message" required maxLength={LIMITS.message} value={form.message} onChange={update("message")} className={`${inputClass} h-32 resize-none p-4`} />
              </div>

              {/* Honeypot: hidden from people and screen readers, tempting for bots. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label htmlFor="contact-website">Website</label>
                <input id="contact-website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={update("website")} />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending" || !form.name.trim() || !form.email.trim() || !form.message.trim()}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-cyan/50 bg-cyan/10 py-4 font-bold uppercase tracking-widest text-cyan transition-all duration-300 hover:bg-cyan hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "sending" ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan border-t-transparent" aria-hidden="true" />
                    {dict.sending}
                  </>
                ) : (
                  <>
                    {dict.send}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 rtl:-scale-x-100" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}
        </motion.div>

        <SocialLinks socials={socials} dict={dict.social} />
      </div>
    </section>
  );
}

const socialClass =
  "group flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg transition-all duration-300 hover:border-cyan/50 hover:bg-cyan/10";
const iconClass = "h-6 w-6 text-white/70 transition-colors group-hover:text-cyan";

function SocialLinks({ socials, dict }) {
  return (
    <div className="flex flex-wrap justify-center gap-4 md:gap-6">
      {socials.github && (
        <a href={socials.github} target="_blank" rel="noopener noreferrer" className={socialClass} aria-label={dict.github} title={dict.github}>
          <svg fill="currentColor" viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
          </svg>
        </a>
      )}
      {socials.linkedin && (
        <a href={socials.linkedin} target="_blank" rel="noopener noreferrer" className={socialClass} aria-label={dict.linkedin} title={dict.linkedin}>
          <svg fill="currentColor" viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
        </a>
      )}
      {socials.email && (
        <a href={`mailto:${socials.email}`} className={socialClass} aria-label={dict.email} title={dict.email}>
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClass} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </a>
      )}
      {socials.phone && (
        <a href={`tel:${socials.phone}`} className={socialClass} aria-label={dict.phone} title={dict.phone}>
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClass} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.864-1.051l-3.215-.536c-.538-.09-.997.109-1.32.518l-1.34 1.697c-1.958-1.01-3.66-2.712-4.67-4.67l1.697-1.34c.409-.323.608-.782.518-1.32l-.536-3.215C11.716 2.601 11.266 2.25 10.75 2.25H6.75A2.25 2.25 0 004.5 4.5v2.25z" />
          </svg>
        </a>
      )}
    </div>
  );
}
