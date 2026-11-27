//! `open_file`: the agent shows the user a file in the chat's side panel
//! (the file viewer tab; Markdown opens in its rendered Preview) — e.g. a
//! spec it just wrote, for the user to review right there. Offered to the
//! native agent and, relayed over the MCP bridge, to ACP agents; either way
//! the path is confined to the chat's own checkout.
//!
//! The UI side is the `agent://open_file` event, handled by
//! `useAgentOpenFile` in the frontend.

use crate::commands;
use crate::state::AppState;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

pub(crate) const EVENT: &str = "agent://open_file";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenFilePayload {
    /// The top-level conversation whose side panel the file opens in — a
    /// sub-agent's is its parent's, which is the one with a panel.
    pub session_id: String,
    /// Absolute, canonical path — what the file tree and editor key on.
    pub path: String,
    pub line: Option<u64>,
}

/// Resolves `args` against `root`: the path must name an existing file
/// inside it.
pub(crate) fn resolve(root: &Path, args: &Value) -> Result<(PathBuf, Option<u64>), String> {
    let path = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or("missing `path`")?;
    let resolved = commands::resolve_within_root(root, path).map_err(|e| {
        if e == "path escapes project root" {
            format!(
                "`{path}` is outside this chat's checkout ({})",
                root.display()
            )
        } else {
            format!("can't open `{path}`: {e}")
        }
    })?;
    if !resolved.exists() {
        return Err(format!("there's no file at `{path}`"));
    }
    if !resolved.is_file() {
        return Err(format!("`{path}` is not a file"));
    }
    let line = args.get("line").and_then(Value::as_u64).filter(|&l| l > 0);
    Ok((resolved, line))
}

pub(super) fn open_file(
    app: &AppHandle,
    state: &AppState,
    session_id: &str,
    root: &Path,
    args: &Value,
) -> Result<String, String> {
    let (path, line) = resolve(root, args)?;
    let payload = OpenFilePayload {
        session_id: commands::top_level_session_id(state, session_id),
        path: path.display().to_string(),
        line,
    };
    app.emit(EVENT, &payload).map_err(|e| e.to_string())?;
    let shown = path
        .strip_prefix(root.canonicalize().unwrap_or_default())
        .unwrap_or(&path);
    let rendered = if is_markdown(&path) {
        " (as a rendered preview)"
    } else {
        ""
    };
    Ok(format!(
        "Opened `{}` in the user's side panel{rendered}.",
        shown.display()
    ))
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown")
    )
}

/// The native/bridge-shared definition (see `action_tools::action_defs`).
pub(crate) fn open_file_def() -> Value {
    json!({
        "name": "open_file",
        "description": "Open a file for the user in the file viewer of this chat's side panel, so they can read or review it without leaving the chat. Markdown files open as a rendered preview. Use it after writing or substantially changing a document the user should look at (a spec, plan, design doc, README), or to point them at code you're discussing. It only shows the file; it doesn't read it for you. The path must be inside this chat's checkout.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "Path relative to the project root (or absolute, inside it)" },
                "line": { "type": "integer", "description": "Optional 1-based line to scroll to and select; opens the source rather than the Markdown preview" }
            },
            "required": ["path"]
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ai-leash-open-file-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("docs")).unwrap();
        std::fs::write(dir.join("docs/spec.md"), "# Spec\n").unwrap();
        dir
    }

    #[test]
    fn resolves_a_file_inside_the_root() {
        let root = tmp();
        let (path, line) = resolve(&root, &json!({ "path": "docs/spec.md", "line": 3 })).unwrap();
        assert_eq!(path, root.canonicalize().unwrap().join("docs/spec.md"));
        assert_eq!(line, Some(3));
        assert!(is_markdown(&path));
        let (_, line) = resolve(&root, &json!({ "path": "docs/spec.md", "line": 0 })).unwrap();
        assert_eq!(line, None);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_paths_outside_the_root_dirs_and_missing_files() {
        let root = tmp();
        let outside = resolve(&root, &json!({ "path": "../" })).unwrap_err();
        assert!(
            outside.contains("outside this chat's checkout"),
            "{outside}"
        );
        let abs = resolve(&root, &json!({ "path": "/etc/hostname" })).unwrap_err();
        assert!(abs.contains("outside"), "{abs}");
        let dir = resolve(&root, &json!({ "path": "docs" })).unwrap_err();
        assert!(dir.contains("is not a file"), "{dir}");
        let missing = resolve(&root, &json!({ "path": "nope.md" })).unwrap_err();
        assert!(missing.contains("no file at"), "{missing}");
        assert!(resolve(&root, &json!({})).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
