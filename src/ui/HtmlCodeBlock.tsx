import { IconButton } from "@astryxdesign/core/IconButton";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import {
  Download,
  Maximize2,
  Minimize2,
  SquareArrowOutUpRight,
} from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import {
  HtmlPreviewContext,
  HtmlPreviewFrame,
  isHtmlDocument,
} from "./HtmlPreview";

// The ```html part of `Markdown`'s code blocks: a Preview / Code switch once
// the block's closing fence has streamed in, opening on the preview when
// it's a whole page or marked ```html preview. Kept out of `Markdown.tsx`,
// which only asks `useHtmlCodeBlock` for header actions and a body.

const HTML_LANGUAGES = new Set(["html", "htm"]);

/** The markdown source being rendered (provided by `Markdown`), so a code
 * block can look at its own fence: react-markdown hands components
 * positions, not the source text. */
export const MarkdownSourceContext = createContext("");

export interface SourcePosition {
  start?: { offset?: number };
  end?: { offset?: number };
}

// A fenced block's info string past the language (```html preview → "preview")
// and whether its closing fence has arrived yet — while a reply streams, an
// open block runs to the end of the text, so its last line isn't a fence.
function fenceOf(source: string, position: SourcePosition | undefined) {
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (start === undefined || end === undefined) {
    return { meta: "", isClosed: true };
  }
  // Lines inside a blockquote or list item carry its `>`/indent prefix.
  const lines = source
    .slice(start, end)
    .split("\n")
    .map((l) => l.replace(/^[\s>]*/, "").trimEnd());
  const open = lines[0];
  const fence = /^(`{3,}|~{3,})/.exec(open)?.[1] ?? "```";
  const last = lines[lines.length - 1];
  return {
    meta: open.slice(fence.length).trim().split(/\s+/).slice(1).join(" "),
    isClosed:
      lines.length > 1 &&
      last.length >= fence.length &&
      [...last].every((c) => c === fence[0]),
  };
}

/** For a code block: `null` unless it's a closed ```html block, else the
 * header actions to show before Copy and, on Preview, the body to show in
 * place of the code. */
export function useHtmlCodeBlock(
  language: string | undefined,
  text: string,
  position: SourcePosition | undefined,
): { actions: ReactNode; body: ReactNode | null } | null {
  const previewActions = useContext(HtmlPreviewContext);
  const source = useContext(MarkdownSourceContext);
  const [view, setView] = useState<"preview" | "code" | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  if (!language || !HTML_LANGUAGES.has(language.toLowerCase())) return null;
  const fence = fenceOf(source, position);
  if (!fence.isClosed) return null;
  const shown =
    view ??
    (/\bpreview\b/.test(fence.meta) || isHtmlDocument(text)
      ? "preview"
      : "code");
  return {
    actions: (
      <>
        <SegmentedControl
          size="sm"
          label="Show"
          value={shown}
          onChange={(v) => setView(v as "preview" | "code")}
        >
          <SegmentedControlItem value="preview" label="Preview" />
          <SegmentedControlItem value="code" label="Code" />
        </SegmentedControl>
        {shown === "preview" && (overflows || isExpanded) && (
          <IconButton
            variant="ghost"
            size="sm"
            label={isExpanded ? "Collapse" : "Expand"}
            tooltip={isExpanded ? "Collapse" : "Expand"}
            icon={
              isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />
            }
            onClick={() => setIsExpanded((e) => !e)}
          />
        )}
        {previewActions && (
          <>
            <IconButton
              variant="ghost"
              size="sm"
              label="Open in a tab"
              tooltip="Open in a tab"
              icon={<SquareArrowOutUpRight size={13} />}
              onClick={() => previewActions.open(text)}
            />
            <IconButton
              variant="ghost"
              size="sm"
              label="Save as file"
              tooltip="Save as file"
              icon={<Download size={13} />}
              onClick={() => previewActions.save(text)}
            />
          </>
        )}
      </>
    ),
    body:
      shown === "preview" ? (
        <HtmlPreviewFrame
          html={text}
          isExpanded={isExpanded}
          onOverflowChange={setOverflows}
        />
      ) : null,
  };
}
