import { describe, expect, it } from "vitest";
import {
  firstIndex,
  groupActivity,
  groupEntries,
  toDisplayItems,
} from "./entryGrouping";
import type { PanelEntry } from "./hooks/useChatStream";

const user = (content = "hi"): PanelEntry => ({
  kind: "text",
  role: "user",
  content,
  time: 0,
});
const reply = (content = "done"): PanelEntry => ({
  kind: "text",
  role: "assistant",
  content,
  time: 0,
});
const tool = (name = "read_file"): PanelEntry => ({
  kind: "tool",
  callId: name,
  name,
  args: {},
});
const thinking = (): PanelEntry => ({
  kind: "thinking",
  content: "hmm",
  done: true,
});

describe("groupActivity", () => {
  it("leaves a lone tool call as a single row", () => {
    expect(groupActivity([user(), tool(), reply()])).toEqual([
      { kind: "single", index: 0 },
      { kind: "single", index: 1 },
      { kind: "single", index: 2 },
    ]);
  });

  it("leaves two consecutive steps as two single rows", () => {
    expect(groupActivity([user(), thinking(), tool(), reply()])).toEqual([
      { kind: "single", index: 0 },
      { kind: "single", index: 1 },
      { kind: "single", index: 2 },
      { kind: "single", index: 3 },
    ]);
  });

  it("groups a run of three or more steps", () => {
    expect(
      groupActivity([user(), thinking(), tool(), tool(), tool(), reply()]),
    ).toEqual([
      { kind: "single", index: 0 },
      { kind: "activitygroup", indices: [1, 2, 3, 4] },
      { kind: "single", index: 5 },
    ]);
  });

  it("groups a run of three at the end of the entries", () => {
    expect(groupActivity([user(), tool(), tool(), tool()])).toEqual([
      { kind: "single", index: 0 },
      { kind: "activitygroup", indices: [1, 2, 3] },
    ]);
  });

  it("counts each run separately around text", () => {
    expect(
      groupActivity([tool(), tool(), reply(), tool(), tool(), tool()]),
    ).toEqual([
      { kind: "single", index: 0 },
      { kind: "single", index: 1 },
      { kind: "single", index: 2 },
      { kind: "activitygroup", indices: [3, 4, 5] },
    ]);
  });

  it("splits runs at a sub-agent entry, which is never grouped", () => {
    expect(
      groupActivity([
        tool(),
        tool(),
        tool("spawn_sub_agent"),
        tool(),
        tool(),
        tool(),
      ]),
    ).toEqual([
      { kind: "single", index: 0 },
      { kind: "single", index: 1 },
      { kind: "single", index: 2 },
      { kind: "activitygroup", indices: [3, 4, 5] },
    ]);
  });

  it("only groups the given indices", () => {
    const entries = [tool(), tool(), tool(), tool()];
    expect(groupActivity(entries, [1, 2])).toEqual([
      { kind: "single", index: 1 },
      { kind: "single", index: 2 },
    ]);
    expect(groupActivity(entries, [0, 1, 2])).toEqual([
      { kind: "activitygroup", indices: [0, 1, 2] },
    ]);
  });
});

describe("groupEntries", () => {
  it("still folds a finished turn's work, however short", () => {
    expect(groupEntries([user(), tool(), reply()], false, true)).toEqual([
      { kind: "single", index: 0 },
      { kind: "work", indices: [1], replyIndex: 2 },
      { kind: "single", index: 2 },
    ]);
  });

  it("leaves the in-flight turn's short run as single rows", () => {
    expect(groupEntries([user(), tool(), tool()], true, true)).toEqual([
      { kind: "single", index: 0 },
      { kind: "single", index: 1 },
      { kind: "single", index: 2 },
    ]);
  });
});

describe("toDisplayItems", () => {
  it("puts a short run's single steps back together", () => {
    const entries = [user(), thinking(), tool(), reply()];
    expect(toDisplayItems(entries, groupActivity(entries))).toEqual([
      { kind: "single", index: 0 },
      { kind: "steps", indices: [1, 2] },
      { kind: "single", index: 3 },
    ]);
  });

  it("keeps a sub-agent start a single of its own", () => {
    const entries = [tool(), tool("spawn_sub_agent"), tool()];
    expect(toDisplayItems(entries, groupActivity(entries))).toEqual([
      { kind: "steps", indices: [0] },
      { kind: "single", index: 1 },
      { kind: "steps", indices: [2] },
    ]);
  });
});

describe("firstIndex", () => {
  // The assistant row and the run inside it are keyed on it, so neither
  // remounts as a streamed turn grows.
  it("stays put while a turn's opening run grows into a group", () => {
    const entries: PanelEntry[] = [user()];
    const starts: number[] = [];
    const runStarts: number[] = [];
    for (let n = 0; n < 4; n++) {
      entries.push(tool(`t${n}`));
      const items = groupEntries(entries, true, true);
      starts.push(firstIndex(items[1]));
      const display = toDisplayItems(entries, items);
      runStarts.push(firstIndex(display[1]));
    }
    expect(starts).toEqual([1, 1, 1, 1]);
    expect(runStarts).toEqual([1, 1, 1, 1]);
  });

  it("stays put when the finished turn folds into work", () => {
    const entries = [user(), tool(), tool(), tool(), reply()];
    const running = groupEntries(entries, true, true);
    const done = groupEntries(entries, false, true);
    expect(running[1].kind).toBe("activitygroup");
    expect(done[1].kind).toBe("work");
    expect(firstIndex(done[1])).toBe(firstIndex(running[1]));
  });
});
