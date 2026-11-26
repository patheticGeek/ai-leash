//! A conversation's messages as a native provider receives them (#74):
//! `ChatMessage` serialized as-is, plus whatever the user attached to it
//! (`ChatMessage::attachments`, see `crate::attachments`) turned into that
//! provider's shape:
//!
//! - **image**: an OpenAI-compatible `image_url` content part holding a
//!   `data:` URL, or a base64 entry in Ollama's `images`. For a model that
//!   can't see images (`ImageMode::Text`) it becomes a line like a binary
//!   file's, so the agent still knows it's there.
//! - **text**: appended to the message as a fenced block labelled with the
//!   file's path (or name, for pasted text).
//! - **binary**: a line naming its path, mime and size, for the agent's own
//!   file tools.
//!
//! The stored copies are read again every time a request is built, so a
//! resumed chat (its history reloaded from the database with the
//! attachments on each message) sends exactly what the first turn did.
//!
//! Also home to the per-model vision cache both providers share
//! (`vision_known` / `remember_vision`).

use crate::attachments::{Attachment, AttachmentKind};
use crate::chat::ChatMessage;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// How images go over the wire.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ImageMode {
    /// `content` becomes an array of `text` and `image_url` parts.
    OpenAi,
    /// The message gets an `images` array of bare base64.
    Ollama,
    /// The model can't see images: each is described in a line instead.
    Text,
}

/// Whether any message carries an image — only then is it worth asking
/// whether the model can see them.
pub(super) fn has_images(messages: &[ChatMessage]) -> bool {
    messages
        .iter()
        .flat_map(|m| &m.attachments)
        .any(|a| a.kind == AttachmentKind::Image)
}

/// `messages` as the request's `messages` array.
pub(super) fn messages(messages: &[ChatMessage], mode: ImageMode) -> Vec<Value> {
    messages.iter().map(|m| message(m, mode)).collect()
}

fn message(m: &ChatMessage, mode: ImageMode) -> Value {
    let mut value = serde_json::to_value(m).unwrap_or_else(|_| json!({}));
    if m.attachments.is_empty() {
        return value;
    }
    let mut text = m.content.clone();
    let mut images: Vec<(String, String)> = Vec::new(); // (mime, base64)
    for a in &m.attachments {
        let section = match a.kind {
            AttachmentKind::Image if mode != ImageMode::Text => match read_base64(a) {
                Some(b64) => {
                    images.push((a.mime.clone(), b64));
                    None
                }
                None => Some(missing_line(a)),
            },
            AttachmentKind::Image => Some(reference_line(
                a,
                "image, not shown: this model doesn't accept images",
            )),
            AttachmentKind::Text => Some(text_block(a)),
            AttachmentKind::Binary => Some(reference_line(a, "binary file")),
        };
        if let Some(section) = section {
            if !text.is_empty() {
                text.push_str("\n\n");
            }
            text.push_str(&section);
        }
    }
    let content = match mode {
        ImageMode::OpenAi if !images.is_empty() => {
            let mut parts = Vec::new();
            if !text.is_empty() {
                parts.push(json!({ "type": "text", "text": text }));
            }
            for (mime, b64) in &images {
                parts.push(json!({
                    "type": "image_url",
                    "image_url": { "url": format!("data:{mime};base64,{b64}") },
                }));
            }
            Value::Array(parts)
        }
        _ => Value::String(text),
    };
    value["content"] = content;
    if mode == ImageMode::Ollama && !images.is_empty() {
        value["images"] = Value::Array(images.into_iter().map(|(_, b64)| json!(b64)).collect());
    }
    value
}

