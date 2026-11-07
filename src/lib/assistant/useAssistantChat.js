"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AssistantError, streamAssistantReply } from "./chatClient";
import { ASSISTANT_LIMITS } from "./limits";

let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter += 1)}`;

/**
 * Conversation state for the assistant: sends a question, streams the reply
 * into place and turns failures into a friendly, translated message.
 *
 * @param errorText (code) => string   message shown for an error code
 * @param getRequestOptions async () => ({ options, idToken })   extra request data (admin test console)
 */
export function useAssistantChat({ errorText, getRequestOptions } = {}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // The source of truth for the async flow; state mirrors it for rendering.
  const historyRef = useRef([]);
  const busyRef = useRef(false);
  const abortRef = useRef(null);

  const commit = useCallback((next) => {
    historyRef.current = next;
    setMessages(next);
  }, []);

  const patch = useCallback(
    (id, changes) => commit(historyRef.current.map((message) => (message.id === id ? { ...message, ...changes } : message))),
    [commit]
  );

  const send = useCallback(
    async (text) => {
      const content = String(text || "").trim().slice(0, ASSISTANT_LIMITS.maxUserMessageChars);
      if (!content || busyRef.current) return false;
      busyRef.current = true;
      setIsLoading(true);

      const history = [...historyRef.current, { id: newId(), role: "user", content }];
      const replyId = newId();
      commit([...history, { id: replyId, role: "assistant", content: "", pending: true }]);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const extra = getRequestOptions ? await getRequestOptions() : {};
        await streamAssistantReply({
          messages: history,
          ...extra,
          signal: controller.signal,
          onText: (reply) => patch(replyId, { content: reply }),
        });
        patch(replyId, { pending: false });
      } catch (error) {
        if (error?.name === "AbortError") {
          commit(historyRef.current.filter((message) => message.id !== replyId));
        } else {
          const code = error instanceof AssistantError ? error.code : "default";
          if (error?.partialText) {
            patch(replyId, { content: error.partialText, pending: false });
            commit([...historyRef.current, { id: newId(), role: "assistant", content: errorText?.(code) ?? code, isError: true }]);
          } else {
            patch(replyId, { content: errorText?.(code) ?? code, pending: false, isError: true });
          }
        }
      } finally {
        busyRef.current = false;
        abortRef.current = null;
        setIsLoading(false);
      }
      return true;
    },
    [commit, patch, errorText, getRequestOptions]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    commit([]);
  }, [commit]);

  // Stop any request still streaming when the component goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { messages, isLoading, send, reset };
}
