import {
  type Extension,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutter,
  WidgetType,
} from "@codemirror/view";
import { Plus } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The CodeMirror half of review comments (`reviewComments.ts`): a gutter
// whose `+` shows on a hovered line — click it for that line, drag down or
// up it for a range — and block widgets under commented lines that React
// (`FileEditorTab`) portals each comment thread into, so the threads are
// ordinary Astryx components with the app's context. Commented lines get
// a highlight.

// One thread under the editor's lines: a saved comment, or the box for a
// new one (`id` "new").
export interface ThreadSpec {
  id: string;
  startLine: number;
  endLine: number;
  // Outdated comments sit at their old lines without highlighting them.
  isHighlighted: boolean;
}

// Where React mounts each thread — `mount` when a widget's DOM is made,
// `unmount` when CodeMirror drops it.
export interface ThreadHosts {
  mount: (id: string, el: HTMLElement) => void;
  unmount: (id: string, el: HTMLElement) => void;
}

const setThreads = StateEffect.define<ThreadSpec[]>();
const setDrag = StateEffect.define<{ from: number; to: number } | null>();

class ThreadWidget extends WidgetType {
  private observer: ResizeObserver | null = null;

  constructor(
    readonly id: string,
    readonly hosts: ThreadHosts,
  ) {
    super();
  }

  eq(other: ThreadWidget) {
    return other.id === this.id;
  }

  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-review-thread";
    // React fills it in after CodeMirror has measured it, so tell it to
    // measure again whenever the thread's height changes.
    this.observer = new ResizeObserver(() => view.requestMeasure());
    this.observer.observe(el);
    this.hosts.mount(this.id, el);
    return el;
  }

  destroy(el: HTMLElement) {
    this.observer?.disconnect();
    this.hosts.unmount(this.id, el);
  }

  // Typing and clicking in a thread are the thread's, not the editor's.
  ignoreEvent() {
    return true;
  }
}

const commentedLine = Decoration.line({ class: "cm-review-line" });
const draggedLine = Decoration.line({ class: "cm-review-drag" });

type Range = ReturnType<Decoration["range"]>;

// `deco` on the start of every line in `ranges` (1-based, inclusive).
function lineRanges(
  doc: Text,
  ranges: { from: number; to: number }[],
  deco: Decoration,
): Range[] {
  const starts = new Set<number>();
  for (const { from, to } of ranges) {
    for (let n = Math.max(1, from); n <= Math.min(to, doc.lines); n++) {
      starts.add(doc.line(n).from);
    }
  }
  return [...starts].map((pos) => deco.range(pos));
}

const plusMarkup = renderToStaticMarkup(createElement(Plus, { size: 12 }));

class PlusMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-review-plus";
    el.innerHTML = plusMarkup;
    return el;
  }
}
const plusMarker = new PlusMarker();

function lineAt(view: EditorView, clientY: number): number {
  const block = view.lineBlockAtHeight(clientY - view.documentTop);
  return view.state.doc.lineAt(block.from).number;
}

const theme = EditorView.theme({
  ".cm-review-gutter .cm-gutterElement": {
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingInline: "var(--spacing-0-5)",
  },
  ".cm-review-plus": {
    display: "flex",
    opacity: 0,
    color: "var(--color-text-accent)",
  },
  ".cm-review-gutter .cm-gutterElement:hover .cm-review-plus": { opacity: 1 },
  ".cm-review-line": { backgroundColor: "var(--color-accent-muted)" },
  ".cm-review-drag": { backgroundColor: "var(--color-accent-muted)" },
  ".cm-review-thread": {
    // The editor's mono font and pre whitespace stop at the thread.
    fontFamily: "var(--al-font-sans)",
    fontSize: "var(--al-font-size-base)",
    whiteSpace: "normal",
  },
});

export function reviewExtension({
  hosts,
  onPick,
}: {
  hosts: ThreadHosts;
  // Lines `from..=to` (1-based) picked in the gutter.
  onPick: (from: number, to: number) => void;
}): Extension {
  const threads = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      let next = deco.map(tr.changes);
      for (const e of tr.effects) {
        if (!e.is(setThreads)) continue;
        const doc = tr.state.doc;
        const widgets = e.value.map((t) =>
          Decoration.widget({
            widget: new ThreadWidget(t.id, hosts),
            block: true,
            side: 1,
          }).range(doc.line(Math.min(Math.max(1, t.endLine), doc.lines)).to),
        );
        const lines = lineRanges(
          doc,
          e.value
            .filter((t) => t.isHighlighted)
            .map((t) => ({ from: t.startLine, to: t.endLine })),
          commentedLine,
        );
        next = Decoration.set([...widgets, ...lines], true);
      }
      return next;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const drag = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      for (const e of tr.effects) {
        if (!e.is(setDrag)) continue;
        return e.value
          ? Decoration.set(
              lineRanges(
                tr.state.doc,
                [
                  {
                    from: Math.min(e.value.from, e.value.to),
                    to: Math.max(e.value.from, e.value.to),
                  },
                ],
                draggedLine,
              ),
              true,
            )
          : Decoration.none;
      }
      return deco.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const plusGutter = gutter({
    class: "cm-review-gutter",
    lineMarker: () => plusMarker,
    initialSpacer: () => plusMarker,
    domEventHandlers: {
      mousedown(view, line, event) {
        const e = event as MouseEvent;
        if (e.button !== 0) return false;
        e.preventDefault();
        const from = view.state.doc.lineAt(line.from).number;
        let to = from;
        view.dispatch({ effects: setDrag.of({ from, to }) });
        const move = (m: MouseEvent) => {
          const next = lineAt(view, m.clientY);
          if (next === to) return;
          to = next;
          view.dispatch({ effects: setDrag.of({ from, to }) });
        };
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
          view.dispatch({ effects: setDrag.of(null) });
          onPick(Math.min(from, to), Math.max(from, to));
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        return true;
      },
    },
  });

  return [plusGutter, threads, drag, theme];
}

// Puts `threads` under the editor's lines, replacing the ones there.
export function showThreads(view: EditorView, threads: ThreadSpec[]) {
  view.dispatch({ effects: setThreads.of(threads) });
}
