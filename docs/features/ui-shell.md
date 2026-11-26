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

The sidebar runs the full height of the window. A development or
pull-request build shows a **DEV** or **PR** tag at the top of the sidebar,
beside the collapse button, so it's never mistaken for a release. The title bar sits above the
chat and the right-hand panel and shows where you are as a breadcrumb:
**project / chat title** (a task's chat shows as **#12 · task title**),
**project / Board** on a project's board, or **project / New thread** for a
thread that has no messages yet. Click the
project name to open that project's [board](./project-board.md). Drag the
title bar to move the window. Its right end has an **Open in external
editor** button (see [Open in external editor](#open-in-external-editor)), the quick-run control for
[Actions](./actions.md), and the window controls; on a board those two
buttons give way to the **Board / Both / Chat** layout switch. The center of
the window is where you chat with the agent. The panel on the right contains
project tools such as files and terminals.

### Collapsing the sidebar

The arrow button beside the logo at the top of the sidebar collapses it to a
narrow strip of icons: New thread, Add project, a folder for each project,
Done and Settings. Point at (or click) a project's folder to open a menu with
its board and chats; Done works the same way. While it's collapsed, the same
button sits at the start of the title bar; click it to expand the sidebar
again. The sidebar's width and whether it's collapsed are remembered,
including after a restart. Drag the sidebar's edge to resize it.

## Choosing a project and conversation

The top of the sidebar has **New thread** (**Ctrl+N**, or **Command+N** on
macOS), which starts a new thread in the current project, and **Add
project**, which asks for a folder to add. Below them, **Projects** lists one
group per project. Each group holds:

- **Board** first, which opens that project's [board](./project-board.md)
  and project chat. It shows how many tasks are in progress (blue) and in
  review (amber).
- Then the project's conversations, most recent first. Each is one line with
  its title; a chat started for a board task starts with the task's number,
  such as **#12 · Fix app colours**. Point at a chat to see its project, workspace (worktree
  or primary checkout) and branch.

To remove a project, point at its name and open its **⋯** menu, or
right-click its name, and choose **Remove project**. After you confirm, the
project is removed from AI Leash and its board and conversations are
deleted. The project's files on disk aren't touched; add the folder again
with **Add project** to start afresh.

Projects with no conversations, tasks or project chat yet are tucked behind
**More projects** at the end of the list. Click a project's name (or press
Enter or Space on it) to fold or unfold its group; there's no separate
arrow. The app remembers which groups you folded, including after a
restart. The active entry is highlighted.

The filter button beside **Projects** chooses how chats are listed:

- **Chats**: **Grouped by project** (the default) lists them as above.
  **Flat list** lists every open chat in one **Chats** section, most recent
  first, whatever its project; point at a chat to see its project.
  **Projects** then lists one **Board** row per project, named after the
  project, with its in-progress and review counts and its **⋯** menu.
- **Task chats**: mixed in with the rest, grouped at the top (of each
  project, or of the flat list), or hidden.

The button is highlighted while either is changed from its default. The same
two choices are in **Settings > Chat**.

To add another project, click **Add project** and choose a folder. You can
then open one of its existing conversations from the sidebar or start a new
thread in that project with **New thread**.

Conversations that you have marked as done move into the **Done** group at
the bottom of the sidebar, which starts folded and shows how many there are.
Click it to open it and see the most recent ones (**Show all** lists the rest), and use a
conversation's menu to mark it as not done. Each conversation has a **⋯**
menu that appears when you point at it (or right-click it), with **Mark as
done** and **Delete conversation**. Titles use the whole row; while you
point at a chat, its **⋯** appears after its status, which stays whole and
clear of the button; only the title gets shorter. **Settings** sits at the bottom of the
sidebar, with **Done** pinned just above it. The **Projects** and **Chats**
titles stay in place; only the lists under them scroll, with a fade at an edge
while there's more out of view that way.

The sidebar can show activity while you are viewing another conversation. A
blue spinner means the agent is still processing that conversation; the blue
time next to it, kept on one line, is how long the current turn has been
running. An amber marker means that conversation is waiting for you: pulsing
to approve a requested action, or steady when the agent has asked you a
question. In the flat chat list it's an icon right after the title (a shield
for an approval, a bell for a question); in the project groups it's a dot at
the row's end. Point at it to see what's needed. Switch to it to answer; see
[Permissions](./tools.md#why-permission-prompts-appear) for more about approvals.

## The chat area

The **Agent** tab is the main conversation. When the agent starts a
sub-agent, you can open that sub-agent's conversation in its own center tab
from the **Sub Agents** panel. Sub-agent conversations are read-only, so they
are useful for following the work without interrupting it.

You can switch between the Agent tab and any open sub-agent tabs at the top of
the chat area. Sub-agent tabs can be closed when you no longer need them.

### Closing tabs

A tab you can close shows a **×** at its end: always on the selected tab,
and on other tabs when you point at them. To close a tab, click its **×**,
middle-click anywhere on the tab, or press **Ctrl+W** (**Command+W** on
macOS) while the tab has keyboard focus. Every tab except **Agent** can be
closed; reopen **Files** (or any other tool) from the right-hand panel's
**+** button.

### Moving tabs between the chat area and the tool panel

Drag a tab sideways in its row to reorder it. Drag it into the other area
to move it there: drop it onto a tab to place it beside that tab, or
anywhere else in that area to add it at the end. Any tab can move either
way (a terminal, a file, the Files tab, a sub-agent's conversation)
except the **Agent** tab, which always stays in the chat area, though you
can still reorder it there.

A moved tab carries on where it was: a terminal keeps its shell and
scrollback, and a sub-agent conversation keeps streaming. An open file
reloads its editor, so its undo history starts over. **Ctrl+S**
(**Command+S** on macOS) saves the file whose editor you are typing in.

Code blocks in the conversation have a header showing the language and a copy
button. Shell code blocks also have an **Open in a new terminal** button. It
opens a terminal tab with the command typed at the prompt but not run, so you
can review or edit it before pressing **Enter**.

### Worktree and branch

For projects in a git repository, a bar below the message box shows which
worktree the conversation is working in (on the left) and which branch is
checked out there (on the right). Click either one to open a picker above
it. Both pickers have a search box; use the arrow keys to move through the
list and **Enter** to choose an entry. The current entry is checked.

- **Worktree** lists the project's primary checkout and any other worktrees.
  Choose one to work in it, or select **New worktree…** at the bottom of the
  list to create one on a new branch (based on a branch you choose) or on an
  existing branch that is not already checked out elsewhere. The form opens
  in the picker itself; **Cancel** returns to the list. The worktree is fixed
  once you send the conversation's first message; after that the worktree
  button is disabled, and its tooltip says why.
- **Branch** lists the branches of the current worktree, the checked-out one
  first and the rest by when they were last checked out in that worktree
  (most recent first; never-checked-out branches last). Choose one to switch
  to it, or select **New branch…** to create a branch from a base branch and
  switch to it, in the same inline form. If git refuses the name (for
  example, a branch by that name already exists), its message shows on the
  name field. The branch can be changed at any time.

To delete a worktree or branch, hover its row (or move the highlight to it)
to reveal the trash icon, click it, and confirm in the card that replaces
the row. The active worktree and the currently checked-out branch cannot be
deleted. If git refuses because a worktree has uncommitted changes or a
branch is not fully merged, the card shows git's message and offers **Force
delete**, which throws those changes away.

## The right-hand tool panel

The right-hand panel has its own tabs. Click a tab to switch tools, close it
as described in [Closing tabs](#closing-tabs), and use the **+** button to
open another tab. Drag the panel's left edge to resize it. When there are
more tabs than fit, the row scrolls sideways (mouse wheel, trackpad, or
moving through the tabs with the keyboard) and fades out at the edge where
tabs are hidden. If no
tab is open, AI Leash displays the tab chooser automatically. New tabs open
here, but you can drag them into the chat area; see
[Moving tabs](#moving-tabs-between-the-chat-area-and-the-tool-panel).
Opening something that is already open, such as a file, takes you to its
tab in whichever area it is in.

### Tabs are remembered per conversation

Each conversation keeps its own set of open tabs, both in the right-hand panel
and in the chat area, in the order and area you left them, along with which
one was active in each.
Switching to another conversation shows that conversation's tabs, and they
are restored the next time you open it, even after restarting the app.
Terminal tabs reopen with a fresh shell rather than the previous session. A
new thread that has not had a message sent yet is not remembered.

### Files

**Files** shows the files and folders of the checkout the conversation is
working in, as a tree. Click a folder to open or close it; its contents load
the first time you open it, and stay up to date as files change on disk.
Select a file to open it in an editor tab. Files opened from the tree appear
alongside the other tabs in this panel. A small marker on a file tab indicates
that the file has unsaved changes.

The search box above the tree finds files anywhere in the checkout, not only
in folders you have opened. Type part of a path; every word you type must
appear in the file's path, in any case. The tree is replaced by a flat list
of matching files, each with the folder it is in, while the box has text.
Files ignored by git (and `node_modules`, `target`, `dist`, `.git`) are left
out, and the list stops at 200 matches. Clear the box to return to the tree.

### File editor

Opening a file adds it as a tab in the right-hand panel. Use the editor to
read or change the file, then close its tab when you are finished. Opening a
file that is already open takes you to its existing tab instead of creating a
duplicate.

### Terminal

Choose **Terminal** to open a shell in the current project. You can open more
than one terminal; each terminal keeps its own session and scrollback while
you switch between tabs. A terminal is an ordinary tab: it opens in this
panel and can be dragged into the chat area and back. There is no separate
bottom terminal drawer. See [Terminal](./terminal.md).

### Sub agents

The **Sub agents** tab lists the sub-agent tasks created for the current
conversation, newest first. Each row starts with a status dot (pulsing while
the sub-agent runs, then finished or failed; point at it for the word), then
the task's description, its model and when it started, and on the right how
long it has run. Select a row to open its conversation in the center area.

A running sub-agent has a stop button on its row. A finished one has a **⋯**
menu with **Open its conversation** and **Delete**, which removes it from
the list.

Before any sub-agent has run, the tab says so and explains that they appear
when the agent uses `spawn_sub_agent`. While the list loads it shows
placeholder rows, and if it can't be loaded the tab says what went wrong and
offers **Try again**.

### Actions

**Actions** lists the project's saved commands, one row each, with a status
dot, the name and the command, a run or stop button, and a **⋯** menu (Show
output, Edit, Delete). **Add action** sits at the bottom of the tab. When an
action runs, AI Leash opens a separate terminal tab for its output so you can
keep an eye on it without losing your other terminal sessions. See
[Actions](./actions.md).

### Tab chooser

The **+** button at the end of the panel's tab row opens the tab chooser in
the panel: one card each for Files, Terminal, Sub agents and Actions, with a
short description. The Sub agents card shows how many sub-agents are running
in this conversation. Choosing a card opens that tab; switching to another
tab closes the chooser.

## Resizing the workspace

Drag the dividers between the conversation sidebar, chat area, and right-hand
panel to change their widths. AI Leash remembers those widths for the next
time you use the app.

## Appearance

AI Leash uses a dark appearance throughout the app, including the window
controls, chat, editors, and terminals. There is currently no light theme or
appearance switch. The interface is built on the stock Astryx `neutral` look
(monochrome, no accent colour); the only change from stock is that app
chrome — tabs, sidebar rows and small buttons, pickers and inputs — uses
12px text around 14px content. The theme lives in `themes/ai-leash/` and is
changed only through `npx astryx experimental theme editor`. Icons are
`lucide-react` throughout. You can change the fonts and text sizes under
[Settings](#settings), and adjust the panel widths as described above.

## Settings

Open **Settings** from the gear at the bottom of the sidebar. It is one
dialog (Astryx's `settings-dialog` template, `src/features/settings/`): a
side nav on the left and the selected panel on the right, with a close
button pinned to the panel's top corner. The nav has three groups:

- **Agents**: the agents the chat bar can pick from; see
  [Agent chat](./agent-chat.md#built-in-providers).
- **Preferences**: **Chat**, **Fonts**, **External editor** and **Debug**
  (below).
- **App**: **Crash log** (see [Crash logging](./crash-logging.md)) and
  **About** (version, commit, app id, and links to the source code and
  website).

Type in **Search settings** at the top of the nav to find a setting by name
or by a word you'd use for it ("ide", "monospace", "send"). The nav is
replaced by the matching settings while you type; use the arrow keys and
**Enter**, or click one, to open its panel. **Escape** clears the search
first, then closes the dialog. The searchable list lives in
`src/features/settings/panels.ts`, next to the panel registry.

Clicking outside the dialog closes it too. Settings save as you change
them, so it just closes — except while an agent's **Add** / **Edit** form
holds something you haven't saved, when it asks **Discard changes?** first.

## Dialogs

Every dialog closes when you press **Escape** or click outside it. One
that holds edits you haven't saved — a new task, a task's title or
description while you edit it, the start-task options, board settings,
a typed-but-not-added epic, an agent form in Settings — asks **Discard
changes?** (**Discard** / **Keep editing**) first; with nothing unsaved it
just closes. Its own **Cancel** and close (×) buttons close it straight
away. The shared piece is `useDiscardGuard` (`src/hooks/useDiscardGuard.tsx`):
the dialog keeps Astryx's default `purpose`, passes the hook's
`onOpenChange` to its `Dialog` and renders the hook's `AlertDialog` next
to it. Confirmations (Astryx `AlertDialog`: remove project, delete task,
finish task, discard changes) are the exception: Astryx fixes them to
close only from their buttons or Escape, not from a click outside.

## Preferences

The Preferences panels hold the app's personal settings. Changes apply
immediately and are remembered in the app's config folder
(`preferences.json`, with a `.dev` suffix in development builds), so they
survive a restart and are not tied to the window.

- **Chat**: turn on **Compose mode** to make **Enter** insert a new line in
  the message box and **Ctrl+Enter** (**Command+Enter** on macOS) send the message. It is off by
  default, when **Enter** sends and **Shift+Enter** adds a new line. **Max chat
  box height** sets how many lines the message box grows to before it
  scrolls (3 to 12, default 6). **Collapse finished turns** folds a finished
  turn's thinking, tool calls and earlier messages into one "Worked for" row.
  Under **Sidebar**, **Chats** and **Task chats** are the same choices as
  the sidebar's filter button (grouped by project or a flat list; task chats
  mixed in, at the top or hidden).
- **Fonts**: choose a font family and size for **Interface text** and for
  **Code text**. See [Fonts](#fonts).
- **External editor**: the command behind the title bar's Open button; see
  [Open in external editor](#open-in-external-editor).
- **Debug**: see [Debug mode](./debug-mode.md).

### Fonts

Interface text and code text each have a font family and a size in pixels
(from 8 to 32), with a live preview under the family.

- **Interface text** is used for normal text throughout the app. Its default
  size is 14px. The size sets the body text size (Astryx's `--font-size-base`,
  used for body text, labels and the like); surfaces not yet moved to Astryx
  scale all their text proportionally with it.
- **Code text** is used for code blocks and inline code, tool output,
  terminals, and the file editor. Its default size is 12px. Open terminals
  resize to fit when you change it.

The family picker lists the fonts installed on your computer, with a search
box; the code picker lists monospaced fonts first. The first entry is the
built-in font (Instrument Sans for interface text, JetBrains Mono for code).
A family set before the picker existed — a comma-separated list such as
`Inter, sans-serif`, or a font that has since been uninstalled — stays in the
list as a **Custom** entry until you pick another; a font that isn't installed
falls back to the built-in one.

## Open in external editor

The title bar has an **Open in external editor** button (code icon) that opens the active
conversation's checkout (the project root, or its worktree) in an external
editor. **Settings > External editor** sets the command it runs — `code` by default; any
launcher on your shell's `PATH` works (`zed`, `cursor`, `idea`, `code -n`).
The checkout path is appended as the last argument. The command is split
shell-style but never run through a shell. If it fails to launch, the
button's tooltip shows the error.

## Debug mode

**Settings > Debug** has the settings for inspecting the app's own behavior; see
[Debug mode](./debug-mode.md) for the ACP Events devtools panel and the
title bar's id display.
