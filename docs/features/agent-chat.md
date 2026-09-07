# Agent chat runtime

There are two independent "agent backends" a chat session can use, chosen
globally in `ProviderSettingsModal.tsx` (`store.ts`'s `agentBackend`, not
per-project): the **built-in** loop (`chat.rs`, described in this whole
file below), or an **external ACP agent subprocess** (`acp.rs`, see
"External ACP agent backend" at the end of this file). The built-in
runtime talks directly to a local Ollama server or an OpenAI-compatible
HTTP API (see "Provider" below) and does not go through the Agent Client
Protocol (ACP) itself — it uses its own simple session/event model that
happens to look ACP-shaped (session id, streamed message chunks, tool
calls, permission requests) so the UI code isn't tied to one backend
shape, which is exactly what let the ACP backend reuse the same
`chat://{sessionId}/...` event names and the same `PermissionModal.tsx`
flow without any redesign.

## Provider

`src-tauri/src/provider.rs` defines `ProviderConfig`, an enum with two
variants — `Ollama { host }` and `OpenAiCompatible { base_url, api_key }`
— serialized with an internal `kind` tag (`"ollama"` /
`"openAiCompatible"`) so it matches the frontend's `ProviderConfigPayload`
union (`src/lib/tauriApi.ts`) exactly. There is deliberately **no
backend-persisted provider config**: every command that talks to a model
(`send_prompt`, `retry_last`, `resume_after_background_subtask`,
`list_provider_models`) takes a `provider: ProviderConfig` argument sent
fresh from the frontend on every call, the same way `model: String`
already was — `AppState` gained no new field for this. The frontend's own
copy of provider settings (`store.ts`'s `providerSettings` — the Ollama
host, zero or more saved OpenAI-compatible configs, and which one is
active) lives in `localStorage` only (`ai-leash:providerConfig`),
including API keys in plaintext — an explicit, deliberate tradeoff for
this local-first single-user app rather than adding an OS-keychain
dependency.

`provider::stream_turn` dispatches on the enum to one of two functions,
both used from the single `run_agent_loop` call site (`chat.rs`) that
used to call Ollama directly:
- `stream_turn_ollama`: unchanged Ollama behavior, just with the host
  built from `ProviderConfig::Ollama.host` instead of a hardcoded
  `localhost:11434` — bare newline-delimited JSON, one full message
  snapshot per line, `tool_calls` sent whole (not incrementally) right
  before the final `done`.
