"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

const COPY = {
  en: { title: "Something went wrong", text: "This page couldn't load. Please try again.", retry: "Try again" },
  ar: { title: "حدث خطأ ما", text: "تعذّر تحميل هذه الصفحة. حاول مرة أخرى.", retry: "إعادة المحاولة" },
};

export default function Error({ error, retry }) {
  const { lang } = useParams();
  const copy = COPY[lang] || COPY.en;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-glass border border-white/10 rounded-2xl p-8 backdrop-blur-md">
        <h1 className="text-2xl font-bold text-white mb-3">{copy.title}</h1>
        <p className="text-muted mb-6">{copy.text}</p>
        <button
          type="button"
          onClick={() => retry()}
          className="px-6 py-2.5 rounded-lg border border-cyan/50 text-cyan hover:bg-cyan/15 transition-colors"
        >
          {copy.retry}
        </button>
      </div>
    </div>
  );
}
