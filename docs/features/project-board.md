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
- an optional **epic**;
- optionally, the **agent** its chat starts with — which agent or
  provider, model, thinking level and permission (Ask/Bypass, or the
  agent's own modes for agents that have them). Anything left at **Board
  default** uses the board's settings.

Each task also gets a short number, such as **#12**, that stays with it.
Numbers aren't reused, even after a task is deleted.

Click a card to edit it or delete it. A card shows its number, priority,
effort and epic, and a spinner with the elapsed time while its chat is
working.

## Planning by chatting

Agents can work the board too — see
[Tools](./tools.md#plan-and-track-work-on-the-board). In the project chat
(or any chat), ask for something like "break the settings rework into
tasks" and they're added to the board, with epics, priorities, sizes and
the agent each should start with if you ask for them. You can ask it to
start tasks as well, optionally naming the agent, model and thinking level
to use.

## Starting a task

Hover a card that hasn't been started and click its **▶ Start** button.
Pick the agent, model, thinking level and permission its chat should
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
another chat shows in the transcript with **From …** above it (click it to
open the sender). Ask the project chat things like "tell #12 to use the
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
other branch, AI Leash lists them and asks before removing it. Choose
**Keep it open** to deal with them first.

## Board settings

The gear in the board's toolbar opens its settings. Set the agent, model,
thinking level and permission the board's tasks start with when they
don't pick their own. Anything left at **Default** uses the app's default
agent (Settings > Agents) with the model last used on it.

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
