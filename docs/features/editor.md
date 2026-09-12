# Editor & file tree

## Opening a project

There is no auto-opened project on launch. The left project bar
(`src/app/LeftBar.tsx`) opens a native folder picker. Selecting a folder
calls `set_project_root` in `commands.rs`, which stores the path in
`AppState.project_root`. Every project-scoped command and agent tool
resolves paths against this root.

Opening a folder also resets state tied to the previous project:

- the store clears `openFiles` and `activePath`;
- `CenterPanel` remounts the chat for the new project;
- terminal tabs tear down their PTYs and respawn in the new folder.

## Path safety

`commands::resolve_within_root(root, requested)` is the single
containment check reused by filesystem commands and tools. It joins
relative paths to the root, canonicalizes the target (or its parent for
new files), and rejects anything outside the canonicalized root.

## File tree

`src/features/sidebar/tabs/FileTree.tsx` renders a lazy tree. The root
listing is fetched via `list_dir()` when the project opens, and each
directory fetches its children on first expand. The backend watches the
project recursively and emits a debounced `fs://changed` event, which
refreshes the root and expanded directory listings after agent edits,
terminal commands, builds, or external changes.

`list_dir` hides `.git`, `node_modules`, `target`, and `dist`, then sorts
directories first and names case-insensitively.

## Editor

`FileEditorTab.tsx` uses CodeMirror 6 with the `oneDark` theme. It
selects JavaScript/TypeScript, Python, Rust, JSON, HTML, and CSS modes
from the file extension; other files use plain text.

Open files live in the Zustand store:

- `openFile(path, name)` reads the file and makes it active;
- `updateContent(path, content)` runs on document changes and marks the
  file dirty;
- `saveActive()` writes the active file and clears its dirty flag;
- Ctrl/Cmd+S invokes `saveActive()`;
- closing a file removes it and selects the last remaining file.

There is no unsaved-changes warning on close. CodeMirror keeps its own
undo history, but an open editor buffer is not automatically replaced
when an agent or terminal changes the same file; the filesystem watcher
refreshes the tree only.
