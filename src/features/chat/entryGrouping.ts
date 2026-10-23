import type { PanelEntry } from "./hooks/useChatStream";

// Whether the assistant text entry at `i` is the last chunk of its reply
// group — a turn's reply can be split into several text entries by tool
// calls interleaved in between (see the backend's `TurnSegment`), and only
// the group's final chunk should show the copy/timestamp/"Worked for"
// footer, not every intermediate one. A group is "closed" once a later user
// text entry shows up (a new turn has definitely started, so this group is
// done regardless of whether the agent is still sending); otherwise this
// chunk trails off the end of `entries` and is still part of whatever's
// actively being sent, so its footer stays hidden until `sending` clears.
// (An earlier version gated on `i < entries.length - 1` instead of whether
// the group was closed, which hid footers on *every* earlier, already-closed
// group too the moment any new turn started sending.)
export function isVisibleFinalChunk(
  entries: PanelEntry[],
  i: number,
  sending: boolean,
): boolean {
  let groupClosed = false;
  for (let j = i + 1; j < entries.length; j++) {
    const e = entries[j];
    if (e.kind === "text") {
      if (e.role === "assistant") return false;
      groupClosed = true;
      break;
    }
  }
  if (!groupClosed && sending) return false;
  return true;
}

export type ActivityItem =
  | { kind: "single"; index: number }
  | { kind: "activitygroup"; indices: number[] };

export type RenderItem =
  | ActivityItem
  | { kind: "work"; indices: number[]; replyIndex: number };

// Groups runs of consecutive thinking/tool entries so the transcript can
// show only the latest activity by default (see `ActivityGroup`) instead of
// every individual step — a multi-step agent turn can otherwise bury the
// actual conversation. `indices` restricts grouping to those entries (used
// for the inside of a collapsed `work` item); defaults to all of them.
export function groupActivity(
  entries: PanelEntry[],
  indices: number[] = entries.map((_, i) => i),
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const i of indices) {
    if (entries[i].kind === "thinking" || entries[i].kind === "tool") {
      const last = items[items.length - 1];
      if (last && last.kind === "activitygroup") {
        last.indices.push(i);
      } else {
        items.push({ kind: "activitygroup", indices: [i] });
      }
    } else {
      items.push({ kind: "single", index: i });
    }
  }
  return items;
}

// Like `groupActivity`, but a finished turn's work — everything between the
// user's message and the trailing run of assistant text that closes the
// reply (thinking, tool calls, intermediate text) — is folded into a single
// `work` item (see `WorkSummary`), leaving only that final text, which is
// where the agent's summary/result lives, on show. `replyIndex` is the
// reply's last text entry, which is where `turnDurations` keys the turn's
// time. The turn still in flight (`sending`) is left alone so its progress
// stays visible, as is a turn with no tool/thinking activity or one that
// didn't end on assistant text (cancelled, failed mid-tool). With
// `collapse` off (the "Collapse finished turns" preference) this is just
// `groupActivity`.
export function groupEntries(
  entries: PanelEntry[],
  sending: boolean,
  collapse: boolean,
): RenderItem[] {
  if (!collapse) return groupActivity(entries);
  const items: RenderItem[] = [];
  // A note arrives between turns, so it ends one like a user message does.
  const isUserText = (e: PanelEntry) =>
    (e.kind === "text" && e.role === "user") || e.kind === "note";
  const isReplyText = (e: PanelEntry) =>
    e.kind === "text" && e.role === "assistant";
  let start = 0;
  while (start < entries.length) {
    if (isUserText(entries[start])) {
      items.push({ kind: "single", index: start });
      start++;
      continue;
    }
    let end = start;
    while (end < entries.length && !isUserText(entries[end])) end++;
    let replyStart = end;
    while (replyStart > start && isReplyText(entries[replyStart - 1])) {
      replyStart--;
    }
    const turn = Array.from({ length: end - start }, (_, k) => start + k);
    const inFlight = sending && end === entries.length;
    const hasWork = turn
      .slice(0, replyStart - start)
      .some(
        (i) => entries[i].kind === "thinking" || entries[i].kind === "tool",
      );
    if (!inFlight && hasWork && replyStart < end) {
      items.push({
        kind: "work",
        indices: turn.slice(0, replyStart - start),
        replyIndex: end - 1,
      });
      items.push(...groupActivity(entries, turn.slice(replyStart - start)));
    } else {
      items.push(...groupActivity(entries, turn));
    }
    start = end;
  }
  return items;
}

// Whether this turn has produced anything visible yet — before that, the
// bottom "Working for…" indicator shows "Waiting" rather than a running
// clock, since there's nothing to measure the *progress* of yet, just the
// wait for the model to respond at all.
export function hasTurnActivity(entries: PanelEntry[]): boolean {
  const last = entries[entries.length - 1];
  return !!(
    last &&
    ((last.kind === "text" && last.role === "assistant") ||
      last.kind === "thinking" ||
      last.kind === "tool")
  );
}
