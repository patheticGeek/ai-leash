# AI Leash features

AI Leash is a desktop agentic harness built on Tauri.
It provides a built-in agent runtime that executes tools (shell, file
read/edit, search) with user permission gating, plus an alternative
backend for driving an external ACP agent subprocess. The runtime can
connect to different model providers, including Ollama and
OpenAI-compatible services.

This directory documents each feature area as it exists today:

- [Editor & file tree](./editor.md)
- [Terminal](./terminal.md)
- [Agent chat runtime](./agent-chat.md)
- [Conversation history (SQLite)](./conversation-history.md)
- [Default tools & permissions](./tools.md)
- [AGENTS.md, memory & skills](./context-and-memory.md)
- [UI shell & theme](./ui-shell.md)
- [Crash logging](./crash-logging.md)

Source layout, for reference while reading these docs:

```
src-tauri/src/
  main.rs        entry point
  lib.rs         Tauri app builder, command registration
  state.rs       shared AppState (project root, ptys, chat sessions, permissions, cancellations, db)
  commands.rs    project/fs Tauri commands, path-containment helper
  pty.rs         PTY-backed terminal commands
  chat.rs        built-in agent loop, streaming orchestration, tool dispatch
  provider.rs    Provider abstraction (Ollama + OpenAI-compatible HTTP backends)
  acp.rs         external ACP agent subprocess backend (alternative to chat.rs's loop)
  env.rs         one-shot startup fixup for PATH (via fix-path-env) before spawned children start
  crashlog.rs    panic hook + durable crash log file, also accepts frontend-reported crashes
  tools.rs       default tool definitions + execution + permission requests
  context.rs     AGENTS.md / memory / skills loading
  db.rs          SQLite-backed conversation history (save/load, schema)

src/
  main.tsx                         React root; installs crash reporting, wraps App in ErrorBoundary
  App.tsx                          layout composition, resizable regions
  store.ts                         zustand store (project root, panel tabs, chat tabs, sub-agents, ollama status)
  lib/tauriApi.ts                  typed wrappers around Tauri invoke
  lib/chatEntries.ts               shared chat entry types + accumulation/replay helpers
  lib/crashReporting.ts            forwards uncaught errors/rejections/React crashes to the backend crash log
  hooks/useResizableWidth.ts       drag-resize width hook (persists to localStorage)
  components/Logo.tsx              thin wrapper rendering assets/logo.svg (a static vector wordmark, not live text), sized via className — used by LeftBar.tsx and SettingsModal.tsx's About section
  components/LeftBar.tsx           project switcher (logo, + to open, recent projects)
  components/SidePanel.tsx         multi-tab right panel (file tree / files / terminals / sub agents)
  components/FileTree.tsx          file tree (a SidePanel tab)
  components/FileEditorTab.tsx     CodeMirror editor (a SidePanel tab)
  components/TerminalPanel.tsx     xterm.js terminal (a SidePanel tab; one instance per open terminal)
  components/TabPicker.tsx         "open a tab" tile grid shown when SidePanel has no tabs open
  components/CenterPanel.tsx       center tab strip (permanent Agent tab + sub-agent tabs)
  components/ChatPanel.tsx         the primary agent chat UI
  components/ModelPickerPopover.tsx  search-and-pick popover shared by the backend/model and ACP-model pickers in ChatPanel.tsx
  components/SubAgentChatTab.tsx   read-only sub-agent transcript (a CenterPanel tab)
  components/Markdown.tsx          react-markdown + remark-gfm renderer for assistant/sub-agent text
  components/SubAgentsTab.tsx      running/finished sub-agents list (a SidePanel tab)
  components/PermissionPopover.tsx  shell/edit/ACP approval box popover, anchored above ChatPanel.tsx's textarea
  components/SettingsModal.tsx     side-nav settings dialog; "Providers" (agent backend, Ollama host, OpenAI-compatible config), "Crash log", and "About" sections
  components/StatusBar.tsx         aggregate connected/total across all configured providers
  components/ErrorBoundary.tsx     catches render-time crashes app-wide, reports + shows a fallback instead of a white screen
```

This is a running build log, not a spec — if behavior in the code
diverges from what's written here, trust the code and update these docs.
