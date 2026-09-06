# Editor & file tree

## Opening a project

There's no auto-opened project on launch. The sidebar (`Sidebar.tsx`)
shows an "Open Folder" button until one is picked via the native folder
dialog (`@tauri-apps/plugin-dialog`, `open({ directory: true })`).

Selecting a folder calls the `set_project_root` Tauri command
(`commands.rs`), which stores the path in `AppState.project_root`
(a `Mutex<Option<PathBuf>>`). Every other project-scoped command
(`list_dir`, `read_file_text`, `write_file_text`, and all agent tools)
resolves paths against this root.

Opening a folder also resets other state tied to the previous project:

- `store.ts`'s `setProjectRoot` clears `openFiles`/`activePath`.
- `App.tsx` remounts `ChatPanel` by keying it on `projectRoot`, which
  wipes the chat session, its `sessionId`, and its message history.
- `TerminalPanel` tears down its PTY and respawns a fresh shell rooted
  at the new folder (its effect depends on `projectRoot`).

## Path safety

`commands::resolve_within_root(root, requested)` is the single
containment check reused by every fs-touching command and tool. It
joins the requested path onto the root (if relative), canonicalizes it
(or its parent, for not-yet-existing files), and rejects anything that
doesn't start with the canonicalized root. This is what stops both the
editor's own read/write commands and the agent's `read_file`/`edit_file`/
`write_file`/`grep`/`list_dir` tools from escaping the project directory
(e.g. via `../../etc/passwd`).

## File tree

`Sidebar.tsx` renders a lazy tree: the root listing is fetched via
`list_dir()` with no path when the project opens, and each directory
node fetches its own children on first expand (cached in local
component state after that — it doesn't currently watch the filesystem
for external changes).

`list_dir` (`commands.rs`) hides `.git`, `node_modules`, `target`, and
`dist` (see `IGNORED_NAMES` in `commands.rs`), sorted directories-first
then alphabetically (case-insensitive).

## Editor

`EditorArea.tsx` uses CodeMirror 6 (`codemirror` meta package +
`@codemirror/lang-*` packages) with the `oneDark` theme. Language is
picked from the file extension in `languageFor()`: `ts`/`tsx`/`js`/`jsx`
→ `javascript()` (with `typescript`/`jsx` flags set appropriately),
`py` → `python()`, `rs` → `rust()`, `json` → `json()`, `html` → `html()`,
`css` → `css()`; anything else gets no language extension (plain text
highlighting only).

Open files live in the zustand store (`store.ts`), not in the editor
component:

- `openFile(path, name)` — reads the file via `read_file_text` and adds
  it to `openFiles` if not already open, then makes it active.
- `updateContent(path, content)` — called from CodeMirror's
  `updateListener` on every doc change; marks the file `dirty: true`.
- `saveActive()` — writes the active file via `write_file_text` and
  clears its dirty flag. Bound to Ctrl/Cmd+S in `EditorArea.tsx`.
- `closeFile(path)` — removes a tab; if it was active, falls back to the
  last remaining open file (or `null`).

There's no unsaved-changes warning on close, and no editor-side
diffing/undo integration with the agent's own edits — if the agent edits
a file that's open in a tab, the tab won't reflect the new content until
you close and reopen it (or the editor is reloaded).
