# Default tools & permissions

All tool schemas and execution live in `tools.rs`; `tool_definitions()`
returns the JSON (OpenAI/Ollama function-calling format) sent with every
`/api/chat` request, and `execute_tool()` dispatches a called tool by
name.

## Tool list

| Tool | Params | Permission? | Notes |
|---|---|---|---|
| `read_file` | `path`, `offset?`, `limit?` | No | See "Partial reads" below. |
| `edit_file` | `path`, `old_string`, `new_string` | Yes (`edit`) | Exact-match find/replace, not full overwrite. |
| `write_file` | `path`, `content` | Yes (`edit`) | Full create/overwrite. |
| `list_dir` | `path` (`.` for root) | No | Hides the same `IGNORED_NAMES` as the sidebar. |
| `grep` | `pattern` (regex), `path?` | No | Walks with the `ignore` crate, so it respects `.gitignore`. |
| `shell` | `command` | Yes (`shell`) | Runs via `sh -c`, capped at 30s. |
| `load_skill` | `name` | No | Fetches a skill's full body — see [context-and-memory.md](./context-and-memory.md). Only offered to the model at all when the project actually has at least one discoverable skill. |
| `task` | `tasks: [{description, prompt}, ...]` | No (its own sub-actions are still gated individually) | Delegates one or more subtasks to isolated sub-agents, run concurrently when there's more than one entry — see [agent-chat.md](./agent-chat.md#sub-agents-the-task-tool). Only offered to top-level sessions, never to a sub-agent's own session. |

All string arguments pulled from tool calls pass through
`fix_literal_escapes()` first: if a string has **zero** real newline
characters but **does** contain a literal two-character `\n`, it's
treated as a local model having double-escaped its JSON string content,
and those literal escapes are converted back to real newlines/tabs. This
guards against a real failure mode seen with smaller quantized models,
without touching strings that already contain real newlines (where a
literal `\n` substring is far more likely to be intentional, e.g. in a
regex).

Every tool's string output is truncated to **`MAX_TOOL_OUTPUT` = 20,000
characters** (with a `...[truncated]` suffix) before being fed back to
the model.

### Why `edit_file` isn't a full-file overwrite

An earlier version of `edit_file` took the whole new file content and
overwrote the file. In practice, a local model asked to reproduce an
entire file (to add one line) would sometimes silently drop or corrupt
content it didn't retype faithfully — the model doesn't need read
access to know what it's overwriting, so mistakes were invisible until
the file was already wrong on disk.

The current design instead requires an exact `old_string` → `new_string`
replacement:
- The tool description explicitly tells the model to call `read_file`
  first and copy `old_string` verbatim.
- If `old_string` isn't found in the file, or matches more than once,
  the tool returns a plain-text explanation (not an error) telling the
  model to re-read the file or add more surrounding context — this
  keeps the model in the loop to self-correct instead of the operation
  silently failing or guessing.
- Only a genuinely new/replacement file should use `write_file`.

### Partial reads (`read_file`)

- `offset` is 1-based; `limit` defaults to **`DEFAULT_READ_LIMIT` =
  2000** lines.
- If the requested range doesn't cover the whole file, the result has a
  trailing note: `[showing lines A-B of N in <path>; call read_file
  again with offset=B+1 to continue]`.
- Requesting an `offset` past the end of the file returns a plain
  message instead of an empty read.
- The tool description explicitly nudges the model to use `grep` or a
  small `limit` first on large files, rather than reading everything.

### `grep`

Results are capped at **`MAX_GREP_RESULTS` = 200** matches, formatted as
`path:line: content` (path relative to the project root, line content
trimmed). Binary/unreadable files are silently skipped.

### `shell`

Runs `sh -c "<command>"` with the project root as the working directory,
via `tokio::process::Command`, with a hard **30-second timeout**.
Combined stdout + (if non-empty) a `[stderr]` section + stderr, plus a
trailing `[exit code: N]` line, truncated like any other tool output.
This is a one-shot command runner for the agent, separate from the
interactive PTY terminal (see [terminal.md](./terminal.md)) — it doesn't
stream live output to the UI, only the final combined result once the
command exits.

## Permissions

`shell`, `edit_file`, and `write_file` require approval before doing
anything. `request_permission()` (`tools.rs`) generates a UUID, stores a
`tokio::sync::oneshot::Sender<bool>` for it in
`AppState.pending_permissions`, emits a `permission://request` event
with `{ id, kind: "shell" | "edit", title, detail }`, and `.await`s the
receiver — the whole tool call (and the agent loop) blocks until the
user responds.

`PermissionModal.tsx` listens for that event and renders:
- `shell` — the raw command in a monospace block.
- `edit` — a line-by-line diff (`+`/`-`/` ` prefixed, colored
  green/red/gray), built server-side by `diff_text()` using the
  `similar` crate (`TextDiff::from_lines`) — used for both `edit_file`
  and `write_file`.

Approve/Deny calls `respond_permission(id, approved)`, which looks up
and fires the stored oneshot sender. If denied, the tool returns a
plain-text "the user denied permission..." result (not an error) so the
model can adapt (e.g. ask the user what they'd prefer) rather than the
turn just failing.

There's currently no "always allow" / remembered-permission option —
every shell command and every edit is approved individually, every
time.
