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
Other file types open as plain text. The editor uses the code font and size
from **Settings > Fonts**; see [Fonts](./ui-shell.md#fonts).

## Save your changes

Edits are held in the open file until you save them. Use **Ctrl+S** on
Windows and Linux, or **Command+S** on macOS, to save the active file.

A small dot on a file tab means it has unsaved changes. Save before closing
the tab if you want to keep those changes; closing a tab does not provide a
separate unsaved-changes prompt.

## Comment on lines

You can leave review comments on a file's lines for the agent, like comments
on a pull request:

1. Hover the line numbers; a **+** appears beside the line under the pointer.
2. Select the **+** to comment on that line, or press it and drag up or down
   to comment on a range of lines.
3. Type your comment in the box that opens under those lines and select
   **Comment** (or press **Ctrl+Enter**). **Escape** cancels.

Comments show in the file under the lines they're on, and those lines are
highlighted. Use the pencil to edit a comment and the bin to delete it.
They're drafts until you send them with **Send review** in the chat; see
[Send a code review](./agent-chat.md#send-a-code-review). They belong to the
conversation, so a new thread's files can take comments once its first
message is sent.

When the file changes, a comment moves with its lines. If those lines are
edited, it's marked outdated and stays at its original line.

## Working alongside an agent

The editor is useful for the final review of an agent's work. Open the files
the agent touched, compare the result with what you asked for, and make
focused edits when needed. You can then save the file and ask the agent to
continue from the updated version.

If an agent or terminal command changes a file that is already open, the
editor loads the new version, unless you have unsaved edits in it: then it
keeps your copy (the tab's dot shows it) and the file tree still refreshes.
Save to overwrite the file with your copy, or close and reopen the tab to
load the version on disk.
