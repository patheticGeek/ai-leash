import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup, EditorView } from "codemirror";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { useAppStore } from "../../../store";

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

// One open file's editor — `path` is the tab's own file, not the store's
// `activePath`, since a file tab in each area can be showing at once.
export default function FileEditorTab({ path }: { path: string }) {
  const openFiles = useAppStore((s) => s.openFiles);
  const updateContent = useAppStore((s) => s.updateContent);
  const saveFile = useAppStore((s) => s.saveFile);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const activeFile = openFiles.find((f) => f.path === path);
  // A restored tab mounts before its file's content has been read in.
  const loaded = !!activeFile;

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
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              updateContent(activeFile.path, update.state.doc.toString());
            }
          }),
          EditorView.theme({
            "&": { height: "100%", backgroundColor: "var(--background)" },
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
  }, [path, loaded]);

  if (!activeFile) return null;

  // Scoped to this editor rather than the window, so with a file tab open
  // in each area Ctrl+S saves the one being typed in.
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      saveFile(path);
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: catches Ctrl+S bubbling up from the CodeMirror editor inside
    <div
      ref={containerRef}
      onKeyDown={onKeyDown}
      className="h-full min-h-0 overflow-hidden bg-background"
    />
  );
}
