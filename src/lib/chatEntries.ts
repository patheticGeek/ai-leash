import type { PersistedMessage } from "./tauriApi";

export interface TextEntry {
  kind: "text";
  role: "user" | "assistant";
  content: string;
  time: number;
}

export interface ThinkingEntry {
  kind: "thinking";
  content: string;
  done: boolean;
}

export interface ToolEntry {
  kind: "tool";
  callId: string;
  name: string;
  args: unknown;
  result?: string;
}

export type Entry = TextEntry | ThinkingEntry | ToolEntry;

export interface ToolCallPayload {
  id: string | null;
  name: string;
  arguments: unknown;
}

export interface ToolResultPayload {
  id: string | null;
  result: string;
}

export interface ToolCallArgsPayload {
  id: string | null;
  arguments: unknown;
}

export function finishThinking(prev: Entry[]): Entry[] {
  const last = prev[prev.length - 1];
  if (last && last.kind === "thinking" && !last.done) {
    return [...prev.slice(0, -1), { ...last, done: true }];
  }
  return prev;
}

export function appendThinking(prev: Entry[], payload: string): Entry[] {
  const last = prev[prev.length - 1];
  if (last && last.kind === "thinking" && !last.done) {
    return [...prev.slice(0, -1), { ...last, content: last.content + payload }];
  }
  return [...prev, { kind: "thinking", content: payload, done: false }];
}

export function appendChunk(prev: Entry[], payload: string): Entry[] {
  const withFinishedThinking = finishThinking(prev);
  const last = withFinishedThinking[withFinishedThinking.length - 1];
  if (last && last.kind === "text" && last.role === "assistant") {
    return [
      ...withFinishedThinking.slice(0, -1),
      { ...last, content: last.content + payload },
    ];
  }
  return [
    ...withFinishedThinking,
    { kind: "text", role: "assistant", content: payload, time: Date.now() },
  ];
}

export function appendToolCall(
  prev: Entry[],
  payload: ToolCallPayload,
): Entry[] {
  return [
    ...finishThinking(prev),
    {
      kind: "tool",
      callId: String(payload.id),
      name: payload.name,
      args: payload.arguments,
    },
  ];
}

export function applyToolResult(
  prev: Entry[],
  payload: ToolResultPayload,
): Entry[] {
  return prev.map((entry) =>
    entry.kind === "tool" && entry.callId === String(payload.id)
      ? { ...entry, result: payload.result }
      : entry,
  );
}

// Patches in a tool call's input after the entry already exists — some ACP
// agents (unlike the initial `ToolCall` notification `appendToolCall` reads)
// only send `rawInput` later via a `ToolCallUpdate`, so the args shown can't
// always be filled in at creation time. See `emit_tool_call_update` in
// `acp/events.rs` for the backend half.
export function updateToolArgs(
  prev: Entry[],
  payload: ToolCallArgsPayload,
): Entry[] {
  return prev.map((entry) =>
    entry.kind === "tool" && entry.callId === String(payload.id)
      ? { ...entry, args: payload.arguments }
      : entry,
  );
}

export function isToolError(result: string | undefined): boolean {
  return result?.startsWith("Error:") ?? false;
}

function isPendingTool(e: Entry): e is Extract<Entry, { kind: "tool" }> {
  return e.kind === "tool" && e.result === undefined;
}

// Rebuilds a display `Entry[]` from persisted, whole (non-streamed) messages
// loaded from disk — used once, on mount, to hydrate a conversation's
// history rather than replaying it live event-by-event. `thinking` deltas
// are never persisted (see `PersistedMessage`), so reloaded history never
// has them, same as it never did across an app restart before persistence
// existed. A `tool`-role message doesn't carry which call it answers
// (Ollama's own history shape doesn't need that, since messages are always
// sent back in order) — matched positionally here against the earliest
// still-unfilled `tool` entry, same assumption the backend already relies
// on when replaying history to Ollama.
export function messagesToEntries(messages: PersistedMessage[]): Entry[] {
  const entries: Entry[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      entries.push({
        kind: "text",
        role: "user",
        content: message.content,
        time: message.createdAt * 1000,
      });
    } else if (message.role === "assistant") {
      if (message.content) {
        entries.push({
          kind: "text",
          role: "assistant",
          content: message.content,
          time: message.createdAt * 1000,
        });
      }
      for (const call of message.toolCalls ?? []) {
        entries.push({
          kind: "tool",
          callId: String(call.id),
          name: call.function.name,
          args: call.function.arguments,
        });
      }
    } else if (message.role === "tool") {
      const pending = entries.find(isPendingTool);
      if (pending) pending.result = message.content;
    }
  }
  return entries;
}
