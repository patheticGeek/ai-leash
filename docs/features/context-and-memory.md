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
External agents connected over ACP see the same list when they connect and can
load a skill through AI Leash. Project skills are picked up for them from the
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
