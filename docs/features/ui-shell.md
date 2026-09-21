# The AI Leash workspace

AI Leash is arranged as a conversation workspace with three main areas:

```text
+----------------+----------------------------+----------------------+
| Conversations  | Chat                       | Tools and files      |
|                |                            |                      |
|                |                            |                      |
+----------------+----------------------------+----------------------+
|                |                            |                      |
+----------------+----------------------------+----------------------+
```

The top bar shows the current project and conversation. It also includes a
button for starting a new thread, an **Open** button for your external
editor (see [Open in IDE](#open-in-ide)), the quick-run control for
[Actions](./actions.md), and the window controls. The center of the
window is where you chat with the agent. The panel on the right contains
project tools such as files and terminals.

## Choosing a project and conversation

The left sidebar lists your conversations. Each entry shows its conversation
title and the project or workspace it belongs to. The active conversation is
highlighted.

Use the project menu at the top of the sidebar to switch between:

- **All projects**, which shows conversations from every project.
- An individual project, which shows only conversations for that project.

To add another project, click the **+** button and choose a folder. You can
then open one of its existing conversations from the sidebar or start a new
thread in that project with the new-thread button in the top bar.

Conversations that you have marked as done appear in a separate **Done**
section. You can expand that section to see the full list, reopen a completed
conversation, or mark it as active again. To delete a conversation, open its
context menu from the conversation entry.

The sidebar can show activity while you are viewing another conversation. A
working indicator means the agent is still processing that conversation. An
approval indicator means that conversation is waiting for you to approve a
requested action. Switch to it to review the request; see
[Permissions](./tools.md#why-permission-prompts-appear) for more about approvals.

## The chat area

The **Agent** tab is the main conversation. When the agent starts a
sub-agent, you can open that sub-agent's conversation in its own center tab
from the **Sub Agents** panel. Sub-agent conversations are read-only, so they
are useful for following the work without interrupting it.

You can switch between the Agent tab and any open sub-agent tabs at the top of
the chat area. Sub-agent tabs can be closed when you no longer need them.

Code blocks in the conversation have a header showing the language and a copy
button. Shell code blocks also have an **Open in a new terminal** button. It
opens a terminal tab with the command typed at the prompt but not run, so you
can review or edit it before pressing **Enter**.

### Worktree and branch

For projects in a git repository, a bar below the message box shows which
worktree the conversation is working in (on the left) and which branch is
checked out there (on the right). Click either one to open a picker. Both
pickers have a search box; use the arrow keys to move through the list and
**Enter** to choose an entry.

- **Worktree** lists the project's primary checkout and any other worktrees.
  Choose one to work in it, or select **New worktree…** at the bottom of the
  list to create one on a new branch (based on a branch you choose) or on an
  existing branch that is not already checked out elsewhere. The worktree is
  fixed once you send the conversation's first message; after that the list
  can still be browsed but not changed.
- **Branch** lists the branches of the current worktree. Choose one to switch
  to it, or select **New branch…** to create a branch from a base branch and
  switch to it. The branch can be changed at any time.

To delete a worktree or branch, click the trash icon on its row and confirm.
The active worktree and the currently checked-out branch cannot be deleted.
If git refuses because a worktree has uncommitted changes or a branch is not
fully merged, the picker shows git's message and offers **Force delete**.

## The right-hand tool panel

The right-hand panel has its own tabs. Click a tab to switch tools, click its
close button to remove it, and use the **+** button to open another tab. If no
tab is open, AI Leash displays the tab chooser automatically.

### Tabs are remembered per conversation

Each conversation keeps its own set of open tabs, both in the right-hand panel
and in the chat area (its sub-agent tabs), along with which one was active.
Switching to another conversation shows that conversation's tabs, and they
are restored the next time you open it, even after restarting the app.
Terminal tabs reopen with a fresh shell rather than the previous session. A
new thread that has not had a message sent yet is not remembered.

### File Tree

**File Tree** lets you browse the files and folders in the current project.
Select a file to open it in an editor tab. Files opened from the tree appear
alongside the other tabs in this panel. A small marker on a file tab indicates
that the file has unsaved changes.

### File editor

Opening a file adds it as a tab in the right-hand panel. Use the editor to
read or change the file, then close its tab when you are finished. Opening a
file that is already open takes you to its existing tab instead of creating a
duplicate.

### Terminal

Choose **Terminal** to open a shell in the current project. You can open more
than one terminal; each terminal keeps its own session and scrollback while
you switch between tabs.

### Sub Agents

The **Sub Agents** tab lists the sub-agent tasks created for the current
conversation. Each entry shows whether the task is running, finished, or
ended with an error, along with its duration. Select an entry to open its
conversation in the center area.

While a sub-agent is running, you can stop it from this list. Finished
sub-agent entries can be removed from the list.

### Actions

**Actions** contains the reusable actions available for the project. Use it
to run and manage those actions. When an action runs, AI Leash opens a
separate terminal tab for its output so you can keep an eye on it without
losing your other terminal sessions.

## Resizing the workspace

Drag the dividers between the conversation sidebar, chat area, and right-hand
panel to change their widths. AI Leash remembers those widths for the next
time you use the app.

## Appearance

AI Leash uses a dark appearance throughout the app, including the window
controls, chat, editors, and terminals. There is currently no light theme or
appearance switch. You can change the fonts and text sizes under
[Preferences](#preferences), and adjust the panel widths as described above.

## Preferences

**Settings > Preferences** collects the app's personal settings in four
sections. Changes apply immediately and are remembered.

- **Chat**: turn on **Compose mode** to make **Enter** insert a new line in
  the message box and **Ctrl+Enter** (**Command+Enter** on macOS) send the message. It is off by
  default, when **Enter** sends and **Shift+Enter** adds a new line.
- **Fonts**: choose a font family and size for **Interface text** and for
  **Code text**. See [Fonts](#fonts).
- **IDE**: the command behind the title bar's Open button; see
  [Open in IDE](#open-in-ide).
- **Debug**: see [Debug mode](./debug-mode.md).

### Fonts

Each of the two font settings has a font family field and a size in pixels
(from 8 to 32).

- **Interface text** is used for normal text throughout the app. Its default
  size is 16px, and changing it scales all interface text proportionally.
- **Code text** is used for code blocks and inline code, tool output,
  terminals, and the file editor. Its default size is 12px. Open terminals
  resize to fit when you change it.

You can type any font name, or a comma-separated list such as
`Inter, sans-serif`. Leave the family empty to use the built-in font
(Instrument Sans for interface text, JetBrains Mono for code). If a font you
type is not installed, AI Leash falls back to the built-in font.

Select **Browse** beside a family field to pick from the fonts installed on
your computer. The picker has a search box and previews the highlighted font;
the code picker lists monospaced fonts first.

## Open in IDE

The title bar has an **Open** button (code icon, tooltip "Open in IDE") that opens the active
conversation's checkout (the project root, or its worktree) in an external
editor. Settings > Preferences > **IDE** sets the command it runs — `code` by default; any
launcher on your shell's `PATH` works (`zed`, `cursor`, `idea`, `code -n`).
The checkout path is appended as the last argument. The command is split
shell-style but never run through a shell. If it fails to launch, the button
turns amber and its tooltip shows the error.

## Debug mode

Settings > Preferences has a **Debug** section for inspecting the app's own behavior; see
[Debug mode](./debug-mode.md) for the ACP Events devtools panel and the
title bar's id display.
