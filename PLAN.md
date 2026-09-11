# PLAN: splitting up AI Leash's monolithic modules

## Problem

AI Leash is a Tauri v2 agentic harness, and it's grown the way harnesses
grow: each new capability (ACP agents, sub-agents, Actions, permission
modes, memory/skills, the model picker) got bolted onto whichever file
already touched that area. The result is a handful of files that mix
several unrelated concerns and are now hard to extend without wading
through code you don't need to read:

| File                          | Lines | Mixes together                                                                                         |
| ------------------------------ | ----: | -------------------------------------------------------------------------------------------------------- |
| `src/components/ChatPanel.tsx` |  1685 | streaming/rendering, tool-call/thinking entries, model+agent picker, permission popover, slash commands, retry/compact, context-usage ring |
| `src/store.ts`                 |  1149 | project/files, provider settings, ACP config, permission mode, sub-agent tasks, panel/chat tabs, project activity |
| `src-tauri/src/tools.rs`       |  1221 | tool schemas, fs tools, shell tool, sub-agent tool arms, Actions tool arms, permission request/response |
| `src-tauri/src/acp.rs`         |   908 | subprocess lifecycle, event→`chat://` mapping, permission bridging, model/command discovery             |
| `src-tauri/src/provider.rs`    |   860 | provider config/enum, connectivity checks, Ollama streaming, OpenAI-compatible SSE streaming             |
| `src-tauri/src/chat.rs`        |   791 | command handlers, the agent loop, sub-agent spawn/resume, clear/compact                                   |
| `src/components/SettingsModal.tsx` | 551 | provider config, ACP agent list, crash-log viewer, About                                               |

Every one of these is a "God file" for its area: to add one more tool,
provider, ACP capability, or settings tab, you edit a file that already
does five other things, with no seam to hang the new code on. This plan
restructures each into small, single-concern modules connected through
a couple of explicit **registries**, so new features are additive (new
file + one registration line) instead of edits to a growing switch
statement.

This is a pure internal refactor — behavior stays identical. No new
features, no UI layout changes. Where SidePanel tab work is mentioned
below it's only to make sure this refactor doesn't box in the
milestone-8 git-diff/browser-tab work that's already planned on top of
it.

## Guiding principles

1. **One concern per file.** A file should be describable in one
   clause. If the description needs "and", split it.
2. **Registries over switch statements.** Anywhere the current code
   has a big `match`/`if` chain that grows with every new
   tool/provider/tab/settings-section, replace it with a list of
   small self-registering units + one dispatcher that iterates the
   list. Adding a feature becomes "add a file, add one line," not
   "find the right spot in a 1000-line match."
3. **Orchestrators stay thin.** `ChatPanel.tsx`, `tools::execute_tool`,
   `chat::run_agent_loop` etc. remain the entry points, but they
   delegate to extracted units instead of inlining logic.
4. **No behavior change in this pass.** Splitting is mechanical:
   move code, keep signatures, keep event/IPC shapes
   (`chat://...`, `invoke()` commands) exactly as documented in
   `ARCHITECTURE.md` §4. A second pass can clean up internals once
   the seams exist.
5. **Validate at every step**, not just at the end: `cargo check`
   after each Rust module split, `tsc && vite build` (plus `biome
   check`) after each frontend split. Per the project's UI-change
   convention, no manual app launch/screenshot verification is
   needed for this refactor — it's structural, not visual.

## Target layout — Rust backend (`src-tauri/src/`)

