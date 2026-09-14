# Browse and edit files

The file tree and editor give you a quick way to inspect and make small
changes to the files in the checkout you are working with. This is useful
when an agent is working on a task: you can see the files it is changing,
review its work, and make a correction or adjustment yourself without
leaving the conversation.

## Browse your files

Open the file panel to see the folders and files available to the active
conversation. Select the arrow beside a folder to expand or collapse it.
Select a file to open it in the editor.

The tree keeps the usual project clutter out of the way, including dependency,
build, and version-control folders. It also updates when files are changed by
the agent, a terminal command, or another program, so newly created or
modified files appear without requiring you to restart the app.

## Open and edit a file

When you select a file, it opens in a tab in the side panel. You can:

- Read the file without switching away from the chat.
- Edit its contents directly.
- Keep multiple files open and switch between their tabs.
- Close a file with the **×** on its tab.

Common programming and data files receive helpful syntax highlighting,
including JavaScript and TypeScript, Python, Rust, JSON, HTML, and CSS.
Other file types open as plain text.

## Save your changes

Edits are held in the open file until you save them. Use **Ctrl+S** on
Windows and Linux, or **Command+S** on macOS, to save the active file.

A small dot on a file tab means it has unsaved changes. Save before closing
the tab if you want to keep those changes; closing a tab does not provide a
separate unsaved-changes prompt.

## Working alongside an agent

The editor is useful for the final review of an agent's work. Open the files
the agent touched, compare the result with what you asked for, and make
focused edits when needed. You can then save the file and ask the agent to
continue from the updated version.

If an agent or terminal command changes a file that is already open, the
editor keeps the copy currently open while the file tree refreshes. Close and
reopen the file to load the latest version from disk, taking care first to
save any edits you want to keep.
