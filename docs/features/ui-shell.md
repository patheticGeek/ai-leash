# UI shell & theme

## Layout (`App.tsx`)

Three resizable regions, left to right — chat is the primary, central
surface; everything else (file tree, file editing, terminals, sub-agent
monitoring) lives in a multi-tab panel on the right:

```
+---------+---------------------------------+------------------------+
| ai leash|  CenterPanel tab strip          |  SidePanel tab strip   |
|   [+]   |  (Agent, always-open + one      |  (Files / Terminal 1 / |
|---------|   tab per opened sub-agent)     |   Sub Agents / ...) +  |
| project |                                 |  active tab's content  |
| list    |  active tab's content           |                        |
+---------+---------------------------------+------------------------+
|                         status bar                               |
+---------------------------------------------------------------------+
```

- `LeftBar.tsx` is the project switcher: a header row (`Logo` — an
  inline SVG rendering "ai" with a `linearGradient` fill and "leash" in
  plain text, plus a `+` button that opens the native folder-picker
  dialog and calls `store.openProject`) above a list of
  `store`'s `recentProjects`. Clicking a project row calls
  `openProject(path)` to switch to it (highlighted when it matches
  `projectRoot`). One row = one project = one conversation for now;
  wiring multiple named conversations per project is future work.
  `recentProjects: {path, name, title, lastMessageAt}[]` persists to
  `localStorage` (`ai-leash:recentProjects`), deduped by path — but
  *displayed* sorted by `lastMessageAt` descending (computed at render
  time in `LeftBar`, the stored array order doesn't matter). Merely
  opening/switching to a project (`openProject`) does **not** touch
  `lastMessageAt` or reorder anything; only `touchProjectActivity`
  does, called when a project's `chat://{path}/generating` event fires
  `true` (see "generating" in agent-chat.md below) — i.e. an actual
  chat turn starting, not just looking at a project. This was a
  deliberate fix: reordering on every switch made the sidebar
  reshuffle under you as you clicked around to look at things. A
  one-time migration in `loadRecentProjects()` seeds this list from the
  old single-project `ai-leash:lastProjectRoot` key (from before this
  sidebar existed) and removes that key. `restoreLastProject` (called
  once on app mount) opens whichever project has the highest
  `lastMessageAt` (0 if a project's never had one, i.e. never chatted
  in) rather than a dedicated last-project key; if that path fails to
  open (e.g. deleted/moved), it's dropped from the list.
  Each row (`ProjectRow`) shows the conversation title (or "New
  conversation") on its first line, the project name on its second line,
  and a small pulsing blue dot next to the title when
  `store.generatingSessions[path]` is true. A pulsing amber dot means a
  permission request is waiting for that project. Since `LeftBar`
  is always mounted, this reflects a project generating in the
  background even while you're looking at a different one (see
  ["generating" in agent-chat.md](./agent-chat.md#generating--is-a-session-busy-right-now)
  for where that state comes from).
  The custom title bar shows the same session as
  `<project name> / <conversation title>`; sub-agent center tabs use their
  own label while active.
- `CenterPanel.tsx` is the main, central column (no fixed width, no
  longer lives in a right-hand sidebar) and is itself a small tab
  strip: a permanent, non-closable `Agent` tab (`ChatPanel`, kept
  mounted — hidden via CSS, not unmounted — whenever another center
  tab is active, so its session/`sessionId` and in-flight streaming
  survive switching away) plus one closable tab per opened sub-agent
  conversation (`SubAgentChatTab.tsx`, read-only: no input box, no
  retry — a sub-agent can't be messaged further once spawned).
  `store`'s `chatTabs: ChatTab[]` + `activeChatTabId` track these;
  `subAgentThreads: Record<subSessionId, Entry[]>` holds each
  sub-agent's flat transcript, mirrored in parallel with the existing
  nested-under-tool-call thread by `ChatPanel`'s `subtask_start`
  handler (both read from the same shared helpers in
  `src/lib/chatEntries.ts` — `Entry`, `appendThinking`, `appendChunk`,
  `appendToolCall`, `applyToolResult` — extracted from `ChatPanel.tsx`
  so both consumers stay in sync off one implementation). Two ways to
  open a sub-agent's tab:
  - Clicking its row in the right `SidePanel`'s `Sub Agents` tab calls
    `openChatTab(subSessionId, description)` (dedupes by
    `` subagent:${subSessionId} ``, just activates if already open).
  - The instant a sub-agent spawns, `ChatPanel`'s `subtask_start`
    handler calls `openPanelTab("subagents")` to surface the right
    sidebar's `Sub Agents` tab automatically — not the center tab
    itself, which still requires a manual click, only the place you'd
    notice it running.
  Switching projects (`openProject`) resets `chatTabs` back to just
  `Agent` — a stale sub-agent tab from a different project's
  conversation showing up in the center pane would be the wrong
  context. `subAgentTasks`/`subAgentThreads` deliberately do **not**
  reset on project switch, though — the Sub Agents sidebar list is a
  cross-project history, not per-conversation state, so it doesn't
  empty out every time you switch away and back (a past bug). It's also
  no longer purely in-memory: `store.loadSubAgentTasks()` fetches every
  persisted sub-agent from SQLite (`list_sub_agents`, see
  [conversation-history.md](./conversation-history.md)) and merges in
  anything not already known locally (by `subSessionId`, so it can't
  clobber a live update), called once on `App` mount and again every
  time `SubAgentsTab` mounts. There's no age cap anymore — sub-agents
  are kept indefinitely. `SubAgentChatTab.tsx` does the equivalent for
  an individual transcript: if `subAgentThreads[subSessionId]` is
  `undefined` (never loaded — as opposed to `[]`, loaded but genuinely
  empty) it calls `load_conversation_history(subSessionId)` and converts
  the result with the same `messagesToEntries()` a top-level session's
  history hydration already uses.
- `SidePanel.tsx` (right) is a genuine multi-tab panel, not a
  fixed set of two tabs: `store`'s `panelTabs: PanelTab[]` +
  `activePanelTabId` track an arbitrary number of simultaneously open
  tabs of kind `filetree` | `subagents` | `terminal` | `file`.
  - `filetree` and `subagents` are singletons — opening one twice just
    activates the existing tab (id equals the kind itself).
  - `terminal` tabs are never deduped — each open creates a new
    `TerminalPanel` instance (own pty), id
    `` terminal:${crypto.randomUUID()} ``, labeled `Terminal N`.
  - `actions` is a singleton management tab. Starting an Action opens a
    separate `action:${actionId}` terminal tab attached to that Action's
    persistent PTY.
  - `file` tabs are deduped by path (id `` file:${path} ``) and driven
    by the existing `openFiles`/`activePath` state — `store.openFile`
    both loads the file's content (if not already loaded) and calls
    `openPanelTab("file", ...)` to add/focus its tab. Closing a file
    tab (`closePanelTab`) also drops it from `openFiles`.
  - When `panelTabs` is empty, or the tab strip's `+` button is
    clicked, `SidePanel` shows `TabPicker.tsx` — a grid of tiles (one
    per non-file kind) instead of tab content. Picking a tile calls
    `    `openPanelTab` and hides the picker. Actions are available from this
    grid alongside File Tree, Terminal, and Sub Agents.
  - All currently-open `terminal` tabs, and the (singleton) `filetree`
    tab if open, stay mounted (hidden via CSS, not unmounted)
    regardless of which tab is active — so pty sessions/scrollback and
    the file tree's expanded-folder state (local `useState` in
    `FileTree.tsx`'s `Node`) survive switching to another tab.
    `subagents` and `file` content is cheap to rebuild from store
    state on every activation, so those unmount when inactive.
  - `FileEditorTab.tsx` renders
    just the CodeMirror view for the currently active file — no
    internal per-file tab strip of its own, since the outer
    `SidePanel` tab strip already covers that.
  - **Tabs are remembered per project** (`store`'s
    `panelStateByConversation: Record<string, {panelTabs,
    activePanelTabId}>`, keyed by project path — doubling as a
    conversation id for now, since it's one conversation per project
    until multiple named conversations per project are wired up).
    `openProject` snapshots the outgoing project's `panelTabs`/
    `activePanelTabId` into this map before switching, then restores
    the incoming project's saved tabs (or starts empty, if it's never
    been opened this session). This is in-memory only — not persisted
    to `localStorage` — so it resets on app restart. Restoring doesn't
    resurrect the actual pty/component instances (those were already
    unmounted, killing their ptys, when you switched away) — `file`
    tabs get their content re-read from disk fresh (a since-deleted
    file just drops its tab silently), and `terminal` tabs reopen as
    brand-new shells under their old tab label/id.
- `LeftBar` and `SidePanel` widths are drag-resizable via
  `ResizeHandle.tsx` + the `useResizableWidth` hook
  (`src/hooks/useResizableWidth.ts`), which persists each width to
  `localStorage` (`ai-leash:leftBarWidth`, `ai-leash:rightPanelWidth`).
  Chat fills whatever space remains between them.

Permission requests are per-project, not a single app-wide overlay:
`PermissionPopover.tsx` renders inside `ChatPanel.tsx`, anchored above
that project's own textarea, only when `permissionForSession` (`store`)
resolves a pending request for the currently open session (or a sub-agent
it spawned). `LeftBar.tsx` is where the one global `permission://request`/
`permission://resolved` listener pair lives (mounted regardless of which
project is open, same as its existing `generating` listeners) — a project
awaiting approval in the background gets a pulsing amber glow on its
sidebar row (`ProjectRow`'s `awaitingApproval`) rather than being silently
invisible until you happen to switch to it. See
[tools.md](./tools.md#permissions).

The chat transcript groups consecutive thinking and tool-call entries
into one collapsed activity block. It shows the latest entry by default
and provides a `Show all (N thoughts, M tools used)` control, omitting
zero-count categories; expanding it reveals the complete activity run.

## Dark mode only

There is exactly one theme; no light mode, no toggle, no
`prefers-color-scheme` handling. This is enforced in a few places at
once rather than relying on any single mechanism:

- `index.html`: `<html class="dark" style="color-scheme: dark">` plus a
  `<meta name="color-scheme" content="dark">` tag.
- `index.css`: `:root { color-scheme: dark; }` and a small set of CSS
  variables (`--al-bg`, `--al-bg-raised`, `--al-bg-sunken`,
  `--al-border`, `--al-text`, `--al-text-dim`, `--al-accent`) — though
  in practice most components use raw Tailwind arbitrary-value classes
  (e.g. `bg-[#0b0c0e]`, `border-[#26272c]`) rather than these variables
  consistently.
- `tauri.conf.json`: the native window itself is configured with
  `"theme": "Dark"`, so the OS-level window chrome (title bar, etc.)
  matches too, not just the web content.
- Tailwind v4 is wired in via the `@tailwindcss/vite` plugin
  (`vite.config.ts`) rather than a `tailwind.config` + PostCSS setup.

Because no component ever applies a `dark:` variant or a light palette,
"dark mode only" isn't really a runtime mode switch — it's just the only
palette that exists in the codebase.

## Status bar

The status bar: aggregate connectivity across every configured provider
(Ollama + each saved OpenAI-compatible config), as "`N`/`M` providers
connected" with a colored dot — gray until at least one check has
returned, green if all are connected, amber if some are, red if none are.
Hovering the dot/text shows a per-provider tooltip (label + "checking…" /
"connected" / "disconnected"). Backed by the provider store's
`providerConnectivity`/`refreshProviderConnectivity` in the provider store (see
[agent-chat.md](./agent-chat.md) for the polling behavior and how this
differs from the active-provider-only `ollamaConnected` check).

## Window

From `tauri.conf.json`: product name "AI Leash", identifier
`dev.patheticgeek.aileash`, single window titled "AI Leash", default size
1400×900, minimum size 900×600.
