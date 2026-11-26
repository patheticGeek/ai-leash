//! Files attached to a prompt as context — the one path every feature that
//! hands an agent "these files, too" goes through (`@` mentions, #24; line
//! review comments, #25). Callers pick the paths; this reads them under the
//! conversation's checkout with size caps and renders them per backend:
//!
//! - our own agent loop: `native_block`, tagged text appended to the user
//!   message (so the history — and a retry — keeps the snapshot);
//! - an ACP agent: `acp_blocks`, content blocks after the prompt's text —
//!   embedded `resource`s when it advertises `embeddedContext`, else
//!   `resource_link`s (the baseline every ACP agent accepts). The prompt
//!   text should name the paths too, so an agent ignoring the blocks still
//!   knows which files were meant.
//!
//! Usage: `let mut budget = Budget::default();` then `read(root, rel, &mut
//! budget)` per path; hand the `Vec<FileContext>` to `native_block` or, via
//! `AcpCommand::Prompt`, to `acp_blocks`.

use crate::commands::{resolve_within_root, IGNORED_NAMES};
use agent_client_protocol::schema::v1::{
    ContentBlock, EmbeddedResource, EmbeddedResourceResource, ResourceLink, TextResourceContents,
};
use std::path::{Path, PathBuf};

/// Per file: past this the contents are cut with a note.
pub const MAX_FILE_BYTES: usize = 100 * 1024;
/// Across one prompt's files; later ones go as paths only.
pub const MAX_TOTAL_BYTES: usize = 400 * 1024;
/// Entries in a folder's listing.
const MAX_LISTING_ENTRIES: usize = 500;
const LISTING_DEPTH: usize = 3;

/// What's left of one prompt's byte allowance (`MAX_TOTAL_BYTES`).
pub struct Budget(usize);

impl Default for Budget {
    fn default() -> Self {
        Budget(MAX_TOTAL_BYTES)
    }
}

/// One file or folder, read.
pub struct FileContext {
    /// Relative to the checkout, `/`-separated, no trailing `/`.
    pub rel: String,
    pub abs: PathBuf,
    pub body: Body,
}

pub enum Body {
    File {
        text: String,
        truncated: bool,
    },
    Folder {
        listing: String,
    },
    /// Binary, unreadable or over the prompt's budget: the agent gets the
    /// path only; the string says why.
    PathOnly(String),
}

impl FileContext {
    pub fn is_dir(&self) -> bool {
        matches!(self.body, Body::Folder { .. })
    }

    /// `rel`, with a trailing `/` for a folder.
    pub fn display_path(&self) -> String {
        if self.is_dir() {
            format!("{}/", self.rel)
        } else {
            self.rel.clone()
        }
    }

    pub fn uri(&self) -> String {
        let mut uri = format!("file://{}", self.abs.display());
        if self.is_dir() && !uri.ends_with('/') {
            uri.push('/');
        }
        uri
    }

    /// The text an agent gets for it: the file (with a truncation note) or
    /// the folder's listing; None for path-only.
    pub fn text(&self) -> Option<String> {
        match &self.body {
            Body::File { text, truncated } => Some(if *truncated {
                format!(
                    "{text}\n[… truncated: only the first {} KB of this file are attached; read the rest with your tools]",
                    MAX_FILE_BYTES / 1024
                )
            } else {
                text.clone()
            }),
            Body::Folder { listing } => Some(listing.clone()),
            Body::PathOnly(_) => None,
        }
    }
}

pub fn rel_string(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Reads `rel` under `root` — a file's text (capped by `MAX_FILE_BYTES` and
/// what's left of `budget`) or a folder's listing. None when it doesn't
/// exist, is absolute, or escapes `root`.
pub fn read(root: &Path, rel: &str, budget: &mut Budget) -> Option<FileContext> {
    if rel.is_empty() || Path::new(rel).is_absolute() {
        return None;
    }
    let abs = resolve_within_root(root, rel).ok()?;
    if !abs.exists() {
        return None;
    }
    let body = if abs.is_dir() {
        Body::Folder {
            listing: list_folder(root, &abs),
        }
    } else {
        read_file(&abs, budget)
    };
    Some(FileContext {
        rel: rel.trim_end_matches('/').to_string(),
        abs,
        body,
    })
}

fn read_file(path: &Path, budget: &mut Budget) -> Body {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => return Body::PathOnly(format!("could not read: {e}")),
    };
    if bytes.iter().take(8000).any(|&b| b == 0) {
        return Body::PathOnly("binary file, not attached".into());
    }
    if budget.0 == 0 {
        return Body::PathOnly("over this message's attachment limit".into());
    }
    let cap = MAX_FILE_BYTES.min(budget.0);
    let truncated = bytes.len() > cap;
    let mut end = bytes.len().min(cap);
    // Cut on a char boundary.
    while end > 0 && end < bytes.len() && (bytes[end] & 0xC0) == 0x80 {
        end -= 1;
    }
    budget.0 -= end;
    Body::File {
        text: String::from_utf8_lossy(&bytes[..end]).into_owned(),
        truncated,
    }
}