- `stream_turn_openai`: a generic OpenAI-compatible chat-completions
  provider (works against `api.openai.com`, OpenRouter, or any
  self-hosted OpenAI-compatible server). Its wire format is genuinely
  different from Ollama's, not just a different URL: streaming is
  **SSE** (`data: {...}\n` lines terminated by a literal `data: [DONE]`),
  and tool-call arguments arrive as **incremental string fragments keyed
  by index** that must be concatenated before parsing as JSON, rather
  than Ollama's single whole-array send. `stream_options:
  {include_usage: true}` is set on the request so token usage populates
  the same `usage` event Ollama's path already emits (best-effort — some
  third-party hosts may ignore it). Both providers reuse
  `tools::tool_definitions(...)` unchanged (already OpenAI
  function-calling-shaped JSON) and `tools::ToolCall`/`ToolCallFunction`
  as the finalized shape, so `TurnResult` is identical regardless of
  which provider produced it.

`list_provider_models` only returns a real, live model list for Ollama
(`GET /api/tags`, host-configurable). For `OpenAiCompatible` it always
returns `[]` — many OpenAI-compatible hosts don't implement `GET
/v1/models` reliably, and it has no `context_length` equivalent anyway —
so the frontend uses a free-text model-id input for this provider kind
(`ChatPanel.tsx` swaps its `<select>` for an `<input>` when
`providerSettings.activeId !== "ollama"`) instead of a populated
dropdown.

A provider call can fail two ways, expressed as `ProviderError` rather
than a plain `String` so `run_agent_loop`'s retry logic doesn't have to
string-match provider-specific error text:
- `Transient` — worth silently retrying the same turn a couple of times
  (`MAX_MALFORMED_TOOL_CALL_RETRIES`): Ollama's "error parsing tool call"
  500 (a sampling hiccup where the model's raw reasoning leaks into where
  clean JSON is expected), or a `429`/`5xx` from an OpenAI-compatible
  host.
- `Fatal` — surfaced to the user immediately.

Settings UI: `ProviderSettingsModal.tsx` (opened via the gear button next
to `LeftBar.tsx`'s "open project" `+`) lets you set the Ollama host, and
add/edit/delete saved OpenAI-compatible configs (label, base URL, API
key, model id) and pick which one is active.

External ACP-agent-process support (driving a whole separate agent
*binary* over the Agent Client Protocol, as opposed to just varying which
HTTP API a single turn's model call goes to) remains a distinct, larger,
not-yet-built piece of work — see the intro above. It won't fold into
`ProviderConfig`: an ACP agent owns its entire tool-calling and
permission-request loop, so it would replace `run_agent_loop` itself for
a session rather than swap out one HTTP call inside it.

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

- **The tool call always returns immediately, never waiting on any
  sub-agent.** `execute_tool`'s `"spawn_sub_agent"` arm spawns one
  detached `tokio::spawn` task per entry in `tasks` and returns a short
  confirmation (`"Spawned N sub-agent(s): ...`") the moment they're all
  kicked off — there's no mode that blocks the calling turn. Each
  spawned task independently runs `chat::run_sub_agent`, records its own
  finish (`db::record_sub_agent_finished`), and then calls
  `chat::resume_after_background_subtask` to inject its result into the
  parent session and autonomously trigger a new turn — the model gets a
  chance to react to each result as soon as it's ready, in whatever
  order they actually finish, without the user needing to say anything.
  There's no separate "planning" step deciding whether to split — it's
  the same single model turn as always, just with a tool schema that
  lets one call request several subtasks when the request actually has
  independent parts (the tool description tells the model exactly when
  to do that vs. just handling something directly). The model can also
  proactively check on things itself via `list_sub_agents` (a status
  list of everything it's spawned) and `read_sub_agent` (one sub-agent's
  full prompt + transcript, paginated line-by-line like `read_file`) —
  both gated behind the same `allow_subtasks` flag as `spawn_sub_agent`
  itself, and both scoped so a session can only see sub-agents it
  spawned.
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
- Each sub-agent gets its **own fresh cancellation flag**, not the
  parent's — an accepted consequence of every task running fully
  detached now (nothing awaits them together, so there's no single
  point to share a flag through). Stopping the parent no longer stops
  sub-agents already in flight.
- Each sub-agent's `AGENTS.md`/skills/touched-directory scoping is
  attached to the **parent's** session id, not its own — directories
  any of them read or edit count toward the parent's scoping (see
  [context-and-memory.md](./context-and-memory.md)), since they're all
  doing work on the parent's behalf within the same project.
- Only each sub-agent's **final assistant message** feeds back into the
  parent's own history — as a *real* synthetic tool call, not a bare
  injected message: `resume_after_background_subtask` pushes an
  `assistant` message with one `tool_calls` entry (name
  `sub_agent_result`, args `{sub_session_id, description}`) followed by a
  `tool`-role message carrying the result, and emits the matching
  `chat://{session_id}/tool_call`/`tool_result` events live. This is
  what makes it render as an ordinary tool-call entry (with a `Bot`
  icon, same as `spawn_sub_agent`) both live and after a reload — a bare
  `tool`-role message with no preceding `tool_calls` entry to pair with
  would otherwise be silently dropped by `messagesToEntries` (nothing to
  attach it to), which is exactly what an earlier version of this did.
  None of a sub-agent's intermediate thinking/tool-calls ever enter the
  parent's context, only the UI sees them (nested, collapsed by default
  under the `spawn_sub_agent` tool-call entry, one labeled thread per
  subtask — see [ui-shell.md](./ui-shell.md) for the separate,
  standalone tab view of the same data). Each sub-agent's *in-memory*
  history is dropped
  (`chat_sessions.remove`) once it finishes so long-running apps don't
  accumulate unbounded state — but every message is durably persisted to
  the same SQLite `conversations`/`messages` tables a top-level session
  uses (sub-agent session ids are no longer excluded from persistence),
  plus a `sub_agents` table tracking status/timing, kept **indefinitely**
  (no expiry). `load_conversation_history` transparently falls back to
  disk for any session id, so it works unmodified for reloading a
  sub-agent's full transcript too — see
  [conversation-history.md](./conversation-history.md).
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