```
src-tauri/src/
  main.rs
  lib.rs
  state.rs
  crashlog.rs
  env.rs
  commands.rs
  pty.rs
  actions.rs
  db/
    mod.rs            # connection setup, WAL, migrations
    conversations.rs
    messages.rs
    sub_agents.rs
  provider/
    mod.rs            # ProviderConfig enum, ProviderError, stream_turn() dispatch, registry
    ollama.rs          # complete_ollama, stream_turn_ollama, list_ollama_models
    openai_compat.rs   # complete_openai, stream_turn_openai, OpenAiAccum
  chat/
    mod.rs             # send_prompt, retry_last, cancel_prompt, clear/compact commands
    agent_loop.rs       # run_agent_loop, run_with_cancellation
    sub_agents.rs        # spawn_sub_agent, run_sub_agent, resume_after_background_subtask
    history.rs          # load_conversation_history, list/delete_sub_agent
  tools/
    mod.rs             # ToolDef registry + execute_tool() dispatcher
    schema.rs           # tool_definitions() JSON schemas
    fs_tools.rs          # read_file, edit_file, write_file, list_dir, grep
    shell_tools.rs        # run_shell, run_shell_command
    memory_tools.rs        # update_memory, load_skill arms (delegate into context.rs)
    sub_agent_tools.rs      # spawn_sub_agent, list_sub_agents, read_sub_agent arms
    action_tools.rs          # Actions tool arms
    permissions.rs             # request_permission, respond_permission, set_permission_mode
  acp/
    mod.rs             # send_prompt_acp, set_acp_model, fetch_acp_models (public commands)
    process.rs           # ensure_acp_session, run_acp_session, subprocess lifecycle
    events.rs              # handle_session_notification, emit_tool_call(_update), persist_*
    permissions.rs           # bridge_acp_permission, select_permission_option
    discovery.rs               # mcp_servers_for, model/command option payloads
  context.rs
  mcp_bridge/
    mod.rs
    server.rs
    client.rs
```

### Key seams

- **`tools/mod.rs` becomes a registry**, not a hand-rolled match on
  ~15 tool names:

  ```rust
  pub struct ToolHandler {
      pub name: &'static str,
      pub schema: fn() -> serde_json::Value,
      pub execute: fn(ToolCtx<'_>, serde_json::Value) -> BoxFuture<'_, Result<String, String>>,
  }

  pub fn registry() -> &'static [ToolHandler] { &[
      fs_tools::READ_FILE, fs_tools::EDIT_FILE, fs_tools::WRITE_FILE,
      fs_tools::LIST_DIR, fs_tools::GREP,
      shell_tools::SHELL,
      memory_tools::UPDATE_MEMORY, memory_tools::LOAD_SKILL,
      sub_agent_tools::SPAWN_SUB_AGENT, sub_agent_tools::LIST_SUB_AGENTS, sub_agent_tools::READ_SUB_AGENT,
      action_tools::RUN_ACTION, action_tools::STOP_ACTION, /* ... */
  ]}
  ```

  `tool_definitions()` and `execute_tool()` both become "iterate the
  registry", so a brand-new tool is one new file exporting a
  `ToolHandler` plus one line in `registry()` — nothing else in the
  codebase changes. This is the change that most directly serves "more
  features stuffed in one file": today every new tool is a new match
  arm in the same 1221-line file.

- **`provider/mod.rs` becomes a small provider registry** behind
  `ProviderConfig`, so a third provider shape (e.g. Anthropic-native,
  Bedrock) is a new file implementing `stream_turn`/`complete`/
  `list_models`, not a third branch threaded through every function in
  today's `provider.rs`.

- **`acp/discovery.rs`** isolates the ACP-specific "what
  models/commands does this external agent expose" logic, which is
  the part most likely to need new cases per external agent
  (Copilot CLI vs. Claude Code vs. future ACP agents).

## Target layout — frontend (`src/`)

Today everything lives flat in one `src/components/` folder (24 files,
no grouping — a "swamp folder" by the time you're hunting for one
component among unrelated ones). Replace it with **feature folders**:
each feature owns its own components + hooks in one place, sidebar
tabs live under one predictable path, and only genuinely generic,
domain-free presentational components go in `src/ui/`. Nothing goes
directly in a bare `components/` folder anymore — that folder is
deleted.

