use crate::actions::{self, ActionDef};
use crate::tools::guidance;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub path: PathBuf,
}

/// Global (not per-project) directory for `sub` — `memory` or `skills` —
/// suffixed for dev builds via `paths::versioned_dir` so a `cargo tauri dev`
/// build never reads or writes an installed release build's global memory/
/// skills, and vice versa.
fn global_dir(sub: &str) -> PathBuf {
    crate::paths::versioned_dir(sub)
}

/// A global AGENTS.md ships default instructions/persona that apply across
/// every project, independent of any per-project AGENTS.md. Deliberately
/// not dev/release-split like `global_dir` — it's a single hand-authored
/// file, not mutable state a dev build could corrupt.
fn global_agents_md() -> Option<String> {
    std::fs::read_to_string(crate::paths::config_dir().join("AGENTS.md")).ok()
}

/// The project or global `MEMORY.md` path.
pub fn memory_path(root: &Path, global: bool) -> Option<PathBuf> {
    if global {
        Some(global_dir("memory").join("MEMORY.md"))
    } else {
        Some(root.join(".ai-leash").join("memory").join("MEMORY.md"))
    }
}

fn read_memory(root: &Path) -> (Option<String>, Option<String>) {
    let global = memory_path(root, true).and_then(|p| std::fs::read_to_string(p).ok());
    let project = memory_path(root, false).and_then(|p| std::fs::read_to_string(p).ok());
    (global, project)
}

/// Strips a markdown code fence wrapping the whole file, if present. Skill
/// files are often authored by copying an example that was itself shown
/// inside a fenced code block, fence markers included by mistake.
fn strip_wrapping_code_fence(content: &str) -> String {
    let trimmed = content.trim();
    if !trimmed.starts_with("```") {
        return content.to_string();
    }
    let mut lines: Vec<&str> = trimmed.lines().collect();
    lines.remove(0);
    if lines.last().is_some_and(|l| l.trim() == "```") {
        lines.pop();
    }
    lines.join("\n")
}

/// Skill files are markdown with a `---`-delimited frontmatter containing
/// `name:` and `description:` lines, matching Claude Code's own skill format.
fn parse_frontmatter(content: &str) -> (Option<(String, String)>, &str) {
    let Some(rest) = content.strip_prefix("---\n") else {
        return (None, content);
    };
    let Some(end) = rest.find("\n---") else {
        return (None, content);
    };
    let frontmatter = &rest[..end];
    let body = rest[end + 4..].trim_start_matches('\n');

    let mut name = None;
    let mut description = None;
    for line in frontmatter.lines() {
        if let Some(v) = line.strip_prefix("name:") {
            name = Some(v.trim().to_string());
        }
        if let Some(v) = line.strip_prefix("description:") {
            description = Some(v.trim().to_string());
        }
    }
    match (name, description) {
        (Some(n), Some(d)) => (Some((n, d)), body),
        _ => (None, body),
    }
}

/// Every directory from `dir` up to (but excluding) `root`, closest-first.
/// Empty if `dir` isn't under `root` (shouldn't happen — callers only ever
/// pass paths that came out of `resolve_within_root`) or `dir == root`.
fn ancestors_within_root(root: &Path, dir: &Path) -> Vec<PathBuf> {
    if !dir.starts_with(root) {
        return vec![];
    }
    let mut result = vec![];
    let mut current = dir.to_path_buf();
    while current != root {
        result.push(current.clone());
        match current.parent() {
            Some(p) => current = p.to_path_buf(),
            None => break,
        }
    }
    result
}

/// AGENTS.md files from the root plus every directory the agent has touched
/// this session (and their ancestors up to the root), shallowest first so a
/// subfolder's instructions read as an addition to the root's, not a
/// replacement. Labeled with their path relative to root for the model to
/// tell which scope each one came from.
fn collect_agents_md(root: &Path, touched_dirs: &[PathBuf]) -> Vec<(String, String)> {
    let mut dirs: Vec<PathBuf> = vec![root.to_path_buf()];
    for touched in touched_dirs {
        dirs.extend(ancestors_within_root(root, touched));
    }
    dirs.sort();
    dirs.dedup();
    dirs.sort_by_key(|d| d.components().count());

    let mut out = vec![];
    for dir in dirs {
        let path = dir.join("AGENTS.md");
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        let label = if dir == root {
            "AGENTS.md".to_string()
        } else {
            path.strip_prefix(root)
                .unwrap_or(&path)
                .display()
                .to_string()
        };
        out.push((label, content));
    }
    out
}