`run_with_cancellation` also emits `chat://{session_id}/generating` with
`{ active: bool, autonomous: bool }` — `active: true` right after
inserting the cancellation flag, `active: false` right after removing
it, bracketing the exact same span as the cancellation flag's lifetime.
This is the single choke point for it rather than each call site
(`send_prompt`, `retry_last`, `resume_after_background_subtask`)
emitting its own, specifically so a background subtask autonomously
resuming the conversation — no frontend action triggers that, see
"Sub-agents" above — still reports the session as busy. `autonomous` is
`true` only for `resume_after_background_subtask`'s turns (the model
reacting to a finished sub-agent on its own); `false` for
`send_prompt`/`retry_last` (a turn the user is actually waiting on).
ACP-backed sessions (`acp.rs`) emit the same shape, always with
`autonomous: false` — there's no background-subtask concept there. Two
consumers, each keying off the field that matters to them:

- `ChatPanel.tsx` derives its own `sending` state from
  `store.generatingSessions[sessionId] && !store.autonomousGeneratingSessions[sessionId]`
  instead of purely local state, so if you switch away from a project
  mid-turn and back, the newly (re)mounted `ChatPanel` shows the correct
  busy/idle state immediately from `store.ts`'s current value — rather
  than defaulting to "idle" and waiting to happen to catch a live event.
  Excluding autonomous turns here means the Stop button never appears,
  and a new message can always be sent (it just queues behind the
  session lock), for a turn the user didn't initiate and isn't
  necessarily watching — only `send`/`retry`/`stop`-driven turns block
  the input. `send`/`retry`/`stop` still set local state directly too,
  purely for instant feedback ahead of the backend round-trip.
- `LeftBar.tsx` is always mounted regardless of which project (if any)
  is open, and subscribes to this event for every project in
  `recentProjects` — a blue dot next to a project's name in the
  sidebar means that project has a turn running in the background,
  even while you're looking at a different one entirely (see
  [ui-shell.md](./ui-shell.md)). It only reads `active`, not
  `autonomous` — any activity, including a sub-agent's autonomous
  reaction turn, is worth surfacing there.

Since a `spawn_sub_agent` call itself never waits on any subtask, the
parent's `generating` drops back to `false` as soon as its own turn
finishes returning the "spawned" confirmation — not while subtasks are
still running in the background. It flips `true` again independently
(with `autonomous: true`), once per subtask, when that subtask's
`resume_after_background_subtask` reacquires the parent's per-session
lock and runs another turn — visible as a busy dot in the sidebar, but
never as a Stop button or blocked input in that project's own chat.
Sub-agent sessions themselves never emit `generating` at all
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
single-line, ellipsis-truncated JSON dump of its arguments — expanding
one shows the same args again, but in full (pretty-printed,
`JSON.stringify(args, null, 2)`, not truncated) rather than repeating
the collapsed line.

Per-message UI on every text entry: a `HH:mm` timestamp, a copy-to-
clipboard button (flips to a checkmark for ~1.2s), and — only on the
last message — the retry button described above.

`assistant`/`sub-agent`-role `TextEntry`s render through
`Markdown.tsx` (`react-markdown` + `remark-gfm`, both already
dependencies, previously unused) — headings, lists, tables, code
blocks/inline code, blockquotes, and links (opened in a new tab) all
get dark-theme-matched styling via the `components` prop. `user`-role
text stays plain `whitespace-pre-wrap`, on the assumption it's typed
input rather than generated prose — matching the convention most chat
UIs use. Every place a message's text is rendered uses this same
split: the main `entries` list here, `SubEntryLine` (the nested
sub-agent thread), and `SubAgentChatTab.tsx` (the standalone tab).

### Provider connection status

