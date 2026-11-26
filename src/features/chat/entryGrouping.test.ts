import { describe, expect, it } from "vitest";
import {
  GROUP_MIN,
  groupActivity,
  groupEntries,
  hiddenSteps,
  toRows,
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
  it("makes a lone step a group of one", () => {
    expect(groupActivity([user(), tool(), reply()])).toEqual([
      { kind: "single", index: 0 },
      { kind: "activitygroup", indices: [1] },
      { kind: "single", index: 2 },
    ]);
  });

  it("groups every run of consecutive steps, short or long", () => {
    expect(
      groupActivity([thinking(), tool(), reply(), tool(), tool(), tool()]),
    ).toEqual([
      { kind: "activitygroup", indices: [0, 1] },
      { kind: "single", index: 2 },
      { kind: "activitygroup", indices: [3, 4, 5] },
    ]);
  });

  it("splits runs at a sub-agent start, which is never grouped", () => {
    expect(
      groupActivity([tool(), tool("spawn_sub_agent"), tool(), tool()]),
    ).toEqual([
      { kind: "activitygroup", indices: [0] },
      { kind: "single", index: 1 },
      { kind: "activitygroup", indices: [2, 3] },
    ]);
  });

  it("only groups the given indices", () => {
    expect(groupActivity([tool(), tool(), tool()], [1, 2])).toEqual([
      { kind: "activitygroup", indices: [1, 2] },
    ]);
  });

  it("keeps a growing run's item, so its group stays the same one", () => {
    const entries: PanelEntry[] = [user()];
    for (let n = 1; n <= 4; n++) {
      entries.push(tool(`t${n}`));
      const items = groupActivity(entries);
      expect(items[1]).toMatchObject({ kind: "activitygroup" });
      expect(items[1]).toHaveProperty("indices.0", 1);
    }
  });
});

describe("hiddenSteps", () => {
  it("hides nothing below GROUP_MIN steps", () => {
    expect(GROUP_MIN).toBe(3);
    expect(hiddenSteps(1)).toBe(0);
    expect(hiddenSteps(2)).toBe(0);
  });

  it("hides all but the latest from GROUP_MIN steps on", () => {
    expect(hiddenSteps(3)).toBe(2);
    expect(hiddenSteps(7)).toBe(6);
  });
});

describe("toRows", () => {
  it("keeps the assistant row's key while its turn grows and folds", () => {
    const entries: PanelEntry[] = [user()];
    const keys: string[] = [];
    for (const entry of [tool(), tool(), tool(), reply()]) {
      entries.push(entry);
      keys.push(toRows(entries, groupEntries(entries, true, true))[1].key);
    }
    // The finished turn: its work is now a `work` fold, not an activity run.
    const done = groupEntries(entries, false, true);
    expect(done[1]).toMatchObject({ kind: "work" });
    keys.push(toRows(entries, done)[1].key);
    expect(new Set(keys)).toEqual(new Set(["1"]));
  });

  it("starts a new assistant row after each user message", () => {
    const entries = [user(), tool(), reply(), user(), tool(), reply()];
    const rows = toRows(entries, groupEntries(entries, false, true));
    expect(rows.map((r) => [r.kind, r.key])).toEqual([
      ["user", "0"],
      ["assistant", "1"],
      ["user", "3"],
      ["assistant", "4"],
    ]);
  });
});
