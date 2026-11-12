"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Assistant replies are Markdown. react-markdown never renders raw HTML and
// strips unsafe link protocols, so model output cannot inject markup.
const markdownComponents = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-2 hover:text-white">
      {children}
    </a>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 ps-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 ps-5 last:mb-0">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  h1: ({ children }) => <p className="mb-2 font-semibold text-white">{children}</p>,
  h2: ({ children }) => <p className="mb-2 font-semibold text-white">{children}</p>,
  h3: ({ children }) => <p className="mb-2 font-semibold text-white">{children}</p>,
};

function TypingDots() {
  return (
    <span className="flex gap-1.5 py-1" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan [animation-delay:300ms]" />
    </span>
  );
}

/** One chat bubble. Shared by the public chat and the admin test console. */
export default function ChatMessage({ message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div dir="auto" className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-gradient-to-br from-cyan to-blue px-4 py-2.5 text-sm font-medium leading-relaxed text-[#050a15] shadow-[0_4px_16px_rgb(var(--accent-cyan-rgb)/0.25)]">
          {message.content}
        </div>
      </div>
    );
  }

  const tone = message.isError ? "border-amber-400/30 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[0.06] text-white/90";
  return (
    <div className="flex justify-start">
      <div dir="auto" className={`max-w-[85%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm leading-relaxed ${tone}`}>
        {message.pending && !message.content ? (
          <TypingDots />
        ) : message.isError ? (
          message.content
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
