# Actions

An Action is a saved command for the current project. Give it a short name,
such as `dev`, `build`, or `test`, and enter the command it should run, such
as `npm run dev`, `npm run build`, or `npm test`.

Actions are useful for commands you run often. Instead of retyping a command
in a terminal, you can start it from the app whenever you need it. Your
Actions are saved with the project, so they are available the next time you
open that project.

## Create an Action

1. Open the **Actions** tab in the sidebar.
2. Select **Add action**.
3. Enter a name that helps you recognize the command.
4. Enter the command to run.
5. Select **Save**.

For example, create an Action named `dev` with the command `npm run dev` to
keep a development server ready to start.

## Run an Action

In the **Actions** tab, select the play button next to a stopped Action. AI
Leash starts the command in the background and opens its output in a terminal
tab. The terminal shows output while the command is running, so you can watch
a development server start, check a build, or follow test results.

You can also select an Action's name to open its terminal view. For quick
access, the most recently used Action appears in the title bar when Actions
are available. Use the dropdown there to choose another Action.

If an Action is already running, starting it again does not create a second
copy of the command.

## Stop an Action

Select the stop button next to a running Action. The Action changes to
**stopped**, and its command is ended. You can select the play button again
later to start a fresh run.

## Edit or delete an Action

Hover over an Action in the sidebar to reveal its controls:

- Select the pencil button to change its name or command, then select
  **Save**.
- Select the trash button to remove it from the project.

Deleting an Action also stops it if it is currently running.
