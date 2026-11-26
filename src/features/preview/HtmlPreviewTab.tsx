import { IconButton } from "@astryxdesign/core/IconButton";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Check, Copy, Download, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/tauriApi";
import { useCopyToClipboard } from "../../lib/useCopyToClipboard";
import type { WorkspaceTab } from "../../store";
import { HtmlPreviewFrame } from "../../ui/HtmlPreview";
import { useSaveHtml } from "./useHtmlPreviewActions";

const styles = stylex.create({
  host: { height: "100%", minHeight: 0 },
  frame: { flexGrow: 1, minHeight: 0 },
  message: { padding: spacingVars["--spacing-4"] },
});

type Loaded = { html: string; error?: undefined } | { error: string };

// Reads a file preview's `.html` from its session's checkout. `null` while
// loading.
function useFileHtml(path: string | undefined, sessionId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const load = useCallback(() => {
    if (!path) return;
    setLoaded(null);
    api
      .readFileText(sessionId, path)
      .then((html) => setLoaded({ html }))
      .catch((e) => setLoaded({ error: String(e) }));
  }, [path, sessionId]);
  useEffect(load, [load]);
  return { loaded, reload: load };
}

// A full-size HTML preview in a tab of its own: a chat ```html block
// (`tab.html`) or an `.html` file the agent wrote (`tab.path`, re-read on
// Reload). Same sandbox as the inline preview — see `ui/HtmlPreview.tsx`.
export default function HtmlPreviewTab({ tab }: { tab: WorkspaceTab }) {
  const file = useFileHtml(
    tab.html === undefined ? tab.path : undefined,
    tab.sessionId ?? null,
  );
  const { copy, copied } = useCopyToClipboard();
  const saveHtml = useSaveHtml();
  const html =
    tab.html ??
    (file.loaded && "html" in file.loaded ? file.loaded.html : null);
  const name = tab.path?.split(/[\\/]/).pop();

  return (
    <VStack xstyle={styles.host}>
      <Toolbar
        label="Preview"
        size="sm"
        dividers={["bottom"]}
        startContent={
          <Text type="supporting" color="secondary" maxLines={1}>
            {tab.path ?? "HTML from the chat"}
          </Text>
        }
        endContent={
          <>
            {tab.path && tab.html === undefined && (
              <IconButton
                variant="ghost"
                size="sm"
                label="Reload"
                tooltip="Reload"
                icon={<RotateCw size={13} />}
                onClick={file.reload}
              />
            )}
            <IconButton
              variant="ghost"
              size="sm"
              label="Copy HTML"
              tooltip="Copy HTML"
              isDisabled={html === null}
              icon={copied ? <Check size={13} /> : <Copy size={13} />}
              onClick={() => html !== null && copy(html)}
            />
            <IconButton
              variant="ghost"
              size="sm"
              label="Save as file"
              tooltip="Save as file"
              isDisabled={html === null}
              icon={<Download size={13} />}
              onClick={() => html !== null && void saveHtml(html, name)}
            />
          </>
        }
      />
      {html !== null ? (
        <VStack xstyle={styles.frame}>
          <HtmlPreviewFrame html={html} isFill title={tab.label} />
        </VStack>
      ) : (
        file.loaded?.error && (
          <VStack xstyle={styles.message}>
            <Text type="supporting" color="secondary">
              Couldn't read {tab.path}: {file.loaded.error}
            </Text>
          </VStack>
        )
      )}
    </VStack>
  );
}
