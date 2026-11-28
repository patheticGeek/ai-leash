import { describe, expect, it } from "vitest";
import {
  fuzzyFilter,
  fuzzyScore,
  MATCH_EXACT,
  MATCH_PREFIX,
  MATCH_SUBSEQUENCE,
  MATCH_SUBSTRING,
  MATCH_WORD_START,
  normalize,
} from "./fuzzyMatch";

describe("normalize", () => {
  it("lowercases and folds separators into one space", () => {
    expect(normalize("  AI-Leash__src/app.tsx ")).toBe("ai leash src app tsx");
  });
});

describe("fuzzyScore", () => {
  const chat = ["Fix the sidebar search", "ai-leash", "Chats"];

  it("matches a chat in project ai-leash for `ai leash`", () => {
    expect(fuzzyScore("ai leash", chat)).not.toBeNull();
    expect(fuzzyScore("AI_LEASH", chat)).not.toBeNull();
  });

  it("matches `alsh` against ai-leash as a subsequence", () => {
    expect(fuzzyScore("alsh", ["ai-leash"])).toBe(MATCH_SUBSEQUENCE);
  });

  it("excludes the row when any word matches nothing", () => {
    expect(fuzzyScore("sidebar zzz", chat)).toBeNull();
    expect(fuzzyScore("qx", chat)).toBeNull();
  });

  it("every word may match a different field", () => {
    expect(fuzzyScore("search leash chats", chat)).toBe(MATCH_WORD_START);
  });

  it("finds a task by its number, with or without #", () => {
    const task = ["#12 · Ship it", "ai-leash", "#12", "Chats"];
    expect(fuzzyScore("12", task)).not.toBeNull();
    expect(fuzzyScore("#12", task)).not.toBeNull();
  });

  it("scores exact, prefix, word start, substring, subsequence", () => {
    expect(fuzzyScore("ai leash", ["ai-leash"])).toBe(MATCH_EXACT);
    expect(fuzzyScore("fix the", chat)).toBe(MATCH_PREFIX);
    expect(fuzzyScore("side sea", chat)).toBe(MATCH_WORD_START);
    expect(fuzzyScore("bar", chat)).toBe(MATCH_SUBSTRING);
    expect(fuzzyScore("sdbr", chat)).toBe(MATCH_SUBSEQUENCE);
  });

  it("matches everything on an empty query", () => {
    expect(fuzzyScore("  ", chat)).toBe(0);
  });
});

describe("fuzzyFilter", () => {
  it("ranks exact/prefix, then word start, then subsequence", () => {
    const rows = [
      "a lush sheet", // no word holds l-e-a-s-h in order
      "Leash notes",
      "leash",
      "the leash",
      "unrelated",
    ];
    expect(fuzzyFilter("leash", rows, (r) => [r])).toEqual([
      "leash", // exact
      "Leash notes", // prefix
      "the leash", // word start
    ]);
    expect(
      fuzzyFilter("lsh", ["the leash", "lsh tool", "lash"], (r) => [r]),
    ).toEqual(["lsh tool", "the leash", "lash"]);
  });

  it("keeps the input order among equal scores", () => {
    const rows = ["b leash", "a leash", "c leash"];
    expect(fuzzyFilter("lea", rows, (r) => [r])).toEqual(rows);
  });
});