fn read_base64(a: &Attachment) -> Option<String> {
    let bytes = std::fs::read(a.best_path()?).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// The path the agent should use: where it came from if that's still
/// there (so it matches the user's own files), else the stored copy.
fn display_path(a: &Attachment) -> String {
    a.original_path
        .as_ref()
        .filter(|p| std::path::Path::new(p).exists())
        .cloned()
        .or_else(|| a.best_path().map(|p| p.to_string_lossy().into_owned()))
        .unwrap_or_else(|| a.name.clone())
}

fn missing_line(a: &Attachment) -> String {
    format!("[Attached file {} is no longer available]", a.name)
}

fn reference_line(a: &Attachment, what: &str) -> String {
    if a.best_path().is_none() {
        return missing_line(a);
    }
    format!(
        "[Attached {what}: {} ({}, {})]",
        display_path(a),
        a.mime,
        human_size(a.size)
    )
}

/// A text attachment as a fenced block. The fence is longer than any run
/// of backticks inside, so the file can't close it early.
fn text_block(a: &Attachment) -> String {
    let Some(body) = a
        .best_path()
        .and_then(|p| std::fs::read(p).ok())
        .map(|b| String::from_utf8_lossy(&b).into_owned())
    else {
        return missing_line(a);
    };
    let longest_run = body.split(|c| c != '`').map(str::len).max().unwrap_or(0);
    let fence = "`".repeat(longest_run.max(2) + 1);
    let label = a.original_path.as_deref().unwrap_or(&a.name);
    let note = if a.truncated {
        format!(
            "\n[Truncated: only the first {} of {} is included]",
            human_size(a.stored_size),
            human_size(a.size)
        )
    } else {
        String::new()
    };
    let newline = if body.ends_with('\n') { "" } else { "\n" };
    format!("{fence}{label}\n{body}{newline}{fence}{note}")
}

fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

/// What's been learned about each model's vision, keyed by provider
/// endpoint and model (`vision_key`): from Ollama's `/api/show`, or from an
/// OpenAI-compatible host refusing an image.
static VISION: LazyLock<Mutex<HashMap<String, bool>>> = LazyLock::new(Default::default);

pub(super) fn vision_key(endpoint: &str, model: &str) -> String {
    format!("{endpoint}\u{0}{model}")
}

pub(super) fn vision_known(key: &str) -> Option<bool> {
    VISION.lock().unwrap().get(key).copied()
}

pub(super) fn remember_vision(key: String, vision: bool) {
    VISION.lock().unwrap().insert(key, vision);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user(content: &str, attachments: Vec<Attachment>) -> ChatMessage {
        ChatMessage {
            role: "user".into(),
            content: content.into(),
            tool_calls: None,
            attachments,
        }
    }

    fn png() -> Vec<u8> {
        let img = image::RgbImage::from_pixel(2, 2, image::Rgb([1, 2, 3]));
        let mut out = std::io::Cursor::new(Vec::new());
        img.write_to(&mut out, image::ImageFormat::Png).unwrap();
        out.into_inner()
    }

    /// A staged attachment in a fresh directory; removing the directory
    /// takes its stored copy with it.
    fn staged(name: &str, bytes: &[u8]) -> (std::path::PathBuf, Attachment) {
        let dir = std::env::temp_dir().join(format!("al-wire-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = crate::attachments::stage_bytes(&dir, name, bytes.to_vec()).unwrap();
        (dir, a)
    }

    #[test]
    fn plain_messages_serialize_unchanged() {
        let m = user("hi", vec![]);
        assert_eq!(
            messages(&[m], ImageMode::OpenAi),
            vec![json!({"role": "user", "content": "hi"})]
        );
    }

    #[test]
    fn images_become_openai_parts_or_ollama_images() {
        let (_dir, image) = staged("dot.png", &png());
        assert_eq!(image.kind, AttachmentKind::Image);
        let m = user("what is this?", vec![image.clone()]);

        let openai = message(&m, ImageMode::OpenAi);
        let parts = openai["content"].as_array().unwrap();
        assert_eq!(parts[0], json!({"type": "text", "text": "what is this?"}));
        assert_eq!(parts[1]["type"], "image_url");
        let url = parts[1]["image_url"]["url"].as_str().unwrap();
        assert!(url.starts_with(&format!("data:{};base64,", image.mime)));

        let ollama = message(&m, ImageMode::Ollama);
        assert_eq!(ollama["content"], "what is this?");
        assert_eq!(ollama["images"].as_array().unwrap().len(), 1);

        let text = message(&m, ImageMode::Text);
        let content = text["content"].as_str().unwrap();
        assert!(content.contains("doesn't accept images"));
        assert!(text.get("images").is_none());
    }

    #[test]
    fn text_files_are_fenced_and_binaries_referenced() {
        let (_d1, text) = staged("notes.md", b"has ``` inside\n");
        let (_d2, bin) = staged("blob.bin", &[0u8, 1, 2, 3]);
        assert_eq!(bin.kind, AttachmentKind::Binary);
        let m = user("", vec![text, bin]);
        let v = message(&m, ImageMode::OpenAi);
        let content = v["content"].as_str().unwrap();
        assert!(
            content.starts_with("````notes.md\nhas ``` inside\n````"),
            "{content}"
        );
        assert!(content.contains("[Attached binary file: "));
        assert!(content.contains("4 B)]"));
    }

    #[test]
    fn a_missing_copy_is_said_so() {
        let (dir, image) = staged("dot.png", &png());
        std::fs::remove_dir_all(&dir).unwrap();
        let v = message(&user("x", vec![image]), ImageMode::OpenAi);
        assert_eq!(
            v["content"],
            "x\n\n[Attached file dot.png is no longer available]"
        );
    }
}