/// Skills from the root and global directories, plus any `.skills/` folder in
/// a directory the agent has touched this session (and its ancestors up to
/// root). Scanned deepest-touched-directory first, so a more specific scoped
/// skill wins over a same-named root/global one (first match wins on name).
pub fn list_skills(root: &Path, touched_dirs: &[PathBuf]) -> Vec<SkillInfo> {
    let mut scoped: Vec<PathBuf> = vec![];
    for touched in touched_dirs {
        scoped.extend(ancestors_within_root(root, touched));
    }
    scoped.sort();
    scoped.dedup();
    scoped.sort_by_key(|d| std::cmp::Reverse(d.components().count()));

    let mut dirs_to_scan: Vec<PathBuf> = scoped.into_iter().map(|d| d.join(".skills")).collect();
    dirs_to_scan.push(root.join(".skills"));
    dirs_to_scan.push(global_dir("skills"));

    let mut seen_names = HashSet::new();
    let mut skills = vec![];
    for dir in dirs_to_scan {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };
            let content = strip_wrapping_code_fence(&content);
            if let (Some((name, description)), _) = parse_frontmatter(&content) {
                if seen_names.insert(name.clone()) {
                    skills.push(SkillInfo {
                        name,
                        description,
                        path,
                    });
                }
            }
        }
    }
    skills
}

pub fn load_skill_body(root: &Path, touched_dirs: &[PathBuf], name: &str) -> Option<String> {
    let skill = list_skills(root, touched_dirs)
        .into_iter()
        .find(|s| s.name == name)?;
    let content = std::fs::read_to_string(&skill.path).ok()?;
    let content = strip_wrapping_code_fence(&content);
    let (_, body) = parse_frontmatter(&content);
    Some(body.to_string())
}

/// The project's defined Actions, by name, so the agent knows what already
/// exists before it considers running the same command itself. Shared by the
/// native system prompt (refreshed every turn) and the MCP bridge's
/// instructions (a snapshot from connect time — the model is told to call
/// `list_actions` for the current set).
pub fn actions_section(actions: &[ActionDef]) -> Option<String> {
    if actions.is_empty() {
        return None;
    }
    let mut out = String::from(
        "# Actions\n\nThis project's defined Actions — background commands the user can see in the Actions tab. Start one with `run_action` rather than running the same command yourself.\n\n",
    );
    for a in actions {
        let first_line = a.command.lines().next().unwrap_or_default();
        let command: String = first_line.chars().take(120).collect();
        let ellipsis = if command.len() < a.command.len() {
            "…"
        } else {
            ""
        };
        out.push_str(&format!("- **{}**: `{command}{ellipsis}`\n", a.name));
    }
    Some(out)
}

/// The "Available skills" list, shared by the native system prompt and the
/// MCP bridge's instructions.
pub fn skills_section(skills: &[SkillInfo]) -> Option<String> {
    if skills.is_empty() {
        return None;
    }
    let mut list = String::from(
        "# Available skills\n\nCall `load_skill` with a skill's exact name to load its full instructions when it's relevant to the current task.\n\n",
    );
    for s in skills {
        list.push_str(&format!("- **{}**: {}\n", s.name, s.description));
    }
    Some(list)
}

pub fn build_system_prompt(
    root: &Path,
    touched_dirs: &[PathBuf],
    allow_subtasks: bool,
) -> Option<String> {
    // First, so the user's own AGENTS.md/memory read as additions to (and
    // can override) these built-in defaults rather than the other way round.
    let mut sections = vec![guidance::native_guidance(allow_subtasks)];

    if let Some(global_agents) = global_agents_md() {
        sections.push(format!(
            "# Global instructions (AGENTS.md)\n\n{global_agents}"
        ));
    }

    for (label, content) in collect_agents_md(root, touched_dirs) {
        sections.push(format!("# Project instructions ({label})\n\n{content}"));
    }

    let (global_mem, project_mem) = read_memory(root);
    if let Some(m) = global_mem {
        sections.push(format!("# Global memory\n\n{m}"));
    }
    if let Some(m) = project_mem {
        sections.push(format!("# Project memory\n\n{m}"));
    }

    sections.extend(actions_section(&actions::load_actions(root)));
    sections.extend(skills_section(&list_skills(root, touched_dirs)));

    Some(sections.join("\n\n---\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn action(name: &str, command: &str) -> ActionDef {
        ActionDef {
            id: name.into(),
            name: name.into(),
            command: command.into(),
        }
    }

    #[test]
    fn actions_section_is_omitted_when_there_are_none() {
        assert!(actions_section(&[]).is_none());
    }

    #[test]
    fn actions_section_lists_names_and_first_line_of_command() {
        let section =
            actions_section(&[action("dev", "npm run dev"), action("multi", "a\nb")]).unwrap();
        assert!(section.contains("- **dev**: `npm run dev`"));
        assert!(section.contains("- **multi**: `a…`"));
    }

    #[test]
    fn skills_section_lists_each_skill() {
        assert!(skills_section(&[]).is_none());
        let section = skills_section(&[SkillInfo {
            name: "deploy".into(),
            description: "Ship it".into(),
            path: PathBuf::new(),
        }])
        .unwrap();
        assert!(section.contains("- **deploy**: Ship it"));
    }
}
