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

export type RenderItem =
  | { kind: "single"; index: number }
  | { kind: "activitygroup"; indices: number[] };

// Groups runs of consecutive thinking/tool entries so the transcript can
// show only the latest activity by default (see `ActivityGroup`) instead of
// every individual step — a multi-step agent turn can otherwise bury the
// actual conversation.
export function groupEntries(entries: PanelEntry[]): RenderItem[] {
  const items: RenderItem[] = [];
  for (let i = 0; i < entries.length; i++) {
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
