import { mentionToken } from "@/lib/mentions";
// Review comments: draft notes left on a file's lines, like a GitHub PR
// review, sent to the agent together as one chat message ("Send review").
// The store side (per-chat, persisted) is `store/reviewSlice.ts`; the
// editor side (gutter `+`, inline threads) is `reviewEditor.ts` +
// `FileEditorTab`; the composer's drawer is `ReviewDrawer.tsx`.

export interface ReviewComment {
  id: string;
  // Absolute path, the same key `openFiles` / file tabs use.
  path: string;
  // 1-based, inclusive — the lines as they were when the comment was left.
  startLine: number;
  endLine: number;
  // Those lines' text when the comment was left, joined with "\n". What a
  // comment re-anchors by once the file changes under it.
  snippet: string;
  body: string;
  createdAt: number;
}

// Where a comment sits in a file's current text.
export interface CommentAnchor {
  startLine: number;
  endLine: number;
  // Its snippet is nowhere in the file any more: shown (and sent) at its
  // original lines, clamped to the file, marked outdated — like GitHub.
  outdated: boolean;
}

function sameLines(lines: string[], at: number, want: string[]): boolean {
  for (let i = 0; i < want.length; i++) {
    if (lines[at + i]?.trimEnd() !== want[i].trimEnd()) return false;
  }
  return true;
}

// Re-anchors `comment` in `content`: its own lines if they still hold the
// snippet, else the occurrence of the snippet nearest to where it was, else
// outdated at its original lines.
export function anchorComment(
  comment: Pick<ReviewComment, "startLine" | "endLine" | "snippet">,
  content: string,
): CommentAnchor {
  const lines = content.split("\n");
  const want = comment.snippet.split("\n");
  const span = comment.endLine - comment.startLine;
  const original = comment.startLine - 1;
  if (sameLines(lines, original, want)) {
    return {
      startLine: comment.startLine,
      endLine: comment.endLine,
      outdated: false,
    };
  }
  // A whitespace-only snippet would match anywhere; don't move it.
  if (comment.snippet.trim()) {
    let best = -1;
    for (let i = 0; i + want.length <= lines.length; i++) {
      if (
        sameLines(lines, i, want) &&
        (best < 0 || Math.abs(i - original) < Math.abs(best - original))
      ) {
        best = i;
      }
    }
    if (best >= 0) {
      return {
        startLine: best + 1,
        endLine: best + 1 + span,
        outdated: false,
      };
    }
  }
  const last = Math.max(1, lines.length);
  const startLine = Math.min(comment.startLine, last);
  return {
    startLine,
    endLine: Math.min(startLine + span, last),
    outdated: true,
  };
}

// The text of lines `start..=end` (1-based) of `content`.
export function linesOf(content: string, start: number, end: number): string {
  return content
    .split("\n")
    .slice(start - 1, end)
    .join("\n");
}

export function lineLabel(start: number, end: number): string {
  return start === end ? `line ${start}` : `lines ${start}–${end}`;
}

// `path` relative to the checkout, for display and for the agent (which
// works in that checkout).
export function relativePath(path: string, checkoutPath: string | null) {
  if (checkoutPath) {
    const root = checkoutPath.endsWith("/") ? checkoutPath : `${checkoutPath}/`;
    if (path.startsWith(root)) return path.slice(root.length);
  }
  return path;
}

// Whether `relPath` is inside the checkout (`relativePath` left it
// relative), so it can be attached as an `@` mention.
function isInCheckout(relPath: string): boolean {
  return !/^([A-Za-z]:)?[\\/]/.test(relPath);
}

// The commented files a review mentions (attaches): those inside the
// checkout, by path relative to it, once each.
export function reviewMentions(comments: AnchoredComment[]): string[] {
  return [...new Set(comments.map((c) => c.relPath).filter(isInCheckout))];
}

// A fence longer than any backtick run in `code`, so a snippet holding
// ``` can't close it early.
function fenceFor(code: string): string {
  const longest = Math.max(
    2,
    ...(code.match(/`+/g) ?? []).map((run) => run.length),
  );
  return "`".repeat(longest + 1);
}

function quoted(code: string): string {
  const fence = fenceFor(code);
  return `${fence}\n${code}\n${fence}`;
}

export interface AnchoredComment {
  comment: ReviewComment;
  anchor: CommentAnchor;
  // The code those lines hold now — or, when outdated, what they held.
  code: string;
  relPath: string;
}

// The one message "Send review" posts: each comment as `@path:lines`
// and its text, grouped by file in the order they were left, then the
// overall note. The `@path:lines` token attaches the whole file once (#24,
// `src-tauri/src/mentions.rs` drops the line range), so the code itself
// isn't quoted — except for an outdated comment (its lines say something
// else now) and a file outside the checkout (it can't be attached), which
// quote the code they're about. Plain markdown, so it reads the same to a
// native or an ACP agent.
export function formatReview(comments: AnchoredComment[], note: string) {
  const n = comments.length;
  const parts = [
    `Code review: ${n} comment${n === 1 ? "" : "s"}. Please address each one.${
      reviewMentions(comments).length > 0
        ? " The files are attached; line numbers are the file's current lines."
        : ""
    }`,
  ];
  const byFile = new Map<string, AnchoredComment[]>();
  for (const c of comments) {
    byFile.set(c.relPath, [...(byFile.get(c.relPath) ?? []), c]);
  }
  let i = 0;
  for (const [relPath, fileComments] of byFile) {
    const attached = isInCheckout(relPath);
    for (const { comment, anchor, code } of fileComments) {
      i++;
      const { startLine: start, endLine: end } = anchor;
      const where = attached
        ? `${mentionToken(relPath)}:${start === end ? start : `${start}-${end}`}`
        : `\`${relPath}\` ${lineLabel(start, end)}`;
      const lines = [
        `### ${i}. ${where}${anchor.outdated ? " (outdated: these lines have changed since; the quote is what they said)" : ""}`,
      ];
      if (anchor.outdated || !attached) lines.push(quoted(code));
      lines.push(comment.body.trim());
      parts.push(lines.join("\n"));
    }
  }
  if (note.trim()) parts.push(`### Overall\n${note.trim()}`);
  return parts.join("\n\n");
}
