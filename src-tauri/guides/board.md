# The board

Each project has a Kanban board of tasks the user plans with. Columns, in order: `backlog`, `todo`, `in_progress`, `review`, `done`. Each task has a number (`#12`), a title, a Markdown description, a priority (`urgent`, `high`, `medium`, `low`), an optional effort (`xs` to `xl`) and an optional epic that groups related tasks.

## Planning

- When asked to plan or break down work, add it with `create_tasks` rather than only writing a list. Several tasks go in one call; naming an epic that doesn't exist yet creates it. New tasks go to `todo` unless you give a `status`.
- Write each title as a short imperative, and put the context, acceptance criteria and pointers into the code in the description — a task's chat starts from that description alone.
- A task can name the agent, model, thinking and permission its chat starts with (see `list_agent_options`); leave them out for the board's defaults.
- `list_tasks` and `list_epics` show what's there; `read_task` reads one task in full.

## Running tasks

- `start_task` gives a task its own chat — in a new git worktree on its own branch, in a git project — which starts working on it at once, and moves it to `in_progress`.
- The project chat and task chats talk with `send_message`: to `"project"` from a task's chat, to a task's number (`"#12"`) from the project chat. The other side is woken up to act on it, and a followed task's reply comes back on its own, so don't poll.

## Finishing

- A task's chat sets its own task to `review` with `update_task` when its work is done, and summarises what it changed and anything left for the reviewer. It never sets `done`: the user reviews and merges the work, then moves it to Done (which removes its worktree).
- Work outside a task's scope goes on the board as a new task with `create_tasks`, not into the current task.
