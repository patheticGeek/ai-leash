import { CodeBlock as AstryxCodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typographyVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Check, Copy, Play } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  isValidElement,
  memo,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { type InlineMention, splitInlineMentions } from "@/lib/mentions";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import {
  MarkdownSourceContext,
  type SourcePosition,
  useHtmlCodeBlock,
} from "./HtmlCodeBlock";
import UiBlock from "./UiBlock";

// Flattens a rendered node back to the source text it came from.
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

// What the run button on a shell code block does with its command. Provided by
// whoever hosts the transcript (this file doesn't know about terminals); with
// no provider, shell blocks just don't get a run button.
export const RunCommandContext = createContext<
  ((command: string) => void) | null
>(null);

// The message being rendered, for a ```ui block to tell whether its closing
// fence has arrived yet (react-markdown runs an unclosed fence to the end).
const SourceContext = createContext<{ content: string; isStreaming: boolean }>({
  content: "",
  isStreaming: false,
});

// The fence's language, off react-markdown's `language-*` class on `<code>`.
function languageOf(children: ReactNode): string | undefined {
  const className = isValidElement<{ className?: string }>(children)
    ? children.props.className
    : undefined;
  return /language-(\S+)/.exec(className ?? "")?.[1];
}

// How an inline `@path` mention (`splitInlineMentions`) is drawn — a
// badge, supplied by the transcript (this file doesn't know about files or
// tabs). Only used when `Markdown` is given `mentions`.
export const MentionBadgeContext = createContext<
  ((mention: InlineMention) => ReactNode) | null
>(null);

const SHELL_LANGUAGES = new Set(["bash", "sh", "shell", "zsh"]);

// Block spacing: a gap below each block (paragraphs, lists, code, quotes,
// tables), none after the last one. Headings add more room above them, so a
// section break reads as one; see `heading`.
const blockGap = {
  default: spacingVars["--spacing-3"],
  ":last-child": 0,
};

// The user's code font size (Settings → Preferences, `fontPreferences`).
const CODE_SIZE = "var(--al-code-size)";

