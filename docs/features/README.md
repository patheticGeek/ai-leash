# AI Leash features

AI Leash is a desktop agentic harness built on Tauri. It provides a
built-in agent runtime with permission-gated tools and an alternative
backend for driving an external ACP agent subprocess. The runtime can
connect to Ollama and OpenAI-compatible services.

Feature documentation:

- [Editor & file tree](./editor.md)
- [Terminal](./terminal.md)
- [Agent chat runtime](./agent-chat.md)
- [Conversation history (SQLite)](./conversation-history.md)
- [Default tools & permissions](./tools.md)
- [Project Actions](./actions.md)
- [AGENTS.md, memory & skills](./context-and-memory.md)
- [UI shell & theme](./ui-shell.md)
- [Crash logging](./crash-logging.md)

## Source layout

```text
src-tauri/src/
  main.rs        entry point
  lib.rs         Tauri app builder, command registration, and MCP bridge
  state.rs       shared AppState (project, PTYs, actions, sessions, permissions, db)
  commands.rs    project/fs commands, containment, and filesystem watcher
  pty.rs         PTY-backed terminal and action process commands
  chat/          built-in loop, streaming, history, and sub-agents
  provider/      Ollama and OpenAI-compatible HTTP backends
  acp/           external ACP agent subprocess backend
  actions.rs     project-scoped named background commands
  tools/         tool schemas, execution, permissions, and sub-agents
  context.rs     AGENTS.md / memory / skills loading
  db/            conversation, ACP-session, and sub-agent persistence

src/
  main.tsx       React root, crash reporting, and ErrorBoundary
  app/           shell layout, title bar, project bar, and center panel
  features/      chat, sidebar, and settings feature modules
  store/         Zustand slices for app state
  lib/           typed Tauri wrappers, chat entries, and crash reporting
  ui/            shared UI primitives and theme components
  hooks/         reusable frontend hooks
```

This is a running build log, not a spec. If behavior in the code
diverges from what's written here, trust the code and update these docs.
