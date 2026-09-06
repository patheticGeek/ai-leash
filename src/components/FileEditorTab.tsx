import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { useAppStore } from "../store";

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

export default function FileEditorTab() {
  const openFiles = useAppStore((s) => s.openFiles);
  const activePath = useAppStore((s) => s.activePath);
  const updateContent = useAppStore((s) => s.updateContent);
  const saveActive = useAppStore((s) => s.saveActive);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const activeFile = openFiles.find((f) => f.path === activePath);

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
            "&": { height: "100%", backgroundColor: "#101114" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveActive();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActive]);

  if (!activeFile) return null;

  return <div ref={containerRef} className="h-full min-h-0 overflow-hidden bg-[#101114]" />;
}
