# Instructions, memory, and skills

AI Leash can give the agent useful context beyond the conversation itself. You
can provide standing instructions for a project, let the agent remember
important details, and give it reusable skills for specialized kinds of work.
Together, these features help the agent behave consistently and spend less
time rediscovering how you work.

## AGENTS.md: instructions for a project

`AGENTS.md` is a plain-text instruction file for the agent. Use it to explain
how you want the agent to work in a project and what it should keep in mind
while making changes.

Useful instructions include:

- The purpose of the project and the conventions it follows
- How the project is organized
- Commands the agent should use to check its work
- Rules about formatting, testing, dependencies, or permissions
- Important product, design, or security requirements
- Things the agent should avoid changing

Write instructions as clear, direct guidance. For example, you might tell the
agent to preserve a public API, run a particular test command after changing a
feature, or update the documentation whenever behavior changes.

An `AGENTS.md` at the project level applies throughout that project. You can
also add one in a subfolder when a particular part of the project needs
additional guidance. The more specific instructions add to the broader ones,
so a folder can have its own conventions without repeating everything about
the project.

AI Leash also supports general instructions that apply across your projects.
Use these for preferences such as your preferred writing style or a general
working approach. Keep project-specific details in the project's own
`AGENTS.md`.

The agent reads these instructions as part of its working context. Changes
take effect as the conversation continues, so you can refine the guidance
without having to recreate the project.

## What the agent is told about its chat

