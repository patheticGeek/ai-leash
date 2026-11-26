//! Built-in feature guides: markdown in `src-tauri/guides/`, compiled in,
//! and read on demand with the `read_guide` tool. They hold the long specs
//! (the ```ui block format, HTML previews, the board, Actions) so the
//! always-sent guidance (`guidance::guidance`) only needs a one-line pointer
//! to each — the MCP bridge's `instructions` must stay short, as Claude Code
//! cuts them off at about 4K characters. The bridge is this same binary
//! (`--mcp-bridge`), so it answers `read_guide` locally, like `load_skill`.
//!
//! These are not skills: `load_skill` stays for the user's own skills.

use serde_json::{json, Value};

pub struct Guide {
    /// The `topic` passed to `read_guide`.
    pub name: &'static str,
    /// When to read it: one line, shown in the tool description and the
    /// guidance's pointer list.
    pub when: &'static str,
    pub body: &'static str,
}

pub const GUIDES: &[Guide] = &[
    Guide {
        name: "rich-replies",
        when: "before a ```ui block: tables, charts, stat tiles or choice buttons in a reply",
        // Keep in sync with `src/lib/uiSpec.ts`.
        body: include_str!("../../guides/rich-replies.md"),
    },
    Guide {
        name: "html-previews",
        when: "before a UI prototype, mockup or demo as a ```html block or `.html` file",
        body: include_str!("../../guides/html-previews.md"),
    },
    Guide {
        name: "board",
        when: "before planning work as tasks, starting them, or finishing one",
        body: include_str!("../../guides/board.md"),
    },
    Guide {
        name: "actions",
        when: "before running a dev server, watcher or other long-running command",
        body: include_str!("../../guides/actions.md"),
    },
];

pub fn read_guide_def() -> Value {
    let names: Vec<&str> = GUIDES.iter().map(|g| g.name).collect();
    let lines: Vec<String> = GUIDES
        .iter()
        .map(|g| format!("- {}: {}", g.name, g.when))
        .collect();
    json!({
        "name": "read_guide",
        "description": format!(
            "Read one of AI Leash's built-in guides to a feature of this harness. Read the matching guide first:\n{}",
            lines.join("\n")
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "topic": { "type": "string", "enum": names, "description": "Which guide to read" }
            },
            "required": ["topic"]
        }
    })
}

pub fn read_guide(args: &Value) -> Result<String, String> {
    let topic = args
        .get("topic")
        .and_then(Value::as_str)
        .ok_or("missing `topic`")?;
    GUIDES
        .iter()
        .find(|g| g.name == topic)
        .map(|g| g.body.to_string())
        .ok_or_else(|| {
            let names: Vec<&str> = GUIDES.iter().map(|g| g.name).collect();
            format!("No guide named `{topic}`. Guides: {}.", names.join(", "))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_topic_resolves() {
        let def = read_guide_def();
        let topics = def["parameters"]["properties"]["topic"]["enum"]
            .as_array()
            .unwrap();
        assert_eq!(topics.len(), GUIDES.len());
        for t in topics {
            let body = read_guide(&json!({ "topic": t })).unwrap();
            assert!(body.starts_with("# "), "{t} has no heading");
            assert!(body.len() > 200, "{t} is suspiciously short");
        }
        assert!(read_guide(&json!({ "topic": "nope" }))
            .unwrap_err()
            .contains("rich-replies"));
    }

    #[test]
    fn description_lists_every_guide() {
        let desc = read_guide_def()["description"]
            .as_str()
            .unwrap()
            .to_string();
        for g in GUIDES {
            assert!(desc.contains(&format!("- {}: ", g.name)));
        }
    }

    #[test]
    fn rich_reply_example_is_valid_json() {
        let body = read_guide(&json!({ "topic": "rich-replies" })).unwrap();
        let block = body
            .split("```ui\n")
            .nth(1)
            .unwrap()
            .split("\n```")
            .next()
            .unwrap();
        let json: serde_json::Value = serde_json::from_str(block).unwrap();
        assert!(json.is_array());
    }

    /// Every node type `src/lib/uiSpec.ts` declares is documented in the
    /// guide, so the two can't drift apart silently.
    #[test]
    fn rich_replies_guide_matches_ui_spec() {
        let spec = include_str!("../../../src/lib/uiSpec.ts");
        let guide = read_guide(&json!({ "topic": "rich-replies" })).unwrap();
        let types: Vec<&str> = spec
            .split("type: \"")
            .skip(1)
            .filter_map(|rest| rest.split('"').next())
            .collect();
        assert!(types.len() >= 17, "found only {types:?}");
        for ty in types {
            assert!(guide.contains(&format!("`{ty}`")), "guide lacks `{ty}`");
        }
    }
}
