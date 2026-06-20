"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function AICore({ lang }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState([]);
  const messagesEndRef = useRef(null);

  // 1. نظام الـ State المستقل بالكامل (بدون أي مكتبات خارجية)
  const [messages, setMessages] = useState([]);
  const [localText, setLocalText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const allQuestionsAr = [
    "من هو تركي؟ 🧐",
    "ما هي أبرز تقنيات تركي؟ 💻",
    "حدثني عن تطبيق منصت 📱",
    "كيف يمكنني التواصل معه؟ ✉️",
    "ماهي هواياته بعيداً عن البرمجة؟ 🎮",
    "كم عمره؟ 🎂",
    "تركي والهاردوير ⚙️"
  ];

  const allQuestionsEn = [
    "Who is Turki? 🧐",
    "What are his main tech skills? 💻",
    "Tell me about Mnsat project 📱",
    "How can I contact him? ✉️",
    "What are his hobbies? 🎮",
    "How old is he? 🎂",
    "Turki and Hardware ⚙️"
  ];

  const toggleChat = () => {
    if (!isOpen && messages.length === 0) {
      const pool = lang === "ar" ? allQuestionsAr : allQuestionsEn;
      const shuffled = [...pool].sort(() => 0.5 - Math.random());
      setCurrentSuggestions(shuffled.slice(0, 3));
    }
    setIsOpen(!isOpen);
  };

  // 2. المحرك الأصلي الجبار (Native Stream Engine)
 // المحرك الأصلي الجبار (Native Stream Engine)
  const executeSend = async (textToSend) => {
    if (!textToSend.trim() || isLoading) return;

    // 1. إضافة الرسالة للواجهة (مع الـ id لكي يعمل العرض بشكل سليم)
    const newMessages = [...messages, { id: Date.now().toString(), role: 'user', content: textToSend }];
    setMessages(newMessages);
    setLocalText("");
    setIsLoading(true);

    try {
      // 2. الخدعة الهندسية: تنظيف البيانات قبل الإرسال (حذف الـ id لأن Vercel ترفضه)
      const cleanMessages = newMessages.map(({ role, content }) => ({ role, content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: cleanMessages }) // نرسل البيانات النظيفة فقط!
      });

      if (!response.ok) {
        // قراءة رسالة الخطأ من السيرفر لمعرفة المشكلة بالتحديد
        const errorText = await response.text();
        console.error("Server Error Detail:", errorText);
        throw new Error("فشل الاتصال بالخادم");
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
    } catch (error) {
      console.error("Native Chat Error:", error);
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: "عذراً، حدث خطأ في الاتصال بالخادم. يرجى التأكد من مفتاح API." }]);
    } finally {
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
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-4 w-[90vw] sm:w-[360px] h-[480px] bg-black/80 backdrop-blur-xl border border-cyan/30 rounded-2xl shadow-[0_0_30px_rgba(34,211,238,0.15)] flex flex-col overflow-hidden"
          >
            {/* رأس النافذة */}
            <div className="bg-cyan/10 border-b border-cyan/20 p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
                <h3 className="text-white font-bold tracking-widest text-sm">T.A CORE <span className="text-cyan/50 text-xs">v1.0</span></h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-red-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* منطقة الرسائل */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full mt-4 gap-6">
                  <div className="text-center text-white/50 text-sm font-mono px-4 leading-relaxed">
                    {lang === "ar" 
                      ? "مرحباً! أنا النظام الذكي الخاص بتركي. يمكنك سؤالي أو اختيار أحد الأوامر السريعة:" 
                      : "System Ready. You can ask me anything or use a quick command:"}
                  </div>
                  
                  <div className="flex flex-col items-stretch gap-3 w-full px-2">
                    {currentSuggestions.map((q, i) => (
                      <motion.div key={q} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                        <button
                          type="button" 
                          onClick={() => handleSuggestionClick(q)}
                          className="w-full text-xs sm:text-sm text-cyan bg-cyan/5 border border-cyan/30 px-4 py-3 rounded-xl hover:bg-cyan/20 transition-colors text-center shadow-[0_0_10px_rgba(34,211,238,0.05)]"
                        >
                          {q}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-cyan text-black rounded-br-sm font-medium' : 'bg-white/10 text-white rounded-bl-sm border border-white/5 whitespace-pre-wrap'}`}>
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/5 p-3 rounded-2xl rounded-bl-sm flex gap-1">
                    <span className="w-2 h-2 bg-cyan/50 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-cyan/50 rounded-full animate-bounce delay-75"></span>
                    <span className="w-2 h-2 bg-cyan/50 rounded-full animate-bounce delay-150"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* النموذج المستقل تماماً */}
            <form onSubmit={handleManualSubmit} className="p-3 bg-black/50 border-t border-cyan/20 flex gap-2">
              <input
                value={localText}
                onChange={(e) => setLocalText(e.target.value)}
                placeholder={lang === "ar" ? "اكتب أمرك هنا..." : "Type your command..."}
                dir={lang === "ar" ? "rtl" : "ltr"}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan/50 transition-colors"
              />
              <button 
                type="submit" 
                disabled={!localText.trim() || isLoading}
                className="bg-cyan/20 text-cyan p-2 rounded-lg hover:bg-cyan hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleChat}
        className="w-14 h-14 bg-glass border border-cyan/50 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:bg-cyan/20 transition-all z-50 backdrop-blur-md"
      >
        {isOpen ? (
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-cyan">
             <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
           </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-cyan">
            <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
          </svg>
        )}
      </motion.button>
    </div>
  );
}