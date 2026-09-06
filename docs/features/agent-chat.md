# Agent chat runtime

The built-in agent runtime (`chat.rs`) talks directly to a local
**Ollama** server over HTTP — it does not go through the Agent Client
Protocol (ACP). ACP is reserved for driving *external* agent processes
later (not yet built); the built-in runtime uses its own simple
session/event model that happens to look ACP-shaped (session id,
streamed message chunks, tool calls, permission requests) so the UI
code isn't tied to one backend shape.

## Provider

Hardcoded to `http://localhost:11434` for now (`chat.rs`):
- `GET /api/tags` → `list_ollama_models` command, used to populate the
  model dropdown and to determine Ollama connectivity.
- `POST /api/chat` with `"stream": true` and the full tool list attached
  (see [tools.md](./tools.md)) → the actual chat/tool-call loop.

There's no generic OpenAI-compatible provider yet and no way to point
at a different Ollama host/port from the UI — both are still on the
plan (multi-provider milestone), not implemented.

## Session model

Each mount of `ChatPanel` generates a fresh `sessionId`
(`crypto.randomUUID()`), and `App.tsx` remounts `ChatPanel` (via
`key={projectRoot}`) whenever the open folder changes, so switching
projects starts a brand-new session. Session history lives entirely on
the Rust side in `AppState.chat_sessions: Mutex<HashMap<String,
Vec<ChatMessage>>>` — the frontend never holds the canonical message
list, only a rendering-friendly derived view (see "Frontend rendering"
below).

`ChatMessage` (`chat.rs`) is `{ role, content, tool_calls? }`, matching
Ollama's chat message shape directly (roles used: `system`, `user`,
`assistant`, `tool`).

### System prompt injection

`refresh_system_prompt` (`chat.rs`) runs at the top of every call to
`run_agent_loop` — i.e. on every `send_prompt` and every `retry_last`,
not just a session's first message. It rebuilds the system prompt from
`context::build_system_prompt()` (AGENTS.md + memory + skill list — see
[context-and-memory.md](./context-and-memory.md)) and keeps it in sync
as history's first message: updates it in place if one's already there,
inserts one if there's now something to say and there wasn't before,
and removes it if there's now nothing to say. Doing this every turn
(rather than once, when the session starts) matters in practice — it
means editing `AGENTS.md` or dropping in a new skill file *during* an
open chat session takes effect on the very next message, instead of
only affecting sessions started after the edit. If none of AGENTS.md,
memory, or skills have anything, no system message is present at all.

## The agent loop (`run_agent_loop`)

For a given `session_id`/`model`, in a loop capped at
**`MAX_TOOL_ITERATIONS = 15`** iterations:

1. Check the session's cancellation flag (see "Cancellation" below); if
   set, emit `done` and stop.
2. Send the full history to `/api/chat` and stream the response
   (`stream_one_turn`).
3. Push the resulting assistant message (content + any `tool_calls`) to
   history.
4. If there were no tool calls, emit `done` and the turn is over.
5. Otherwise, for each tool call: emit `tool_call`, execute it (or, if
   it's an exact repeat of the immediately preceding call, skip
   execution and substitute a corrective message — see "Repeat-call
   nudge"), emit `tool_result`, push a `tool`-role message with the
   result, and loop back to step 2.

If the loop exhausts all 15 iterations without the model stopping on its
own, it emits an `error` event and returns `Err(...)`.

### Streaming (`stream_one_turn`)

Ollama's streaming response is newline-delimited JSON. Each line is
parsed as `{ message: { content, thinking, tool_calls }, done }`:

- `thinking` deltas (present on reasoning models like `gpt-oss`) are
  emitted on `chat://{id}/thinking` as they arrive, separately from
  `content`.
- `content` deltas are emitted on `chat://{id}/chunk` and accumulated
  into the final assistant message content.
- `tool_calls`, when present, arrive as one complete array in a single
  chunk (not streamed token-by-token) — Ollama only includes this in the
  chunk immediately before `done: true`.
- A non-2xx HTTP response is *not* a `send()` error in reqwest, so it's
  checked explicitly (`resp.status().is_success()`) and its body text is
  surfaced as the error message — otherwise Ollama's JSON error object
  would silently be fed to the NDJSON parser as if it were a valid
  empty chunk, producing no visible output and no error.

### Repeat-call nudge

Weaker local models sometimes get stuck calling the same read-only tool
(e.g. `read_file` on the same path) repeatedly instead of acting on what
they already learned. `run_agent_loop` tracks `last_call: Option<(name,
arguments)>` across the whole turn; if a call is byte-identical to the
immediately preceding one, it isn't re-executed — the model instead gets
back a message telling it to stop repeating and take a concrete action
or explain what's blocking it.

### Cancellation

`AppState.cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>` holds
one flag per in-flight session. `send_prompt`/`retry_last` create the
flag before starting the loop and remove it when done
(`run_with_cancellation`). The `cancel_prompt(session_id)` command just
flips the flag. It's checked:
- at the top of each loop iteration,
- right after a turn's streaming response finishes,
- before each individual tool call,
- and mid-stream, inside the byte-stream read loop in `stream_one_turn`.

So cancellation takes effect promptly rather than only after the whole
current response finishes — though a tool that's already mid-execution
(e.g. a running shell command) is not forcibly killed, it's allowed to
finish.

### Retry / regenerate

`retry_last(session_id, model)` pops trailing messages from history
until the last message is a `user` message (i.e. it removes any
`assistant`/`tool` messages after it), then runs the loop again. This
single operation covers both:
- "regenerate this response" — last message was `assistant`/`tool`.
- "retry this message" — last message is already `user` because a
  previous attempt errored before any reply came back.

It never duplicates the user's message; it only ever re-answers the
existing last one. The frontend only shows the retry button on the
*last* rendered message, since retrying anything earlier isn't a
well-defined operation with this truncate-and-regenerate approach.

## Frontend rendering (`ChatPanel.tsx`)

The UI keeps its own `entries: Entry[]` array, derived by listening to
events rather than mirroring `ChatMessage[]` directly — this is what
lets `thinking` and `tool` entries render as distinct UI blocks even
though only `user`/`assistant`/`tool` roles exist in the real backend
history:

- `TextEntry` — `{ role: "user" | "assistant", content, time }`.
- `ThinkingEntry` — `{ content, done }`, accumulated from `thinking`
  events, finalized (`done: true`) as soon as a `chunk` or `tool_call`
  event arrives.
- `ToolEntry` — `{ callId, name, args, result? }`, created on `tool_call`
  and filled in on the matching `tool_result` (matched by the tool
  call's `id`, stringified).

Both `thinking` and `tool` entries render collapsed by default with a
chevron toggle; the collapsed tool row shows `name` plus a
single-line, ellipsis-truncated JSON dump of its arguments.

Per-message UI on every text entry: a `HH:mm` timestamp, a copy-to-
clipboard button (flips to a checkmark for ~1.2s), and — only on the
last message — the retry button described above.

### Ollama connection status

`store.ts` holds `ollamaConnected: boolean | null` (`null` = not yet
checked) and `ollamaModels: string[]`, refreshed via `refreshOllama()`
which calls `list_ollama_models` and sets connected/models on success or
`ollamaConnected: false` + empty models on failure. `App.tsx` triggers
one check on mount; `ChatPanel` polls every **5 seconds** via
`setInterval`, but the effect bails out (and its cleanup stops the
interval) whenever `sending` is `true` — no polling while a turn is
actively in flight. `StatusBar.tsx` reads the same store value to show
"checking…" / "connected" / "disconnected" with a colored dot.
