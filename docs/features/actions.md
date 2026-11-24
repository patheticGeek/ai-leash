# Actions

An Action is a saved command for the current project. Give it a short name,
such as `dev`, `build`, or `test`, and enter the command it should run, such
as `npm run dev`, `npm run build`, or `npm test`.

Actions are useful for commands you run often. Instead of retyping a command
in a terminal, you can start it from the app whenever you need it. Your
Actions are saved with the project, so they are available the next time you
open that project.

Actions belong to the checkout the conversation is working in. If a
conversation uses a [worktree](./ui-shell.md#worktree-and-branch), its
Actions are the ones in that worktree, and running or stopping an Action, from
the sidebar or the title bar, affects that worktree rather than the main
project folder. This stays true when you reopen the conversation later.

## Create an Action

1. Open the **Actions** tab in the side panel.
2. Select **Add action**. It is at the bottom of the tab, or in the middle
   of it when the project has no Actions yet.
3. Enter a name that helps you recognize the command.
4. Enter the command to run.
5. Select **Add**.

The form opens at the bottom of the tab; **Cancel** closes it.

For example, create an Action named `dev` with the command `npm run dev` to
keep a development server ready to start.

## Run an Action

Each Action is a row with a status dot, its name and command, a play or stop
button, and a **⋯** menu. The dot is green while the Action runs, red when
its last run failed, and grey otherwise; point at it to see the state in
words (**Running**, **Exited 1**, **Exited**, **Stopped**, **Not started**)
and when the last run ended.

In the **Actions** tab, select the play button next to a stopped Action. AI
Leash starts the command in the background and opens its output in a terminal
tab. The terminal shows output while the command is running, so you can watch
a development server start, check a build, or follow test results.

You can also select an Action's row, or **Show output** in its **⋯** menu,
to open its terminal view. For quick
access, the most recently used Action appears in the title bar when Actions
are available. Use the dropdown there to choose another Action.

If an Action is already running, starting it again does not create a second
copy of the command. When you start a new run, the Action's terminal clears
the previous run's output right away.

## Stop an Action

Select the stop button next to a running Action. The Action changes to
**Stopped**, and its command is ended. Once the command has actually exited,
its output ends with a line such as `[action stopped] exit code: 1`, so you
can see how it went down. You can select the play button again later to
start a fresh run.

An Action whose command ends on its own shows **Exited** instead. If the
command failed (a non-zero exit code), its dot turns red and the state shows
the code, for example **Exited 1**.

The last run's output is kept after it stops or exits, until the Action runs
again. An agent can still read it with `read_action`, which also reports the
run's status and exit code, and can ask for only the output that arrived
since its previous read.

## Edit or delete an Action

Open the Action's **⋯** menu:

- Select **Edit** to change its name or command in the form at the bottom of
  the tab, then select **Save**.
- Select **Delete** to remove it from the project.

Deleting an Action also stops it if it is currently running.

## Empty, loading and error states

A project with no Actions shows a short explanation and an **Add action**
button in the middle of the tab. While the list loads, the tab shows
placeholder rows. If the list can't be loaded, for example because
`.ai-leash/actions.json` has a syntax error, the tab shows the error and a
**Try again** button.
