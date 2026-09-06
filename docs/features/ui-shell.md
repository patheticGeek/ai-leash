# UI shell & theme

## Layout (`App.tsx`)

Three resizable regions, left to right — chat is the primary, central
surface; everything else (file tree, file editing, terminals, sub-agent
monitoring) lives in a multi-tab panel on the right:

```
+------+---------------------------------+------------------------+
| Left |                                 |  SidePanel tab strip   |
| Bar  |          ChatPanel              |  (Files / Terminal 1 / |
| empty|          (flex-1)               |   Sub Agents / ...) +  |
|      |                                 |  active tab's content  |
+------+---------------------------------+------------------------+
|                         StatusBar                                 |
+---------------------------------------------------------------------+
```

- `LeftBar.tsx` is intentionally empty for now — a placeholder strip
  reserved for a future icon-based activity bar.
- `ChatPanel` is the main, central column (no fixed width) — it no
  longer lives in a right-hand sidebar.
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
  - All currently-open `terminal` tabs stay mounted (hidden via CSS,
    not unmounted) regardless of which tab is active, so their pty
    sessions and scrollback survive switching away; `filetree`,
    `subagents`, and `file` content is cheap to remount from store
    state, so only the active one is rendered.
  - `FileEditorTab.tsx` (replacing the old `EditorArea.tsx`) renders
    just the CodeMirror view for the currently active file — no
    internal per-file tab strip of its own, since the outer
    `SidePanel` tab strip already covers that.
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
