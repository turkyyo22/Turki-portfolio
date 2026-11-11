"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { translateFields } from "@/lib/adminApi";

// The same text translated twice in one session reuses the first answer
// instead of spending another AI request.
const cache = new Map();
const CACHE_SIZE = 50;

const cacheKey = ({ from, to, context, fields }) => JSON.stringify([from, to, context, fields]);

function remember(key, fields) {
  cache.set(key, fields);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
}

/**
 * Calls the admin translator. `translate(job)` resolves to the translated
 * fields, or null when it failed (then `error` holds a readable message) or
 * was cancelled. Only one request runs at a time; leaving the page cancels it.
 */
export function useTranslator() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(null);

  useEffect(() => () => running.current?.abort(), []);

  const translate = useCallback(async (job) => {
    const key = cacheKey(job);
    if (cache.has(key)) {
      setError("");
      return cache.get(key);
    }

    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError("");
    try {
      const fields = await translateFields({ ...job, signal: controller.signal });
      remember(key, fields);
      return fields;
    } catch (failure) {
      if (failure?.name !== "AbortError") setError(failure?.message || "Translation failed. Try again.");
      return null;
    } finally {
      if (running.current === controller) {
        running.current = null;
        setBusy(false);
      }
    }
  }, []);

  const clearError = useCallback(() => setError(""), []);

  return { translate, busy, error, clearError };
}
