# Project boards

Every project has a Kanban board for planning work as tasks. Open it from
the **Project boards** section at the top of the sidebar.

The board takes over the window next to the sidebar — there's no tab
strip or side panel while it's open. Next to it is the **project chat**,
an ordinary conversation for the whole project: use it to plan, break work
into tasks, or ask about the board. It always works in the project's main
checkout, so it has no worktree or branch picker.

The title bar's **Open** and Actions buttons are hidden here. Switch
between **Board**, **Both** and **Chat** in the title bar to see
just the board, the board with the chat docked on its right (a third of
the width by default; drag the divider to resize it), or just the chat.
The choice is remembered.

## Columns

Tasks move left to right through five columns:

- **Backlog**: ideas and work that isn't planned yet.
- **Todo**: work that's ready to start.
- **In progress**: work that is being done.
- **Review**: work that's finished and waiting for you to check it.
- **Done**: finished work.

**Done** is hidden by default, since it keeps growing. Click **Show done**
in the toolbar to see it; the number next to it is how many tasks are done.
It shows tasks finished in the last 30 days, with a **Load older** button
for the rest.

Drag a card to reorder it within a column or to move it to another one.

## Tasks

Click **New task** in the toolbar, or the **+** on a column's header, to
add a task. A task has:

- a **title** and a **description** (Markdown),
- a **status** (its column),
- a **priority**: urgent, high, medium or low,
- an **effort**: a T-shirt size from XS to XL, or unsized,
- an optional **epic**.

Each task also gets a short number, such as **#12**, that stays with it.
Numbers aren't reused, even after a task is deleted.

Click a card to edit it or delete it. A card shows its number, priority,
effort and epic, and a spinner with the elapsed time while its chat is
working.

## Planning by chatting

Agents can work the board too — see
[Tools](./tools.md#plan-and-track-work-on-the-board). In the project chat
(or any chat), ask for something like "break the settings rework into
tasks" and they're added to the board, with epics, priorities and sizes if
you ask for them. You can ask it to start tasks as well, optionally naming
the agent, model and effort to use.

## Starting a task

Hover a card that hasn't been started and click its **▶ Start** button.
Pick the agent, model and effort its chat should use (the effort starts
from the task's size: XS and S are low, M medium, L and XL high), whether
it may run tools without asking, and whether to open its chat straight
away. Then click **Start**.

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

### Projects that aren't git repositories

Without git there are no worktrees, so a task's chat runs in the project's
one checkout. To keep tasks from changing the same files under each other,
only one task can be in progress at a time there. If you'd rather run
several anyway, open the board settings (the gear in the toolbar, shown
only for such projects) and turn on **Allow several tasks in progress at
once**.

## Finishing a task

Drag a task to **Done**, or set its status to Done, when you're happy with
it. That stops its chat if it's still working, marks the chat done, and
removes the task's worktree. The branch is kept, so its commits stay
reachable; merge or delete it as you usually would.

If the worktree has uncommitted changes, or commits that aren't on any
other branch, AI Leash lists them and asks before removing it. Choose
**Keep it open** to deal with them first.

## Epics

Epics group related tasks. Click **Epics** in the toolbar to add, rename,
recolour, archive or delete them. Deleting an epic keeps its tasks; they
just have no epic afterwards. Archived epics can't be picked for new tasks.

Use the epic menu at the left of the toolbar to show one epic's tasks, or
only tasks with no epic. **Group by epic** splits the board into one row
per epic; dragging a card into another epic's row moves it to that epic.

## In the sidebar

Each project in **Project boards** shows how many of its tasks are in
progress (blue) and in review (amber). Chats started for a task appear
under **Chats** with the task's number. Use the filter button next to the
project menu to choose how they're listed:

- **Show all chats**: task chats are mixed in with the rest, most recent
  first.
- **Group task chats at top**: task chats come first.
- **Hide task chats**: only other chats are listed. Open a task's chat from
  its card instead.

Removing a project from AI Leash also deletes its board.
