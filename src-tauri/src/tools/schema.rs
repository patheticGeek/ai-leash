use crate::context;
use crate::tools::sub_agent_tools;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn tool_definitions(
    root: Option<&Path>,
    touched_dirs: &[PathBuf],
    allow_subtasks: bool,
) -> Value {
    let mut tools = json!([
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a file's contents. Always call this before edit_file so you know the file's exact current contents. For large files, prefer reading a specific range with `offset`/`limit` instead of the whole file at once: start with a small `limit` or use `grep` to find the area you care about, then read just that range.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path relative to the project root" },
                        "offset": { "type": "integer", "description": "1-based line number to start reading from. Omit to start at line 1." },
                        "limit": { "type": "integer", "description": "Maximum number of lines to return. Defaults to 2000." }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace one exact snippet of text in an existing file with new text, leaving the rest of the file untouched. You must call read_file first and copy `old_string` verbatim from its output (matching whitespace and indentation exactly) so it matches exactly one location; include a line or two of surrounding context if the snippet isn't unique on its own. Do not use this to create a new file, use write_file instead.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path relative to the project root" },
                        "old_string": { "type": "string", "description": "The exact existing text to replace, copied verbatim from read_file's output" },
                        "new_string": { "type": "string", "description": "The text to replace it with" }
                    },
                    "required": ["path", "old_string", "new_string"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Create a new file, or completely overwrite an existing one, with the given full contents. Prefer edit_file for changing part of a file that already exists. If the file already exists, call read_file first so you know what you're replacing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path relative to the project root" },
                        "content": { "type": "string", "description": "The complete contents to write to the file" }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_dir",
                "description": "List files and directories at a given path in the project. Use this to orient yourself in an unfamiliar area instead of guessing paths.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Path relative to the project root, use \".\" for the root" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "grep",
                "description": "Search for a regular expression pattern across project files (respects .gitignore). Use this to find where something is defined or used before reading whole files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Regular expression to search for" },
                        "path": { "type": "string", "description": "Subdirectory relative to project root to search, defaults to the root" }
                    },
                    "required": ["pattern"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_memory",
                "description": "Add to or update your persistent memory notes, which are shown back to you under \"# Project memory\" / \"# Global memory\" in the system prompt at the start of every future session. Use this for durable facts worth remembering across conversations (user preferences, project conventions, ongoing context) — not scratch state for the current task. Call it on your own as soon as the user states a lasting preference or corrects you in a way that should apply next time; don't wait to be asked. Pass the complete new contents for the given scope, not just an addition: this replaces the whole file, and you can see its current contents (if any) already in your system prompt.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "scope": { "type": "string", "enum": ["project", "global"], "description": "\"project\" for notes specific to this project only, \"global\" for notes that should apply across all projects" },
                        "content": { "type": "string", "description": "The complete new markdown contents of the memory file for this scope" }
                    },
                    "required": ["scope", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "shell",
                "description": "Run a shell command in the project root and return its combined stdout/stderr. Requires user approval. For one-off commands that finish quickly (tests, builds, git, inspecting state); it times out after 30 seconds. For a dev server, watcher or anything long-running, use run_action (call list_actions first, or create_action if none fits) instead.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The shell command to execute" }
                    },
                    "required": ["command"]
                }
            }
        }
    ]);

    let has_skills = root.is_some_and(|r| !context::list_skills(r, touched_dirs).is_empty());
    if has_skills {
        if let Value::Array(arr) = &mut tools {
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "load_skill",
                    "description": "Load the full instructions for a skill listed under \"Available skills\" in your system prompt, by its exact name. Only use this for names listed there — tools (read_file, edit_file, write_file, list_dir, grep, shell) are called directly and are never loaded as skills.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Exact name of the skill to load" }
                        },
                        "required": ["name"]
                    }
                }
            }));
        }
    }

    if allow_subtasks {
        if let Value::Array(arr) = &mut tools {
            for definition in [
                sub_agent_tools::spawn_sub_agent_def(),
                sub_agent_tools::list_sub_agents_def(),
                sub_agent_tools::read_sub_agent_def(),
                sub_agent_tools::list_agent_options_def(),
            ] {
                arr.push(json!({ "type": "function", "function": definition }));
            }
        }
    }

    // Always advertised (not gated on whether any Actions are defined yet)
    // so the agent knows this capability exists at all and can offer to set
    // one up via create_action — list_actions itself says "No actions
    // defined for this project" when there are none.
    if let Value::Array(arr) = &mut tools {
        arr.push(json!({
            "type": "function",
            "function": {
                "name": "create_action",
                "description": "Define a new Action: a named background terminal command (e.g. \"dev\" -> \"npm run dev\"), shown in the project's Actions tab and runnable via run_action. Asks the user to approve the command first, same as write_file/edit_file. Use it when a command is long-running or recurring and no existing Action covers it (check list_actions first), instead of running it via `shell` or leaving an untracked background process.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Short human-readable name, e.g. \"dev\"" },
                        "command": { "type": "string", "description": "The shell command to run in the background, e.g. \"npm run dev\"" }
                    },
                    "required": ["name", "command"]
                }
            }
        }));
        arr.push(json!({
            "type": "function",
            "function": {
                "name": "run_action",
                "description": "Start a user-defined background Action by name (see the project's Actions tab, or call list_actions). No permission prompt — the command was already vetted by the user when they defined it. A no-op if it's already running; use stop_action first if you need to restart it. Prefer this over `shell` for anything long-running or repeated (dev server, watcher, build --watch) — `shell` times out after 30 seconds. Afterwards, call read_action to confirm it started cleanly.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "The Action's name, as shown by list_actions" }
                    },
                    "required": ["name"]
                }
            }
        }));
        arr.push(json!({
            "type": "function",
            "function": {
                "name": "stop_action",
                "description": "Stop a running Action by name. A no-op if it isn't running.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "The Action's name, as shown by list_actions" }
                    },
                    "required": ["name"]
                }
            }
        }));
        arr.push(json!({
            "type": "function",
            "function": {
                "name": "list_actions",
                "description": "List this project's defined Actions and whether each is currently running. Call this before starting any dev server, watcher or other long-running command, in case an Action for it already exists.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        }));
        arr.push(json!({
            "type": "function",
            "function": {
                "name": "read_action",
                "description": "Read the recent captured output of an Action that's running or has been run — e.g. to check a dev server's compile output for an error. Call this after run_action, or whenever a running Action might have failed, instead of guessing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "The Action's name, as shown by list_actions" }
                    },
                    "required": ["name"]
                }
            }
        }));
    }

    tools
}
