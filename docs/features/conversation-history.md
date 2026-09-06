# Conversation history (SQLite)

## Storage

`db.rs` opens a SQLite database at `<config-dir>/ai-leash/history.db`
(the same `dirs::config_dir().join("ai-leash")` convention
`context.rs` uses for the global `AGENTS.md`/memory — see
[context-and-memory.md](./context-and-memory.md)), created on first run
via `AppState`'s `Default` impl (`Db` implements `Default` too, opening
and initializing schema eagerly). WAL journal mode is enabled for
better concurrent read/write behavior. Schema:

```sql
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,           -- == project root path, for now
    project_root TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,  -- also the ordering key
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,               -- JSON-encoded Vec<ToolCall>, nullable
    created_at INTEGER NOT NULL
);
```

No separate `seq` column — `messages.id`'s `AUTOINCREMENT` already
gives strict insertion order, which is all that's needed since messages
are always appended, never reordered or edited in place.

## Conversation id == project path (for now)

There's no independent "conversation" concept yet — `ChatPanel.tsx`'s
`sessionId` (previously a fresh `crypto.randomUUID()` on every mount)
is now `projectRoot ?? crypto.randomUUID()`, so it's stable across app
restarts as long as you reopen the same project. `CenterPanel` already
remounts `ChatPanel` on `projectRoot` change (`key={projectRoot}`), so
this only evaluates once per project per app run. This matches the
existing "one conversation per project for now" scoping used elsewhere
(`store.ts`'s `panelStateByConversation`, also keyed by project path —
see [ui-shell.md](./ui-shell.md)); wiring multiple named conversations
per project later will need a real conversation id distinct from the
project path, at which point this doubling-up goes away.

## What gets persisted, and what doesn't

`chat.rs`'s `push_message` — the single choke point everything already
went through for updating in-memory `chat_sessions` — now also calls
`db::save_message` before it touches the `HashMap`. Two things are
silently skipped there (`db::save_message` no-ops rather than erroring,
since a persistence failure shouldn't ever break the live chat):

- **`system`-role messages.** These are rebuilt from AGENTS.md/memory
  on every single turn by `refresh_system_prompt` (see
  [agent-chat.md](./agent-chat.md)), which mutates `chat_sessions`
  directly and never calls `push_message` — so in practice a system
  message can't reach `save_message` at all; the explicit role check
  there is just a defensive belt-and-suspenders guard.
- **Sub-agent sessions** (`spawn_sub_agent`). `db::is_persistable`
  checks for the `::spawn_sub_agent::` marker every `sub_session_id`
  is built with (see [agent-chat.md](./agent-chat.md)) and skips
  anything matching — sub-agent history is already discarded from
  `chat_sessions` the moment it finishes (`run_sub_agent`), so
  persisting it would just be dead rows with no way to view them again
  (there's no per-project sub-agent history UI, only the live
  `subAgentThreads` store slice for the duration of the run — see
  [ui-shell.md](./ui-shell.md)).

Persisting a message requires a project to be open —
`commands::get_root_path` returning `Err` (no project open) means
`push_message` skips the database entirely, same reasoning as above:
there's no stable id to key a conversation by without one.

## Loading history back

`load_conversation_history(session_id)` (new Tauri command,
`chat.rs`) is called once from a `ChatPanel` mount effect, before the
event-listener-registration effect. It checks `chat_sessions` first —
if the session's already in memory (including a session that's simply
never been persisted, which covers every sub-agent id) it's returned
as-is; otherwise `db::load_messages` reads it from disk and the result
seeds `chat_sessions` too, so the loop can resume the conversation on
the next `send_prompt` without needing to hit SQLite again this run.

The frontend's `messagesToEntries()` (`src/lib/chatEntries.ts`)
rebuilds a display `Entry[]` from the returned whole (non-streamed)
`PersistedMessage[]` — a different code path from the live
`appendThinking`/`appendChunk`/`appendToolCall`/`applyToolResult`
helpers used for streaming, since there's no delta-by-delta replay
here, just whole messages already containing their final content:

- `user`/`assistant` messages become `TextEntry`s (`time` taken from
  the message's real `createdAt`, not `Date.now()`).
- An `assistant` message's `tool_calls` each become a `ToolEntry`
  (no `result` yet).
- A `tool`-role message doesn't carry which call it answers — Ollama's
  own history format doesn't need that, since messages are always
  replayed back to it in order — so it's matched positionally against
  the earliest still-unfilled `ToolEntry`, the same assumption
  `run_agent_loop` already relies on.
- `thinking` deltas are never persisted at all (there's no `thinking`
  role in `ChatMessage`), so reloaded history never shows them — same
  as it always looked before this feature existed, just now surviving
  a restart instead of only a single run.

`ChatPanel.tsx`'s hydration effect guards against clobbering a live
update that might have arrived while the (async) load was still in
flight, via `setEntries((prev) => (prev.length === 0 ? loaded : prev))`
— defensive rather than load-bearing, since nothing can actually send a
message before the component has mounted and the user has interacted
with it.

## Testing

`db.rs` has `#[cfg(test)]` unit tests exercising the SQL directly
(round-tripping plain messages in order, round-tripping `tool_calls`
JSON, confirming `system` messages and sub-agent sessions are excluded,
and confirming two conversations' messages don't leak into each
other) against a throwaway file in the OS temp dir per test — `cargo
test --lib db::`. This is the fastest way to verify a change to the
schema or save/load logic without going through Ollama or the UI at
all.
