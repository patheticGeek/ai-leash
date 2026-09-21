# Agent chat

AI Leash's chat panel is where you ask an agent to investigate a project,
explain code, plan a change, or carry out work with you. The agent can stream
its reply, inspect files, use tools, and ask for approval before making
changes or running commands.

Each conversation remembers its own agent and model choice. This lets you use
a local model for one project, an OpenAI-compatible service for another, and
an external agent such as Claude Code or GitHub Copilot in a third without
changing the other conversations.

## Start a conversation

Open a project and type a request in the chat panel. Press **Send** or use
the keyboard shortcut shown by the input: **Enter** sends and
**Shift+Enter** inserts a new line. If you would rather write multi-line
messages, turn on **Compose mode** in Settings > Preferences > Chat; then
**Enter** inserts a new line and **Ctrl+Enter** sends. The conversation is saved with the
project and can be reopened from the project history; see
[conversation history](./conversation-history.md).

The agent's response appears as it is produced. While it works, the panel can
show:

- **Thinking**, when the selected model or agent provides a reasoning stream.
- **Tool activity**, such as reading a file, searching the project, editing a
  file, or running a command.
- **The answer**, rendered with Markdown formatting, including code blocks,
  lists, tables, links, and headings. A single line break in the text is
  shown as a line break.

Each code block has a header showing its language and a copy button. Blocks
in a shell language (such as `bash` or `sh`) also have an **Open in a new
terminal** button, which opens a terminal tab with the command typed at the
prompt but not run, so you can review or edit it first.

Thinking and tool activity are collapsed by default so the conversation stays
readable. Expand an activity group to inspect all of the steps, or expand an
individual tool entry to see its inputs and output. A failed tool call is
marked as failed and its output remains available for inspection.

Every message has a timestamp and a copy button. The final assistant message
also shows how long the agent spent working once the reply is complete. The
timing stays accurate if you switch to another conversation while the agent
works.

The transcript follows new output while you are at the bottom. Scroll up to
read earlier messages and it stops following; a **Latest** button appears to
jump back down.

## Choose who answers

The picker in the chat bar combines all available ways to answer the
conversation:

- **Ollama models** available from your configured Ollama server.
- **Saved OpenAI-compatible providers**, such as OpenAI, OpenRouter, or a
  self-hosted service.
- **External ACP agents**, including Claude Code and GitHub Copilot when they
  are configured.

