# The AI Leash workspace

AI Leash is arranged as a conversation workspace with three main areas:

```text
+----------------+----------------------------+----------------------+
| Conversations  | Chat                       | Tools and files      |
|                |                            |                      |
|                |                            |                      |
+----------------+----------------------------+----------------------+
|                |                            |                      |
+----------------+----------------------------+----------------------+
```

The top bar shows the current project and conversation. It also includes a
button for starting a new thread and the window controls. The center of the
window is where you chat with the agent. The panel on the right contains
project tools such as files and terminals.

## Choosing a project and conversation

The left sidebar lists your conversations. Each entry shows its conversation
title and the project or workspace it belongs to. The active conversation is
highlighted.

Use the project menu at the top of the sidebar to switch between:

- **All projects**, which shows conversations from every project.
- An individual project, which shows only conversations for that project.

To add another project, click the **+** button and choose a folder. You can
then open one of its existing conversations from the sidebar or start a new
thread in that project with the new-thread button in the top bar.

Conversations that you have marked as done appear in a separate **Done**
section. You can expand that section to see the full list, reopen a completed
conversation, or mark it as active again. To delete a conversation, open its
context menu from the conversation entry.

The sidebar can show activity while you are viewing another conversation. A
working indicator means the agent is still processing that conversation. An
approval indicator means that conversation is waiting for you to approve a
requested action. Switch to it to review the request; see
[Permissions](./tools.md#why-permission-prompts-appear) for more about approvals.

## The chat area

The **Agent** tab is the main conversation. When the agent starts a
sub-agent, you can open that sub-agent's conversation in its own center tab
from the **Sub Agents** panel. Sub-agent conversations are read-only, so they
are useful for following the work without interrupting it.

You can switch between the Agent tab and any open sub-agent tabs at the top of
the chat area. Sub-agent tabs can be closed when you no longer need them.

## The right-hand tool panel

The right-hand panel has its own tabs. Click a tab to switch tools, click its
close button to remove it, and use the **+** button to open another tab. If no
tab is open, AI Leash displays the tab chooser automatically.

### File Tree

**File Tree** lets you browse the files and folders in the current project.
Select a file to open it in an editor tab. Files opened from the tree appear
alongside the other tabs in this panel. A small marker on a file tab indicates
that the file has unsaved changes.

### File editor

Opening a file adds it as a tab in the right-hand panel. Use the editor to
read or change the file, then close its tab when you are finished. Opening a
file that is already open takes you to its existing tab instead of creating a
duplicate.

### Terminal

Choose **Terminal** to open a shell in the current project. You can open more
than one terminal; each terminal keeps its own session and scrollback while
you switch between tabs.

### Sub Agents

The **Sub Agents** tab lists the sub-agent tasks created for the current
conversation. Each entry shows whether the task is running, finished, or
ended with an error, along with its duration. Select an entry to open its
conversation in the center area.

While a sub-agent is running, you can stop it from this list. Finished
sub-agent entries can be removed from the list.

### Actions

**Actions** contains the reusable actions available for the project. Use it
to run and manage those actions. When an action runs, AI Leash opens a
separate terminal tab for its output so you can keep an eye on it without
losing your other terminal sessions.

## Resizing the workspace

Drag the dividers between the conversation sidebar, chat area, and right-hand
panel to change their widths. AI Leash remembers those widths for the next
time you use the app.

## Appearance

AI Leash uses a dark appearance throughout the app, including the window
controls, chat, editors, and terminals. There is currently no light theme or
appearance switch. The adjustable panel widths are the available workspace
layout preference.