```
src/
  app/                        # composition root / window chrome — not a "feature", the shell around them
    App.tsx
    TitleBar.tsx
    TitleBarActions.tsx
    LeftBar.tsx
    CenterPanel.tsx
  features/
    chat/
      ChatPanel.tsx             # thin orchestrator
      SubAgentChatTab.tsx         # shares rendering with ChatPanel via components/ below
      components/
        ChatEntryList.tsx          # renders Entry[] (message/tool-call/thinking) — shared
        ChatEntryRenderer.tsx        # one Entry -> JSX, used by both ChatPanel & SubAgentChatTab
        ChatInputBar.tsx               # textarea, slash-command autocomplete, send/stop
        ContextUsageRing.tsx             # usage ring + popover
        SlashCommandMenu.tsx               # slash command list/dismiss/index state
        ModelPickerPopover.tsx
        PermissionModePopover.tsx
        PermissionPopover.tsx
      hooks/
        useChatSession.ts                    # session id, kind (builtin/acp), model/agent choice
        useChatStream.ts                        # chat:// event listeners -> entries/usage/done
    sidebar/
      SidePanel.tsx              # tab-registry-driven shell (see below)
      TabPicker.tsx
      tabKinds.ts                  # PanelTabKind registry — the one lookup table SidePanel reads
      tabs/
        FileTree.tsx
        FileEditorTab.tsx
        TerminalPanel.tsx
        SubAgentsTab.tsx
        ActionsTab.tsx
        ActionTerminalTab.tsx
      # milestone-8 additions land here later: tabs/GitDiffTab.tsx, tabs/BrowserTab.tsx
    settings/
      SettingsModal.tsx          # tab shell only
      tabs/
        ProviderSettingsTab.tsx
        AcpSettingsTab.tsx
        CrashLogTab.tsx
        AboutTab.tsx
    actions/
      useActions.ts              # shared domain hook — imported by both
                                  # features/sidebar/tabs/ActionsTab.tsx and app/TitleBarActions.tsx
  ui/                          # generic, feature-agnostic presentational components
    Button.tsx
    ResizeHandle.tsx
    Logo.tsx
    ErrorBoundary.tsx
    Markdown.tsx
  store/
    index.ts                    # combineSlices() — the exported useAppStore
    projectSlice.ts
    providerSlice.ts
    acpSlice.ts
    permissionSlice.ts
    subAgentSlice.ts
    panelSlice.ts
  hooks/
    useResizableWidth.ts        # generic, layout-only — used by app/ shell, not feature-specific
  lib/
    tauriApi.ts
    chatEntries.ts                # shared Entry union + accumulation helpers (pure, no JSX)
    crashReporting.ts
```

Rule of thumb for where a new file goes: if it's pure layout chrome
around everything else, it's `app/`; if it renders inline user-facing
content with zero app knowledge, it's `ui/`; if it belongs to one
capability (chat, sidebar, settings, actions, and later e.g. git-diff),
it's `features/<name>/`, with that feature's own `components/`
and/or `hooks/` subfolder once it has more than one file of either.
`store/` and `lib/` stay flat, feature-agnostic infrastructure — they
hold state/types shared *across* features, not any one feature's UI.

### Key seams

- **`store/` becomes zustand slices** combined in `store/index.ts`
  (standard zustand slice pattern — each slice is
  `StateCreator<AppStore, [], [], ProjectSlice>` etc., composed with
  `create<AppStore>()((...a) => ({ ...projectSlice(...a), ...providerSlice(...a), ... }))`).
  `AppStore` stays one type (nothing that reads `useAppStore` changes),
  but a new feature's state (say, git-diff tab state) lands in its own
  new slice file instead of growing `store.ts` further. This directly
  extends the path the milestone-8 SidePanel plan already assumes.

