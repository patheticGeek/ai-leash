// The command palette's matcher: forgiving, case-blind and separator-blind.
// `-`, `_`, `/`, `.` and whitespace all count as one separator, so `ai leash`
// finds `ai-leash`. Every query word has to match somewhere in the row's
// fields (title, project, `#task` number, group); within a word the letters
// may be a subsequence (`alsh` finds `ai-leash`). Higher scores rank first.

export const MATCH_EXACT = 5; // the whole query is a whole field
export const MATCH_PREFIX = 4; // a field starts with the whole query
export const MATCH_WORD_START = 3; // every query word starts a word
export const MATCH_SUBSTRING = 2; // every query word is in a word
export const MATCH_SUBSEQUENCE = 1; // some query word only as a subsequence

// `#` too, so `12` and `#12` both find task #12.
const SEPARATORS = /[-_/.#\s]+/g;

// Lower case, each run of separators one space, no space at either end.
export function normalize(text: string): string {
  return text.toLowerCase().replace(SEPARATORS, " ").trim();
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

// How well one query word (already normalized, no spaces) matches the
// fields, or 0 for not at all.
function wordScore(word: string, words: string[], chunks: string[]): number {
  if (words.some((w) => w.startsWith(word))) return MATCH_WORD_START;
  // A chunk is a whitespace-separated piece of a field with its other
  // separators dropped (`ai-leash` → `aileash`), so `aileash` and `leash`
  // still land inside it.
  if (chunks.some((c) => c.includes(word))) return MATCH_SUBSTRING;
  if (chunks.some((c) => isSubsequence(word, c))) return MATCH_SUBSEQUENCE;
  return 0;
}

// The query's score against a row's searchable fields, or `null` when any
// query word matches nothing. An empty query matches everything at 0.
export function fuzzyScore(query: string, fields: string[]): number | null {
  const q = normalize(query);
  if (q === "") return 0;
  const normalized = fields.map(normalize).filter((f) => f !== "");
  if (normalized.includes(q)) return MATCH_EXACT;
  if (normalized.some((f) => f.startsWith(q))) return MATCH_PREFIX;

  const words = normalized.flatMap((f) => f.split(" "));
  const chunks = fields.flatMap((f) =>
    f
      .toLowerCase()
      .split(/\s+/)
      .map((c) => c.replace(SEPARATORS, ""))
      .filter((c) => c !== ""),
  );
  let score: number = MATCH_WORD_START;
  for (const word of q.split(" ")) {
    const s = wordScore(word, words, chunks);
    if (s === 0) return null;
    score = Math.min(score, s);
  }
  return score;
}

// The items the query matches, best first; equal scores keep their order.
export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  fields: (item: T) => string[],
): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: fuzzyScore(query, fields(item)),
    }))
    .filter(
      (r): r is { item: T; index: number; score: number } => r.score !== null,
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
