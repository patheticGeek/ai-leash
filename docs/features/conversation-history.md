# Conversation history

AI Leash keeps your conversations on your computer so you can return to them
later. Your history is still there after you close and reopen the app, and
conversations from different projects stay separate.

## What is saved

As you chat, AI Leash saves the conversation as it develops:

- Your messages and the agent's replies
- Tool activity and its results, such as files the agent reads or commands it
  runs
- The order and time of the messages
- How long a completed agent reply took, when that information is available

Saving happens during a turn rather than only at the very end. If the app
closes unexpectedly, the conversation can therefore retain the part of the
exchange that was already received.

The app does not save the agent's temporary streaming “thinking” display. It
also rebuilds the instructions supplied by your project context when you use
the conversation again, rather than showing those instructions as part of
the visible transcript. See [Context and memory](./context-and-memory.md) for
how project context is provided to the agent.

## What “across restarts” means

When you reopen AI Leash, your saved conversations are available in the
conversation list. Select one to restore its transcript and continue where
you left off. Message timestamps, tool activity, titles, and completed-turn
durations are restored with it.

History is stored on the computer running AI Leash. It is not dependent on
keeping the app window open, and it is not lost simply because you switch to
another project or start a new conversation.

## Finding and managing conversations

The left sidebar lists your conversations, with the most recently active ones
first. It normally shows conversations from all projects. Use the project
filter at the top of the sidebar to narrow the list to one project.

Select a conversation to switch to it. Switching does not delete or merge
anything: each conversation has its own transcript and can be continued
independently.

The tabs you had open in a conversation, in the side panel and for its
sub-agents, are remembered with it. They come back when you reopen the
conversation, including after restarting the app. See
[Tabs are remembered per conversation](./ui-shell.md#tabs-are-remembered-per-conversation).

To start a separate conversation, use **New Thread** and choose the project
you want to work on. You can have multiple conversations for the same
project—for example, one for investigating a bug and another for planning a
feature.

AI Leash gives conversations a title based on the beginning of your first
message. Some agents can provide a more specific title. The title helps you
recognize the conversation in the sidebar; it does not change the transcript.

When you are finished with a conversation, mark it **Done** to move it into
the collapsed **Done** section. You can reopen it or mark it as not done
later. To remove a conversation permanently, open its context menu in the
sidebar and choose **Delete conversation**. Deleting removes its transcript
and its related sub-agent records as well.

## Sub-agent work

When the main agent delegates a task, the sub-agent appears in the **Sub
Agents** view for the current conversation. Each task shows its description,
status, model, and how long it has been running or ran.

Select a sub-agent to open its transcript after it finishes—or while it is
still running—and review the work it performed. Its prompt, messages, tool
activity, and final result are kept so you can inspect the work later, even
after restarting the app. A completed or failed sub-agent can be deleted
from the **Sub Agents** view; a running one can be stopped.

Sub-agent conversations are kept with the conversation that created them.
Deleting or clearing that parent conversation also removes the associated
sub-agent history.

For more about delegated work and how it appears in a chat, see
[Agent chat](./agent-chat.md).
