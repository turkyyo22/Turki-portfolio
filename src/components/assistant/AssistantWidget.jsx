"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";

import { onAssistantAsk } from "@/lib/assistant/events";
import { useAssistantChat } from "@/lib/assistant/useAssistantChat";
import { directionOf } from "@/lib/i18n";
import CoreGlyph from "./CoreGlyph";

// Loaded on demand, so the first page load stays light.
const loadChatPanel = () => import("./ChatPanel");
const ChatPanel = dynamic(loadChatPanel, { ssr: false });
const AssistantIntro = dynamic(() => import("./AssistantIntro"), { ssr: false });

const INTRO_SEEN_KEY = "ta-core:intro-seen";
const INTRO_DELAY_MS = 1500;

function pickThree(pool, exclude = []) {
  const blocked = new Set(exclude);
  const available = pool.filter((question) => !blocked.has(question));
  const source = available.length >= 3 ? available : pool;
  return [...source].sort(() => Math.random() - 0.5).slice(0, 3);
}

function introAlreadySeen() {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberIntroSeen() {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // Storage may be blocked; the intro would just play again next visit.
  }
}

/**
 * The floating assistant: launcher button, first-visit 3D intro and chat panel.
 * Anything on the page can open it with `askAssistant()` (see lib/assistant/events).
 */
export default function AssistantWidget({ lang, dict }) {
  const [isOpen, setIsOpen] = useState(false);
  const [intro, setIntro] = useState("pending"); // pending | visible | done
  const [hasUnread, setHasUnread] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionRound, setSuggestionRound] = useState(0);
  const queuedQuestion = useRef(null);

  const errorText = useCallback((code) => dict.errors[code] || dict.errors.default, [dict.errors]);
  // The site language helps the model pick the reply language when a question is ambiguous.
  const getRequestOptions = useCallback(async () => ({ options: { lang } }), [lang]);
  const { messages, isLoading, send } = useAssistantChat({ errorText, getRequestOptions });

  const showSuggestions = useCallback(
    (exclude = []) => {
      setSuggestionRound((round) => round + 1);
      setSuggestions(pickThree(dict.suggestions, exclude));
    },
    [dict.suggestions]
  );

  const finishIntro = useCallback((reason) => {
    rememberIntroSeen();
    setIntro("done");
    if (reason === "dismissed") setHasUnread(true);
  }, []);

  const openChat = useCallback(() => {
    finishIntro("opened");
    setHasUnread(false);
    setIsOpen(true);
    setSuggestions((current) => (current.length > 0 ? current : pickThree(dict.suggestions)));
  }, [dict.suggestions, finishIntro]);

  const ask = useCallback(
    async (question) => {
      const shown = suggestions;
      setSuggestions([]);
      const sent = await send(question);
      if (sent) showSuggestions([question, ...shown]);
      else queuedQuestion.current = question; // a reply is still streaming
    },
    [send, suggestions, showSuggestions]
  );

  // Questions from the rest of the page ("Ask AI about this", the hero card, the nav).
  useEffect(
    () =>
      onAssistantAsk(({ question }) => {
        openChat();
        if (question) ask(question);
      }),
    [openChat, ask]
  );

  // Send a question that arrived while the previous answer was streaming.
  useEffect(() => {
    if (isLoading || !queuedQuestion.current) return;
    const question = queuedQuestion.current;
    queuedQuestion.current = null;
    const id = window.setTimeout(() => ask(question), 0);
    return () => window.clearTimeout(id);
  }, [isLoading, ask]);

  // Play the intro once per visit, shortly after the page appears.
  useEffect(() => {
    if (introAlreadySeen()) return undefined;
    const id = window.setTimeout(() => {
      setIntro((state) => (state === "pending" ? "visible" : state));
      loadChatPanel(); // warm the chat code while the intro plays
    }, INTRO_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  const dismissIntro = useCallback(() => finishIntro("dismissed"), [finishIntro]);
  const closeChat = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <ChatPanel
            key="panel"
            lang={lang}
            dict={dict}
            messages={messages}
            isLoading={isLoading}
            suggestions={suggestions}
            suggestionRound={suggestionRound}
            onSend={ask}
            onClose={closeChat}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {intro === "visible" && !isOpen && (
          <AssistantIntro key="intro" dict={dict} textDirection={directionOf(lang)} onOpen={openChat} onDismiss={dismissIntro} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="launcher"
            type="button"
            onClick={openChat}
            onPointerEnter={loadChatPanel}
            onFocus={loadChatPanel}
            aria-label={hasUnread ? `${dict.open}. ${dict.unread}` : dict.open}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-4 left-4 z-50 flex h-12 w-12 items-center sm:bottom-6 sm:left-6 sm:h-14 sm:w-14 justify-center rounded-full border border-cyan/50 bg-glass shadow-[0_0_20px_rgba(0,229,255,0.3)] backdrop-blur-md transition-colors hover:bg-cyan/20"
          >
            <CoreGlyph size={34} />
            {hasUnread && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-cyan text-[11px] font-bold text-[#050a15] shadow-[0_0_10px_rgba(0,229,255,0.8)]" aria-hidden="true">
                1
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
