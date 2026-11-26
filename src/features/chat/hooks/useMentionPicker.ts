import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { qk } from "../../../data/keys";
import {
  isPickedMention,
  MENTION_DRAG_TYPE,
  mentionSpans,
  mentionToken,
  onMentionRequest,
  rememberMention,
} from "../../../lib/mentions";
import { api, type MentionCandidate } from "../../../lib/tauriApi";

// The `@` file picker's state for `ChatComposer` (#24), the counterpart to
// `useSlashCommands`: typing `@` (at the start or after a space) opens it
// over the files and folders of the chat's checkout (`search_mentions`,
// fuzzy and `.gitignore`-aware), filtered by what follows the `@` up to the
// caret. Picking writes `@path ` into the text — the message's token for it,
// which Backspace removes whole. Also takes paths from outside the box: the
// file tree's "Mention in chat" (`requestMention`) and a row dropped on it.
export function useMentionPicker(
  input: string,
  setInputValue: (value: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  checkoutPath: string | null,
) {
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [index, setIndex] = useState(0);

  // The caret, kept in state. A keystroke sets it in the same render as the
  // text (`syncCaret`, from the field's change handler), so typing costs one
  // render. Clicks, arrow keys and focus move it without changing the text;
  // those listeners set it too, and are a no-op when it hasn't moved. Not
  // on the native `input` event: that runs before React's own `onChange`,
  // and re-rendering there with the old text writes it back over the
  // keystroke, so typing is lost.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const sync = () => setCaret(el.selectionStart ?? 0);
    const events = ["select", "keyup", "click", "focus"] as const;
    for (const e of events) el.addEventListener(e, sync);
    return () => {
      for (const e of events) el.removeEventListener(e, sync);
    };
  });

  // Called from the field's change handler, next to setting the text, so
  // both land in one render.
  function syncCaret(value: string) {
    setCaret(textareaRef.current?.selectionStart ?? value.length);
  }

  // The `@query` being typed right before the caret, if any.
  const before = input.slice(0, caret);
  const match = /(^|\s)@([^\s"@]*)$/.exec(before);
  const query = match ? match[2] : null;
  const tokenStart = match ? caret - match[2].length - 1 : -1;

  const [debounced, setDebounced] = useState(query ?? "");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query ?? ""), 80);
    return () => clearTimeout(id);
  }, [query]);

  const open = query !== null && !!checkoutPath && dismissed !== tokenStart;
  const search = useQuery({
    queryKey: qk.mentionSearch(checkoutPath ?? "", debounced),
    queryFn: () => api.searchMentions(checkoutPath ?? "", debounced),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
  const matches: MentionCandidate[] = open ? (search.data ?? []) : [];
  const showPopover = open && matches.length > 0;
  const activeIndex = Math.min(index, matches.length - 1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: query is a trigger-only dep — a new query starts the highlight at the top again
  useEffect(() => {
    setIndex(0);
  }, [query]);
  // A dismissal only holds for the `@` it was made at.
  useEffect(() => {
    if (query === null) setDismissed(null);
  }, [query]);

  function place(value: string, at: number) {
    setInputValue(value);
    setCaret(at);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
    });
  }

  function pathOf(c: MentionCandidate) {
    return c.isDir ? `${c.path}/` : c.path;
  }

  // Replaces the `@query` being typed with the picked path's token.
  function accept(c: MentionCandidate) {
    if (tokenStart < 0) return;
    const path = pathOf(c);
    rememberMention(path);
    const token = `${mentionToken(path)} `;
    const after = input.slice(caret).replace(/^\S*/, "").replace(/^ /, "");
    place(
      input.slice(0, tokenStart) + token + after,
      tokenStart + token.length,
    );
  }

  // Writes `path`'s token in at the caret (or the end), spaced off from
  // the text around it.
  function insertPath(path: string) {
    rememberMention(path);
    const el = textareaRef.current;
    const current = el?.value ?? input;
    const at = el ? (el.selectionStart ?? current.length) : current.length;
    const head = current.slice(0, at);
    const pad = head && !/\s$/.test(head) ? " " : "";
    const token = `${pad}${mentionToken(path)} `;
    place(head + token + current.slice(at), at + token.length);
  }

  // The file tree's "Mention in chat".
  const insertRef = useRef(insertPath);
  useEffect(() => {
    insertRef.current = insertPath;
  });
  useEffect(() => onMentionRequest((path) => insertRef.current(path)), []);

  // A file-tree row dropped on the box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(MENTION_DRAG_TYPE)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const path = e.dataTransfer?.getData(MENTION_DRAG_TYPE);
      if (!path) return;
      e.preventDefault();
      insertRef.current(path);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("drop", drop);
    };
  });

  // Backspace right after a picked mention's token takes the whole token
  // out. True if it did (the key is handled).
  function backspace(): boolean {
    const el = textareaRef.current;
    if (!el || el.selectionStart !== el.selectionEnd) return false;
    const at = el.selectionStart;
    const span = mentionSpans(input).find(
      (s) => s.end === at && isPickedMention(s.path),
    );
    if (!span) return false;
    place(input.slice(0, span.start) + input.slice(span.end), span.start);
    return true;
  }

  // The menu's keys, then Backspace over a picked token — run first in the
  // composer's keydown; true if the key was handled here.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const handled = (() => {
      if (showPopover) {
        if (e.key === "ArrowDown") {
          setIndex((i) => Math.min(i + 1, matches.length - 1));
          return true;
        }
        if (e.key === "ArrowUp") {
          setIndex((i) => Math.max(i - 1, 0));
          return true;
        }
        if (e.key === "Tab" || e.key === "Enter") {
          const c = matches[activeIndex];
          if (c) accept(c);
          return true;
        }
        if (e.key === "Escape") {
          setDismissed(tokenStart);
          return true;
        }
      }
      return e.key === "Backspace" && backspace();
    })();
    if (handled) e.preventDefault();
    return handled;
  }

  return {
    showPopover,
    syncCaret,
    onKeyDown,
    // `MentionMenu`'s props, but for its anchor.
    menu: {
      matches,
      activeIndex,
      onSelect: accept,
      onActiveIndexChange: setIndex,
    },
  };
}