const styles = stylex.create({
  root: {
    // Inherits the transcript's size (which follows the user's font scale);
    // only colours, weights and spacing come from tokens.
    lineHeight: 1.625,
    overflowWrap: "break-word",
  },
  // The code palette's own background (`--color-syntax-background`, from
  // the theme), the one the editor and terminal use too — see
  // `lib/codeTheme.ts`.
  codeBlock: {
    marginBlock: 0,
    marginBlockEnd: blockGap,
    overflow: "hidden",
    borderRadius: radiusVars["--radius-element"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    backgroundColor: "var(--color-syntax-background)",
  },
  codeHeader: {
    paddingBlock: spacingVars["--spacing-0-5"],
    paddingInlineStart: spacingVars["--spacing-2"],
    paddingInlineEnd: spacingVars["--spacing-1"],
    borderBlockEndWidth: 1,
    borderBlockEndStyle: "solid",
    borderBlockEndColor: colorVars["--color-border"],
    color: colorVars["--color-text-secondary"],
    fontSize: "0.857em",
  },
  // The highlighted body: Astryx `CodeBlock` bare (no header or copy of its
  // own, `container="section"` takes no frame), at the user's code size —
  // its `sm` text reads `--text-supporting-size`.
  code: {
    "--text-supporting-size": CODE_SIZE,
    paddingBlock: spacingVars["--spacing-1"],
  },
  inlineCode: {
    paddingInline: spacingVars["--spacing-1"],
    paddingBlock: spacingVars["--spacing-0-5"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-muted"],
    fontFamily: typographyVars["--font-family-code"],
    fontSize: CODE_SIZE,
    color: colorVars["--color-text-primary"],
  },
  link: {
    color: {
      default: colorVars["--color-text-blue"],
      ":hover": colorVars["--color-text-primary"],
    },
    textDecoration: "underline",
  },
  p: { marginBlock: 0, marginBlockEnd: blockGap },
  list: {
    marginBlock: 0,
    marginBlockEnd: blockGap,
    paddingInlineStart: spacingVars["--spacing-5"],
  },
  ul: { listStyleType: "disc" },
  ol: { listStyleType: "decimal" },
  // Items a small step apart, so a list doesn't read as one paragraph; a
  // nested list or a loose item's paragraphs sit tight inside it.
  li: {
    marginBlockEnd: {
      default: spacingVars["--spacing-1"],
      ":last-child": 0,
    },
    paddingInlineStart: spacingVars["--spacing-0-5"],
    "::marker": { color: colorVars["--color-text-secondary"] },
  },
  blockquote: {
    marginBlock: 0,
    marginInline: 0,
    marginBlockEnd: blockGap,
    paddingBlock: spacingVars["--spacing-0-5"],
    paddingInlineStart: spacingVars["--spacing-3"],
    borderInlineStartWidth: 2,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: colorVars["--color-border-emphasized"],
    color: colorVars["--color-text-secondary"],
  },
  // Headings: primary text, stepped down in size by level, weight 500 (the
  // design guide's ceiling), with room above so each starts a section and a
  // tighter gap below so it belongs to what follows.
  heading: {
    marginBlockStart: {
      default: spacingVars["--spacing-5"],
      ":first-child": 0,
    },
    marginBlockEnd: spacingVars["--spacing-2"],
    fontWeight: fontWeightVars["--font-weight-medium"],
    lineHeight: 1.3,
    color: colorVars["--color-text-primary"],
    fontSize: "1em",
  },
  h1: { fontSize: "1.5em" },
  h2: { fontSize: "1.3em" },
  h3: { fontSize: "1.15em" },
  // h4–h6: body size, set apart by colour and weight only.
  hMinor: {
    marginBlockStart: {
      default: spacingVars["--spacing-4"],
      ":first-child": 0,
    },
  },
  // A Markdown file (Preview) reads as a document: more air before the top
  // two levels, which also get a rule under them.
  hDocument: {
    marginBlockStart: {
      default: spacingVars["--spacing-8"],
      ":first-child": 0,
    },
    marginBlockEnd: spacingVars["--spacing-3"],
    paddingBlockEnd: spacingVars["--spacing-2"],
    borderBlockEndWidth: 1,
    borderBlockEndStyle: "solid",
    borderBlockEndColor: colorVars["--color-border"],
  },
  hr: {
    marginBlock: spacingVars["--spacing-5"],
    height: 0,
    borderWidth: 0,
    borderBlockStartWidth: 1,
    borderBlockStartStyle: "solid",
    borderBlockStartColor: colorVars["--color-border"],
  },
  tableWrap: { marginBlockEnd: blockGap, overflowX: "auto" },
  table: { borderCollapse: "collapse", fontSize: "0.857em" },
  cell: {
    paddingInline: spacingVars["--spacing-2"],
    paddingBlock: spacingVars["--spacing-1"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    textAlign: "start",
  },
  th: {
    backgroundColor: colorVars["--color-background-card"],
    fontWeight: fontWeightVars["--font-weight-medium"],
  },
  strong: {
    fontWeight: fontWeightVars["--font-weight-semibold"],
    color: colorVars["--color-text-primary"],
  },
});

// A fenced code block: a header with the language and a copy button above the
// scrollable code. ```html blocks add a preview (`HtmlCodeBlock.tsx`).
function CodeBlock({
  children,
  position,
}: {
  children?: ReactNode;
  position?: SourcePosition;
}) {
  const { copy, copied } = useCopyToClipboard();
  const language = languageOf(children);
  const runCommand = useContext(RunCommandContext);
  const text = nodeText(children).replace(/\n$/, "");
  const html = useHtmlCodeBlock(language, text, position);
  return (
    <div {...stylex.props(styles.codeBlock)}>
      <HStack align="center" justify="between" xstyle={styles.codeHeader}>
        <span>{language ?? "text"}</span>
        <HStack align="center">
          {html?.actions}
          {runCommand && language && SHELL_LANGUAGES.has(language) && (
            <IconButton
              variant="ghost"
              size="sm"
              label="Open in a new terminal"
              tooltip="Open in a new terminal"
              icon={<Play size={13} />}
              onClick={() => runCommand(text)}
            />
          )}
          <IconButton
            variant="ghost"
            size="sm"
            label="Copy"
            tooltip="Copy"
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
            onClick={() => copy(text)}
          />
        </HStack>
      </HStack>
      {html?.body ?? (
        <AstryxCodeBlock
          code={text}
          language={language ?? "plaintext"}
          hasLanguageLabel={false}
          hasCopyButton={false}
          container="section"
          size="sm"
          width="100%"
          xstyle={styles.code}
        />
      )}
    </div>
  );
}

// A ```ui fence: rendered as Astryx components (`UiBlock`), or a placeholder
// while the reply is still streaming and the closing fence hasn't come.
function UiFence({
  children,
  start,
  end,
}: {
  children?: ReactNode;
  start?: number;
  end?: number;
}) {
  const { content, isStreaming } = useContext(SourceContext);
  const raw = content.slice(start ?? 0, end ?? content.length);
  const closed = /\n[ \t>]*([`~]{3,})[ \t]*$/.test(raw.trimEnd());
  return (
    <UiBlock
      source={nodeText(children).replace(/\n$/, "")}
      isPending={isStreaming && !closed}
    />
  );
}

// Whether this is a Markdown file's Preview (`isDocument`), where the top
// two heading levels get document spacing and a rule.
const DocumentContext = createContext(false);

function Heading({
  level,
  ...props
}: { level: 1 | 2 | 3 | 4 | 5 | 6 } & ComponentProps<"h1">) {
  const isDocument = useContext(DocumentContext);
  const Tag = `h${level}` as const;
  return (
    <Tag
      {...props}
      {...stylex.props(
        styles.heading,
        level === 1 && styles.h1,
        level === 2 && styles.h2,
        level === 3 && styles.h3,
        level >= 4 && styles.hMinor,
        isDocument && level <= 2 && styles.hDocument,
      )}
    />
  );
}

// react-markdown hands each element a `node` (the mdast node) along with its
// HTML props; it isn't a DOM attribute, so it's dropped before spreading.
const components: Components = {
  a: ({ node: _, children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(styles.link)}
    >
      {children}
    </a>
  ),
  code: ({ node: _, className, children, ...props }) => {
    if (!/language-/.test(className ?? "")) {
      return (
        <code {...props} {...stylex.props(styles.inlineCode)}>
          {children}
        </code>
      );
    }
    // Fenced: keeps react-markdown's own `language-*` class, the one
    // `className` left in the app — it isn't styling, `CodeBlock` reads it
    // to pick the language.
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ node, children }) =>
    languageOf(children) === "ui" ? (
      <UiFence
        start={node?.position?.start.offset}
        end={node?.position?.end.offset}
      >
        {children}
      </UiFence>
    ) : (
      <CodeBlock position={node?.position}>{children}</CodeBlock>
    ),
  p: ({ node: _, ...props }) => <p {...props} {...stylex.props(styles.p)} />,
  ul: ({ node: _, ...props }) => (
    <ul {...props} {...stylex.props(styles.list, styles.ul)} />
  ),
  ol: ({ node: _, ...props }) => (
    <ol {...props} {...stylex.props(styles.list, styles.ol)} />
  ),
  blockquote: ({ node: _, ...props }) => (
    <blockquote {...props} {...stylex.props(styles.blockquote)} />
  ),
  h1: ({ node: _, ...props }) => <Heading level={1} {...props} />,
  h2: ({ node: _, ...props }) => <Heading level={2} {...props} />,
  h3: ({ node: _, ...props }) => <Heading level={3} {...props} />,
  h4: ({ node: _, ...props }) => <Heading level={4} {...props} />,
  h5: ({ node: _, ...props }) => <Heading level={5} {...props} />,
  h6: ({ node: _, ...props }) => <Heading level={6} {...props} />,
  li: ({ node: _, ...props }) => <li {...props} {...stylex.props(styles.li)} />,
  hr: ({ node: _, ...props }) => <hr {...props} {...stylex.props(styles.hr)} />,
  table: ({ node: _, ...props }) => (
    <div {...stylex.props(styles.tableWrap)}>
      <table {...props} {...stylex.props(styles.table)} />
    </div>
  ),
  th: ({ node: _, ...props }) => (
    <th {...props} {...stylex.props(styles.cell, styles.th)} />
  ),
  td: ({ node: _, ...props }) => (
    <td {...props} {...stylex.props(styles.cell)} />
  ),
  strong: ({ node: _, ...props }) => (
    <strong {...props} {...stylex.props(styles.strong)} />
  ),
};

// Used for assistant/sub-agent text only — user messages are shown as plain
// `whitespace-pre-wrap` text, since they're typed input rather than
// generated prose (matches the convention most chat UIs use). Hand-written
// (no Astryx/registry equivalent), styled with StyleX + Astryx tokens.
//
// `memo`'d (on `content`), with its plugin list hoisted: a streamed chunk
// re-renders the transcript around it, and without this every message's
// Markdown would be re-parsed on every chunk, not just the one growing.
const remarkPlugins = [remarkGfm, remarkBreaks];
// A Markdown file, not a chat message: its soft-wrapped lines join up, as
// CommonMark has them, instead of each becoming a line break.
const documentPlugins = [remarkGfm];

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName: string; hProperties: InlineMention };
}

// Remark step: the `@path` tokens in plain text (not code) that name one
// of `mentions` become `mention` elements, drawn by `MentionBadge`.
function remarkMentions(mentions: readonly string[]) {
  function walk(node: MdNode) {
    if (!node.children) return;
    node.children = node.children.flatMap((child): MdNode[] => {
      if (child.type !== "text" || !child.value?.includes("@")) {
        walk(child);
        return [child];
      }
      return splitInlineMentions(child.value, mentions).map((part) =>
        typeof part === "string"
          ? { type: "text", value: part }
          : {
              type: "mention",
              children: [],
              data: { hName: "mention", hProperties: part },
            },
      );
    });
  }
  return () => walk;
}

function MentionBadge({ node }: { node?: { properties?: unknown } }) {
  const render = useContext(MentionBadgeContext);
  const mention = node?.properties as InlineMention | undefined;
  return mention && render ? render(mention) : null;
}

// `mention` isn't an HTML tag, so it's outside `Components`' keys.
const mentionComponents = {
  ...components,
  mention: MentionBadge,
} as Components;

// A fenced ```ui block is rendered as rich UI (`UiBlock`, spec in
// `lib/uiSpec.ts`). `isStreaming` says the text is still growing, so an
// unclosed ```ui block shows a placeholder instead of its partial JSON.
// `mentions`: a sent user message's attached paths, drawn inline as
// badges (via `MentionBadgeContext`) where the text tags them.
// `isDocument`: a Markdown file's contents (the file viewer's Preview),
// where a single newline is a soft wrap, not a line break.
function Markdown({
  content,
  isStreaming = false,
  mentions,
  isDocument = false,
}: {
  content: string;
  isStreaming?: boolean;
  mentions?: readonly string[];
  isDocument?: boolean;
}) {
  const source = useMemo(
    () => ({ content, isStreaming }),
    [content, isStreaming],
  );
  // Memoized on `mentions` by the React Compiler (a sent message's list is
  // stable while it's on screen).
  const plugins = isDocument
    ? documentPlugins
    : mentions && mentions.length > 0
      ? [...remarkPlugins, remarkMentions(mentions)]
      : remarkPlugins;
  return (
    <div {...stylex.props(styles.root)}>
      <DocumentContext.Provider value={isDocument}>
        <SourceContext.Provider value={source}>
          <MarkdownSourceContext.Provider value={content}>
            <ReactMarkdown
              remarkPlugins={plugins}
              components={
                plugins === remarkPlugins || plugins === documentPlugins
                  ? components
                  : mentionComponents
              }
            >
              {content}
            </ReactMarkdown>
          </MarkdownSourceContext.Provider>
        </SourceContext.Provider>
      </DocumentContext.Provider>
    </div>
  );
}

export default memo(Markdown);
