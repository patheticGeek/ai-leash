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

`ChatPanel`'s `sessionId` is `projectRoot ?? crypto.randomUUID()` —
stable across app restarts as long as you're reopening the same
project, so it doubles as that project's conversation id for
[persistence](./conversation-history.md). `CenterPanel` remounts
`ChatPanel` (via `key={projectRoot}`) whenever the open project
changes, so this only evaluates once per project per app run; without
a project open it falls back to a fresh random id each time (there's
nothing stable to key by, and nothing gets persisted either way).
Session history lives entirely on the Rust side in
`AppState.chat_sessions: Mutex<HashMap<String, Vec<ChatMessage>>>` —
the frontend never holds the canonical message list, only a
rendering-friendly derived view (see "Frontend rendering" below) —
plus, now, on disk in SQLite once a project is open.

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

## Sub-agents (the `spawn_sub_agent` tool)

The main agent can delegate one or more self-contained chunks of work
to isolated sub-agents via the `spawn_sub_agent` tool (`{tasks:
[{description, prompt}, ...]}`, defined in `tools.rs`, each spawned via
`chat::run_sub_agent`; named `spawn_sub_agent` — not just `task` — so
the model, and anyone reading the code, sees an action rather than a
noun):

- **Multiple entries in `tasks` run concurrently**, not one at a time —
  `execute_tool`'s `"spawn_sub_agent"` arm builds one async job per
  entry and drives them all with `futures_util::future::join_all`, so
  several sub-agents are genuinely in flight together (their Ollama
  requests overlap in wall-clock time; true parallelism vs. interleaved
  single-threaded concurrency depends on whether the local Ollama
  server itself processes requests in parallel). The whole
  `spawn_sub_agent` call only resolves once every entry has finished.
  There's no separate "planning" step deciding whether to split — it's
  the same single model turn as always, just with a tool schema that
  lets one call request several subtasks when the request actually has
  independent parts (the tool description tells the model exactly when
  to do that vs. just handling something directly).
- Each sub-agent gets a **fresh history** — just its own `prompt` as
  its first user message, nothing from the parent conversation or from
  sibling subtasks in the same `spawn_sub_agent` call. Each has the
  same tool set as the parent **except `spawn_sub_agent` itself**, so
  nesting is capped at one level deep (a sub-agent can't spawn its own
  sub-agents).
- Each runs on its own `sub_session_id`
  (`{parent_session_id}::spawn_sub_agent::{uuid}`) with its own
  `chat://{sub_session_id}/...` event stream — the same event names
  (`chunk`, `thinking`, `tool_call`, `tool_result`) as a top-level
  session, just under a different id. `tools.rs` emits one
  `chat://{parent_session_id}/subtask_start` event **per subtask**,
  carrying `{callId, subSessionId, description}` (all subtasks from the
  same `spawn_sub_agent` call share the same `callId`) so the frontend
  knows which parent tool-call entry to nest each subtask's stream
  under, and can tell multiple concurrent subtasks apart by
  `subSessionId`.
- All sub-agents from one `spawn_sub_agent` call **share the parent's
  cancellation flag** (`Arc<AtomicBool>`) rather than each getting its
  own — stopping the parent stops every sub-agent it's running.
- Each sub-agent's `AGENTS.md`/skills/touched-directory scoping is
  attached to the **parent's** session id, not its own — directories
  any of them read or edit count toward the parent's scoping (see
  [context-and-memory.md](./context-and-memory.md)), since they're all
  doing work on the parent's behalf within the same project.
- Only each sub-agent's **final assistant message** feeds back — once
  every entry in `tasks` has finished, their results are combined into
  one string (`## {description}\n\n{result}` per subtask, joined) that
  becomes the single `spawn_sub_agent` tool call's result in the
  parent's history. None of their intermediate thinking/tool-calls ever
  enter the parent's context, only the UI sees them (nested, collapsed
  by default under the `spawn_sub_agent` tool-call entry, one labeled
  thread per subtask — see [ui-shell.md](./ui-shell.md) for the
  separate, standalone tab view of the same data). Each sub-agent's
  history is discarded (`chat_sessions.remove`) once it finishes, so
  long sessions with many subtasks don't accumulate unbounded state.
- `run_agent_loop` calling into `execute_tool` calling into
  `run_sub_agent` calling back into `run_agent_loop` is a genuine
  recursive `async fn` cycle; the recursive call in `run_sub_agent` is
  wrapped in `Box::pin(...)` to give it a finite size, since Rust can't
  otherwise compute the size of a self-referential future type.

Unlike `load_skill` (gated on whether any skill exists),
`spawn_sub_agent` is always offered to a top-level session. What
excludes it is an `allow_subtasks: bool` threaded through
`run_agent_loop` → `stream_one_turn` → `tool_definitions`, set to
`false` specifically when running a sub-agent's own loop.

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

