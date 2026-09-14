# Tools and permissions

The agent can do more than answer questions. With access to your project, it
can inspect files, search for information, make changes, run commands, and
keep track of useful project context. These tools let it investigate a task
and carry out the work instead of only describing what you could do yourself.

## What the agent can do

### Explore your project

The agent can:

- Read files, including selected sections of large files.
- List the files and folders in your project.
- Search across project files for text or patterns.

These are read-only activities, so they do not change your project and do not
need an approval prompt.

### Make changes

When you ask the agent to work on your project, it can:

- Edit part of an existing file.
- Create a new file or replace the contents of an existing file.
- Update project or general notes that help it remember useful context in
  future conversations.
- Create named Actions for commands you use regularly.

Before a change is made, the app shows you what the agent wants to change,
including a readable before-and-after view for file edits. You can review it
before deciding whether to approve it.

### Run commands

The agent can run a command in your project to inspect its output, perform a
task, or check its work. Commands run for a limited time and the result is
returned to the conversation.

You can also create named Actions for recurring commands, such as starting a
development server. Creating an Action requires approval. Once you have
approved and created it, the agent can start, stop, and check that Action
without asking you to approve the same predefined command every time.

For longer-running work, see [terminal.md](./terminal.md).

### Work with additional agent help

When available, the agent can delegate separate pieces of work to background
sub-agents. It can then show you which sub-agents are running and read their
results. Any actions those sub-agents want to take are still subject to the
permission rules.

For more about this, see [agent-chat.md](./agent-chat.md#sub-agents).

### Use project skills

Projects may provide optional skills with specialized instructions. The
agent can load one when it is relevant to your request. Skills add guidance
for a particular kind of work; they do not bypass the app's permission
controls.

For more about skills and remembered context, see
[context-and-memory.md](./context-and-memory.md).

## Why permission prompts appear

Some actions can change files, alter project settings, or execute commands.
Those actions may have consequences beyond the current conversation, so the
app asks for your approval before allowing them.

In **Ask** mode, you receive a prompt whenever the agent requests permission
for an action that needs it. The prompt explains what the agent wants to do:

- For a file change, you can review the proposed additions, removals, and
  surrounding unchanged lines.
- For a command, you can read the command before it runs.
- For another approved operation, you can review the description shown by the
  prompt.

The agent waits for your decision. Nothing is changed or run until you
approve it.

## Your choices

When a prompt appears, choose:

- **Approve** to allow that specific request.
- **Deny** to block it. The agent is told that you denied the request and can
  adjust its approach or ask what you would prefer.

There is no separate "always allow this action" choice on an individual
prompt. In Ask mode, later file changes and commands produce their own
prompts, so you remain involved in each approval.

The permission control beside the chat input also lets you choose:

- **Ask** — show a prompt before every action that needs approval. This is
  the default and gives you the most oversight.
- **Bypass** — automatically approve permission requests for the current
  conversation, without showing prompts. Use this only when you are
  comfortable letting the agent carry out those actions on your behalf. You
  can switch back to Ask at any time.

Read-only exploration does not require permission in either mode. Actions
that you have already defined are also treated as pre-approved when the
agent starts or stops them.

## Staying in control

The agent works within the project you opened, and permission prompts give
you a chance to inspect consequential actions before they happen. You can
keep Ask mode enabled while reviewing changes one at a time, deny anything
that does not match your intent, or use Bypass for a conversation where you
want the agent to work with fewer interruptions.

If you are unsure what a proposed command or change will do, deny it and ask
the agent to explain or take a safer, smaller step.
