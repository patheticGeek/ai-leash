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
messages, turn on **Compose mode** in Settings > Chat; then
**Enter** inserts a new line and **Ctrl+Enter** sends. The conversation is saved with the
project and can be reopened from the project history; see
[conversation history](./conversation-history.md).

### The new-thread screen

A new thread (one with no message sent yet) opens as a centred landing
column. Its heading reads **New thread in** followed by the project name,
which is a dropdown: it lists your recent projects (with their paths) and
**Add project…**. Choosing another project starts the new thread there
instead, so the worktree and branch bar under the message box switches to
that project's checkout. **Add project…** opens the folder picker and starts
the thread in the folder you add.

Under the message box and the worktree/branch bar, **The agent starts with**
lists, as tokens, what AI Leash will fold into the agent's instructions for
the checkout you picked: the global and project `AGENTS.md` files, global and
project memory, the number of skills and the number of Actions (see
[context and memory](./context-and-memory.md) and
[actions](./actions.md)). The row is hidden when there is nothing to list.
`AGENTS.md` files in subfolders aren't listed, because they are only added
once the agent works in that folder.

The row lists only what the selected agent actually gets. A built-in
provider gets all of the above. An external agent (ACP) gets only the Actions
and skills lists from AI Leash, so only those are shown, with an info icon
explaining that the agent reads its own instruction files and reads AI Leash
memory only when it asks for it.

Once you send the first message, the screen turns into the normal
conversation view with the message box at the bottom, keeping what you had
chosen. The transcript scrolls under the message box and the worktree/branch
bar. Below the message box, messages fade away going down, to the page
colour at the bottom of the window; the worktree and branch buttons have a
frosted backdrop of their own so their names stay readable over it.

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

Thinking and tool activity are compact rows, so the conversation stays
readable. Each row shows a status icon (a spinner while it runs, a check when
done, a red mark when it failed), the tool's name and what it acted on — a
file path, a command, a search. Click a row to open its detail: the thought
itself, or a tool's input and output. A failed tool call keeps its output
(titled **Error**) available for inspection.

Three or more consecutive thinking and tool steps form a group, shown as its
latest step with a muted **Show N more** under it (one or two steps in a row
just show as their rows); click it to list the earlier steps above (the
button becomes **Show less**). A group stays collapsed while it grows, so
the newest step is always the one on show. Sub-agent steps are never part of
a group: starting sub-agents (`spawn_sub_agent`) always gets a row of its
own and splits the steps around it into separate groups.

