use crate::context;
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
                "description": "List files and directories at a given path in the project.",
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
                "description": "Search for a regular expression pattern across project files (respects .gitignore).",
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
                "description": "Add to or update your persistent memory notes, which are shown back to you under \"# Project memory\" / \"# Global memory\" in the system prompt at the start of every future session. Use this for durable facts worth remembering across conversations (user preferences, project conventions, ongoing context) — not scratch state for the current task. Pass the complete new contents for the given scope, not just an addition: this replaces the whole file, and you can see its current contents (if any) already in your system prompt.",
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
                "description": "Run a shell command in the project root and return its combined stdout/stderr. Requires user approval.",
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
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "spawn_sub_agent",
                    "description": "Delegate one or more self-contained subtasks to fresh sub-agents, each with its own isolated context and the same tools (except spawn_sub_agent itself, so they can't spawn further sub-agents). If the request has multiple independent parts, list them all in `tasks` — they run concurrently, which is faster than doing them one at a time. If it's a single simple thing, or its parts depend on each other's results, either pass just one entry or don't call this at all and handle it yourself. This call returns immediately once the sub-agent(s) are spawned, without waiting for any of them to finish — each one's result is appended to this conversation as its own turn as soon as it's ready, and you'll automatically get a chance to react, without the user needing to say anything. Use `list_sub_agents`/`read_sub_agent` if you need to check on one proactively instead of waiting.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "tasks": {
                                "type": "array",
                                "description": "One entry per independent subtask to run concurrently",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "description": { "type": "string", "description": "Short (3-6 word) label for this subtask, shown to the user" },
                                        "prompt": { "type": "string", "description": "Full, self-contained instructions for the sub-agent" }
                                    },
                                    "required": ["description", "prompt"]
                                }
                            }
                        },
                        "required": ["tasks"]
                    }
                }
            }));
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "list_sub_agents",
                    "description": "List the sub-agents you've spawned via spawn_sub_agent (running and finished), most recent first. Use this to check progress, or to find a sub_session_id for read_sub_agent.",
                    "parameters": { "type": "object", "properties": {}, "required": [] }
                }
            }));
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "read_sub_agent",
                    "description": "Read the full prompt and transcript (including tool calls and the final result) of one sub-agent you spawned, by its sub_session_id. For long transcripts, prefer offset/limit over reading it all at once.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "sub_session_id": { "type": "string", "description": "The sub-agent's session id, from list_sub_agents" },
                            "offset": { "type": "integer", "description": "1-based line number to start reading from. Omit to start at line 1." },
                            "limit": { "type": "integer", "description": "Maximum number of lines to return. Defaults to 2000." }
                        },
                        "required": ["sub_session_id"]
                    }
                }
            }));
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
                "description": "Define a new Action: a named background terminal command (e.g. \"dev\" -> \"npm run dev\"), shown in the project's Actions tab and runnable via run_action. Asks the user to approve the command first, same as write_file/edit_file.",
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
                "description": "Start a user-defined background Action by name (see the project's Actions tab, or call list_actions). No permission prompt — the command was already vetted by the user when they defined it. A no-op if it's already running; use stop_action first if you need to restart it.",
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
                "description": "List this project's defined Actions and whether each is currently running.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        }));
        arr.push(json!({
            "type": "function",
            "function": {
                "name": "read_action",
                "description": "Read the recent captured output of an Action that's running or has been run — e.g. to check a dev server's compile output for an error.",
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
