// `@path` file mentions (#24) — the frontend half of `src-tauri/src/mentions.rs`.
// The backend reads every `@path` in a sent message and stores the message
// with a trailer naming them (`MENTIONS_OPEN`, plus the attached contents for
// our own agent loop); the transcript shows the text before it and the paths
// as chips.

// Must match `mentions::MENTIONS_OPEN` in Rust.
const MENTIONS_OPEN = "\n\n<ai-leash-mentions paths='";

// A stored user message split into what was typed and the mentioned paths.
export function splitMentions(content: string): {
  text: string;
  mentions: string[];
} {
  const at = content.indexOf(MENTIONS_OPEN);
  if (at < 0) return { text: content, mentions: [] };
  const rest = content.slice(at + MENTIONS_OPEN.length);
  const end = rest.indexOf("'>");
  let mentions: string[] = [];
  try {
    const parsed: unknown = JSON.parse(rest.slice(0, end));
    if (Array.isArray(parsed)) mentions = parsed.map(String);
  } catch {
    // A malformed trailer still gets hidden; just no chips.
  }
  return { text: content.slice(0, at), mentions };
}

// How a picked path is written into the message: `@path`, quoted when it
// has whitespace (the backend's tokenizer reads `@"…"` as one path).
export function mentionToken(path: string): string {
  return /\s/.test(path) ? `@"${path}"` : `@${path}`;
}

// The `@path` tokens in `text` (same rules as the Rust tokenizer): `@` at
// the start or after whitespace, then a `"quoted path"` or a run of
// non-space characters. `start`/`end` are the token's span in `text`.
export function mentionSpans(
  text: string,
): { path: string; start: number; end: number }[] {
  const out: { path: string; start: number; end: number }[] = [];
  const re = /(^|\s)@(?:"([^"]+)"|(\S+))/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1].length;
    out.push({ path: m[2] ?? m[3], start, end: m.index + m[0].length });
  }
  return out;
}

// Paths picked in a composer this session, from the `@` menu or the file
// tree (folders end in "/"): Backspace takes one out whole, and a just-sent
// message shows its chips before the stored copy, with the backend's own
// list, is read back.
const picked = new Set<string>();

export function rememberMention(path: string) {
  picked.add(path);
}

export function isPickedMention(path: string): boolean {
  return picked.has(path);
}

export function pickedMentionsIn(text: string): string[] {
  const seen = new Set<string>();
  for (const { path } of mentionSpans(text)) {
    const clean = path.replace(/[,.;:!?)'"]+$/, "");
    // `@path:12` / `@path:12-18` (a review comment's lines) is the file.
    const unranged = clean.replace(/:\d+(-\d+)?$/, "");
    const hit = [path, clean, unranged].find((p) => picked.has(p));
    if (hit) seen.add(hit);
  }
  return [...seen];
}

// "Mention in chat" from the file tree: the composer that's mounted (the
// latest to subscribe) inserts the path.
type Listener = (path: string) => void;
const listeners: Listener[] = [];

export function onMentionRequest(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function requestMention(path: string) {
  listeners[listeners.length - 1]?.(path);
}

// What a file-tree row puts on a drag, read by the composer on drop.
export const MENTION_DRAG_TYPE = "application/x-ai-leash-path";

// One `@path` / `@path:12` / `@path:12-18` token in a sent message that
// names one of its attached `mentions`; `startLine`/`endLine` are its
// lines, when it had them.
export interface InlineMention {
  path: string;
  startLine?: number;
  endLine?: number;
}

function linesOf(start?: string, end?: string) {
  if (!start) return {};
  const startLine = Number(start);
  return { startLine, endLine: end ? Number(end) : startLine };
}

// `text` cut into plain runs and the mention tokens in it that name one of
// `mentions` (the paths the backend attached — see `splitMentions`). A
// token's trailing punctuation stays text; `@` tokens naming anything else
// stay text too.
export function splitInlineMentions(
  text: string,
  mentions: readonly string[],
): (string | InlineMention)[] {
  const known = new Set(mentions);
  const out: (string | InlineMention)[] = [];
  const re = /(^|\s)@(?:"([^"]+)"(\S*)|(\S+))/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const at = m.index + m[1].length;
    let mention: InlineMention | null = null;
    let length = 0;
    if (m[2] !== undefined) {
      const lines = /^:(\d+)(?:-(\d+))?/.exec(m[3]);
      mention = { path: m[2], ...linesOf(lines?.[1], lines?.[2]) };
      length = 1 + m[2].length + 2 + (lines?.[0].length ?? 0);
    } else {
      const token = m[4].replace(/[,.;:!?)'"]+$/, "");
      const parts = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(token);
      if (parts) {
        mention = { path: parts[1], ...linesOf(parts[2], parts[3]) };
        length = 1 + token.length;
      }
    }
    if (!mention || !known.has(mention.path)) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push(mention);
    last = at + length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