A sub-agent's result, when it comes back, is a block of its own rather than
a tool row: a one-line system message, **Sub-agent finished · *task* ·
Done** (or **Failed**), with an **Open** button that opens the sub-agent's
transcript in a tab, and **Show**/**Hide** for the result text (open from
the start when the result is short, collapsed when it is long). It is
never inside a group or a **Worked for** row.

Once a reply is complete, everything the agent did before its closing
message — thinking, tool calls and any text in between — folds into a single
**Worked for** row showing how long the turn took and what it did ("1
thought · 4 tools used · 2 messages · 3 sub-agents spawned"; only the counts
that aren't zero, and a `spawn_sub_agent` call counts as the sub-agents it
started rather than as a tool), so only your message and the agent's final
summary stay on show. Click the row to see every step, grouped as it was
while the agent worked, indented a little from the turn's edge (about half
the **Worked for** label's indent) so they read as nested.
A sub-agent result ends the fold like a message does: the steps before it
fold into their own **Worked** row (once the turn is over, and without a
time if no reply came before the result), the result sits after it, and the
steps after it fold into the next one. For example, a finished turn
`[you, thought, read, spawn, grep, result, edit, reply]` shows as *you ·
Worked (1 thought · 2 tools used · 1 sub-agent spawned) · Sub-agent finished
· Worked for … (1 tool used) · reply*; while it is still running, the steps
show as groups instead: *you · [thought, read] · spawn · [grep] · Sub-agent
finished · [edit] · reply*.
While the agent is still working, its steps stay visible as they happen. To
keep every step on show instead, turn off **Collapse finished turns** in
Settings > Chat.

Your messages are bubbles on the right; the agent's replies have no avatar
and use the transcript's full width. Everything in an agent's turn shares one
left edge: its tool rows, the **Worked for** row, the reply text and the
time/copy line all start where the reply's text starts. The
transcript is a centred column (it uses the whole width in a narrow panel).
Every message has a timestamp and a copy button, lined up with the
message's text: under an agent reply they start where the reply's text
starts, under your bubble they end where its text ends. The final assistant message
also shows how long the agent spent working once the reply is complete, when
there is no **Worked for** row above it already showing that. While the agent
works, the end of its reply shows a spinner with **Working for** and the
elapsed time (**Waiting** until it produces anything). The timing stays
accurate if you switch to another conversation while the agent works.

Messages from other chats — a task chat's message to the project chat or
the other way round, and notes another chat left — appear collapsed, as a
centred one-line system message: **Message from #42 · *title*** (or **from
Project chat**; **Note from …** for a note), where the sender is a link that
opens that chat. Click **Show** to read the whole message; whether you left
it open is remembered for the rest of the session. Local notices such as
**Conversation compacted** are one-line system messages too. An empty conversation (for example after
`/clear`) says so; while a saved conversation loads, the transcript shows
placeholder rows in the shape of messages at the bottom, where the latest
messages will appear, and if it can't be read, it says
what failed and offers **Try again** (nothing is deleted).

A conversation opens at its latest message, whether you open it, switch
back to it or its saved history finishes loading, and stays there as long
content such as code blocks finishes rendering. The transcript follows new
output while you are at the bottom. Scroll up to
read earlier messages and it stops following; a round scroll-to-bottom
button with a down arrow appears just above the message box to jump back
down. While there is more transcript scrolled away above, its top edge fades
out under the tab strip.

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
you use it. Each Ollama connection and OpenAI-compatible provider remembers
the model last used on it, so a new conversation on it starts with that model.
Sub-agents started from an ACP agent's conversation run on the default
built-in provider (or the first enabled one, if the default is an ACP agent)
with its last-used model, unless the agent asks for another.

The picker also shows an ACP agent's model choices when that agent advertises
them. If an agent has not advertised model choices, it still appears as an
agent option and uses its own default model. AI Leash remembers the last
model list each agent reported and refreshes it in the background, so the
list is available as soon as you open a conversation, and one agent failing
to respond does not empty its list.

A new thread does not start the agent. Its model, effort and mode choices come
from that remembered list, and the agent is started only when you send the
first message. The agent then picks up what you chose before it answers.

If a conversation's model is no longer offered once the model list has
loaded — for example, it was removed from Ollama or the agent stopped
listing it — the picker turns red, an error explains what happened, and
sending is blocked until you pick another model. The conversation keeps the
old model selected rather than switching to another one on its own.

### Built-in providers

The built-in agent can use either:

- **Ollama**, connected to an Ollama server at the host configured in
  Settings. Ollama models are discovered automatically and appear in the
  picker with their context-window information when available.
- **An OpenAI-compatible API**, configured with a label, base URL, API key,
  and model ID in Settings. Because compatible services do not all provide a
  reliable model catalog, enter the model ID supplied by that service. The API
  key is stored in the system keychain (macOS Keychain, Windows Credential
  Manager, or the Secret Service on Linux) and is never shown again; leave
  the field blank when editing to keep it. If the keychain can't be used,
  Settings says so and the key is stored unencrypted in the app's settings
  file instead.

Open Settings from the gear button and select **Agents**. External ACP agents
and the built-in providers are listed in two groups, one row each, with the
default agent marked **Default**. Use a row's **⋯** menu to **Make default**,
**Edit** (for example the Ollama host or an API's base URL, key and model) or
**Delete** it, and **Add an agent** to add an ACP agent, an Ollama server or an
OpenAI-compatible API. Provider settings are used by the conversations that select
that provider; the model or provider selection itself is still
conversation-specific.

Every provider and external agent row in **Settings > Agents** has a switch
to turn it off. A turned-off agent stays saved, but it is hidden from the chat
bar picker, skipped by the background connection check and model discovery,
and cannot be the default for new conversations (the default moves to the
next enabled agent). Turn it back on at any time. A conversation that already
uses a turned-off backend keeps it selected, but sending is blocked (a notice
explains why, and queued messages are dropped) until you turn it back on or
pick another agent from the chat bar.

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
- **Mode**: the agent's own permission modes, such as Claude Code's
  **Default**, **Accept Edits**, and **Plan Mode**. When an agent offers
  modes, the permission picker shows them instead of Ask/Bypass (see
  [Work with tools safely](#work-with-tools-safely)).

These controls are next to the main model/agent picker. Changing one affects
the current conversation. If the app has to reconnect an external agent, or
starts it for a new thread's first message, it applies the conversation's
selected model, effort, and mode when the agent supports them. When the agent changes its own mode, for example leaving plan
mode once you approve a plan, the picker follows it and the conversation
remembers the new mode.

You can switch a conversation from one external agent to another, or to the
built-in agent, at any time. While the new agent connects, the picker shows a
spinner and applies the model you chose once the agent is ready. An external
agent can only resume its own earlier sessions, so after switching to a
different one, a warning above the message box says that the agent doesn't
support resuming a previous session and can't see the conversation's earlier
history.
The messages stay visible for you; they are just not part of what the new
agent knows.

Every time an external agent connects, new session or resumed, the first
message it gets starts with a short block from AI Leash describing the chat
(for a task chat, the task and whether it has its own worktree, say) and naming the
built-in guides. Later messages on the same connection don't repeat it, and
it isn't added to the transcript. See [What the agent is told about its
chat](./context-and-memory.md#what-the-agent-is-told-about-its-chat).

A conversation keeps its external agent's session only once something has
been sent in it. Opening a chat that has no messages yet, such as a
project's board chat, connects the agent but doesn't save the session, and
a conversation with no messages never tries to resume one, so it never
shows a "couldn't restore its previous session" error.

## Work with tools safely

Agents can use project tools to inspect and modify files or run shell
commands. In **Ask** permission mode, the chat input is replaced temporarily
by a permission request when approval is needed. Review the title and details,
then choose **Approve** or **Deny**.

The permission mode picker in the chat bar offers the external agent's own
modes when it has any (see above). Otherwise it has two choices:

- **Ask**: request approval for edits, shell commands, and other actions that
  need permission.
- **Bypass**: automatically approve permission requests for this
  conversation. Use this only when you understand and trust the work the
  agent is performing.

While an agent's own modes are shown, Ask/Bypass is not in effect: the agent
decides from its mode when to ask, and every request it does send waits for
your answer. A conversation's Ask/Bypass choice is kept, and applies again if
you switch it to an agent or model without modes.

An external agent uses the same approval prompt when it asks AI Leash for
permission. Stopping a turn sends a cancellation request to the external
agent as well, and Stop works even while the agent is partway through a
turn.

## Answer an agent's questions

An external agent can stop mid-turn to ask you for structured input, such as a
choice between approaches or a value it needs. When it does, the chat input is
replaced by a short form in the same place, one question at a time, with the
agent's message above it. The conversation's row in the sidebar highlights so you can find it
if you're in another conversation.

- Pick an option, enter a value, or select several, depending on the question.
  Use **Skip** on optional questions, and **Previous**/**Next** to move around.
