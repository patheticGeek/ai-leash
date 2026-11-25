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
  // `replyIndex` is the reply text that closes the folded work, where
  // `turnDurations` keys the turn's time; null for work a sub-agent result
  // cut short before any reply (see `groupEntries`).
  | { kind: "work"; indices: number[]; replyIndex: number | null };

// The tool entries that stand for a sub-agent: the `spawn_sub_agent` call
// that starts one (or several) and the `sub_agent_result` entry its finished
// result arrives as in the parent (`chat::record_sub_agent_result`), for the
// built-in agent and external agents alike. An external agent reports our
// MCP tool under its own name for it (`mcp__ai-leash__spawn_sub_agent`,
// `spawn_sub_agent (MCP)`), so the name only has to contain the tool's name
// as a whole word; a live `spawn_sub_agent` also carries the `subtasks` it
// started.
const SUB_AGENT_TOOL =
  /(^|[^a-z0-9])(spawn_sub_agent|sub_agent_result)($|[^a-z0-9_])/i;
const SUB_AGENT_RESULT = /(^|[^a-z0-9])sub_agent_result($|[^a-z0-9_])/i;

export function isSubAgentEntry(entry: PanelEntry): boolean {
  if (entry.kind !== "tool") return false;
  if (entry.subtasks && entry.subtasks.length > 0) return true;
  return SUB_AGENT_TOOL.test(entry.name);
}

// A sub-agent's finished result (`chat::record_sub_agent_result`): rendered
// as its own block (`SubAgentResult`), never inside a group or a fold.
export function isSubAgentResult(entry: PanelEntry): boolean {
  return entry.kind === "tool" && SUB_AGENT_RESULT.test(entry.name);
}

// Groups runs of consecutive thinking/tool entries so the transcript can
// show only the latest activity by default (see `ActivityGroup`) instead of
// every individual step — a multi-step agent turn can otherwise bury the
// actual conversation. Sub-agent entries (`isSubAgentEntry`) are never
// grouped: each is its own `single` item and ends the run before it, so a
// sub-agent's start and result always show as rows of their own (a start
// can still sit inside a finished turn's `work` fold; a result never does).
// `indices` restricts grouping to those entries (used for the inside of a
// collapsed `work` item); defaults to all of them.
export function groupActivity(
  entries: PanelEntry[],
  indices: number[] = entries.map((_, i) => i),
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const i of indices) {
    const entry = entries[i];
    const isActivity = entry.kind === "thinking" || entry.kind === "tool";
    if (isActivity && !isSubAgentEntry(entry)) {
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
// where the agent's summary/result lives, on show. The turn still in flight
// (`sending`) is left alone so its progress stays visible, as is a turn
// with no tool/thinking activity or one that didn't end on assistant text
// (cancelled, failed mid-tool). With `collapse` off (the "Collapse finished
// turns" preference) this is just `groupActivity`.
//
// A sub-agent result is a boundary, like a user message or a note: it is a
// `single` item of its own and never inside a fold, and the stretch before
// it is a segment of its own. A segment that ends on reply text folds as
// above (the result usually starts the agent's next turn). One the result
// cut into mid-work (no reply yet) folds too, with `replyIndex` null, once
// the turn is no longer running — i.e. unless it is part of the in-flight
// turn (no user message or note after it while `sending`).
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
  const isBoundary = (e: PanelEntry) => isUserText(e) || isSubAgentResult(e);
  const isReplyText = (e: PanelEntry) =>
    e.kind === "text" && e.role === "assistant";
  let lastUser = -1;
  entries.forEach((e, i) => {
    if (isUserText(e)) lastUser = i;
  });
  let start = 0;
  while (start < entries.length) {
    if (isBoundary(entries[start])) {
      items.push({ kind: "single", index: start });
      start++;
      continue;
    }
    let end = start;
    while (end < entries.length && !isBoundary(entries[end])) end++;
    let replyStart = end;
    while (replyStart > start && isReplyText(entries[replyStart - 1])) {
      replyStart--;
    }
    const turn = Array.from({ length: end - start }, (_, k) => start + k);
    const work = turn.slice(0, replyStart - start);
    const hasWork = work.some(
      (i) => entries[i].kind === "thinking" || entries[i].kind === "tool",
    );
    const hasReply = replyStart < end;
    const cutByResult = end < entries.length;
    const inFlight = sending && (end === entries.length || start > lastUser);
    const fold = hasReply
      ? hasWork && !(sending && end === entries.length)
      : hasWork && cutByResult && !inFlight;
    if (fold) {
      items.push({
        kind: "work",
        indices: work,
        replyIndex: hasReply ? end - 1 : null,
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
