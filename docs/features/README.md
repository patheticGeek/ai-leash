# ai-leash features

ai-leash is a local-first, dark-mode-only IDE built on Tauri, with a
built-in agent runtime that talks to Ollama and executes tools (shell,
file read/edit, search) with user permission gating.

This directory documents each feature area as it exists today:

- [Editor & file tree](./editor.md)
- [Terminal](./terminal.md)
- [Agent chat runtime](./agent-chat.md)
- [Default tools & permissions](./tools.md)
- [AGENTS.md, memory & skills](./context-and-memory.md)
- [UI shell & theme](./ui-shell.md)

Source layout, for reference while reading these docs:

```
src-tauri/src/
  main.rs        entry point
  lib.rs         Tauri app builder, command registration
  state.rs       shared AppState (project root, ptys, chat sessions, permissions, cancellations)
  commands.rs    project/fs Tauri commands, path-containment helper
  pty.rs         PTY-backed terminal commands
  chat.rs        Ollama-backed agent loop, streaming, tool dispatch
  tools.rs       default tool definitions + execution + permission requests
  context.rs     AGENTS.md / memory / skills loading

src/
  App.tsx                     layout composition
  store.ts                    zustand store (project root, open files, ollama status)
  lib/tauriApi.ts             typed wrappers around Tauri invoke
  components/Sidebar.tsx      file tree + open-folder
  components/EditorArea.tsx   CodeMirror editor + tabs
  components/TerminalPanel.tsx  xterm.js terminal
  components/ChatPanel.tsx    agent chat UI
  components/PermissionModal.tsx  shell/edit approval dialog
  components/StatusBar.tsx    project name + ollama status
```

This is a running build log, not a spec — if behavior in the code
diverges from what's written here, trust the code and update these docs.
