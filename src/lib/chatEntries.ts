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

export function appendToolCall(prev: Entry[], payload: ToolCallPayload): Entry[] {
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

export function applyToolResult(prev: Entry[], payload: ToolResultPayload): Entry[] {
  return prev.map((entry) =>
    entry.kind === "tool" && entry.callId === String(payload.id)
      ? { ...entry, result: payload.result }
      : entry,
  );
}

export function isToolError(result: string | undefined): boolean {
  return result !== undefined && result.startsWith("Error:");
}
