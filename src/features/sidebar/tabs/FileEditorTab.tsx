import { IconButton } from "@astryxdesign/core/IconButton";
import { VStack } from "@astryxdesign/core/Stack";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
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
import { Code, Eye } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { reviewCommentsFor, useAppStore } from "../../../store";
import type { FileViewMode } from "../../../store/projectSlice";
import Markdown from "../../../ui/Markdown";
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
  host: {
    position: "relative",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  // The Preview/Source switch floats over the content's top-right corner,
  // clear of its scrollbar, rather than taking a toolbar row.
  toggle: {
    position: "absolute",
    top: spacingVars["--spacing-2"],
    right: spacingVars["--spacing-4"],
    zIndex: 1,
  },
  pane: { flexGrow: 1, flexBasis: 0, minHeight: 0, overflow: "hidden" },
  // Kept mounted while the Preview shows, so its cursor, undo history and
  // review threads survive the switch.
  hidden: { display: "none" },
  // A plain scrolling box, not `ScrollableArea`, which ignores a `scrollTop`
  // written before it has measured (see `ChatEntryList`'s viewport).
  preview: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 0,
    overflowY: "auto",
    padding: spacingVars["--spacing-4"],
    // The app's chrome is unselectable (`index.css`); a document is
    // something you copy from.
    userSelect: "text",
  },
});

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

// How far down `el` is scrolled, 0–1.
function scrollFraction(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? el.scrollTop / max : 0;
}

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

  // Markdown gets a rendered Preview beside its Source (the editor).
  const isMarkdown = isMarkdownPath(path);
  const mode: FileViewMode = useAppStore((s) =>
    isMarkdown ? (s.fileViewModes[path] ?? "preview") : "source",
  );
  const setFileViewMode = useAppStore((s) => s.setFileViewMode);
  const previewRef = useRef<HTMLDivElement>(null);
  // Where the view being left was scrolled to, to carry over on a switch.
  const carriedScroll = useRef<number | null>(null);

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

  // An `@path:12-18` badge's click (`openFile`'s `lines`): select those
  // lines and scroll them into view, once the file is loaded.
  const revealLines = useAppStore((s) =>
    s.revealLines?.path === path ? s.revealLines : null,
  );
  const clearRevealLines = useAppStore((s) => s.clearRevealLines);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `loaded` re-runs it once the view exists
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !revealLines) return;
    // Lines are the source's: show it first, and come back once it's shown.
    if (mode !== "source") {
      setFileViewMode(path, "source");
      return;
    }
    const { doc } = view.state;
    const clamp = (n: number) => Math.min(Math.max(1, n), doc.lines);
    const from = doc.line(clamp(revealLines.startLine)).from;
    const to = doc.line(clamp(revealLines.endLine)).to;
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    view.focus();
    clearRevealLines();
  }, [revealLines, loaded, mode]);

  // Switching between Preview and Source keeps the place: the same share of
  // the way down. Source scrolls by line, which CodeMirror can do before it
  // has re-measured after being hidden.
  useLayoutEffect(() => {
    const fraction = carriedScroll.current;
    carriedScroll.current = null;
    if (fraction === null) return;
    if (mode === "preview") {
      const el = previewRef.current;
      if (el) el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    const { doc } = view.state;
    const line = doc.line(1 + Math.round(fraction * (doc.lines - 1)));
    view.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: "start" }),
    });
  }, [mode]);

  function switchView(next: string) {
    if (next === mode || (next !== "preview" && next !== "source")) return;
    const view = viewRef.current;
    if (mode === "preview") {
      if (previewRef.current) {
        carriedScroll.current = scrollFraction(previewRef.current);
      }
    } else if (view) {
      // The top visible line's share of the file, not the pixel share,
      // which review threads and wrapped lines skew.
      const top = view.lineBlockAtHeight(
        view.scrollDOM.getBoundingClientRect().top - view.documentTop,
      );
      const { doc } = view.state;
      carriedScroll.current =
        doc.lines > 1 ? (doc.lineAt(top.from).number - 1) / (doc.lines - 1) : 0;
    }
    setFileViewMode(path, next);
  }

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

  // Scoped to this tab rather than the window, so with a file tab open in
  // each area Ctrl+S saves the one being typed in.
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
    <VStack onKeyDown={onKeyDown} xstyle={styles.host}>
      <VStack
        ref={containerRef}
        xstyle={[styles.pane, mode === "preview" && styles.hidden]}
      >
        {[...hosts].map(([id, el]) => createPortal(threadFor(id), el, id))}
      </VStack>
      {mode === "preview" && (
        <VStack
          ref={previewRef}
          role="group"
          aria-label="Preview"
          tabIndex={0}
          xstyle={styles.preview}
        >
          <Markdown content={activeFile.content} isDocument />
        </VStack>
      )}
      {isMarkdown && (
        <VStack xstyle={styles.toggle}>
          <IconButton
            size="sm"
            elevation="low"
            label={mode === "preview" ? "Show source" : "Show preview"}
            tooltip={mode === "preview" ? "Show source" : "Show preview"}
            icon={mode === "preview" ? <Code size={13} /> : <Eye size={13} />}
            onClick={() =>
              switchView(mode === "preview" ? "source" : "preview")
            }
          />
        </VStack>
      )}
    </VStack>
  );
}
