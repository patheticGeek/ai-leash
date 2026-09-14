# Terminal

AI Leash includes an interactive terminal alongside your conversation with an
agent. Use it for commands you want to run yourself, or to watch commands
that an agent starts while it works on your project.

The terminal is a real shell, so it supports the commands, prompts, and
interactive programs you normally use in your project. It is different from
the agent's shell tool, which lets an agent run a command and return its
output in the conversation. See [Tools](./tools.md) for more about that
separate feature.

## Open a terminal

1. Open the tab picker with the **+** button in the side panel.
2. Choose **Terminal**.
3. Type a command and press **Enter**.

The terminal opens in the project you are currently working in. You can use
it to inspect files, install dependencies, run tests, start a development
server, check version-control status, or perform any other task supported by
your usual command-line tools.

You can interact with a running command just as you would in a normal
terminal. For example, press **Ctrl+C** to stop a process that is running in
the foreground. The terminal adjusts to the available space as you resize the
side panel.

## Use multiple terminal tabs

Each time you choose **Terminal** from the tab picker, AI Leash opens another
independent terminal tab. This is useful when you need to keep several
processes running at once, such as:

- a development server in one tab;
- tests, logs, or a file search in another;
- a separate shell for quick commands.

Switch between terminals by selecting their tabs. Close a terminal with the
**x** on its tab when you are finished with that shell and its running
processes.

## Watch an Action

Actions are named commands that you can save and run repeatedly, such as
`npm run dev`, a test command, or a project-specific script. They are useful
for commands that you and the agent use often, especially commands that stay
running in the background.

Open the **Actions** tab from the tab picker to:

- add an Action by giving it a name and command;
- run or stop a saved Action;
- edit or delete an Action;
- open the Action's terminal output.

Selecting an Action opens its own terminal tab. When the Action is running,
that tab shows its live output, and you can interact with the process there
when it accepts input. If the agent starts an Action, you can open the same
Action tab to follow along without losing the output that has already been
produced. When you run the Action again after stopping it, the tab follows
the new run.

## Everyday use with an agent

The terminal is a convenient place to verify or complement the agent's work:

- run a test or build after the agent makes changes;
- inspect the current project state while discussing the next step;
- keep a development server available while the agent edits files;
- view the output of a long-running Action without putting it in the chat;
- run a one-off command yourself when you want direct control.

Terminal sessions belong to the project and conversation you are working in,
so you can keep your command-line work next to the relevant agent
conversation.
