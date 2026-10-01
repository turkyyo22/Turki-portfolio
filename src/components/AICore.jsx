"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const QUESTIONS = {
  ar: [
    "ما المناصب التي يناسبها تركي؟ 💼",
    "ما المشاريع التي يعمل عليها حالياً؟ 🚀",
    "هل يناسبه العمل خارج جدة؟ 📍",
    "متى يمكنه بدء العمل؟ 📅",
    "هل يفضّل الإدارة أم التطوير؟ 🧭",
    "حدثني عن مشروع سبع ثوانٍ 📄",
    "ما أبرز مهاراته التقنية؟ 💻",
    "ما نقاط قوته؟ 💪",
    "ما نقاط ضعفه؟ 🎯",
    "تركي والهاردوير ⚙️",
    "كيف أتواصل معه؟ ✉️"
  ],
  en: [
    "What roles is he a fit for? 💼",
    "What is he working on right now? 🚀",
    "Is he open to working outside Jeddah? 📍",
    "When can he start? 📅",
    "Does he prefer management or engineering? 🧭",
    "Tell me about Seven Seconds 📄",
    "What are his main tech skills? 💻",
    "What are his strengths? 💪",
    "What are his weaknesses? 🎯",
    "Turki and Hardware ⚙️",
    "How can I contact him? ✉️"
  ],
};

function pickThree(pool, exclude = []) {
  const blocked = new Set(exclude.filter(Boolean));
  let available = pool.filter((question) => !blocked.has(question));
  if (available.length < 3) {
    available = pool.filter((question) => question !== exclude[0]);
  }
  return [...available].sort(() => Math.random() - 0.5).slice(0, 3);
}

