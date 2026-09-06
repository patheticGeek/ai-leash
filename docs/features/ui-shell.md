# UI shell & theme

## Layout (`App.tsx`)

Fixed three-pane layout, no resizable dividers yet:

```
+----------+---------------------------+------------------+
| Sidebar  |  EditorArea (flex-[3])    |                  |
| (w-56)   +---------------------------+  ChatPanel       |
|          |  TerminalPanel (flex-[2]) |  (w-96)          |
+----------+---------------------------+------------------+
|                    StatusBar                             |
+------------------------------------------------------------+
```

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
