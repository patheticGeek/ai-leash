//! `@` file mentions in chat messages (#24). The user types `@path` (picked
//! from the composer's file picker, `search_mentions`, or added from the
//! file tree); on send, every `@path` in the message that names a file or
//! folder inside the conversation's checkout is read (`resolve`) and goes
//! to the agent through `crate::file_context`: appended to the user message
//! for our own loop (`attach_contents`), as ACP content blocks otherwise.
//!
//! Either way the stored message ends in a trailer (`MENTIONS_OPEN`) naming
//! the mentioned paths, which the transcript strips and shows as chips
//! (`src/lib/mentions.ts`) and `title_from_message` ignores.

use crate::commands::IGNORED_NAMES;
use crate::file_context::{self, rel_string, Budget, FileContext};
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Starts the stored message's trailer; the frontend splits on it.
pub const MENTIONS_OPEN: &str = "\n\n<ai-leash-mentions paths='";
const MENTIONS_CLOSE: &str = "</ai-leash-mentions>";
/// Walk budget for one picker search, so a huge checkout stays responsive.
const MAX_WALK_ENTRIES: usize = 50_000;
const MAX_SEARCH_RESULTS: usize = 50;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MentionCandidate {
    /// Relative to the checkout, `/`-separated.
    pub path: String,
    pub is_dir: bool,
}

/// How well `query` fuzzy-matches `path` (a subsequence, case-insensitive),
/// or None. Higher is better: consecutive runs, matches at the start of a
/// segment and in the file name score more; shorter paths win ties.
fn fuzzy_score(path: &str, query: &str) -> Option<i64> {
    if query.is_empty() {
        return Some(-(path.len() as i64));
    }
    let hay: Vec<char> = path.to_lowercase().chars().collect();
    let name_start = path.rfind('/').map_or(0, |i| path[..=i].chars().count());
    let mut score = 0i64;
    let mut hi = 0usize;
    let mut prev: Option<usize> = None;
    for qc in query.to_lowercase().chars() {
        let found = (hi..hay.len()).find(|&i| hay[i] == qc)?;
        score += 1;
        if prev == Some(found.wrapping_sub(1)) {
            score += 5;
        }
        if found == 0 || matches!(hay[found - 1], '/' | '_' | '-' | '.') {
            score += 3;
        }
        if found >= name_start {
            score += 2;
        }
        prev = Some(found);
        hi = found + 1;
    }
    // A literal substring beats a scattered match.
    if path.to_lowercase().contains(&query.to_lowercase()) {
        score += 20;
    }
    Some(score * 1000 - path.len() as i64)
}

/// Files and folders under `checkout_path` fuzzy-matching `query`, best
/// first — the composer's `@` picker. `.gitignore`-aware like
/// `search_files`; skips the same `IGNORED_NAMES`.
#[tauri::command]
pub fn search_mentions(checkout_path: String, query: String) -> Vec<MentionCandidate> {
    let root = PathBuf::from(&checkout_path);
    let query: String = query.chars().filter(|c| !c.is_whitespace()).collect();
    let walker = ignore::WalkBuilder::new(&root)
        .hidden(false)
        .filter_entry(|e| !IGNORED_NAMES.contains(&e.file_name().to_string_lossy().as_ref()))
        .build();
    let mut scored: Vec<(i64, MentionCandidate)> = vec![];
    for entry in walker.flatten().take(MAX_WALK_ENTRIES) {
        if entry.depth() == 0 {
            continue;
        }
        let is_dir = entry.file_type().is_some_and(|t| t.is_dir());
        let rel = rel_string(&root, entry.path());
        if let Some(score) = fuzzy_score(&rel, &query) {
            scored.push((score, MentionCandidate { path: rel, is_dir }));
        }
    }
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.path.cmp(&b.1.path)));
    scored.truncate(MAX_SEARCH_RESULTS);
    scored.into_iter().map(|(_, c)| c).collect()
}

/// The `@path` tokens in `message`, in order and deduplicated: `@` at the
/// start or after whitespace, then either a run of non-space characters
/// or a `"quoted path"` (for names with spaces). Trailing punctuation is
/// tried off too, since "look at @a.ts, please" means `a.ts`.
fn mention_tokens(message: &str) -> Vec<Vec<String>> {
    let chars: Vec<char> = message.chars().collect();
    let mut out = vec![];
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '@' && (i == 0 || chars[i - 1].is_whitespace()) {
            if chars.get(i + 1) == Some(&'"') {
                if let Some(end) = (i + 2..chars.len()).find(|&j| chars[j] == '"') {
                    out.push(vec![chars[i + 2..end].iter().collect()]);
                    i = end + 1;
                    continue;
                }
            }
            let end = (i + 1..chars.len())
                .find(|&j| chars[j].is_whitespace())
                .unwrap_or(chars.len());
            let token: String = chars[i + 1..end].iter().collect();
            let mut candidates = vec![token.clone()];
            let trimmed = token.trim_end_matches([',', '.', ';', ':', '!', '?', ')', '\'', '"']);
            if trimmed != token {
                candidates.push(trimmed.to_string());
            }
            // `@src/a.ts:12` / `@src/a.ts:12-18` points at lines of the
            // file; the whole file is what's attached.
            if let Some(path) = without_line_range(trimmed) {
                candidates.push(path.to_string());
            }
            out.push(candidates);
            i = end;
            continue;
        }
        i += 1;
    }
    out
}