function SuggestionList({ questions, round, onPick }) {
  return (
    <div className="flex flex-col items-stretch gap-3 w-full">
      {questions.map((question, index) => (
        <motion.div key={`${round}-${question}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
          <button
            type="button"
            onClick={() => onPick(question)}
            className="group w-full text-xs sm:text-sm text-cyan/90 bg-white/[0.03] border border-cyan/25 px-4 py-3 rounded-xl text-center transition-all duration-200 hover:bg-cyan hover:text-[#050a15] hover:border-cyan hover:font-semibold hover:shadow-[0_0_18px_rgba(0,229,255,0.35)] active:scale-[0.98]"
          >
            {question}
          </button>
        </motion.div>
      ))}
    </div>
  );
}

export default function AICore({ lang }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState([]);
  const [suggestionRound, setSuggestionRound] = useState(0);
  const messagesEndRef = useRef(null);

  // 1. نظام الـ State المستقل بالكامل (بدون أي مكتبات خارجية)
  const [messages, setMessages] = useState([]);
  const [localText, setLocalText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentSuggestions, isLoading]);

  const pool = lang === "ar" ? QUESTIONS.ar : QUESTIONS.en;

  const showNextSuggestions = (exclude = []) => {
    setSuggestionRound((round) => round + 1);
    setCurrentSuggestions(pickThree(pool, exclude));
  };

  const toggleChat = () => {
    if (!isOpen && messages.length === 0) {
      showNextSuggestions();
    }
    setIsOpen(!isOpen);
  };

 // المحرك الأصلي الجبار (Native Stream Engine)
  const executeSend = async (textToSend) => {
    if (!textToSend.trim() || isLoading) return;

    // 1. إضافة الرسالة للواجهة (مع الـ id لكي يعمل العرض بشكل سليم)
    const newMessages = [...messages, { id: Date.now().toString(), role: 'user', content: textToSend }];
    const shownSuggestions = currentSuggestions;
    setMessages(newMessages);
    setLocalText("");
    setCurrentSuggestions([]);
    setIsLoading(true);
try {
      const cleanMessages = newMessages.map(({ role, content }) => ({ role, content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: cleanMessages })
      });

      // 1. إذا كان رد السيرفر يحتوي على خطأ 429 (انتهت الحصة)
      if (!response.ok) {
        if (response.status === 429) throw new Error("rate_limit");
        throw new Error("server_error");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = "";

      const aiMessageId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: aiMessageId, role: 'assistant', content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        aiContent += decoder.decode(value, { stream: true });
        
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          updated[lastIndex] = { ...updated[lastIndex], content: aiContent };
          return updated;
        });
      }

      // 2. حماية إضافية: إذا اكتمل الاتصال ولكن الرد كان فارغاً تماماً
      if (!aiContent.trim()) {
         throw new Error("empty_response");
      }

    } catch (error) {
      console.error("Native Chat Error:", error);
      
      // 1. النص الجديد واللطيف لتجربة مستخدم أفضل
      let errorMessage = "عذراً، أواجه مشكلة في الاتصال بالشبكة حالياً. يرجى المحاولة لاحقاً.";
      
      if (error.message === "rate_limit" || error.message === "empty_response") {
        errorMessage = "مساعد تركي في فترة راحة قصيرة الآن ☕، يرجى المحاولة بعد دقيقة أو دقيقتين!";
      }

      setMessages((prev) => {
        // 2. فلتر هندسي: مسح أي فقاعة محادثة فارغة للذكاء الاصطناعي لمنع التكرار
        const cleanedMessages = prev.filter(msg => !(msg.role === 'assistant' && msg.content === ""));
        
        // 3. التحقق مما إذا كانت الرسالة الأخيرة هي نفس رسالة الخطأ (لمنع التكرار المطلق إذا ضغط الزائر مرتين)
        const lastMsg = cleanedMessages[cleanedMessages.length - 1];
        if (lastMsg && lastMsg.content === errorMessage) {
          return cleanedMessages; // لا تضف شيئاً إذا كانت الرسالة موجودة بالفعل
        }

        // 4. إضافة رسالة الخطأ مرة واحدة وبشكل نظيف
        return [...cleanedMessages, { id: Date.now().toString(), role: 'assistant', content: errorMessage }];
      });
    } finally {
      showNextSuggestions([textToSend, ...shownSuggestions]);
      setIsLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    executeSend(localText);
  };

  const handleSuggestionClick = (q) => {
    executeSend(q);
  };

  return (
    <>
      {/* النافذة والزر مثبتان بشكل مستقل في نفس الزاوية حتى لا يؤثر أحدهما على موضع الآخر أثناء الحركة */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ transformOrigin: "bottom left" }}
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="fixed bottom-6 left-6 z-50 w-[90vw] sm:w-[360px] h-[480px] bg-gradient-to-b from-[#0b1220]/95 to-[#050a15]/95 backdrop-blur-xl border border-cyan/25 rounded-2xl shadow-[0_0_30px_rgba(34,211,238,0.15)] flex flex-col overflow-hidden"
          >
            {/* رأس النافذة */}
            <div className="relative bg-gradient-to-r from-cyan/15 via-blue/10 to-transparent border-b border-white/10 p-4 flex justify-between items-center">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/60 to-transparent" />
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cyan opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan" />
                </span>
                <h3 className="text-white font-bold tracking-widest text-sm">T.A CORE <span className="text-cyan/60 text-[10px] font-mono align-middle ml-1">v1.2</span></h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={lang === "ar" ? "إغلاق المحادثة" : "Close chat"}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* منطقة الرسائل */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full mt-4 gap-6">
                  <div className="text-center text-muted text-sm font-mono px-4 leading-relaxed">
                    {lang === "ar" 
                      ? "مرحباً! أنا النظام الذكي الخاص بتركي. يمكنك سؤالي أو اختيار أحد الأوامر السريعة:" 
                      : "System Ready. You can ask me anything or use a quick command:"}
                  </div>
                  
                  <SuggestionList questions={currentSuggestions} round={suggestionRound} onPick={handleSuggestionClick} />
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-gradient-to-br from-cyan to-blue text-[#050a15] rounded-br-sm font-medium shadow-[0_4px_16px_rgba(0,229,255,0.25)]' : 'bg-white/[0.06] text-white/90 rounded-bl-sm border border-white/10 whitespace-pre-wrap'}`}>
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              
              {!isLoading && messages.length > 0 && (
                <SuggestionList questions={currentSuggestions} round={suggestionRound} onPick={handleSuggestionClick} />
              )}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.06] border border-white/10 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5">
                    <span className="w-1.5 h-1.5 bg-cyan rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-cyan rounded-full animate-bounce [animation-delay:150ms]"></span>
                    <span className="w-1.5 h-1.5 bg-cyan rounded-full animate-bounce [animation-delay:300ms]"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* النموذج المستقل تماماً */}
            <form onSubmit={handleManualSubmit} className="p-3 bg-black/30 border-t border-white/10 flex gap-2">
              <input
                value={localText}
                onChange={(e) => setLocalText(e.target.value)}
                placeholder={lang === "ar" ? "اكتب أمرك هنا..." : "Type your command..."}
                dir={lang === "ar" ? "rtl" : "ltr"}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan/60 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(0,229,255,0.12)] transition-all"
              />
              <button 
                type="submit" 
                disabled={!localText.trim() || isLoading}
                aria-label={lang === "ar" ? "إرسال" : "Send"}
                className="w-11 shrink-0 bg-gradient-to-br from-cyan to-blue text-[#050a15] rounded-xl flex items-center justify-center shadow-[0_0_14px_rgba(0,229,255,0.3)] transition-all hover:brightness-110 hover:shadow-[0_0_20px_rgba(0,229,255,0.5)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 ${lang === "ar" ? "-scale-x-100" : ""}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* زر الفتح يختفي أثناء المحادثة لأن رأس النافذة يحتوي زر الإغلاق */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="launcher"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleChat}
            aria-label={lang === "ar" ? "افتح المساعد الذكي" : "Open AI assistant"}
            className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-glass border border-cyan/50 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:bg-cyan/20 transition-colors backdrop-blur-md"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-cyan">
              <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}