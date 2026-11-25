# Project boards

Every project has a Kanban board for planning work as tasks. Open it from
the **Board** entry at the top of the project's group in the sidebar.

Projects whose board isn't in use yet — no tasks, no project chat, and no
conversations — are listed behind **More projects** at the end of the
sidebar's project list.

The board takes over the window next to the sidebar — there's no tab
strip or side panel while it's open. Next to it is the **project chat**,
an ordinary conversation for the whole project: use it to plan, break work
into tasks, or ask about the board. It always works in the project's main
checkout, so it has no worktree or branch picker.

The title bar's **Open** and Actions buttons are hidden here. Switch
between **Board**, **Both** and **Chat** in the title bar to see
just the board, the board with the chat docked on its right (380px wide
by default; drag the divider to resize it, between 300 and 560px), or
just the chat. The choice and the chat's width are remembered. With the
chat docked, the columns keep their width and the board scrolls sideways.
Columns are at least 300px wide (the kanban template's column width) and
share any extra width when the board is wider than they need, grouped by
epic or not.

## Columns

Tasks move left to right through five columns:

- **Backlog**: ideas and work that isn't planned yet.
- **Todo**: work that's ready to start.
- **In progress**: work that is being done.
- **Review**: work that's finished and waiting for you to check it.
- **Done**: finished work.

Each column's header has a status dot, the column's name, an ⓘ that says
what the column is for, how many tasks it holds, and a **+** that adds a
task straight into it. An empty column says so.

**Done** is hidden by default, since it keeps growing. Turn on **Show
done** (the ✓ toggle in the toolbar; its tooltip says how many tasks are
done) to see it. It shows tasks finished in the last 30 days, with a
**Load N older** button at the bottom of the column for the rest.

Drag a card to reorder it within a column or to move it to another one.
While you drag, the card follows the pointer and a dashed placeholder
marks where it came from. A card's **⋯** menu can also move it to any
other column.

## Tasks

Click **New task** in the toolbar, or the **+** on a column's header, to
add a task. A task has:

- a **title** and a **description** (Markdown),
- a **status** (its column),
- a **priority**: urgent, high, medium or low,
- an **effort**: a T-shirt size from XS to XL, or unsized,
- an optional **epic**;
- optionally, the **agent** its chat starts with — which agent or
  provider, model, thinking level and permission (Ask/Bypass, or the
  agent's own modes for agents that have them). Anything left at **Board
  default** uses the board's settings.

Each task also gets a short number, such as **#12**, that stays with it.
Numbers aren't reused, even after a task is deleted.

A card shows its number and effort (**#12 · M**), a priority badge, its
title, its epic, and at the bottom right what's going on with it: a
**Start** button if it hasn't been started, the elapsed time and a
pulsing dot while its chat is working, and a chat button once it has a
chat.

### The task window

New task and a task's details are the same window. On the left are the
title, a row with the status, priority, effort and epic, and the
description; on the right, the agent settings and where its chat runs.

- **New task** is the empty version. The column (and epic row) you
  opened it from is filled in; priority, effort and epic start empty
  (a task with no priority gets medium). Tick **Start it right away**
  (off by default) to start the task as soon as it's created, with its
  agent settings — or the board's — and the project chat following it.
  Ctrl+Enter creates it from anywhere in the window.
- **Task details** opens when you click a card, press Enter on it, or
  pick **Open** from its **⋯** menu. Changes save as you make them, so
  there's no Save button: pick a new status, priority, effort or epic in
  the field row (effort and epic can be cleared with their ×), click the
  pencil to rename it or edit its description. Setting the status to
  Done finishes the task (see [below](#finishing-a-task)).
- **Its chat** (details only) shows whether the task has started. If not,
  **Start** starts it straight away with the settings in the side rail.
  Once it has a chat, you see whether it's working (with a pulsing dot
  and how long its turn has run), **Stop** while it works, **Open chat**,
  and its last reply.
- The **Agent** settings can be changed until the task starts. After
  that they show what its chat actually runs with — change those in the
  chat itself. **Checkout** says "Created on start" until then, and
  afterwards names the worktree and its current branch.
- **Delete task** (bottom left, or the **⋯** menu) asks first. Deleting a
  task keeps its chat, worktree and branch.

There's no separate full-page view of a task.

## Planning by chatting

Agents can work the board too — see
[Tools](./tools.md#plan-and-track-work-on-the-board). In the project chat
(or any chat), ask for something like "break the settings rework into
tasks" and they're added to the board, with epics, priorities, sizes and
the agent each should start with if you ask for them. You can ask it to
start tasks as well, optionally naming the agent, model and thinking level
to use.

## Starting a task

Click the **▶ Start** button on a card that hasn't been started (or
**Start** in its details, which skips the questions below and uses the
task's settings). Pick the agent, model, thinking level and permission its chat should
use — filled in from the task's own agent settings, else the board's —
whether the project chat follows it (see
[below](#the-project-chat-and-task-chats)), and whether to open its chat
straight away. Then click **Start**. With no thinking level picked, our
own providers think at a level that fits the task's size: XS and S low, M
medium, L and XL high.

Starting a task:

- gives it a chat of its own, listed under **Chats** with the task's
  number;
- in a git repository, creates a worktree on a new `task/<number>-<title>`
  branch, off whatever the project's main checkout has checked out, and
  runs the chat there — so several tasks can be worked on at once without
  touching each other or your main checkout;
- moves it to **In progress** and sends the task — its title, priority,
  effort, epic and description — as the chat's first message, asking the
  agent to move the task to **Review** when it's done.

A started card has a chat button that opens its chat. The chat is a normal
conversation: you can read along, answer questions, approve tool use and
send messages of your own.

## The project chat and task chats

The project chat and a task's chat can message each other. A task's chat
sends progress, questions or blockers to the project chat; the project
chat sends instructions or answers to a task by its number. A message from
another chat shows in the transcript collapsed to one line, **Message from
…** (click the sender to open its chat, or **Show** to read it). Ask the project chat things like "tell #12 to use the
new API" or "what's #9 waiting on?".

Whenever a task's turn ends, the project chat hears about it, with the
task's status and its last reply. Whether that wakes the project chat
depends on whether it's **following** the task:

- It follows a task it started or has sent a message to, and one you
  start from the board with **The project chat follows it** ticked (the
  default). Then the task's
  updates and messages wake it, so it can react: answer a question, send
  the next instruction, or start the next task.
- Once you write in a task's chat yourself, you've taken it over, and the
  project chat stops following it — even for a quick answer. Its updates
  still reach the project chat, but as **notes**: collapsed rows in its
  transcript that it reads the next time it runs, without starting a turn
  (or spending tokens) for each one.

A task chat the project chat isn't following shows a banner above its
message box; click **Hand back to project chat** to have it follow again.
Messaging the task from the project chat does the same.

Messages to a task always wake it. A chat that's busy gets a message once
its current turn ends.

So two agents can't keep answering each other forever, a chat that's had
8 messages from other chats in a row, with nothing from you in between,
gets further ones as notes instead. Writing in that chat resumes it.

### Projects that aren't git repositories

Without git there are no worktrees, so a task's chat runs in the project's
one checkout. To keep tasks from changing the same files under each other,
only one task can be in progress at a time there. If you'd rather run
several anyway, open the board settings (the gear in the toolbar) and
turn on **Allow several tasks in progress at once**.

## Finishing a task

Drag a task to **Done**, or set its status to Done, when you're happy with
it. That stops its chat if it's still working, marks the chat done, and
removes the task's worktree. The branch is kept, so its commits stay
reachable; merge or delete it as you usually would.

If the worktree has uncommitted changes, or commits that aren't on any
other branch, AI Leash asks before removing it, saying how many there
are and naming the first few. Choose **Remove worktree** to go ahead, or
**Keep it open** to deal with them first; the task then stays where it
was.

## Board settings

The settings button in the board's toolbar opens its settings. Set the agent, model,
thinking level and permission the board's tasks start with when they
don't pick their own. Anything left at **Default** uses the app's default
agent (Settings > Agents) with the model last used on it.

## Epics

Epics group related tasks. Click **Epics** in the toolbar to add, rename,
recolour (pick one of eight colours from the menu at the start of its
row), archive or delete them. Deleting an epic keeps its tasks; they
just have no epic afterwards. Archived epics can't be picked for new tasks.

Use the epic menu in the toolbar to show one epic's tasks, or only tasks
with no epic. **Group by epic** (the toggle next to it) splits the board
into one lane per epic, with **No epic** last, under one shared row of
column headers that stays pinned while you scroll down. Each lane starts
with a header row across the whole board, set off from the lane above by
a divider: the epic's name (in its colour) and how many tasks it has.
The name stays pinned on the left while you scroll the board sideways.
Click the chevron next to it to collapse or expand that lane; this is
remembered per epic. Cards in a lane don't repeat the epic's name.
Dragging a card into another epic's lane moves it to that epic.
A lane with no cards to show (after the epic filter and Show done) is
hidden; a Done cell that only offers **Load older** doesn't count. If
that hides every lane, the board shows its plain columns instead.

The epic filter, Group by epic and Show done are remembered per project
(`useBoardViewPrefs`, under the `boardViewPrefs` localStorage key), so
each board comes back as you left it after switching boards or
restarting. If the remembered epic has since been deleted or archived,
the filter falls back to All epics. **Load older** is kept per project
only for the session; a restart loads recent done tasks again.

## How it's built

The board is the Astryx `kanban-board` template (`BoardView.tsx`): a
`LayoutHeader` + `Toolbar` (title and count `Badge`, epic `Selector`,
`ToggleButton`s for Group by epic and Show done, Epics, board settings,
New task), then muted column `Card`s in a row that scrolls sideways.
Each is at least `COLUMN_MIN_WIDTH` (300px) and grows to share spare
width; the swimlane grid uses the same `minmax(300px, 1fr)` tracks, with
a `min-width` of the columns plus gaps so it scrolls rather than
squeezing them. Cards (`TaskCard.tsx`) are `Card`s with a priority
`Badge`, a `Heading` title, an epic `Token` (`TaskMeta.tsx` maps the
epic's stored hex colour onto a Token colour) and a `MoreMenu`. Swimlanes
are one CSS grid with one column per status. Its first row, the column
headers, is `position: sticky; top: 0`. Each lane is then a header row
spanning every column (`grid-column: 1 / -1`: a `Divider` and the epic
`Token`, count and collapse button), followed by that lane's muted cells,
one per column. The header's content is `position: sticky; left:
spacing-4` inside the scroller, so the epic name stays in view while the
columns scroll past. The scroller itself has no padding, so the sticky
header row pins flush to its top edge and carries the gutter inside it.
Collapsed lanes are stored in `LS_KEYS.boardCollapsedLanes` as
`projectRoot` + lane key (the epic id, or `none`).

Drag and drop is still dnd-kit (`PointerSensor` with a 6px threshold, so
a click still opens the card; `closestCorners`; one `SortableContext`
per column or lane cell). The card being dragged stays in place as the
template's ghost, and `DragOverlay` shows a copy on `elevation="high"`.

`ProjectBoardView.tsx` docks the project chat with the ide template's
split: an Astryx `Layout` whose `end` is a `ResizeHandle` + `LayoutPanel`
sized by `useResizableWidth` (`LS_KEYS.projectChatWidth`). Switching
layouts remounts the chat; its draft (`chatDraft.ts`) and any running
turn (the backend) live outside it, so nothing is lost.

The task window is one design in three states — new, not started,
started — built from the Astryx `DialogFormDialog` block with the
`work-item-detail` template's content inside (`taskModal.tsx`): a
1120-wide `Dialog` (`purpose="form"`, `maxHeight` 85dvh) holding a
`Layout` with `DialogHeader`, `LayoutContent`, a 320px `LayoutPanel`
rail with a divider, and `LayoutFooter`. The field row is label-less
`Selector`s (status with its column's `StatusDot`, the priority `Badge`,
effort, the epic `Token`). `NewTaskDialog.tsx` is the empty, editable
state; `TaskDetailsDialog.tsx` the other two, saving each change with
`update_task`. Its "Its chat" card reads the chat's live state from
`useGenerating`, stops it with `cancel_prompt`, and shows the last
assistant message from `load_conversation_history` (its own
`qk.taskLastReply` query, refetched when a turn ends).

`AgentFields.tsx` renders the agent pickers as a `MetadataList` of
label-less ghost `Selector`s; the task window's rail, the start dialog
(`StartTaskDialog.tsx`) and board settings (`BoardSettingsDialog.tsx`)
all use it. `AgentSummary` is the read-only version a started task
shows. The finish confirm (`useFinishTask.tsx`) and the delete confirm
are `AlertDialog`s.

## In the sidebar

Each project's **Board** entry shows how many of its tasks are in progress
(blue) and in review (amber), and a spinner while the project chat is
working. Chats started for a task appear in the same project group as
**#12 · task title**. Use the filter button beside **Projects** to choose how
they're listed:

- **Mixed in**: task chats are mixed in with the rest, most recent first.
- **Grouped at the top**: task chats come first in each project.
- **Hidden**: only other chats are listed. Open a task's chat from its card
  instead.

The same menu can show a **Flat list** instead of project groups: each
project's board is then a row of its own under **Projects**, named after the
project and keeping its counts, and every chat (task chats included, unless
hidden) is in one **Chats** list below, most recent first. **Grouped at the
top** then puts all task chats at the top of that list. Both choices are also
in **Settings > Chat**.

Removing a project from AI Leash (**Remove project** in its sidebar
group's **⋯** menu) also deletes its board. Its files on disk aren't
touched.