- When a question comes with a free-text box (an "Other" answer, or a note on
  your pick), it sits under that question's options rather than on a page of
  its own.
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
  but cannot create more sub-agents. Their guidance says so: they're told
  they're a one-shot job for the chat that spawned them and that their
  last message is the result (see [What the agent is told about its
  chat](./context-and-memory.md#what-the-agent-is-told-about-its-chat)).
  An ACP sub-agent isn't offered AI Leash's sub-agent tools either.
- Return their final result to the main agent, which can then react to it
  automatically.

When a sub-agent is started, the `spawn_sub_agent` row says how many it
started. Open the row to see one line per sub-agent: whether it is running,
finished or failed, its task, model, how long it ran and its latest step, and
a button that opens its full transcript in a tab. Multiple sub-agents can run
at once. You can also open a sub-agent's transcript from the Sub Agents view;
see [the UI shell guide](./ui-shell.md). A sub-agent's tab is the same transcript a
conversation uses, without the message box: the same grouping, rows, fades,
scroll-to-bottom button and empty / loading / error states, opening at the
end and following new output. A line at its top shows its model and whether
it is running, finished or failed.

While any sub-agent of the conversation is running, a compact banner sits
just above the message box, as the last row of the banner stack: a spinner,
"3 sub-agents running" and how long the longest has been going, with a
"View" button that reveals the Sub Agents view in the side panel. It's gone
as soon as none is running. Starting a sub-agent doesn't switch the side
panel to the Sub Agents view on its own: the banner is the cue, and its
"View" button the way there. It reads the same live list as the Sub Agents
view (updated by each sub-agent's start/finish event, no polling), so it
works the same for local and ACP conversations. It's
`banners/SubAgentsBanner.tsx`.

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

Sub-agents are for short, self-contained pieces of one request; you can
watch them but not talk to them. For longer work you want to steer
yourself, put it on the [project board](./project-board.md) as a task
instead: a started task gets a full chat of its own (in its own git
worktree), which you can write in like any other, and which reports back
to the project chat.

## Rich replies

When data reads better as a table, chart or a row of figures than as prose,
the agent can show it that way: a sortable table, a bar or line chart, stat
tiles, key/value details, lists, progress bars, status badges, callouts,
cards, tabs, code, and buttons to pick from. Ask for it ("compare these five
models in a table and a chart") or let the agent decide; it's told the
feature exists in its standing guidance (see [Tools](./tools.md)).

It's part of the reply text, so it works the same for the built-in agent and
for external ACP agents such as Claude Code or Copilot: the agent writes a
fenced code block with the language `ui` holding JSON that describes what to
show, and the transcript renders it with the app's own components instead of
showing the code. For example:

```ui
[
  {"type": "table", "columns": ["Model", "Latency (ms)"],
   "rows": [["A", 320], ["B", 610]]},
  {"type": "chart", "title": "Latency", "labels": ["A", "B"],
   "series": [{"name": "Latency", "values": [320, 610]}], "unit": "ms"}
]
```

The block is one node or an array of nodes shown top to bottom. The node
types are `table` (string or `{key, label, align}` columns; rows as arrays or
objects; click a header to sort), `chart` (`bar` or `line`, `labels` and up
to eight `series`), `stats` (stat tiles with an optional change and tone),
`keyValue`, `list`, `progress`, `badge`, `status`, `heading`, `text`,
`divider`, `callout`, `code`, `card`, `tabs`, `stack` (vertical or
horizontal) and `choices`. Tones are `neutral`, `info`, `success`, `warning`
and `error`. The full field list is in `src/lib/uiSpec.ts`, which validates
it, and in the built-in `rich-replies` guide (`src-tauri/guides/rich-replies.md`)
that agents read with `read_guide` before writing a block; the two are kept
in sync, and a test checks the guide covers every node type.

- **Safe by construction.** The JSON is data only. Nothing in it runs: there
  are no scripts, HTML, styles or links to load, and the agent can't reach
  anything beyond the fixed set of components above. Size limits (nesting
  depth, node, row and point counts) keep a runaway block from slowing the
  transcript down.
- **While streaming**, a `ui` block whose closing fence hasn't arrived yet
  shows a small "Rendering view…" placeholder rather than half-written JSON.
- **Invalid blocks degrade gracefully.** Bad JSON, an unknown node type, or a
  wrong field (for example a chart series with the wrong number of values)
  shows the block's raw source with a one-line note saying what's wrong. A
  block left unclosed when the reply ends is still rendered if its JSON is
  complete. If a valid block somehow fails while rendering, the same raw
  fallback appears instead of breaking the transcript.
- **Choices send a message.** A `choices` node shows buttons; clicking one
  sends its message (or its label) as your next message, exactly as if you
  had typed it, including the take-over prompt in a followed task chat. The
  buttons are disabled while a reply is running, and once one is picked.
- **Copying gives readable text.** The message's **Copy** button replaces
  each valid `ui` block with a plain-text version — tables and charts become
  Markdown tables, stats and key/value items become lines, choices become a
  list — so pasting it elsewhere reads naturally. Invalid blocks are copied as
  written.

Rich blocks render anywhere the app shows an agent's Markdown, including
sub-agent results and task descriptions; the choice buttons only work in a
chat transcript. The renderer is `src/ui/UiBlock.tsx` (Astryx components
throughout) with a small SVG chart in `src/ui/Chart.tsx`, since Astryx has no
chart component; both have Storybook stories.

## Send, stop, and queue messages

While the agent is working, **Stop** cancels the current user-initiated turn.
An operation already in progress, such as a shell command, may finish before
the stop takes effect.

You can prepare another request while a turn is running. Select **Queue** to
place it after the current turn (or press **Ctrl+Enter**). Queued messages
show as chips at the top of the message box, are sent in order, and can be
removed with a chip's **×** before they start.

Background follow-up turns caused by a completed sub-agent do not block you
from sending another request. Your message waits its turn and is processed
without interrupting the existing conversation.

## Mention files with @

Type `@` in the message box (at the start or after a space) to pick a file
or folder from the chat's working directory — its worktree, for a task chat.
Keep typing to filter: the match is fuzzy over the whole relative path
(`src/app/Ap` finds `src/app/AppShell.tsx`), skips what `.gitignore` ignores,
and lists folders with a trailing `/`. Use the arrow keys and **Tab** or
**Enter** to pick, or **Escape** to close the list. The pick is written into
the message as `@path` (quoted, `@"my file.md"`, when the name has spaces);
**Backspace** right after a picked mention removes it whole. You can point at
lines too, by adding them after the path, `@path:12` or `@path:12-18`, as a
review does (see [Send a code review](#send-a-code-review)). The whole file
is still attached, once, however many times it's mentioned.

You can also right-click a file or folder in the Files tab and choose
**Mention in chat**, or drag it from the tree onto the message box.

When you send, every `@path` in the message that names something inside the
working directory goes to the agent with it:

- **Built-in agent**: the file's current contents (or, for a folder, a
  listing up to three levels deep) are attached to your message. Each file is
  capped at 100 KB with a note that it was cut, and one message's
  attachments at 400 KB; binary files and anything past the cap go as the
  path only. The attachment is part of the conversation history, so a retry
  sees the same snapshot.
- **External ACP agents**: the file is added to the prompt as ACP content —
  an embedded `resource` with its text when the agent advertises
  `embeddedContext`, otherwise a `resource_link` (which every ACP agent
  accepts). The message text still names the path either way.

In the sent message, each mention shows in place as a small badge instead of
the `@path` text: the file's name plus its lines when you gave them
(`AppShell.tsx:12-18`), with the full path in its tooltip. Select a file's
badge to open the file in a tab. If the badge has lines, the editor scrolls
to them and selects them. An `@` that doesn't name an attached file stays as
you typed it. A mention that only appears inside code, where it can't be a
badge, shows as a chip under the message instead.

Under the hood, the stored message ends in an `<ai-leash-mentions>` trailer
naming the paths (and, for the built-in agent, holding the contents). The
transcript hides it and the chat title ignores it. The picker uses the
`search_mentions` command; `src-tauri/src/mentions.rs` finds the `@path`s and
writes the trailer. Reading the files and handing them to an agent is the
shared `src-tauri/src/file_context.rs` (size caps, `native_block` for the
built-in agent, `acp_blocks` for ACP), which any feature that attaches files
to a prompt should use. The frontend side (`src/lib/mentions.ts`,
`useMentionPicker`, `MentionMenu`) mirrors the slash-command menu.

## Attach images and files

`@` mentions only reach files inside the working directory. To add anything
else, such as a screenshot, a log from elsewhere on disk or a file from your
Downloads folder, attach it:

- **Paste** into the message box: an image on the clipboard, or files copied
  in your file manager.
- **Drop** files from the OS anywhere on the message box's dock.
- Select the **paperclip** button in the box's footer to choose files in the
  system file dialog.

Attached files show in the drawer at the top of the box before you send:
images as thumbnails, other files as a chip with their name and size. Each
has a remove button. You can send a message that has attachments and no
text. The same chips show under the sent message. Select an image to view it
in a lightbox with zoom that steps through the message's images. The window
dims, and the image shows at up to its natural size, within a box of
`max(70vw, min(92vw, 720px))` by `max(90vh, min(96vh, 560px))` including
its caption. The viewer opens at once; an image whose bytes haven't loaded
yet says so in its caption, and one that can't be read (its stored copy is
gone, say) shows the error there instead. Select a file to **Open** it with the system's default app, or **Show in
folder** to reveal it in the file manager. A file's tooltip shows its
original path and size.

Each attachment is one of three kinds, decided from its bytes:

- **Image** (PNG, JPEG, WebP, GIF): an image over 2048 px on its long edge or
  over 5 MB is downscaled and re-encoded until it fits 5 MB. A GIF is never
  re-encoded, so one over 5 MB is refused.
- **Text**: anything that decodes as UTF-8, such as source, logs, Markdown,
  JSON or CSV. Only the first 1 MB is kept, and the chip turns yellow with a
  warning when the file was longer.
- **Binary**: anything else is kept as a reference (path, mime type and size)
  without its contents. It's copied when it's 50 MB or smaller, so you can
  still open it later.

Each file is copied into the app's own `attachments` folder (next to the
database, under `~/.config/ai-leash`) the moment you add it, so the transcript
keeps working after the original moves or is deleted. A pasted image has no
path, so that copy is all there is.

How the agent receives attachments depends on its backend. A native provider
(Ollama or OpenAI-compatible) gets them with the message they were attached
to:

- **Images** go as images: an `image_url` content part holding a `data:` URL
  for an OpenAI-compatible host, an entry in the message's `images` for
  Ollama.
- **Text files** are added to the message as a fenced code block labelled
  with the file's path (its name, for pasted text). When the file was cut to
  1 MB, a note after the block says so.
- **Binary files** become a line naming the file's path, mime type and size,
  so the agent can use its own file tools on it.

When the picked model can't see images, a warning above the message box says
so while images are attached. Those images are then sent as a line naming
their path, like a binary file, instead of being dropped. Ollama reports
vision through `/api/show`. An OpenAI-compatible host can't be asked, so the
first image goes through as an image. If the host turns it down (a 4xx that
mentions images), the turn is sent again with path lines, and the model is
remembered as non-vision for the rest of the run, which also shows the
warning. `/compact`'s summary call always gets the path line for an image.

Attachments are read from their stored copies each time a request is built,
and they're stored on their message, so a resumed chat replays them in its
history like the first turn did. A copy that has gone missing is sent as a
line saying the file is no longer available.

An ACP agent gets each one as a content block after the
message text, in the richest form it advertised in `initialize`'s
`promptCapabilities`:

- **Image**: an `image` block (base64, with a `file://` uri to the stored
  copy) if the agent advertises `image`. If it doesn't, the composer won't
  take images for that chat: one you add is dropped with an error, and the
  paperclip's tooltip says so. Before the agent has connected, images are
  let through and go as a `resource_link` if it turns out not to take them.
- **Text**: an embedded `resource` with the file's text (and a note if it
  was cut at 1 MB) if the agent advertises `embeddedContext`, otherwise a
  `resource_link`.
- **Binary**: an embedded blob `resource` if the agent advertises
  `embeddedContext` and the stored copy is 5 MB or smaller, otherwise a
  `resource_link`.

A `resource_link` points at the stored copy (or, for a binary file too big to
copy, the original) with a percent-encoded `file://` URI, plus its name, mime
type and size. It's the baseline every ACP agent accepts. An attachment whose
file is gone from disk is left out.

An image an ACP agent sends back in its reply (an `image` content block in
`agent_message_chunk`) is staged like a pasted one and shows under that
message as an image chip.

Under the hood, `src-tauri/src/attachments.rs` stages each file as
`<attachments>/<id>/` (the copy plus a `meta.json` holding its `Attachment`).
It does this through `stage_attachment_path` or `stage_attachment_bytes`; the
latter takes the raw file as the request body, with the name in an
`x-attachment-name` header. `send_prompt` takes the staged ids, loads them
and passes them to `Backend::send`. They're stored with the user message as
`ChatMessage::attachments`, in the `messages.attachments` JSON column, and
returned on `PersistedMessage`. That field isn't serialized into a provider
request: `provider/wire.rs` builds each provider's message list from it,
and also holds the per-model vision cache. `ModelClient::supports_vision`
answers from that cache (asking Ollama when it has no answer yet), and the
`model_supports_vision` command passes it to the composer
(`useModelVision`, `NoVisionBanner`). At startup,
`attachments::sweep` removes staged attachments that no message references
and that are more than a day old (removed chips, deleted conversations).
Thumbnails and the viewer load an image's stored copy over Tauri's asset
protocol (`convertFileSrc(storedPath)`), so the webview loads, decodes and
caches it natively and both share one URL. The protocol is on in
`tauri.conf.json` with an empty scope; `lib.rs`'s setup allows only
`attachments::root()`, so nothing else on disk is reachable through it. The
URL is in the `<img>` from the first render, and the thumbnail's 64×64 box is
fixed from the start, so nothing in the transcript changes height as images
load. A background `decode()` turns a failed read into an error in the
chip's tooltip and the viewer's caption.
`open_attachment` opens or reveals the file (the original when revealing, if
it still exists, else the copy). On the frontend, `useAttachments` owns the
composer's list along with paste, drop (Tauri's `onDragDropEvent`, hit-tested
against the dock) and the dialog. `AttachmentChips` renders the chips in both
places. Queued messages carry their attachments too.

For ACP agents, `acp/attachments.rs` builds the blocks (`prompt_blocks`, with
`PromptCaps` read from `initialize` in `process.rs`) and stages the agent's
images (`stage_agent_image`). `AcpCommand::Prompt` carries the attachments
next to the `@path` files. The agent's `image` capability is published as
`images` on `AcpSessionOptions`, which `useChatSession` turns into
`imagesUnsupportedReason` for the composer. In `events.rs`, an image goes on
the open assistant run's `attachments` (`db::set_message_attachments` on its
row) and is emitted on `chat://{id}/attachment`, where `appendAttachment`
adds it to the streaming message. A tool call's image output is summarized
as `[image: <mime>]`.

