import { VStack } from "@astryxdesign/core/Stack";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import * as stylex from "@stylexjs/stylex";
import { basicSetup, EditorView } from "codemirror";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { reviewCommentsFor, useAppStore } from "../../../store";
import ReviewThread from "../../review/ReviewThread";
import {
  anchorComment,
  linesOf,
  type ReviewComment,
} from "../../review/reviewComments";
import {
  reviewExtension,
  showThreads,
  type ThreadHosts,
  type ThreadSpec,
} from "../../review/reviewEditor";

const styles = stylex.create({
  host: { height: "100%", minHeight: 0, overflow: "hidden" },
});

function languageFor(name: string): Extension {
  const ext = name.split(".").pop() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return javascript({ jsx: true, typescript: ext.startsWith("ts") });
    case "py":
      return python();
    case "rs":
      return rust();
    case "json":
      return json();
    case "html":
      return html();
    case "css":
      return css();
    default:
      return [];
  }
}

// Marks the transaction that loads a newer copy of the file from disk
// (`reloadChangedFiles`) into the view, so it isn't taken for typing.
const fromDisk = Annotation.define<boolean>();

const NEW_THREAD = "new";

// One open file's editor — `path` is the tab's own file, not the store's
// `activePath`, since a file tab in each area can be showing at once.
export default function FileEditorTab({ path }: { path: string }) {
  const openFiles = useAppStore((s) => s.openFiles);
  const updateContent = useAppStore((s) => s.updateContent);
  const saveFile = useAppStore((s) => s.saveFile);
  // Review comments (`features/review/`) belong to the conversation the
  // file is open in; a new thread has none until its first message.
  const sessionId = useAppStore((s) => s.activeSessionId);
  const allComments = useAppStore((s) => reviewCommentsFor(s, sessionId));
  const addReviewComment = useAppStore((s) => s.addReviewComment);
  const editReviewComment = useAppStore((s) => s.editReviewComment);
  const deleteReviewComment = useAppStore((s) => s.deleteReviewComment);
  const canComment = sessionId !== null;
  // Lines picked in the gutter for a comment not yet written.
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(
    null,
  );
  // The DOM CodeMirror made for each thread widget, to portal it into.
  const [hosts, setHosts] = useState<ReadonlyMap<string, HTMLElement>>(
    () => new Map(),
  );
  const threadHosts = useRef<ThreadHosts>({
    mount: (id, el) => setHosts((m) => new Map(m).set(id, el)),
    unmount: (id, el) =>
      setHosts((m) => {
        if (m.get(id) !== el) return m;
        const next = new Map(m);
        next.delete(id);
        return next;
      }),
  }).current;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const activeFile = openFiles.find((f) => f.path === path);
  // A restored tab mounts before its file's content has been read in.
  const loaded = !!activeFile;
  const content = activeFile?.content;

  // This file's comments where they sit in its current text.
  const comments = useMemo(
    () =>
      allComments
        .filter((c) => c.path === path)
        .map((comment) => ({
          comment,
          anchor: anchorComment(comment, content ?? ""),
        })),
    [allComments, path, content],
  );
  const threads: ThreadSpec[] = comments.map(({ comment, anchor }) => ({
    id: comment.id,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    isHighlighted: !anchor.outdated,
  }));
  if (picked) {
    threads.push({
      id: NEW_THREAD,
      startLine: picked.from,
      endLine: picked.to,
      isHighlighted: true,
    });
  }
  const threadsKey = JSON.stringify(threads);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only recreates the CodeMirror view on file switch (path) or once its content first loads. activeFile.* / updateContent must NOT be deps — activeFile.content changes on every keystroke via updateContent's own updateListener callback below, and depending on it would destroy+recreate the editor (losing cursor, selection, undo history) on every character typed. updateContent is a stable Zustand action reference anyway.
  useEffect(() => {
    viewRef.current?.destroy();
    viewRef.current = null;
    if (!containerRef.current || !activeFile) return;

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: activeFile.content,
        extensions: [
          basicSetup,
          oneDark,
          languageFor(activeFile.name),
          canComment
            ? reviewExtension({
                hosts: threadHosts,
                onPick: (from, to) => setPicked({ from, to }),
              })
            : [],
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(fromDisk))
            ) {
              updateContent(activeFile.path, update.state.doc.toString());
            }
          }),
          EditorView.theme({
            // The Astryx code block's background, like the terminal (see
            // `terminalTheme.ts`), over oneDark's own.
            "&": {
              height: "100%",
              backgroundColor: "var(--color-syntax-background)",
            },
            ".cm-gutters": {
              backgroundColor: "var(--color-syntax-background)",
              borderRight: "none",
            },
            ".cm-content, .cm-gutters": {
              fontFamily: "var(--al-font-mono)",
              fontSize: "var(--al-code-size)",
            },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => view.destroy();
  }, [path, loaded, canComment]);

  // A newer copy from disk (an agent's edit — see `reloadChangedFiles`):
  // swap it into the view. Typing round-trips through the store unchanged,
  // so it never differs here.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || content === undefined) return;
    if (view.state.doc.toString() === content) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      annotations: fromDisk.of(true),
    });
  }, [content]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `threadsKey` is `threads` by value; path/loaded/canComment re-run it on a fresh view
  useEffect(() => {
    if (viewRef.current && canComment) showThreads(viewRef.current, threads);
  }, [threadsKey, path, loaded, canComment]);

  if (!activeFile) return null;

  // Scoped to this editor rather than the window, so with a file tab open
  // in each area Ctrl+S saves the one being typed in.
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      saveFile(path);
    }
  }

  function addComment(body: string) {
    if (!sessionId || !picked || content === undefined) return;
    const comment: ReviewComment = {
      id: crypto.randomUUID(),
      path,
      startLine: picked.from,
      endLine: picked.to,
      snippet: linesOf(content, picked.from, picked.to),
      body,
      createdAt: Date.now(),
    };
    addReviewComment(sessionId, comment);
    setPicked(null);
  }

  function threadFor(id: string) {
    if (id === NEW_THREAD) {
      return (
        picked && (
          <ReviewThread
            startLine={picked.from}
            endLine={picked.to}
            onSave={addComment}
            onCancel={() => setPicked(null)}
          />
        )
      );
    }
    const found = comments.find((c) => c.comment.id === id);
    if (!found || !sessionId) return null;
    const { comment, anchor } = found;
    return (
      <ReviewThread
        startLine={anchor.startLine}
        endLine={anchor.endLine}
        body={comment.body}
        isOutdated={anchor.outdated}
        onSave={(body) => editReviewComment(sessionId, comment.id, body)}
        onDelete={() => deleteReviewComment(sessionId, comment.id)}
      />
    );
  }

  return (
    <VStack ref={containerRef} onKeyDown={onKeyDown} xstyle={styles.host}>
      {[...hosts].map(([id, el]) => createPortal(threadFor(id), el, id))}
    </VStack>
  );
}
