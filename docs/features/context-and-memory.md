# AGENTS.md, memory & skills

Rebuilt and folded into a single `system` message at the start of
**every** turn (not just a session's first), so edits to `AGENTS.md`,
memory, or skill files take effect on the next message rather than only
in sessions started after the edit. See `context.rs`
(`build_system_prompt`) and `chat.rs` (`refresh_system_prompt`).

If none of AGENTS.md, memory, or skills produce anything, no system
message is added at all (an empty project doesn't get an empty prompt
section).

## Config paths

Global config lives under `dirs::config_dir()` (the OS-appropriate
config directory — `~/.config` on Linux, `~/Library/Application
Support` on macOS, `%APPDATA%` on Windows) joined with `ai-leash/`:

| Source | Project path | Global path |
|---|---|---|
| Project instructions | `<project root>/AGENTS.md`, plus `<any touched subdir>/AGENTS.md` | — (no global equivalent) |
| Memory | `<project root>/.ai-leash/memory/MEMORY.md` | `<config dir>/ai-leash/memory/MEMORY.md` |
| Skills | `<project root>/.skills/*.md`, plus `<any touched subdir>/.skills/*.md` | `<config dir>/ai-leash/skills/*.md` |

"Touched subdir" means: the agent has called a tool with a path under
that directory at some point during the current chat session. Memory is
not directory-scoped — only the two paths above, project and global.

Note the asymmetry: project-level skills deliberately live at
`.skills/` (a short, tool-agnostic top-level dot-folder) rather than
under `.ai-leash/`, so a `.skills/` convention could plausibly be shared
across other tools later. Memory has not been moved to a similarly
generic path yet — it's still under `.ai-leash/memory/`.

Both memory files are just read as raw text (no parsing) and dropped
into their own section of the system prompt — there's no frontmatter,
no linking between files, and no write tool yet for the agent to update
memory itself; a human (or you, editing the file directly) is the only
way to add to it today.

## AGENTS.md

The root `<project>/AGENTS.md` always applies. On top of that,
**directory-scoped** `AGENTS.md` files are supported: if the agent has
used a tool (`read_file`/`edit_file`/`write_file`/`list_dir`/`grep`) on
a path under some subdirectory, an `AGENTS.md` in that subdirectory (or
any directory between it and the root) is picked up too and merged in.

"Has used a tool on a path" is tracked per-session in
`AppState.touched_dirs` (`state.rs`), recorded by
`tools::record_touched_dir` inside `execute_tool` for every tool that
takes a path argument. `context::collect_agents_md` (`context.rs`) then
walks from each touched directory up to (but not including) the root
via `ancestors_within_root`, collecting any `AGENTS.md` found along the
way, deduplicated and ordered **shallowest first** — so a subfolder's
file reads as an addition layered on top of the root's, not a
replacement, and each section is labeled with its path relative to the
root (e.g. `# Project instructions (src/backend/AGENTS.md)`) so the
model can tell which scope each one came from.

Because `run_agent_loop` recomputes touched directories and rebuilds
the system prompt on **every iteration** of the tool-calling loop (not
just once per user message), a subfolder's `AGENTS.md` becomes visible
to the model as soon as it touches that subfolder for the first time —
even mid-turn, before its next tool call in the same turn.

## Skills

Each skill is a single markdown file with a `---`-delimited YAML-ish
frontmatter (parsed by a minimal hand-rolled parser in `context.rs`,
not a real YAML parser — it only understands top-level `name:` and
`description:` lines):

```markdown
---
name: example-skill
description: One-line summary shown to the model up front
---
Full instructions/body go here. This is only sent to the model if it
calls `load_skill` with this skill's exact `name`.
```

That's shown fenced here for readability — don't copy the ` ``` ` lines
into the actual `.md` file, only the `---`/`name:`/`description:` part.
If a file's content does end up wrapped in a fence like that (an easy
copy-paste mistake), `context::strip_wrapping_code_fence` strips it
before parsing, so it's tolerated rather than silently treated as "no
frontmatter, skip this file."

A file without both `name:` and `description:` in its frontmatter is
silently skipped (not treated as an error).

Skills are scoped the same way `AGENTS.md` is: besides the project root
(`.skills/`) and global (`<config dir>/ai-leash/skills/`) directories, a
`.skills/` folder in any directory the agent has touched this session
(or an ancestor of it, up to the root) is scanned too. Unlike
`AGENTS.md`'s shallow-first merge, skill directories are scanned
**deepest-touched-directory first**, then root, then global — so a
scoped skill with the same `name` as a root or global one wins (first
match wins; see `context::list_skills`). This means a subfolder can
override a general-purpose skill with a more specific one of the same
name for work happening inside it.

The system prompt only ever lists **name + description** for every
discovered skill — full skill bodies are not sent up front, to keep the
prompt small. The `load_skill` tool (see [tools.md](./tools.md)) fetches
a specific skill's full body on demand, mirroring how Claude Code's own
Skill tool works.

`load_skill` is only added to the model's tool list at all when
`context::list_skills()` finds at least one skill for the current
project (`tools::tool_definitions` takes the project root and checks
this). A project with zero skills never sees `load_skill` as an option,
which avoids a real failure mode seen with weaker local models: if a
project's `AGENTS.md` happens to describe its tools using the word
"skill" in prose, a model can conflate that with the actual skills
feature and start calling `load_skill` on tool names like `read_file` —
which obviously don't exist as skills. The `load_skill` error path also
lists the real available skill names (or says there are none) and
states explicitly that tools are called directly, as a backstop for
sessions where skills do exist but the model still guesses wrong.