## Send a code review

You can review the agent's work like a pull request. In a file tab, hover the
line numbers and select the **+** beside a line to comment on it, or drag the
**+** up or down to comment on a range of lines (see
[Comment on lines](./editor.md#comment-on-lines)). Comments are drafts: they
belong to the conversation the file is open in and are kept until you send
them, even across restarts.

Draft comments show as chips at the top of the message box, one per comment,
labelled with the file and lines. Select a chip to open its file, or its
**×** to delete the comment. **Send review (N)**, beside Send, posts every
comment as one message, grouped by file: each comment is the file tagged at
its lines, like `@src/app/AppShell.tsx:12-18`, followed by your comment.
Whatever you've typed in the message box goes with it as an overall note.
The code itself isn't pasted in. Each commented file goes with the review
once, the way [`@` mentions](#mention-files-with-) attach files: its
contents for the built-in agent and an ACP resource for external agents. In
the sent message, each comment's heading shows its file and lines as a badge
(`AppShell.tsx:12-18`); select it to open the file at those lines. There are
two exceptions, which quote the code
they're about: an outdated comment (see below), since its lines now say
something else, and a comment on a file outside the chat's working
directory, which can't be attached and is named by its plain path and lines.
Once it's sent, those comments are cleared.

A comment follows its code. If the lines it's on move (say, the agent adds
code above them), it moves with them. If they change, the comment is marked
outdated, stays at its original line, and is sent flagged as outdated with
the code as it was when you commented.

Send review waits for the agent's current turn to finish, like Send.

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

When usage information is available, the message box's footer, just left of
the send button, shows how much of the selected model or agent's context window was used by
the latest turn ("62% of context"). Hover or focus it to see the used tokens,
total context size, and a bar of the percentage.

This is a snapshot for the latest request, not a lifetime token counter.
Because the conversation is included in later requests, the prompt portion
reflects the history the agent had to process for that turn. Some
OpenAI-compatible providers do not report a context size, so for them it
shows the tokens used without a percentage or total.

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

## Usage limits

When an agent's turn fails because you've hit a usage limit (Claude Code's
5-hour or weekly limit), the chat shows a warning banner — "Claude 5-hour
usage limit reached" — with the time the limit resets. Choose **Yes, resume
automatically** and AI Leash sends a resume message for you once the limit
has reset; choose **No** to handle it yourself. Once an automatic resume is
armed, the banner counts down to it ("resuming in 1:42:07"), and **Don't
resume** turns it off.

The resume message tells the agent the limit has reset for this chat and for
every other chat that uses the same agent, task chats and sub-agents
included, so it doesn't go on believing (from its history before the limit)
that they're still blocked and do their work itself. It names the conversation as a
"chat", "task chat" or "sub-agent". A chat's message also says that task
chats it follows and sub-agents that stopped on the limit don't resume on
their own, so it should message those task chats and spawn sub-agents again
for unfinished work.

The limit is read from the failed prompt's ACP (JSON-RPC) error rather than
from the wording of the message: error data with `errorKind: "rate_limit"`
marks it, and `rateLimit.resetsAt` gives the reset time. If an agent leaves
`resetsAt` out, the time printed after "resets" in the message is used
instead ("12:40pm", "1am", "13:05", "Sep 17, 3:30am"). AI Leash saves the
pending limit with the conversation, so an armed resume keeps waiting if you
switch conversations or quit and reopen the app, and later rows in the
transcript (the error itself, board notes) don't hide it. If the reset time
has already passed when you open it, the banner offers **Yes, continue**
instead. The limit ends when a message goes out — your own, a wake from the
project chat, or the automatic resume — or when a turn completes.

The banner shows in normal chats, the project chat, and board task chats the
project chat isn't following. A task chat the project chat is following
doesn't show it, since the project chat handles that task; handing the task
back to you brings the banner back.

## Connection status and errors

AI Leash checks that the provider selected for the open conversation can be
reached, every few seconds while that conversation is open. A response means the
host could be reached; it does not guarantee that an API key is valid or that a
particular model is available.

The chat panel warns when that check fails. Check the provider's host or base URL, credentials, model
ID, and whether the service is running. For Ollama, the model picker is
populated from the configured Ollama host. For an OpenAI-compatible service,
the model ID is entered manually because model discovery varies between
services.

If an external ACP agent fails to start, check its installation,
authentication, launch command, and PATH. If the agent cannot restore its
previous session, AI Leash offers **Start new session**; this reconnects it
with a fresh agent-side session while retaining the visible saved transcript
for reference.

Every notice about the conversation appears as a banner in one stack directly
above the message box, not over the transcript, so it stays next to the
message it affects and never covers messages as you scroll. The stack is
ordered by severity, top to bottom:

1. **Errors** — something broke: a provider or agent error (including a lost
   connection or an agent process that exited mid-turn), and a session that
   couldn't be restored (**Start new session**). An error banner can be
   dismissed; the next, different error shows again.
2. **Warnings** — something needs a decision or your attention: earlier
   history not shared with the agent, and an agent's usage limit.
3. **Info** — state you can change: a board task's chat that the project
   chat isn't following (**Hand back to project chat**), and the `/help`
   command list.

Permission requests and an agent's questions don't go in the stack: they take
the message box's place until you answer (see
[Tools and permissions](./tools.md)). Toasts, used only to confirm that
something happened, appear at the bottom-right corner of the window; a toast
never asks you anything.

## HTML previews

When an agent writes HTML — a UI prototype, a mockup, a small interactive
demo — the chat shows it rendered, not just as code. This is plain reply
text, so it works the same for built-in providers and external agents; both
are pointed at it (the native system prompt and the MCP server's
instructions, `tools/guidance.rs`) and read the built-in `html-previews`
guide (`src-tauri/guides/html-previews.md`) with `read_guide`, which asks
for one complete, self-contained document in a fenced block tagged `html`.

- **Preview / Code.** A fenced block tagged `html` (or `htm`) gets a
  **Preview / Code** switch in its header. A whole page (it has a doctype,
  `<html>` or `<body>`) or a block marked ` ```html preview ` opens on its
  preview; a snippet opens on its code. While the reply is still streaming,
  the block stays code until its closing fence arrives, then renders.
- **Size.** The preview sizes itself to its content (the page reports its
  height to the app), up to half the window; taller content gets an
  **Expand** button (up to 85% of the window) and scrolls inside the frame
  past that.
- **Open, Save, Copy.** **Open in a tab** shows it full-size in a centre tab
  of its own; **Save as file** writes it wherever you pick in a Save dialog;
  **Copy** copies the HTML.
- **Files.** A tool call that wrote (or read) an `.html` / `.htm` file has a
  **Preview** button on its row, which opens that file from the
  conversation's checkout in a preview tab, with **Reload** to pick up later
  edits. Only the file itself is loaded — relative links to its CSS, scripts
  or images aren't, so a previewed file should inline them too.

### The sandbox

A preview runs in an `<iframe srcdoc>` with
`sandbox="allow-scripts allow-forms"` and no `allow-same-origin`, so its
scripts run but in an opaque origin: they can't read the app's DOM, storage,
cookies or Tauri globals (any access to `parent` throws), can't navigate the
app, open windows or show modal dialogs. `allow-forms` is only there so a
prototype's own `submit` handler fires. A Content Security Policy is put in
front of the agent's HTML — inline scripts and styles, `data:`/`blob:`
images, fonts and media, and nothing else:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; media-src data: blob:;
form-action 'none'; base-uri 'none'
```

So there is **no network**: no CDN scripts or stylesheets, web fonts, remote
images, `fetch`/XHR/WebSockets/beacons, workers or nested frames. That's
deliberate — a preview is a snapshot of what the agent wrote, it never
reaches out (a `<meta>` CSP in the agent's own HTML can only tighten this,
not loosen it). Link clicks that would leave the page are ignored; a page
that navigates itself by script (`location = …`) or a meta refresh is
caught when the next page loads without the preview's own bootstrap
script, and stopped, with a **Reload preview** button. That
navigation does still make its one request before it's caught, which can
only carry what the page itself contains. The app's own IPC also needs an
invoke key only the top frame holds, so a frame couldn't call a command
even if it reached the webview's message handler.

The sandbox was checked in Chromium and WebKitGTK (the engine the Linux app
runs on): every one of the above was blocked, with no request reaching the
network, while the page's own scripts, form handlers and height reporting
kept working. The `HtmlPreview` Storybook story's **Sandbox** example runs a
few of the same checks.

## Conversation display and persistence

The panel keeps the visible transcript synchronized while a response is
streaming and restores saved messages when you reopen a project. Streamed
text is applied to the transcript once per animation frame rather than once
per chunk, and only the message that is growing re-renders — earlier
messages aren't re-parsed as a reply streams in, however long the
conversation. A sub-agent's stream updates only its own row under the
spawning tool call and its own tab, not the parent conversation's
transcript.

A streaming reply (or thinking run) is saved to disk while it arrives, about
twice a second rather than on every chunk, and in full when the run ends —
when a tool call or the other kind of output starts, the turn finishes, or
it fails. If the app quits mid-reply, the saved message keeps everything but
roughly the last half second of text. A
conversation receives a fallback title from its first request; an external
agent may later provide a more descriptive title.

The system context used for the conversation can be opened from the
**System prompt** line at the top of the transcript (click **Show**) when
available. It includes applicable project instructions,
memory, and skills, and is refreshed for subsequent requests so changes to
those resources can take effect without opening a new conversation. See
[context and memory](./context-and-memory.md) for details.
