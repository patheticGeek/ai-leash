import { useToast } from "@astryxdesign/core/Toast";
import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo } from "react";
import { api } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import type { HtmlPreviewActions } from "../../ui/HtmlPreview";

// "Save as file" for an HTML preview: a native Save dialog, then the write.
export function useSaveHtml() {
  const showToast = useToast();
  return useCallback(
    async (html: string, name = "prototype.html") => {
      const path = await save({
        defaultPath: name,
        filters: [{ name: "HTML", extensions: ["html", "htm"] }],
      });
      if (!path) return;
      try {
        await api.saveTextFileAs(path, html);
        showToast({ body: `Saved ${path}` });
      } catch (e) {
        showToast({ type: "error", body: `Couldn't save: ${String(e)}` });
      }
    },
    [showToast],
  );
}

// What a transcript's ```html previews can do outside their frame — given
// to `HtmlPreviewContext` by `TabContentHost`.
export function useHtmlPreviewActions(): HtmlPreviewActions {
  const openPreviewTab = useAppStore((s) => s.openPreviewTab);
  const saveHtml = useSaveHtml();
  return useMemo(
    () => ({
      open: (html) => openPreviewTab({ html }),
      save: (html) => void saveHtml(html),
    }),
    [openPreviewTab, saveHtml],
  );
}
