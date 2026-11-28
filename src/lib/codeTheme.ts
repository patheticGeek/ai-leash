import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// The app's one code palette is the Astryx theme's `--color-syntax-*`
// tokens: Astryx `CodeBlock` (chat code blocks, tool calls) paints with them,
// the terminal resolves them for its ANSI colours (`terminalTheme.ts`), and
// this maps them onto CodeMirror's highlight tags so the editor reads the
// same. Change the colours in the theme (`astryx experimental theme editor`),
// never here.
const syntax = (name: string) => `var(--color-syntax-${name})`;
const PRIMARY = "var(--color-text-primary)";

const highlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword],
    color: syntax("keyword"),
  },
  {
    tag: [t.operatorKeyword, t.operator, t.derefOperator],
    color: syntax("operator"),
  },
  {
    tag: [t.string, t.special(t.string), t.character, t.regexp, t.inserted],
    color: syntax("string"),
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta],
    color: syntax("comment"),
  },
  { tag: [t.number, t.integer, t.float], color: syntax("number") },
  {
    tag: [
      t.bool,
      t.null,
      t.atom,
      t.constant(t.name),
      t.standard(t.name),
      t.escape,
      t.color,
    ],
    color: syntax("constant"),
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.macroName,
      t.labelName,
    ],
    color: syntax("function"),
  },
  {
    tag: [
      t.typeName,
      t.className,
      t.namespace,
      t.self,
      t.annotation,
      t.modifier,
    ],
    color: syntax("type"),
  },
  {
    tag: [t.variableName, t.definition(t.name), t.name],
    color: syntax("variable"),
  },
  {
    tag: [t.propertyName, t.definition(t.propertyName)],
    color: syntax("property"),
  },
  { tag: [t.tagName, t.deleted], color: syntax("tag") },
  { tag: [t.attributeName], color: syntax("attribute") },
  {
    tag: [
      t.punctuation,
      t.separator,
      t.bracket,
      t.angleBracket,
      t.squareBracket,
      t.paren,
      t.brace,
    ],
    color: syntax("punctuation"),
  },
  { tag: t.link, color: syntax("function") },
  { tag: t.url, color: syntax("comment"), textDecoration: "underline" },
  { tag: t.invalid, color: "var(--color-text-error)" },

  // Prose (Markdown). The text itself is secondary (`markdownTheme`), so
  // what carries structure stands out from it: headings in primary text,
  // stepped down in size by level (weight 500 at most, per the design
  // guide); bold in primary; the syntax marks (`#`, `*`, `>`, `-`, fences)
  // dimmed to punctuation so they recede; code (inline, and a fence's text
  // when its language isn't known) in the code text colour, as Astryx
  // `CodeBlock` shows plain code.
  { tag: t.heading1, color: PRIMARY, fontWeight: "500", fontSize: "1.3em" },
  { tag: t.heading2, color: PRIMARY, fontWeight: "500", fontSize: "1.15em" },
  { tag: t.heading3, color: PRIMARY, fontWeight: "500", fontSize: "1.05em" },
  { tag: t.heading, color: PRIMARY, fontWeight: "500" },
  { tag: t.strong, color: PRIMARY, fontWeight: "500" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.quote, fontStyle: "italic" },
  { tag: t.monospace, color: syntax("variable") },
  {
    tag: [t.processingInstruction, t.contentSeparator],
    color: syntax("punctuation"),
  },
]);

const chrome = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: syntax("variable"),
      backgroundColor: syntax("background"),
    },
    ".cm-scroller": { overflow: "auto" },
    ".cm-content, .cm-gutters": {
      fontFamily: "var(--al-font-mono)",
      fontSize: "var(--al-code-size)",
    },
    ".cm-content": { caretColor: "var(--color-text-primary)" },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-text-primary)",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "var(--color-accent-muted)" },
    ".cm-gutters": {
      backgroundColor: syntax("background"),
      color: "var(--color-text-disabled)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "var(--color-overlay-hover)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--color-text-secondary)",
    },
    ".cm-selectionMatch": { backgroundColor: "var(--color-overlay-pressed)" },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "var(--color-overlay-pressed)",
      outline: "var(--border-width) solid var(--color-border-emphasized)",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--color-overlay-pressed)",
      outline: "var(--border-width) solid var(--color-border-emphasized)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "var(--color-accent-muted)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--color-text-secondary)",
    },
    ".cm-panels": {
      backgroundColor: "var(--color-background-card)",
      color: "var(--color-text-primary)",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "var(--border-width) solid var(--color-border)",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "var(--border-width) solid var(--color-border)",
    },
    ".cm-tooltip": {
      border: "var(--border-width) solid var(--color-border)",
      borderRadius: "var(--radius-element)",
      backgroundColor: "var(--color-background-popover)",
      color: "var(--color-text-primary)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--color-overlay-pressed)",
      color: "var(--color-text-primary)",
    },
  },
  { dark: true },
);

/** The editor's look: the theme's code background and syntax colours. */
export const codeTheme: Extension = [chrome, syntaxHighlighting(highlight)];

// A fenced code block's lines, from its opening fence to its closing one,
// get a raised background — the source's version of the framed block the
// chat and Preview draw.
const fenceLine = Decoration.line({ class: "cm-md-fence" });

function fencedLines(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  let next = 0; // first position not yet decorated, keeps adds in order
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "FencedCode") return;
        const start = Math.max(node.from, from, next);
        const end = Math.min(node.to, to);
        for (let pos = start; pos <= end; ) {
          const line = doc.lineAt(pos);
          if (line.from >= next) builder.add(line.from, line.from, fenceLine);
          next = line.to + 1;
          pos = line.to + 1;
        }
        return false;
      },
    });
  }
  return builder.finish();
}

const fencedCode = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = fencedLines(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = fencedLines(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Added for Markdown files: prose in secondary text, so headings and bold
 * (primary, in `highlight`) read as the hierarchy; fenced code on a raised
 * background, highlighted in its own language (`@codemirror/language-data`,
 * wired in the editor) with the same colours as every other code surface. */
export const markdownTheme: Extension = [
  EditorView.theme({
    ".cm-content": { color: "var(--color-text-secondary)" },
    ".cm-md-fence": { backgroundColor: "var(--color-background-card)" },
  }),
  fencedCode,
];