fn list_folder(root: &Path, dir: &Path) -> String {
    let walker = ignore::WalkBuilder::new(dir)
        .hidden(false)
        .max_depth(Some(LISTING_DEPTH))
        .filter_entry(|e| !IGNORED_NAMES.contains(&e.file_name().to_string_lossy().as_ref()))
        .build();
    let mut lines = vec![];
    let mut more = false;
    for entry in walker.flatten() {
        if entry.depth() == 0 {
            continue;
        }
        if lines.len() >= MAX_LISTING_ENTRIES {
            more = true;
            break;
        }
        let mut rel = rel_string(root, entry.path());
        if entry.file_type().is_some_and(|t| t.is_dir()) {
            rel.push('/');
        }
        lines.push(rel);
    }
    lines.sort();
    if more {
        lines.push(format!(
            "[… listing cut at {MAX_LISTING_ENTRIES} entries, {LISTING_DEPTH} levels deep]"
        ));
    }
    if lines.is_empty() {
        "(empty folder)".into()
    } else {
        lines.join("\n")
    }
}

/// `files` as tagged text for our own agent loop, to append to the user
/// message: `intro`, then a `<file path="…">` / `<folder path="…">` block
/// each. Empty when `files` is.
pub fn native_block(intro: &str, files: &[FileContext]) -> String {
    if files.is_empty() {
        return String::new();
    }
    let mut out = format!("\n{intro}\n");
    for f in files {
        let (tag, body) = match &f.body {
            Body::Folder { .. } => ("folder", f.text().unwrap_or_default()),
            Body::File { .. } => ("file", f.text().unwrap_or_default()),
            Body::PathOnly(why) => ("file", format!("[{why}]")),
        };
        out.push_str(&format!("<{tag} path=\"{}\">\n{body}\n</{tag}>\n", f.rel));
    }
    out
}

/// `files` as ACP prompt content blocks, to go after the text block. An
/// embedded text `resource` when the agent advertised `embeddedContext`
/// (and there's text to embed), else a `resource_link`.
pub fn acp_blocks(files: &[FileContext], embedded_context: bool) -> Vec<ContentBlock> {
    files
        .iter()
        .map(|f| match f.text().filter(|_| embedded_context) {
            Some(text) => {
                let mut contents = TextResourceContents::new(text, f.uri());
                contents.mime_type = Some(if f.is_dir() {
                    "text/x-directory-listing".into()
                } else {
                    "text/plain".into()
                });
                ContentBlock::Resource(EmbeddedResource::new(
                    EmbeddedResourceResource::TextResourceContents(contents),
                ))
            }
            None => ContentBlock::ResourceLink(ResourceLink::new(f.rel.clone(), f.uri())),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("al-fc-{name}-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        dir
    }

    #[test]
    fn reads_files_and_folders() {
        let dir = tmp("read");
        std::fs::write(dir.join("sub/a.txt"), "hello").unwrap();
        let mut budget = Budget::default();
        let file = read(&dir, "sub/a.txt", &mut budget).unwrap();
        let folder = read(&dir, "sub/", &mut budget).unwrap();
        assert!(read(&dir, "missing.txt", &mut budget).is_none());
        assert!(read(&dir, "../x", &mut budget).is_none());
        assert_eq!(folder.rel, "sub");
        assert_eq!(folder.display_path(), "sub/");
        let block = native_block("Attached:", &[file, folder]);
        assert!(block.contains("<file path=\"sub/a.txt\">\nhello\n</file>"));
        assert!(block.contains("<folder path=\"sub\">\nsub/a.txt\n</folder>"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn truncates_and_budgets() {
        let dir = tmp("big");
        std::fs::write(dir.join("big.txt"), "x".repeat(MAX_FILE_BYTES + 10)).unwrap();
        let mut budget = Budget(10);
        let f = read(&dir, "big.txt", &mut budget).unwrap();
        assert!(f.text().unwrap().contains("truncated"));
        let again = read(&dir, "big.txt", &mut budget).unwrap();
        assert!(matches!(again.body, Body::PathOnly(_)));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn acp_blocks_follow_embedded_context() {
        let dir = tmp("acp");
        std::fs::write(dir.join("a.txt"), "hi").unwrap();
        let f = read(&dir, "a.txt", &mut Budget::default()).unwrap();
        let files = [f];
        assert!(matches!(
            acp_blocks(&files, true)[0],
            ContentBlock::Resource(_)
        ));
        assert!(matches!(
            acp_blocks(&files, false)[0],
            ContentBlock::ResourceLink(_)
        ));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
