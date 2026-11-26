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

// How an inline `@path` mention (`splitInlineMentions`) is drawn — a
// badge, supplied by the transcript (this file doesn't know about files or
// tabs). Only used when `Markdown` is given `mentions`.
export const MentionBadgeContext = createContext<
  ((mention: InlineMention) => ReactNode) | null
>(null);

const SHELL_LANGUAGES = new Set(["bash", "sh", "shell", "zsh"]);

// Block spacing: a step below each block, none after the last one.
const blockGap = {
  default: spacingVars["--spacing-2"],
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
  codeBlock: {
    marginBlock: spacingVars["--spacing-2"],
    overflow: "hidden",
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-muted"],
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
  pre: {
    margin: 0,
    overflowX: "auto",
    padding: spacingVars["--spacing-2"],
    fontFamily: typographyVars["--font-family-code"],
    fontSize: CODE_SIZE,
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
  blockquote: {
    marginBlock: 0,
    marginInline: 0,
    marginBlockEnd: blockGap,
    paddingInlineStart: spacingVars["--spacing-2"],
    borderInlineStartWidth: 2,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: colorVars["--color-accent"],
    color: colorVars["--color-text-secondary"],
  },
  heading: {
    marginBlockStart: {
      default: spacingVars["--spacing-2"],
      ":first-child": 0,
    },
    marginBlockEnd: spacingVars["--spacing-1-5"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
    fontSize: "1em",
  },
  h1: { fontSize: "1.143em" },
  hr: {
    marginBlock: spacingVars["--spacing-2"],
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
// scrollable code.
function CodeBlock({ children }: { children?: ReactNode }) {
  const { copy, copied } = useCopyToClipboard();
  const className = isValidElement<{ className?: string }>(children)
    ? children.props.className
    : undefined;
  const language = /language-(\S+)/.exec(className ?? "")?.[1];
  const runCommand = useContext(RunCommandContext);
  const text = nodeText(children).replace(/\n$/, "");
  return (
    <div {...stylex.props(styles.codeBlock)}>
      <HStack align="center" justify="between" xstyle={styles.codeHeader}>
        <span>{language ?? "text"}</span>
        <HStack align="center">
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
      <pre {...stylex.props(styles.pre)}>{children}</pre>
    </div>
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
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
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
  h1: ({ node: _, ...props }) => (
    <h1 {...props} {...stylex.props(styles.heading, styles.h1)} />
  ),
  h2: ({ node: _, ...props }) => (
    <h2 {...props} {...stylex.props(styles.heading)} />
  ),
  h3: ({ node: _, ...props }) => (
    <h3 {...props} {...stylex.props(styles.heading)} />
  ),
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

// `mentions`: a sent user message's attached paths, drawn inline as
// badges (via `MentionBadgeContext`) where the text tags them.
function Markdown({
  content,
  mentions,
}: {
  content: string;
  mentions?: readonly string[];
}) {
  const mentionsKey = mentions?.join("\n") ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the paths by value
  const plugins = useMemo(
    () =>
      mentions && mentions.length > 0
        ? [...remarkPlugins, remarkMentions(mentions)]
        : remarkPlugins,
    [mentionsKey],
  );
  return (
    <div {...stylex.props(styles.root)}>
      <ReactMarkdown
        remarkPlugins={plugins}
        components={plugins === remarkPlugins ? components : mentionComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
