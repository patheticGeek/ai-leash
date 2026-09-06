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
|                         StatusBar                                 |
+---------------------------------------------------------------------+
```

- `LeftBar.tsx` is the project switcher: a header row (`Logo` — an
  inline SVG rendering "ai" with a `linearGradient` fill and "leash" in
  plain text, plus a `+` button that opens the native folder-picker
  dialog and calls `store.openProject`) above a list of
  `store.ts`'s `recentProjects`. Clicking a project row calls
  `openProject(path)` to switch to it (highlighted when it matches
  `projectRoot`). One row = one project = one conversation for now;
  wiring multiple named conversations per project is future work.
  `recentProjects: {path, name}[]` persists to `localStorage`
  (`ai-leash:recentProjects`), most-recently-opened first, deduped by
  path — `openProject` both switches the project and moves it to the
  front of this list. A one-time migration in `loadRecentProjects()`
  seeds this list from the old single-project `ai-leash:lastProjectRoot`
  key (from before this sidebar existed) and removes that key.
  `restoreLastProject` (called once on app mount) now opens
  `recentProjects[0]` instead of a dedicated last-project key; if that
  path fails to open (e.g. deleted/moved), it's dropped from the list.
  Each row (`ProjectRow`) shows a small pulsing blue dot next to the
  name when `store.generatingSessions[path]` is true — since `LeftBar`
  is always mounted, this reflects a project generating in the
  background even while you're looking at a different one (see
  ["generating" in agent-chat.md](./agent-chat.md#generating--is-a-session-busy-right-now)
  for where that state comes from).
- `CenterPanel.tsx` is the main, central column (no fixed width, no
  longer lives in a right-hand sidebar) and is itself a small tab
  strip: a permanent, non-closable `Agent` tab (`ChatPanel`, kept
  mounted — hidden via CSS, not unmounted — whenever another center
  tab is active, so its session/`sessionId` and in-flight streaming
  survive switching away) plus one closable tab per opened sub-agent
  conversation (`SubAgentChatTab.tsx`, read-only: no input box, no
  retry — a sub-agent can't be messaged further once spawned).
  `store.ts`'s `chatTabs: ChatTab[]` + `activeChatTabId` track these;
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
  `Agent`, clears `subAgentThreads`, and clears `subAgentTasks` too —
  sub-agents belong to the conversation that spawned them, and it's
  one conversation per project for now (this also fixed a pre-existing
  leak where `subAgentTasks` was never scoped per project at all).
- `SidePanel.tsx` (right) is a genuine multi-tab panel, not a
  fixed set of two tabs: `store.ts`'s `panelTabs: PanelTab[]` +
  `activePanelTabId` track an arbitrary number of simultaneously open
  tabs of kind `filetree` | `subagents` | `terminal` | `file`.
  - `filetree` and `subagents` are singletons — opening one twice just
    activates the existing tab (id equals the kind itself).
  - `terminal` tabs are never deduped — each open creates a new
    `TerminalPanel` instance (own pty), id
    `` terminal:${crypto.randomUUID()} ``, labeled `Terminal N`.
  - `file` tabs are deduped by path (id `` file:${path} ``) and driven
    by the existing `openFiles`/`activePath` state — `store.openFile`
    both loads the file's content (if not already loaded) and calls
    `openPanelTab("file", ...)` to add/focus its tab. Closing a file
    tab (`closePanelTab`) also drops it from `openFiles`.
  - When `panelTabs` is empty, or the tab strip's `+` button is
    clicked, `SidePanel` shows `TabPicker.tsx` — a grid of tiles (one
    per non-file kind) instead of tab content. Picking a tile calls
    `openPanelTab` and hides the picker. Git-diff and an embedded
    browser are planned additions to this same grid in milestone 8.
  - All currently-open `terminal` tabs, and the (singleton) `filetree`
    tab if open, stay mounted (hidden via CSS, not unmounted)
    regardless of which tab is active — so pty sessions/scrollback and
    the file tree's expanded-folder state (local `useState` in
    `FileTree.tsx`'s `Node`) survive switching to another tab.
    `subagents` and `file` content is cheap to rebuild from store
    state on every activation, so those unmount when inactive.
  - `FileEditorTab.tsx` (replacing the old `EditorArea.tsx`) renders
    just the CodeMirror view for the currently active file — no
    internal per-file tab strip of its own, since the outer
    `SidePanel` tab strip already covers that.
  - **Tabs are remembered per project** (`store.ts`'s
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

`PermissionModal` is mounted at the top of `App.tsx` as a fixed overlay
(`fixed inset-0 z-50`) — it renders `null` when there's no pending
permission request, so it has no visual presence otherwise.

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

`StatusBar.tsx`:
- **Bottom-left**: the currently open folder's base name (last path
  segment), or the literal string `"ai-leash"` if no project is open.
- **Bottom-right**: live Ollama connection status with a colored dot —
  gray while unknown/checking, green when connected, red when a check
  has failed. Backed by `store.ts`'s `ollamaConnected`/`refreshOllama`
  (see [agent-chat.md](./agent-chat.md) for the polling behavior).

## Window

From `tauri.conf.json`: product name `ai-leash`, identifier
`dev.geek.ai-leash`, single window titled "ai-leash", default size
1400×900, minimum size 900×600.