### `generating` — is a session busy right now?

`run_with_cancellation` also emits `chat://{session_id}/generating` —
`true` right after inserting the cancellation flag, `false` right after
removing it — bracketing the exact same span as the cancellation flag's
lifetime. This is the single choke point for it rather than each call
site (`send_prompt`, `retry_last`, `resume_after_background_subtask`)
emitting its own, specifically so a background subtask autonomously
resuming the conversation — no frontend action triggers that, see
"Sub-agents" above — still reports the session as busy. Two consumers:

- `ChatPanel.tsx` derives its own `sending` state from
  `store.generatingSessions[sessionId]` instead of purely local state,
  so if you switch away from a project mid-turn and back, the newly
  (re)mounted `ChatPanel` shows the correct busy/idle state immediately
  from `store.ts`'s current value — rather than defaulting to "idle"
  and waiting to happen to catch a live event. `send`/`retry`/`stop`
  still set local state directly too, purely for instant feedback
  ahead of the backend round-trip.
- `LeftBar.tsx` is always mounted regardless of which project (if any)
  is open, and subscribes to this event for every project in
  `recentProjects` — a blue dot next to a project's name in the
  sidebar means that project has a turn running in the background,
  even while you're looking at a different one entirely (see
  [ui-shell.md](./ui-shell.md)).

Since a `spawn_sub_agent` call blocks the parent's own turn until every
subtask finishes (or, for `interrupt: "each"`, until just the first
one does), the parent's `generating` stays `true` for the duration —
sub-agent sessions themselves never emit `generating` at all
(`run_sub_agent` calls `run_agent_loop` directly, bypassing
`run_with_cancellation`), so there's no separate per-sub-agent busy
indicator, only the parent project's.

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

### Context usage tracking

Ollama's final streamed chunk for a turn (the one with `done: true`)
includes `prompt_eval_count` and `eval_count` — the number of prompt
and generated tokens for that request. `stream_one_turn` captures both
and `run_agent_loop` emits them on `chat://{id}/usage` as
`{promptTokens, completionTokens}` after every turn. The frontend adds
them together and compares against the selected model's
`context_length` (from `/api/tags`' `details.context_length`, surfaced
through `list_ollama_models` as `ModelSummary.contextLength`) to show a
percentage — see the ring indicator in `ChatPanel.tsx`. This is a
per-turn snapshot, not a running total across the whole conversation,
but since the full history is resent every turn, `prompt_eval_count`
already reflects however much of the conversation Ollama had to
process for that request.

## Frontend rendering (`ChatPanel.tsx`)

The UI keeps its own `entries: PanelEntry[]` array, derived by
listening to events rather than mirroring `ChatMessage[]` directly —
this is what lets `thinking` and `tool` entries render as distinct UI
blocks even though only `user`/`assistant`/`tool` roles exist in the
real backend history. The base `Entry` union (`TextEntry`,
`ThinkingEntry`, `ToolEntry`) and the pure accumulation helpers
(`appendThinking`/`appendChunk`/`appendToolCall`/`applyToolResult`) live
in `src/lib/chatEntries.ts`, shared with `store.ts` (typing
`subAgentThreads`) and `SubAgentChatTab.tsx` — see
[ui-shell.md](./ui-shell.md) for the center-panel tab that reads
those. `ChatPanel.tsx` locally extends `ToolEntry` with an optional
`subtasks?: SubtaskThread[]` (as `PanelEntry`) purely for its own
nested collapsed-thread display; sub-agents can't spawn further
sub-agents, so a `SubtaskThread`'s own `entries: Entry[]` never needs
that extension.

- `TextEntry` — `{ role: "user" | "assistant", content, time }`.
- `ThinkingEntry` — `{ content, done }`, accumulated from `thinking`
  events, finalized (`done: true`) as soon as a `chunk` or `tool_call`
  event arrives.
- `ToolEntry` — `{ callId, name, args, result? }`, created on
  `tool_call` and filled in on the matching `tool_result` (matched by
  the tool call's `id`, stringified). For a `spawn_sub_agent` call, the
  `PanelEntry` extension's `subtasks` is an array of `{ subSessionId,
  description, entries: Entry[] }` — one entry per concurrently spawned
  subtask, added on that subtask's `subtask_start` event and filled in
  by its own event stream (see "Sub-agents" above). The same
  accumulation logic is reused for the top-level `entries` array and
  for each subtask's `entries`, via `updateSubtaskThread` locating the
  right `ToolEntry` by `callId` and the right subtask within it by
  `subSessionId` — and, in parallel, mirrored into
  `store.subAgentThreads[subSessionId]` via `setSubAgentEntries` so the
  same data is available outside `ChatPanel`'s local state (see
  [ui-shell.md](./ui-shell.md)).

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
