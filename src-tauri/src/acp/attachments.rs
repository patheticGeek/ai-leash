//! Attachments (#73) over ACP (#75), both ways.
//!
//! **Out** (`prompt_blocks`): each file the user attached becomes one
//! content block after the prompt's text, picked from what the agent
//! advertised in `initialize`'s `promptCapabilities` (`PromptCaps`):
//!
//! - an **image** goes as an `image` block (base64, with a `file://` uri to
//!   the stored copy) when the agent accepts images;
//! - a **text** file as an embedded `resource` with text contents when it
//!   accepts `embeddedContext`;
//! - a **binary** file as an embedded blob `resource` under the same
//!   capability, if its stored copy is at most `BLOB_EMBED_CAP`;
//! - anything else as a `resource_link` to the stored copy (or, for one too
//!   big to copy, the original file) — the baseline every ACP agent takes.
//!
//! The composer stops image attachments to an agent that doesn't take
//! images (`imagesUnsupportedReason` on the frontend), so the image
//! fallback is only for a chat whose connection hadn't said yet.
//!
//! **In** (`stage_agent_image`): an `image` block the agent sends back in
//! its message is staged like a pasted one and shown on the assistant
//! message as an attachment (see `events.rs`).

use crate::attachments::{self, Attachment, AttachmentKind};
use agent_client_protocol::schema::v1::{
    BlobResourceContents, ContentBlock, EmbeddedResource, EmbeddedResourceResource, ImageContent,
    ResourceLink, TextResourceContents,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::Path;

/// The biggest binary file sent embedded (base64) rather than as a link.
pub const BLOB_EMBED_CAP: u64 = 5 * 1024 * 1024;

/// What the agent said it takes in a prompt (`initialize`'s
/// `agentCapabilities.promptCapabilities`).
#[derive(Clone, Copy, Debug, Default)]
pub struct PromptCaps {
    pub image: bool,
    pub embedded_context: bool,
}

/// A `file://` URI for `path`, percent-encoding what a URI path can't hold
/// as is (attachment names often have spaces).
pub fn file_uri(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let mut out = String::from("file://");
    if !raw.starts_with('/') {
        // A Windows drive path: file:///C:/…
        out.push('/');
    }
    for b in raw.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// `attachments` as ACP prompt content blocks, one each — see the module
/// doc. One whose file is gone from disk (both the stored copy and the
/// original) is left out.
pub fn prompt_blocks(attachments: &[Attachment], caps: PromptCaps) -> Vec<ContentBlock> {
    attachments
        .iter()
        .filter_map(|a| prompt_block(a, caps))
        .collect()
}

fn prompt_block(a: &Attachment, caps: PromptCaps) -> Option<ContentBlock> {
    let path = a.best_path()?;
    let uri = file_uri(&path);
    let stored = a
        .stored_path
        .as_deref()
        .map(Path::new)
        .filter(|p| p.exists());
    let embedded = match a.kind {
        AttachmentKind::Image if caps.image => {
            stored.and_then(|p| std::fs::read(p).ok()).map(|bytes| {
                let mut image = ImageContent::new(STANDARD.encode(bytes), a.mime.clone());
                image.uri = Some(uri.clone());
                ContentBlock::Image(image)
            })
        }
        AttachmentKind::Text if caps.embedded_context => {
            stored.and_then(|p| std::fs::read(p).ok()).map(|bytes| {
                let mut text = String::from_utf8_lossy(&bytes).into_owned();
                if a.truncated {
                    text.push_str(&format!(
                        "\n[… truncated: only the first {} KB of this file are attached]",
                        attachments::TEXT_CAP / 1024
                    ));
                }
                let mut contents = TextResourceContents::new(text, uri.clone());
                contents.mime_type = Some(a.mime.clone());
                ContentBlock::Resource(EmbeddedResource::new(
                    EmbeddedResourceResource::TextResourceContents(contents),
                ))
            })
        }
        AttachmentKind::Binary if caps.embedded_context && a.stored_size <= BLOB_EMBED_CAP => {
            stored.and_then(|p| std::fs::read(p).ok()).map(|bytes| {
                let mut contents = BlobResourceContents::new(STANDARD.encode(bytes), uri.clone());
                contents.mime_type = Some(a.mime.clone());
                ContentBlock::Resource(EmbeddedResource::new(
                    EmbeddedResourceResource::BlobResourceContents(contents),
                ))
            })
        }
        _ => None,
    };
    Some(embedded.unwrap_or_else(|| {
        let mut link = ResourceLink::new(a.name.clone(), uri);
        link.mime_type = Some(a.mime.clone());
        link.size = i64::try_from(a.size).ok();
        ContentBlock::ResourceLink(link)
    }))
}

/// Stages an `image` block the agent sent (its base64 `data`, or else the
/// local file its `file://` uri names) as an attachment, to show on its
/// message. None if there's nothing usable in it.
pub fn stage_agent_image(image: &ImageContent) -> Option<Attachment> {
    let root = attachments::root();
    let extension = image
        .mime_type
        .strip_prefix("image/")
        .map(|s| s.split(['+', ';']).next().unwrap_or(s))
        .filter(|s| !s.is_empty())
        .unwrap_or("png");
    let name = format!("image.{extension}");
    let data = image.data.trim();
    if !data.is_empty() {
        let bytes = STANDARD.decode(data).ok()?;
        return attachments::stage_bytes(&root, &name, bytes).ok();
    }
    let path = image.uri.as_deref()?.strip_prefix("file://")?;
    attachments::stage_path(&root, Path::new(&attachments::percent_decode(path))).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("al-acp-attach-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn png() -> Vec<u8> {
        let img = image::RgbImage::from_fn(4, 4, |x, y| image::Rgb([x as u8, y as u8, 0]));
        let mut out = std::io::Cursor::new(Vec::new());
        img.write_to(&mut out, image::ImageFormat::Png).unwrap();
        out.into_inner()
    }

    const ALL: PromptCaps = PromptCaps {
        image: true,
        embedded_context: true,
    };
    const NONE: PromptCaps = PromptCaps {
        image: false,
        embedded_context: false,
    };

    #[test]
    fn uris_are_percent_encoded() {
        assert_eq!(
            file_uri(Path::new("/tmp/a b/shot (1).png")),
            "file:///tmp/a%20b/shot%20%281%29.png"
        );
        assert_eq!(
            attachments::percent_decode("/tmp/a%20b/x.png"),
            "/tmp/a b/x.png"
        );
    }

    #[test]
    fn images_go_as_image_blocks_only_when_advertised() {
        let root = temp_root();
        let a = attachments::stage_bytes(&root, "shot.png", png()).unwrap();
        let files = [a];
        match &prompt_blocks(&files, ALL)[0] {
            ContentBlock::Image(img) => {
                assert_eq!(img.mime_type, "image/png");
                assert_eq!(STANDARD.decode(&img.data).unwrap(), png());
                assert!(img.uri.as_deref().unwrap().starts_with("file://"));
            }
            other => panic!("expected an image block, got {other:?}"),
        }
        assert!(matches!(
            prompt_blocks(&files, NONE)[0],
            ContentBlock::ResourceLink(_)
        ));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn text_embeds_with_embedded_context_else_links() {
        let root = temp_root();
        let a = attachments::stage_bytes(&root, "notes.md", b"# hi".to_vec()).unwrap();
        let files = [a];
        match &prompt_blocks(&files, ALL)[0] {
            ContentBlock::Resource(r) => match &r.resource {
                EmbeddedResourceResource::TextResourceContents(t) => {
                    assert_eq!(t.text, "# hi");
                    assert_eq!(t.mime_type.as_deref(), Some("text/markdown"));
                }
                other => panic!("expected text contents, got {other:?}"),
            },
            other => panic!("expected a resource, got {other:?}"),
        }
        match &prompt_blocks(&files, NONE)[0] {
            ContentBlock::ResourceLink(l) => {
                assert_eq!(l.name, "notes.md");
                assert_eq!(l.size, Some(4));
                assert!(l.uri.starts_with("file://"));
            }
            other => panic!("expected a resource_link, got {other:?}"),
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn binary_embeds_as_a_blob_else_links() {
        let root = temp_root();
        let bytes = vec![0u8, 1, 2, 3, 255];
        let a = attachments::stage_bytes(&root, "data.bin", bytes.clone()).unwrap();
        assert_eq!(a.kind, AttachmentKind::Binary);
        let files = [a];
        match &prompt_blocks(&files, ALL)[0] {
            ContentBlock::Resource(r) => match &r.resource {
                EmbeddedResourceResource::BlobResourceContents(b) => {
                    assert_eq!(STANDARD.decode(&b.blob).unwrap(), bytes);
                }
                other => panic!("expected blob contents, got {other:?}"),
            },
            other => panic!("expected a resource, got {other:?}"),
        }
        assert!(matches!(
            prompt_blocks(&files, NONE)[0],
            ContentBlock::ResourceLink(_)
        ));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_file_gone_from_disk_is_left_out() {
        let root = temp_root();
        let a = attachments::stage_bytes(&root, "notes.md", b"x".to_vec()).unwrap();
        let _ = std::fs::remove_dir_all(&root);
        assert!(prompt_blocks(&[a], ALL).is_empty());
    }
}