Before your `AGENTS.md`, every agent gets AI Leash's own built-in guidance,
in four parts: what AI Leash is, a **This chat** section saying what this
particular chat is for, the rules for its tools (see [Default tools &
permissions](./tools.md#how-the-agent-knows-which-tool-to-use)), and a
one-line pointer to each [built-in guide](#built-in-guides). The
**This chat** section is stated as facts for the one kind of chat it is,
and says nothing about the others:

- **Project chat** (the one beside the board): it plans and delegates,
  task chats report to it with `send_message`, and you review and merge
  their work.
- **Task chat**: it is task #N, with the task's title, its branch and
  worktree (or the main checkout), and in a worktree to commit its work on
  that branch. It keeps the task's description current, and when it's done
  sets the task to **Review**, never **Done**, and summarises what it
  changed. It changes other tasks only to add links or dependency notes;
  anything bigger, and any blocker, goes to the project chat; work outside the task's scope goes on the
  board as new tasks instead of being done there.
- **Sub-agent**: it's a one-shot job for the chat that spawned it, its last
  message is the result, and it can't start sub-agents of its own.
- **Any other chat**: which project and checkout it works in, and that it
  has no role on the board.

The built-in agent's system prompt is rebuilt every turn, so this section
is never lost when a long conversation is compacted (unlike a task's first
message, which compaction folds into the summary). External agents
connected over ACP get the same guidance from AI Leash's tool server when
they connect. Because some agents clip or ignore a tool server's
instructions, the first message an external agent gets after each
connect, whether the session is new or resumed, also carries a short
context block: the same **This chat** text, marked as from AI Leash and
not from you, and one line naming the `read_guide` topics. Later messages
on that connection don't repeat it; a reconnect (the app restarted, or the
agent switched) sends it again with the context as it is then.

How it's built: `src-tauri/src/chat_context.rs` reads a `ChatContext`
(kind, backend, project name and root, checkout) from the conversation's
row — its `role`, linked task and worktree, and for a sub-agent the chat
that owns it — and the branch live from git. One builder,
`tools::guidance::guidance`, makes the text for both kinds of agent from
it: `context::build_system_prompt` folds it into the native system prompt,
and `acp::discovery::mcp_servers_for` passes the context as JSON to the
`--mcp-bridge` process (`AI_LEASH_CHAT_CONTEXT`), which returns it as its
`instructions`. A sub-agent's bridge also leaves the sub-agent tools out.
The first-prompt block is `tools::guidance::first_prompt_block`, built from
the same `ChatContext` (loaded once per connection in
`acp/process.rs`) and the same `this_chat` text; `FirstPromptContext` hands
it to `prompt_blocks` once, as a text content block ahead of your message.
It isn't saved to the transcript, but the ACP Events tab shows it as
`context` on that `session/prompt`.

Both are snapshots: the native one from the start of the turn, the
external agent's from connect time. The `chat_info` tool (see
[tools.md](./tools.md#check-what-its-chat-is-right-now)), offered to every
chat, reads the same facts live, plus the task's status, whether the
project chat follows it, and the agent and model; the always-sent guidance
points at it in one line.

## Built-in guides

The longer how-tos for AI Leash's own features aren't in that always-sent
text. They're built-in guides the agent reads with the `read_guide` tool
when it's about to use the feature:

| Topic | Read before |
| --- | --- |
| `rich-replies` | writing a ` ```ui ` block (tables, charts, stat tiles, choice buttons) |
| `html-previews` | showing a prototype or mockup as a ` ```html ` block or `.html` file |
| `board` | planning work as tasks, starting tasks, or finishing one |
| `actions` | running a dev server, watcher or other long-running command |

They're markdown files in `src-tauri/guides/`, compiled into the app with
`include_str!` and listed in `src-tauri/src/tools/guides.rs`. Every agent
gets `read_guide`: the built-in agent as one of its tools, external agents
from the MCP bridge, which answers it itself since it is the same binary.
The guidance names each topic (not only the tool's schema), because Claude
Code only loads an MCP tool's schema when it goes looking for one.

Guides aren't skills: `load_skill` stays for your own project and global
skills.

Why: Claude Code cuts an MCP server's `instructions` off at about 4,096
characters, and with the specs inline the guidance ran past 5,000, so the
end (HTML previews, Actions, skills) never reached it. The bridge's
instructions now give only counts of the project's Actions and skills, with
the tools that list them (`list_actions`; `list_skills` and `load_skill`,
offered when there are skills), and a unit test keeps the worst case — any
chat kind, hundreds of Actions and skills — under 3,000 characters. The
built-in agent has no such limit, so its system prompt still lists the
Actions and skills in full.

## Memory: useful details that persist

Memory is information the agent records so it can use it again in later
conversations. It is useful for details that are easy to forget but helpful
to remember, such as:

- Your preferences for explanations, code style, or collaboration
- The project's architecture and important decisions
- A recurring workflow or release process
- Known constraints, unfinished work, or lessons from earlier tasks

Project memory helps the agent become more familiar with one project over
time. General memory can hold preferences that should carry across projects.
The agent can update memory when it learns something worth keeping, and you
can review or edit the saved text yourself. Memory is guidance, not a
replacement for source code or project documentation: keep precise,
authoritative information in the project where everyone can find it.

Because memory is included in the agent’s context on each turn, it can make
better suggestions, follow established preferences, and avoid repeating
questions or mistakes. Only save information that is accurate, useful, and
appropriate to retain. You approve memory changes in the same way you
approve other edits. For details about edit permissions, see
[Default tools & permissions](./tools.md).

## Skills: reusable expertise

Skills are packaged instructions and workflows for a particular type of task.
A skill might teach the agent how to work with a service, follow a project
workflow, or handle a specialized technical area.

When a skill is available, the agent sees its name and a short description.
It loads the full instructions only when that skill is relevant to the task.
External agents connected over ACP are told how many there are when they
connect, list them with `list_skills` and load one with `load_skill`, both
through AI Leash. Project skills are picked up for them from the
project and general skill folders as of when the agent connected.
This keeps everyday conversations focused while making specialized guidance
available when needed.

Skills can be useful when you want the agent to:

- Follow a repeatable process
- Use a particular tool or service correctly
- Apply domain-specific checks and terminology
- Handle a specialized kind of project work consistently

Use a project skill for guidance that belongs to one project, and a general
skill for expertise you want available in multiple projects. A skill should
describe what to do and when to use it; keep permanent project rules and
personal preferences in `AGENTS.md` or memory instead.

Skills complement the agent's normal tools. They provide the instructions for
how to approach a task, while the agent still asks for permission before
operations that can edit files or run commands. See [Default tools &
permissions](./tools.md) for more about those permissions.
