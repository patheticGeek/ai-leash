# Project boards

Every project has a Kanban board for planning work as tasks. Open it from
the **Project boards** section at the top of the sidebar.

The board takes over the window next to the sidebar — there's no tab
strip or side panel while it's open. Next to it is the **project chat**,
an ordinary conversation for the whole project: use it to plan, break work
into tasks, or ask about the board. It always works in the project's main
checkout, so it has no worktree or branch picker.

Switch between **Board**, **Both** and **Chat** in the title bar to see
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
- **Hide task chats**: only other chats are listed.

Removing a project from AI Leash also deletes its board.