Open the picker, search if needed, and select an option. Options are grouped
under a heading for each source: every Ollama connection, every saved
OpenAI-compatible provider, and every ACP agent (for example, "GitHub
Copilot" followed by that agent's models). The current choice is marked with
a check. The selection applies
to the current conversation and is used for its next message. It does not
change conversations that already have their own selection. A new
conversation starts with the current default, then keeps its own choice after
you use it.

The picker also shows an ACP agent's model choices when that agent advertises
them. If an agent has not advertised model choices, it still appears as an
agent option and uses its own default model. AI Leash remembers the last
model list each agent reported and refreshes it in the background, so the
list is available as soon as you open a conversation, and one agent failing
to respond does not empty its list.

### Built-in providers

The built-in agent can use either:

- **Ollama**, connected to an Ollama server at the host configured in
  Settings. Ollama models are discovered automatically and appear in the
  picker with their context-window information when available.
- **An OpenAI-compatible API**, configured with a label, base URL, API key,
  and model ID in Settings. Because compatible services do not all provide a
  reliable model catalog, enter the model ID supplied by that service.

Open Settings from the gear button. Use the provider section to change the
Ollama host or add, edit, remove, and activate saved OpenAI-compatible
configurations. Provider settings are used by the conversations that select
that provider; the model or provider selection itself is still
conversation-specific.

### External agents

An external ACP agent is a separate agent program that manages its own model,
tools, and permissions. AI Leash presents its replies and activity in the
same chat panel, so you can switch between the built-in agent and an external
agent without learning a different chat interface.

The agent backend settings include ready-to-use entries for:

- **Claude Code**, which uses your existing Claude Code sign-in.
- **GitHub Copilot**, which uses your existing Copilot CLI sign-in.

The corresponding command-line program must be installed and authenticated
on your computer. You can also add another ACP-compatible agent in Settings
by giving it a label and launch command. If an agent cannot be started, the
error usually means the command is misspelled, the program is not installed,
or it is not available on the desktop application's PATH.

An external agent may expose additional controls:

- **Model**: choose from the fixed model list supplied by that agent.
- **Effort**: choose a thinking or reasoning level when the agent supports
  one. Options and names come from the agent, so not every agent offers this
  picker.

These controls are next to the main model/agent picker. Changing one affects
the current conversation. If the app has to reconnect an external agent, it
restores the conversation's selected model and effort when the agent supports
them.

You can switch a conversation from one external agent to another, or to the
built-in agent, at any time. While the new agent connects, the picker shows a
spinner and applies the model you chose once the agent is ready. An external
agent can only resume its own earlier sessions, so after switching to a
different one, the transcript shows a notice that the agent doesn't support
resuming a previous session and can't see the conversation's earlier history.
The messages stay visible for you; they are just not part of what the new
agent knows.

## Work with tools safely

Agents can use project tools to inspect and modify files or run shell
commands. In **Ask** permission mode, the chat input is replaced temporarily
by a permission request when approval is needed. Review the title and details,
then choose **Approve** or **Deny**.

The permission mode picker in the chat bar has two choices:

- **Ask**: request approval for edits, shell commands, and other actions that
  need permission.
- **Bypass**: automatically approve permission requests for this
  conversation. Use this only when you understand and trust the work the
  agent is performing.

An external agent uses the same approval prompt when it asks AI Leash for
permission. Stopping a turn sends a cancellation request to the external
agent as well, and Stop works even while the agent is partway through a
turn.

## Answer an agent's questions

An external agent can stop mid-turn to ask you for structured input, such as a
choice between approaches or a value it needs. When it does, the chat input is
replaced by a short form, one question at a time, with the agent's message
above it. The conversation's row in the sidebar highlights so you can find it
if you're in another conversation.

- Pick an option, enter a value, or select several, depending on the question.
  Use **Skip** on optional questions, and **Previous**/**Next** to move around.
- **Submit** sends your answers to the agent.
- **Decline** tells the agent you don't want to answer. The close button (or
  `Esc`) dismisses the form without answering, and so does stopping the turn.

Bypass permission mode doesn't apply here — the agent is asking you, not
requesting approval, so a form always waits for you.

To run a command yourself rather than asking the agent to use a tool, use
shell mode from the chat input when it is available. The input is visibly
marked as shell mode, and the command's output is shown in the conversation.

## Sub-agents

For requests with independent parts, the main agent can delegate separate
pieces of work to background sub-agents. For example, it might ask one
sub-agent to inspect the user interface while another checks the service
logic, then combine their findings.

Sub-agents:

- Start in the background, so the main conversation does not wait for every
  piece to finish before returning control to you.
- Work from a focused task and their own fresh conversation context.
- Can inspect the project and use the same project tools as the main agent,
  but cannot create more sub-agents.
- Return their final result to the main agent, which can then react to it
  automatically.

When a sub-agent is started, its work appears nested under the corresponding
agent activity entry. Each task has its own labeled thread, and multiple
threads can run at once. Expand the entry to follow a sub-agent's thinking,
tool activity, and result. You can also open a sub-agent's full transcript
from the Sub Agents view; see [the UI shell guide](./ui-shell.md).

The main conversation may briefly show a background activity indicator again
when a sub-agent finishes and the main agent processes its result. This is an
automatic follow-up, not a new message you need to send. A project indicator
in the sidebar also shows activity when work continues while you view another
project.

A finished sub-agent's result appears in the parent conversation as its own
entry, whether the parent is the built-in agent or an external agent, so the
agent's follow-up reply is attached to it rather than to the previous
message. Sub-agent results are saved with the conversation. Clearing the
parent conversation also clears its sub-agent history.

## Send, stop, and queue messages

While the agent is working, **Stop** cancels the current user-initiated turn.
An operation already in progress, such as a shell command, may finish before
the stop takes effect.

You can prepare another request while a turn is running. Select **Queue** to
place it after the current turn. Queued messages are sent in order and can be
removed from the queued-message list before they start.

Background follow-up turns caused by a completed sub-agent do not block you
from sending another request. Your message waits its turn and is processed
without interrupting the existing conversation.

## Retry or regenerate

Use **Retry** on the last message when a response was incomplete, incorrect,
or worth trying again with the same request. AI Leash removes the previous
answer and any tool results after the last user message, then runs that
request again. It does not duplicate your message.

Retry is available only for the latest message, because retrying an older
turn would make the later conversation ambiguous. It is available for the
built-in agent. External ACP agents keep their own conversation state, so
AI Leash does not offer truncate-and-regenerate for those sessions.

## Context and token usage

When usage information is available, a ring beside the chat controls shows
how much of the selected model or agent's context window was used by the
latest turn. Hover or focus the ring to see the used tokens, total context
size, and percentage.

This is a snapshot for the latest request, not a lifetime token counter.
Because the conversation is included in later requests, the prompt portion
reflects the history the agent had to process for that turn. Some
OpenAI-compatible providers do not report a context size, so their ring may
show usage without a percentage or total.

The built-in agent's `/compact` command can summarize an existing
conversation so you can continue with a shorter context. The summary
preserves important decisions and unresolved work while replacing the
earlier transcript used as context. This command is not provided by AI Leash
for external agents; an external agent may offer its own `/compact` command.

For how project instructions, memory, and skills contribute context, see
[context and memory](./context-and-memory.md).

## Slash commands

Type `/` in the chat input to open command suggestions. Continue typing to
filter them. Select a suggestion with the mouse, **Tab**, or **Enter**;
**Escape** dismisses the suggestions without removing what you typed.
Commands can include arguments when the suggestion shows an argument hint.

### Commands provided by AI Leash

These commands are handled by the chat panel rather than sent as a normal
prompt:

| Command | What it does |
| --- | --- |
| `/clear` | Deletes the current conversation's transcript, including its saved sub-agent history. The next message starts a fresh conversation. |
| `/model` | Opens the model and agent picker. |
| `/help` | Shows the local commands and any commands advertised by the active external agent. |
| `/compact` | For the built-in agent, summarizes the conversation and keeps the summary as the starting context for future messages. |

`/compact` is shown only for the built-in agent. If an external agent
advertises a command with that name, its version is sent to that agent
instead.

### Commands provided by external agents

An ACP agent can advertise its own commands, such as project-specific
shortcuts or workflows. They appear in the same suggestions menu and in
`/help`, with the description and argument hint supplied by the agent.
Selecting one inserts it into the input; sending it passes the command and
its arguments to that agent.

The available list can change when an external agent connects or updates its
session. Built-in commands take precedence when they have the same name.

## Claude session limits

When Claude Code reports that you have hit its session limit, the chat shows
a banner with the time the limit resets. Choose **Yes, resume automatically**
and AI Leash sends a "continue working" message for you once the limit has
reset; choose **No** to handle it yourself. Once an automatic resume is
armed, **Cancel** turns it off.

An armed resume keeps waiting if you switch conversations or quit and reopen
the app, because the limit is read from the saved conversation. If the reset
time has already passed when you open it, the banner offers **Yes, continue**
instead. Sending any message of your own ends the pending limit.

## Connection status and errors

The status indicator in the application status area summarizes configured
provider reachability:

- **Gray**: the app has not completed its first check.
- **Green**: every configured provider responded.
- **Amber**: some providers responded and some did not.
- **Red**: no configured provider responded.

Hover the indicator for each provider's state: checking, connected, or
disconnected. A response means the host could be reached; it does not
guarantee that an API key is valid or that a particular model is available.

The chat panel also warns when the provider selected for that conversation
cannot be reached. Check the provider's host or base URL, credentials, model
ID, and whether the service is running. For Ollama, the model picker is
populated from the configured Ollama host. For an OpenAI-compatible service,
the model ID is entered manually because model discovery varies between
services.

If an external ACP agent fails to start, check its installation,
authentication, launch command, and PATH. If the agent cannot restore its
previous session, AI Leash offers **Start new session**; this reconnects it
with a fresh agent-side session while retaining the visible saved transcript
for reference.

## Conversation display and persistence

The panel keeps the visible transcript synchronized while a response is
streaming and restores saved messages when you reopen a project. A
conversation receives a fallback title from its first request; an external
agent may later provide a more descriptive title.

The system context used for the conversation can be expanded from the
transcript when available. It includes applicable project instructions,
memory, and skills, and is refreshed for subsequent requests so changes to
those resources can take effect without opening a new conversation. See
[context and memory](./context-and-memory.md) for details.
