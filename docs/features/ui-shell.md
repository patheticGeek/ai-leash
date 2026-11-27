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
beside the collapse button, so it's never mistaken for a release. The window
has no title bar of its own. The chat area and the right-hand panel each open with their own
top band, the same height and with one line under both, so together they
read as a single bar along the top of the window, the **top bar**:

```text
+----------+----------------------------------------+---------------------------+
| sidebar  | Agent  sub-agent   Actions  Open  panel | Files  Terminal  +  _ [] x |
+----------+----------------------------------------+---------------------------+
```

The chat area's band holds its tabs (see [The chat area](#the-chat-area)),
then, at its right end: the quick-run control for [Actions](./actions.md); an **Open in external editor** button (see
[Open in external editor](#open-in-external-editor)); and the side-panel
toggle (see [Opening and closing the panel](#opening-and-closing-the-panel)).
The right-hand panel's band holds its tabs, its **+** button and the window
controls. With the panel closed, the window controls move to the end of the
chat area's band. Drag either band's empty space to move the window. The
[command palette](#command-palette) has no button here; it opens from the
sidebar's **Search** button or **Ctrl+K**.

A project's board has no tabs, so its band shows where you are instead,
**project / Board** (click the project name to open the board again), and
the editor and Actions buttons give way to the **Board / Both / Chat**
layout switch; the side-panel toggle is hidden, since a board has no side
panel, and the window controls end the band. The center of
the window is where you chat with the agent. The panel on the right contains
project tools such as files and terminals.

### Collapsing the sidebar

The arrow button beside the logo at the top of the sidebar collapses it to a
narrow strip of icons: Search, New thread, Add project, a folder for each project,
Done and Settings. Point at (or click) a project's folder to open a menu with
its board and chats; Done works the same way. While it's collapsed, the same
button sits at the start of the chat area's band, before its tabs; click it
to expand the sidebar again. The sidebar's width and whether it's collapsed are remembered,
including after a restart. Drag the sidebar's edge to resize it.

## Choosing a project and conversation

The top of the sidebar has **Search** (**Ctrl+K**, or **Command+K** on
macOS), a frosted button the sidebar's width that opens the
[command palette](#command-palette) (an icon in the collapsed strip), then **New
thread** (**Ctrl+N**, or **Command+N** on macOS), which starts a new thread in the current project, and **Add
project**, which asks for a folder to add. Below them, **Projects** lists one
group per project. Each group holds:

- **Board** first, which opens that project's [board](./project-board.md)
  and project chat. It shows how many tasks are in progress (blue) and in
  review (amber).
- Then the project's conversations, most recent first. Each is one line with
  its title; a chat started for a board task starts with the task's number,
  such as **#12 · Fix app colours**. Point at a chat to see a card with its
  full title, project, worktree (or project checkout) and branch, what it's
  waiting for if anything, and — for a task's chat — the task's status,
  effort and priority. Pointing at a project (in the flat
  list) shows its full path the same way.

To remove a project, point at its name and open its **⋯** menu, or
right-click its name, and choose **Remove project**. After you confirm, the
project is removed from AI Leash and its board and conversations are
deleted. The project's files on disk aren't touched; add the folder again
with **Add project** to start afresh.

Projects with no conversations, tasks or project chat yet are tucked behind
**More projects** at the end of the list (it, and the Done group's **Show
all** / **Show less**, are a size smaller than the rows so they don't read as
another project). Click a project's name (or press
Enter or Space on it) to fold or unfold its group; there's no separate
arrow. The app remembers which groups you folded, including after a
restart. The active entry is highlighted.

The filter button beside **Projects** chooses how chats are listed:

- **Chats**: **Grouped by project** (the default) lists them as above.
  **Flat list** lists every open chat in one **Chats** section, most recent
  first, whatever its project; point at a chat to see its project.
  **Projects** then lists one **Board** row per project, named after the
  project, with its in-progress and review counts and its **⋯** menu.
  However many chats there are, **Projects** keeps room for about three
  rows (or all of them, if there are fewer; **More projects** counts as a
  row) and scrolls inside it; **Chats** takes the rest of the height. In
  code: `projectsMin1`–`projectsMin3` in `LeftBar.tsx`, a grid row minimum
  of that many `--size-element-md` rows plus the list's `--spacing-0-5`
  gaps.
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
point at a chat, its **⋯** appears after its timer, which stays whole and
clear of the button; only the title gets shorter. **Settings** sits at the bottom of the
sidebar, with **Done** pinned just above it. The **Projects** and **Chats**
titles stay in place; only the lists under them scroll, with a fade at an edge
while there's more out of view that way.

The sidebar can show activity while you are viewing another conversation. A
blue timer at the end of a chat's row means the agent is still processing it;
it shows how long the current turn has been running, stays on one line, and
is one type-scale step (12px) smaller than the chat's 14px title, in both the
flat and the grouped layout. An
amber icon at the start of the row means that conversation is waiting for
you: a shield to approve a requested action, or a question mark when the
agent has asked you a question. When chats are grouped by project it sits in the
row's indent, under the project's folder icon, so the title doesn't move.
Point at it to see what's needed. Switch to it to answer; see
[Permissions](./tools.md#why-permission-prompts-appear) for more about approvals.

## The chat area

The **Agent** tab is the main conversation. When the agent starts a
sub-agent, you can open that sub-agent's conversation in its own center tab
from the **Sub Agents** panel. Sub-agent conversations are read-only, so they
are useful for following the work without interrupting it.

You can switch between the Agent tab and any open sub-agent tabs at the top of
the chat area. Sub-agent tabs can be closed when you no longer need them.

### Closing tabs

Every tab shows an icon before its title for its kind: a folder tree for
**Files**, a code or text page for an open file, a terminal for
**Terminal**, a play button for an Action's output, a lightning bolt for
**Actions**, a robot for **Sub agents** and for a sub-agent's conversation,
an eye for a preview, and a speech bubble for **Agent**. Status markers
(the unsaved-file dot, the running sub-agent count) sit after the title.

When you point at a tab you can close, or move keyboard focus onto it, its
icon turns into a **×** in the same spot, so the tab doesn't shift. To close
a tab, click that **×** (hover it for a "Close …" tooltip), middle-click
anywhere on the tab, or press **Ctrl+W** (**Command+W** on macOS) while the
tab has keyboard focus. Pressing the **×** never starts a drag. Every tab
except **Agent** can be closed; its icon never turns into a **×**. Reopen
**Files** (or any other tool) from the right-hand panel's **+** button.

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

### Opening and closing the panel

The button at the right end of the chat area's band, just before the
right-hand panel, closes the right-hand panel (**Ctrl+J**, or **Command+J** on
macOS, does the same). With it closed, the chat takes the full width of the
window; the same button, or **Ctrl+J** again, brings it back with the tabs
it had. Whether the panel is open is one app-wide setting, not one per
conversation, and it's remembered after a restart.

Anything that opens a tool tab opens the panel again if it's closed:
opening a file from the tree, a file chip in the chat or the review drawer,
**Open in a new terminal** on a code block, running an Action, the
**Sub agents** banner, **Ctrl+1** to **Ctrl+4** and the command palette.
Tabs dragged into the chat area stay where they are. In code the flag is
`sidePanelOpen` in `store/panelSlice.ts` (`setSidePanelOpen`), saved under
`LS_KEYS.sidePanelOpen`; `openPanelTab` and `activateTab` set it whenever
a tab opens or comes forward in the side area, and `App.tsx` leaves the
panel and its resize handle out while it's false.

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

## Keyboard shortcuts

On macOS, use **Command** wherever this table says **Ctrl**.

| Shortcut | What it does |
|---|---|
| **Ctrl+K** | Open or close the [command palette](#command-palette) |
| **Ctrl+N** | New thread in the current project |
| **Ctrl+B** | Collapse or expand the sidebar |
| **Ctrl+J** | [Open or close the right-hand panel](#opening-and-closing-the-panel) |
| **Ctrl+,** | Open Settings |
| **Ctrl+1** | Open the panel's **Files** tab |
| **Ctrl+2** | Open a new **Terminal** tab |
| **Ctrl+3** | Open the panel's **Sub agents** tab |
| **Ctrl+4** | Open the panel's **Actions** tab |

While you're typing in a terminal or the file editor, only **Ctrl+K**
works; every other key goes to the terminal or editor (a shell needs
**Ctrl+B**, **Ctrl+J** and the rest). On a board, **Ctrl+J** and **Ctrl+1**
to **Ctrl+4** do nothing, as there is no side panel. **Ctrl+W** (close the
focused tab), **Ctrl+S** (save the file) and undo/redo work as before; see
[Closing tabs](#closing-tabs).

The shortcuts live in one place, `src/lib/shortcuts.ts`: each has an id, a
label and its keys in the format Astryx's `Kbd` takes (`mod+k`, where `mod`
is Command on macOS and Ctrl elsewhere). The same string draws the key
badges in the palette and the sidebar, the text in tooltips
(`formatShortcut`, `withShortcut`) and the matching. `useShortcuts`
(`src/hooks/useShortcuts.ts`), mounted once in `App.tsx`, is the single
document listener that runs them. It ignores a key another handler has
already claimed (`defaultPrevented`), held-down repeats and IME
composition. The terminals hand **Ctrl+K** back to the app through xterm's
`attachCustomKeyEventHandler` (`terminalKeyFilter`). To add a shortcut, add
it to `SHORTCUTS` and give it a handler in `App.tsx`'s `useShortcuts` call.

## Command palette

Press **Ctrl+K** (**Command+K** on macOS), or click **Search** at the top of
the sidebar, to open the command palette. Type to filter, use the arrow
keys to move and **Enter** to choose, or click a row. **Escape** or a click
outside closes it. It lists, in three groups, in this order:

- **Boards**: the board of each project in use, the ones the sidebar
  doesn't tuck behind **More projects** (an open chat, tasks on its board or
  a project chat), most recent activity first.
- **Chats**: every open (not done) chat in every project, most recent first,
  with its project's name at the end of the row. Choose one to switch to it.
  Typing a project's name finds its chats too.
- **Commands**: New thread, Toggle sidebar, Toggle side panel, Open Files,
  Open Terminal, Open Sub agents, Open Actions and Settings, each with its
  shortcut. On a board, the side-panel commands are left out.

Matching is fuzzy and forgiving. Case doesn't matter, and `-`, `_`, `/`,
`.`, `#` and spaces all count as the same separator, so `ai leash` finds
every chat in `ai-leash`. Every word you type has to match somewhere in the
row's title, project name, `#task` number or group name (each word may hit
a different one); a word that matches nothing hides the row. Within a word
the letters may be skipped over, so `alsh` finds `ai-leash`. Within each
group the best matches come first: the whole query matching a field exactly
or as its start, then every word starting a word, then a word found inside
a word, then subsequence matches; ties keep the group's own order.

The palette is Astryx's `CommandPalette` (`src/app/AppCommandPalette.tsx`),
which handles the keys; the list and its filtering are ours, through its
`searchSource` (`search(query)` runs `fuzzyFilter` from
`src/lib/fuzzyMatch.ts` per group). Its open state is
`commandPaletteOpen` in `store/panelSlice.ts`.

## Appearance

AI Leash uses a dark appearance throughout the app, including the window
controls, chat, editors, and terminals. There is currently no light theme or
appearance switch. The interface is built on the Astryx `neutral` look
(monochrome, no accent colour), made near-black with pure neutral greys (no
blue tint): the chat and board, the darkest, are `#0f0f10`; the sidebar
and the right-hand panel either side are a step up at `#161617`; cards,
menus and popovers are `#1c1c1e`; with `#ededef` primary
and `#a1a1a8` secondary text. Corners are smaller than stock: 6px on
buttons and inputs, 10px on cards, menus and dialogs. App chrome (tabs,
sidebar rows and small buttons, pickers and inputs) uses 12px text around
14px content. The theme lives in `themes/ai-leash/` and is
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
- **External editor**: the command behind the top bar's Open button; see
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

The top bar has an **Open in external editor** button (code icon) that opens the active
conversation's checkout (the project root, or its worktree) in an external
editor. **Settings > External editor** sets the command it runs — `code` by default; any
launcher on your shell's `PATH` works (`zed`, `cursor`, `idea`, `code -n`).
The checkout path is appended as the last argument. The command is split
shell-style but never run through a shell. If it fails to launch, the
button's tooltip shows the error.

## Debug mode

**Settings > Debug** has the settings for inspecting the app's own behavior; see
[Debug mode](./debug-mode.md) for the ACP Events devtools panel and the
top bar's id display.
