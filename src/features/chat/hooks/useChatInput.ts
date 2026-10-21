import { useEffect, useRef, useState } from "react";
import { chatDraftKey as chatDraftKeyFor } from "../../../lib/chatDraft";

function loadChatDraft(key: string | null): string {
  if (!key) return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

// The message box's text: seeded from and persisted to this conversation's
// localStorage draft, plus the textarea ref that programmatic edits need. A
// still-unsent new thread (`sessionId` null) keeps its text in memory only.
export function useChatInput(sessionId: string | null) {
  const chatDraftKey = sessionId ? chatDraftKeyFor(sessionId) : null;
  const [input, setInput] = useState(() => loadChatDraft(chatDraftKey));
  useEffect(() => {
    if (!chatDraftKey) return;
    try {
      if (input) {
        localStorage.setItem(chatDraftKey, input);
      } else {
        localStorage.removeItem(chatDraftKey);
      }
    } catch {
      // Draft persistence is best-effort when storage is unavailable.
    }
  }, [chatDraftKey, input]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The textarea is uncontrolled (see `ChatInputBar`'s `defaultValue`) so the
  // browser's native undo/redo (Ctrl+Z) survives — a controlled `value`
  // reassigned on every keystroke wipes that history. Programmatic changes
  // (clearing on send, inserting a slash-command template) have to write the
  // DOM node directly as well as the `input` state that mirrors it.
  function setInputValue(value: string) {
    setInput(value);
    if (textareaRef.current) textareaRef.current.value = value;
  }

  return { input, setInput, setInputValue, textareaRef };
}
