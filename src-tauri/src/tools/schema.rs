use crate::chat_context::ChatContext;
use crate::context;
use crate::tools::{action_tools, board_tools, guides, memory_tools, sub_agent_tools};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn tool_definitions(
    root: Option<&Path>,
    touched_dirs: &[PathBuf],
    chat: &ChatContext,
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

    // Always offered: the built-in guides the system prompt points at.
    if let Value::Array(arr) = &mut tools {
        arr.push(json!({ "type": "function", "function": guides::read_guide_def() }));
    }

    let has_skills = root.is_some_and(|r| !context::list_skills(r, touched_dirs).is_empty());
    if has_skills {
        if let Value::Array(arr) = &mut tools {
            arr.push(json!({ "type": "function", "function": memory_tools::load_skill_def() }));
        }
    }

    if chat.allows_sub_agents() {
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
        for definition in action_tools::action_defs() {
            arr.push(json!({ "type": "function", "function": definition }));
        }
        // The project's board — always on, same reasoning as Actions, but
        // only the tools this kind of chat may use.
        for definition in board_tools::board_defs_for(&chat.kind) {
            arr.push(json!({ "type": "function", "function": definition }));
        }
    }

    tools
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat_context::{AgentBackend, ChatKind};

    fn names(kind: ChatKind) -> Vec<String> {
        let chat = ChatContext {
            kind,
            backend: AgentBackend::Native,
            project_name: "demo".into(),
            project_root: "/proj/demo".into(),
            checkout: "/proj/demo".into(),
        };
        tool_definitions(None, &[], &chat)
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["function"]["name"].as_str().unwrap().to_string())
            .collect()
    }

    fn board(kind: ChatKind) -> Vec<String> {
        names(kind)
            .into_iter()
            .filter(|n| board_tools::BOARD_TOOLS.contains(&n.as_str()))
            .collect()
    }

    #[test]
    fn board_tools_offered_per_chat_kind() {
        let task = ChatKind::Task {
            number: 1,
            title: "t".into(),
            branch: None,
            worktree_path: None,
        };
        let sub = ChatKind::SubAgent { parent: "p".into() };
        for kind in [ChatKind::Project, ChatKind::Plain, task, sub.clone()] {
            assert_eq!(
                board(kind.clone()),
                board_tools::board_tools_for(&kind),
                "{kind:?}"
            );
        }
        assert!(board(ChatKind::Project).contains(&"start_task".to_string()));
        assert!(!board(ChatKind::Plain).contains(&"start_task".to_string()));
        assert_eq!(board(sub.clone()), ["list_tasks", "read_task"]);
        assert!(!names(sub).contains(&"spawn_sub_agent".to_string()));
        assert!(names(ChatKind::Plain).contains(&"spawn_sub_agent".to_string()));
    }
}