- **`features/sidebar/tabKinds.ts` is the tab registry.** Today's
  implied shape (`TabPicker` + a set of hand-listed tab kinds in
  `SidePanel.tsx` and `store.ts`) is exactly what the milestone-8 note
  describes extending for git-diff/browser tabs. Formalize it now:

  ```ts
  interface PanelTabKind {
    kind: string;                 // "file" | "terminal" | "sub-agent" | "action" | ...
    render: (tab: PanelTab) => React.ReactNode;
    label: (tab: PanelTab) => string;
    icon: React.ComponentType;
  }
  const PANEL_TAB_KINDS: Record<string, PanelTabKind> = { file: ..., terminal: ..., ... };
  ```

  `SidePanel.tsx` looks up `PANEL_TAB_KINDS[tab.kind]` instead of a
  hand-written switch. Adding the git-diff/browser tabs from milestone
  8 becomes: one new file under `features/sidebar/tabs/`, one new
  `PanelTabKind` entry in `tabKinds.ts`, no edits to `SidePanel.tsx`
  itself. (This is a structural change only — no new tabs, no layout
  change, so it doesn't need the ask-before-building wireframe step;
  that applies when the git-diff/browser tabs themselves get designed.)

- **`features/actions/useActions.ts` is a feature that spans two
  physical locations.** The Actions *domain logic* (define/run/stop
  named background commands) is one hook shared by the sidebar tab
  that lists them (`features/sidebar/tabs/ActionsTab.tsx`) and the
  title-bar run/stop shortcut (`app/TitleBarActions.tsx`). Keeping the
  hook in `features/actions/` and letting both UI locations import it
  is the intended shape — "one folder per feature" describes where
  domain logic and its *own* UI lives, not a rule that a feature can
  only ever render in one place.

- **`ChatEntryRenderer.tsx` gets extracted and shared** between
  `ChatPanel.tsx` and `SubAgentChatTab.tsx` via `features/chat/components/`,
  which today independently render the same `Entry` union
  (message/tool-call/thinking) — one rendering path instead of two
  copies that can drift.

- **`ChatPanel.tsx` shrinks to an orchestrator**: session setup via
  `useChatSession`, streaming via `useChatStream`, and JSX composed
  from `ChatEntryList` + `ChatInputBar` + `ContextUsageRing` +
  the existing popovers (`ModelPickerPopover`, `PermissionModePopover`,
  `PermissionPopover` move into `features/chat/components/` as-is,
  they're already correctly scoped to chat).

## What does *not* change

- `ARCHITECTURE.md` §4 (the `invoke()` command list and `chat://`
  event shapes) — untouched. This is a file/module reorg, not an
  API change.
- `db.rs`'s actual schema, `mcp_bridge`'s wire protocol, `pty.rs`,
  `context.rs`, `commands.rs`, `actions.rs` (Rust `actions.rs`, the
  backend command runner — distinct from the frontend
  `features/actions/` hook) — already reasonably single-concern at
  their current size; left alone.
- Small frontend files (`Button.tsx`, `ResizeHandle.tsx`, etc.) —
  already fine internally, just relocated into `ui/`.

## Phases

Each phase is independently shippable and independently validated
(`cargo check` / `tsc && vite build` / `biome check`), so this doesn't
need to land as one giant PR.

1. **Rust: `tools/` split + registry.** Highest leverage — this is
   the file most new backend features (new tools) will touch.
2. **Rust: `provider/` split + registry.**
3. **Rust: `acp/` split.**
4. **Rust: `chat/` split.**
5. **Rust: `db/` split by table** (lower priority — 657 lines is
   tolerable, but do it for symmetry with `conversations`/`messages`/
   `sub_agents` growing independently, e.g. Actions history later).
6. **Frontend: `store/` slice split.** Do this before the ChatPanel
   split so the new hooks can pull from typed slices.
7. **Frontend: folder move** — introduce `app/`, `features/*/`,
   `ui/`, delete `src/components/`; pure file moves + import-path
   updates, no logic changes, do this before phases 8-10 so they land
   directly in the right place instead of moving twice.
8. **Frontend: `features/sidebar/tabKinds.ts` tab registry.** Unblocks
   milestone-8 tab work cleanly.
9. **Frontend: `features/chat/` split** (hooks + subcomponents +
   shared `ChatEntryRenderer`).
10. **Frontend: `features/settings/` tab split.**

Update `ARCHITECTURE.md`'s module tables/diagrams once each phase
lands, since it's documented as the source of truth for layout.

Status: all 10 phases complete as of 2026-09-11.