/// `path` without a trailing `:12` or `:12-18` line range, if it has one.
fn without_line_range(token: &str) -> Option<&str> {
    let (path, range) = token.rsplit_once(':')?;
    let (start, end) = range.split_once('-').unwrap_or((range, range));
    let is_line = |n: &str| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit());
    (!path.is_empty() && is_line(start) && is_line(end)).then_some(path)
}

/// Every `@path` in `message` naming a file or folder inside `root`, read
/// (`file_context::read`, sharing one budget). Paths outside `root` (or
/// that don't exist) are just text.
pub fn resolve(root: &Path, message: &str) -> Vec<FileContext> {
    let mut budget = Budget::default();
    let mut out: Vec<FileContext> = vec![];
    for candidates in mention_tokens(message) {
        let Some(found) = candidates
            .iter()
            .find_map(|c| file_context::read(root, c, &mut budget))
        else {
            continue;
        };
        if !out.iter().any(|m| m.rel == found.rel) {
            out.push(found);
        }
    }
    out
}

/// The stored message's trailer naming `mentions`, wrapping `inner`.
fn trailer(mentions: &[FileContext], inner: &str) -> String {
    // Folders end in "/", so the chips can tell them apart.
    let paths: Vec<String> = mentions.iter().map(FileContext::display_path).collect();
    // `'` would end the attribute; `\u0027` is the same string in JSON.
    let json = serde_json::to_string(&paths)
        .unwrap_or_else(|_| "[]".into())
        .replace('\'', "\\u0027");
    format!("{MENTIONS_OPEN}{json}'>{inner}{MENTIONS_CLOSE}")
}

/// `message` as our own agent loop gets (and stores) it: the text, then
/// the mentions' contents (`file_context::native_block`) inside the trailer.
pub fn attach_contents(message: &str, mentions: &[FileContext]) -> String {
    if mentions.is_empty() {
        return message.to_string();
    }
    let inner = file_context::native_block(
        "The user mentioned these files/folders; their current contents are attached.",
        mentions,
    );
    format!("{message}{}", trailer(mentions, &inner))
}

/// `message` as stored for an ACP chat: the agent got the contents as
/// content blocks, so the trailer only names the paths (for the chips).
pub fn with_paths_only(message: &str, mentions: &[FileContext]) -> String {
    if mentions.is_empty() {
        return message.to_string();
    }
    format!("{message}{}", trailer(mentions, ""))
}

/// `content` without its mentions trailer, if it has one.
pub fn strip_trailer(content: &str) -> &str {
    content
        .find(MENTIONS_OPEN)
        .map_or(content, |i| &content[..i])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_drop_a_line_range() {
        let t = mention_tokens("fix @src/a.ts:12-18 and @b.rs:3. not @c.ts:x");
        assert_eq!(t[0].last().unwrap(), "src/a.ts");
        assert_eq!(t[1].last().unwrap(), "b.rs");
        assert_eq!(t[2], vec!["c.ts:x".to_string()]);
    }

    #[test]
    fn tokens_handle_quotes_and_punctuation() {
        let t = mention_tokens("see @src/a.ts, and @\"my file.md\" but not a@b");
        assert_eq!(t[0], vec!["src/a.ts,".to_string(), "src/a.ts".to_string()]);
        assert_eq!(t[1], vec!["my file.md".to_string()]);
        assert_eq!(t.len(), 2);
    }

    #[test]
    fn fuzzy_prefers_substring_and_name() {
        let a = fuzzy_score("src/app/AppShell.tsx", "src/app/Ap").unwrap();
        let b = fuzzy_score("src/data/apiPaths.ts", "src/app/Ap");
        assert!(b.is_none() || a > b.unwrap());
        assert!(fuzzy_score("src/app/AppShell.tsx", "zzz").is_none());
    }

    #[test]
    fn resolves_files_and_folders_and_builds_trailer() {
        let dir = std::env::temp_dir().join(format!("al-mentions-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("sub/a.txt"), "hello").unwrap();
        let ms = resolve(&dir, "read @sub/a.txt and @sub/ and @missing.txt");
        assert_eq!(ms.len(), 2);
        assert_eq!(ms[0].rel, "sub/a.txt");
        assert!(ms[1].is_dir());
        let stored = attach_contents("read it", &ms);
        assert!(stored.contains("<file path=\"sub/a.txt\">\nhello\n</file>"));
        assert!(stored.contains(r#"paths='["sub/a.txt","sub/"]'"#));
        assert_eq!(strip_trailer(&stored), "read it");
        assert_eq!(strip_trailer(&with_paths_only("x", &ms)), "x");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