`store.ts` holds `ollamaConnected: boolean | null` (`null` = not yet
checked, name kept from before multi-provider support to avoid churn —
see [Provider](#provider) above) and `ollamaModels: ModelSummary[]`,
refreshed via `refreshOllama()` which calls `api.listProviderModels
(activeProviderConfig())` and sets connected/models on success or
`ollamaConnected: false` + empty models on failure. `App.tsx` triggers
one check on mount; `ChatPanel` polls every **5 seconds** via
`setInterval`, but the effect bails out (and its cleanup stops the
interval) whenever `sending` is `true` — no polling while a turn is
actively in flight. `StatusBar.tsx` reads the same store value to show
"checking…" / "connected" / "disconnected" with a colored dot next to
the active provider's label.

## External ACP agent backend

`src-tauri/src/acp.rs` implements the other agent backend: driving a
whole **external ACP (Agent Client Protocol) agent subprocess** — a
separate autonomous program that owns its own model calls, its own
tool-calling, and its own permission-request flow — instead of our
built-in loop. This is a different axis than [Provider](#provider)
above: `Provider` only varies which HTTP API a single model-turn call
goes to, with `run_agent_loop`/`tools::execute_tool`/every built-in tool
staying identical regardless; the ACP backend *replaces*
`run_agent_loop` entirely for a session, and none of our own tools run —
the external agent does its own file I/O directly as a real OS process.
Chosen globally (not per-project) via `store.ts`'s `agentBackend: {kind:
"builtin"} | {kind: "acp", launchCommand}`, set in
`ProviderSettingsModal.tsx`'s "Agent backend" section.

Uses the `agent-client-protocol` crate's stable v1 client role
(`Client.builder()...connect_with(...)`, following
`examples/yolo_one_shot_client.rs`'s pattern), advertising
`ClientCapabilities::new()` (all default/false) so the agent never asks
us to read/write files or run a terminal on its behalf — deliberately
out of scope for now.

- **Process lifecycle**: `send_prompt_acp(session_id, launch_command,
  message)` calls `ensure_acp_session`, which spawns (via
  `AcpAgent::from_str(launch_command)`, a shell-style command line) a
  `tokio::spawn`ed connection actor the first time a given `session_id`
  is used, storing an `mpsc::UnboundedSender<AcpCommand>` in
  `AppState.acp_sessions` keyed by `session_id`. Subsequent prompts for
  the same session reuse the same subprocess/connection — spawning a new
  one per turn would lose the agent's own conversation state entirely,
  since ACP semantics are `Initialize` → one `NewSessionRequest` → many
  serial `PromptRequest`s over that session. The subprocess stays alive
  for the life of the running app; there's no `session/load`/resume
  across app restarts, so a fresh run's respawned subprocess has no
  memory of earlier turns even though the persisted transcript (see
  below) still shows them — the same category of limitation already
  accepted for the built-in loop's crash-recovery behavior.
- **Event mapping**: the connection's `on_receive_notification` handler
  maps `SessionUpdate` variants onto the *same* `chat://{sessionId}/...`
  events the built-in loop emits, so `ChatPanel.tsx` needed zero
  rendering changes: `AgentMessageChunk` → `chunk` (and accumulated into
  a shared `Arc<Mutex<String>>` for persistence once the turn ends),
  `AgentThoughtChunk` → `thinking`, `ToolCall`/`ToolCallUpdate` →
  `tool_call`/`tool_result` (only once `status` reaches
  `Completed`/`Failed`; content rendered via `summarize_tool_call_content`,
  a best-effort text join). `Plan`/`AvailableCommandsUpdate`/
  `CurrentModeUpdate`/etc. are ignored — no UI concept for them yet.
  `generating` is bracketed true/false around each `PromptRequest`
  exactly like `run_with_cancellation` does for the built-in loop, so
  `LeftBar.tsx`'s busy dot and `ChatPanel.tsx`'s `sending` state work
  unchanged.
- **Permission bridge**: `RequestPermissionRequest` (ACP's permission
  ask, which offers a list of named options — allow once/always, reject
  once/always) is bridged onto the *existing* boolean approve/deny
  `PermissionModal.tsx` flow rather than redesigning it — `tools::
  request_permission` (now `pub(crate)`, previously private) is reused
  as-is. `select_permission_option` collapses the outcome: approve →
  first `AllowOnce`, else first `AllowAlways`, else the first option
  offered at all; deny → `RequestPermissionOutcome::Cancelled`
  unconditionally, a legitimate protocol response. `PermissionRequestPayload
  .kind` gained a third literal, `"acp"`, for the modal's header copy.
- **Cancellation**: `chat::cancel_prompt` (same command, same signature —
  the frontend's `stop()` needed no changes) now also checks
  `AppState.acp_sessions` and sends `AcpCommand::Cancel`, which the
  connection actor turns into a `session/cancel` notification to the
  agent.
- **Persistence**: the connection actor calls `chat::push_message` (now
  `pub(crate)`) directly — once for the user's text right before sending
  the prompt, once for the accumulated assistant text once the prompt
  resolves — so ACP-backed turns land in the same SQLite history as the
  built-in loop's, with the same restart-transcript caveat as above.
  Tool-call detail is *not* persisted to SQLite, only forwarded live to
  the frontend for the running app instance.
- **No retry**: our retry is a truncate-and-regenerate operation against
  *our own* `chat_sessions` history; the ACP agent's real conversation
  state lives inside the subprocess and can't be truncated from outside
  without `session/load` (unimplemented). `ChatPanel.tsx` just hides the
  retry button, and the model selector/token-usage ring, while
  `agentBackend.kind === "acp"` — there's no "model" concept from this
  side either, the agent decides.
