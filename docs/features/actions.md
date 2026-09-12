# Project Actions

Actions are named, project-scoped background commands such as `dev` →
`npm run dev`. Definitions live in `.ai-leash/actions.json` under the
project root, while process state and captured output remain in memory.

The Actions tab in the right-side panel lists each action and its state.
Users can add, edit, delete, start, and stop actions. Starting one opens
an attached terminal tab; opening an existing action tab replays buffered
output and follows the live PTY stream. A later run after stopping gets
a fresh process.

Output is retained in a 256 KiB ring buffer while the process is running
and for its most recent run, allowing a terminal tab to replay it.

The built-in agent exposes `create_action`, `list_actions`, `run_action`,
`read_action`, and `stop_action`. Creating an action is permission-gated
as an edit; running and stopping an existing, user-defined action do not
prompt again. ACP agents access the same operations through AI Leash's
local MCP bridge.
