//! Attachments (#73): images and files the user adds to a chat message from
//! the composer (pasted, dropped from the OS, or picked in the native file
//! dialog), from anywhere on disk — the route for what `@path` mentions
//! (`crate::mentions`, inside the checkout only) can't reach.
//!
//! Each attachment is copied ("staged") into the app's own attachments
//! directory the moment it's added, before the message is sent, so the
//! transcript survives the source moving or being deleted and a pasted
//! image (which has no path at all) is a file like any other. A staged
//! attachment is a directory `<attachments>/<id>/` holding the copy and a
//! `meta.json` with its `Attachment`; the message row stores the same
//! `Attachment`s as JSON (`messages.attachments`). Unsent or orphaned ones
//! (a chip removed before send, a deleted conversation) are swept by
//! `collect_garbage` at startup.
//!
//! Three kinds (`AttachmentKind`), decided from the bytes, not the name:
//! - **image** (png/jpeg/webp/gif): downscaled to `IMAGE_MAX_EDGE` and
//!   re-encoded until it fits `IMAGE_CAP` (`prepare_image`).
//! - **text**: anything that's valid UTF-8 without NULs. The copy keeps at
//!   most `TEXT_CAP` bytes (`truncated` says it was cut).
//! - **binary**: anything else — a reference (path, mime, size); copied
//!   when it's at most `BINARY_COPY_CAP`, so it can still be opened.
//!
//! Getting attachments to the model is the backends' job: native providers
//! (#74) and ACP agents (#75) read `ChatMessage::attachments`.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::ipc::{InvokeBody, Request};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// The most an image may weigh once prepared.
pub const IMAGE_CAP: usize = 5 * 1024 * 1024;
/// The longest edge an image is downscaled to.
pub const IMAGE_MAX_EDGE: u32 = 2048;
/// How much of a text file is kept (and so can be sent).
pub const TEXT_CAP: usize = 1024 * 1024;
/// Binary files up to this size are copied; bigger ones stay a reference.
pub const BINARY_COPY_CAP: u64 = 50 * 1024 * 1024;
/// An image file bigger than this isn't even decoded.
const IMAGE_READ_CAP: u64 = 64 * 1024 * 1024;
/// How much of a file is read to tell its kind.
const SNIFF_BYTES: usize = 8192;
const META_FILE: &str = "meta.json";
/// Staged attachments nothing references are kept this long before
/// `collect_garbage` removes them, so one staged for a draft that's still
/// being typed (in another window, say) isn't swept from under it.
const GARBAGE_AGE: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AttachmentKind {
    Image,
    Text,
    Binary,
}

/// One attached file, as staged, stored on its message and sent to the
/// frontend.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    /// A uuid, and the name of its directory under `root()`.
    pub id: String,
    pub kind: AttachmentKind,
    /// The file name as the user knows it (a downscaled image keeps its
    /// original name even if it was re-encoded to another format).
    pub name: String,
    /// The stored copy's mime type.
    pub mime: String,
    /// The original file's size in bytes.
    pub size: u64,
    /// Where it came from on disk — None for pasted bytes.
    pub original_path: Option<String>,
    /// The copy under `root()`; None for a binary file too big to copy.
    pub stored_path: Option<String>,
    /// The stored copy's size in bytes (0 when there's none).
    #[serde(default)]
    pub stored_size: u64,
    /// An image's pixel size, as stored.
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    /// An image that was downscaled or re-encoded to fit `IMAGE_CAP`.
    #[serde(default)]
    pub downscaled: bool,
    /// A text file longer than `TEXT_CAP`: the copy is only its start.
    #[serde(default)]
    pub truncated: bool,
}

impl Attachment {
    /// The stored copy if there is one, else the original file.
    pub fn best_path(&self) -> Option<PathBuf> {
        self.stored_path
            .as_ref()
            .map(PathBuf::from)
            .filter(|p| p.exists())
            .or_else(|| {
                self.original_path
                    .as_ref()
                    .map(PathBuf::from)
                    .filter(|p| p.exists())
            })
    }
}

/// Where staged attachments live: next to the database, split dev/release
/// like it (`paths::versioned_dir`).
pub fn root() -> PathBuf {
    let dir = crate::paths::versioned_dir("attachments");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | '\0' | ':' => '_',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').to_string();
    if cleaned.is_empty() {
        "attachment".into()
    } else {
        cleaned
    }
}

fn extension(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// `name` with its extension replaced by `ext`.
fn with_extension(name: &str, ext: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| name.to_string());
    format!("{stem}.{ext}")
}

fn image_format(head: &[u8]) -> Option<image::ImageFormat> {
    use image::ImageFormat::*;
    match image::guess_format(head).ok()? {
        f @ (Png | Jpeg | WebP | Gif) => Some(f),
        _ => None,
    }
}

fn image_mime(format: image::ImageFormat) -> &'static str {
    match format {
        image::ImageFormat::Jpeg => "image/jpeg",
        image::ImageFormat::WebP => "image/webp",
        image::ImageFormat::Gif => "image/gif",
        _ => "image/png",
    }
}

/// Whether `bytes` read as UTF-8 text. `cut`: they're only the start of
/// the file, so a character split at the end is fine.
fn is_text(bytes: &[u8], cut: bool) -> bool {
    if bytes.contains(&0) {
        return false;
    }
    match std::str::from_utf8(bytes) {
        Ok(_) => true,
        // `error_len() == None`: the input just ended mid-character.
        Err(e) => cut && e.error_len().is_none() && bytes.len() - e.valid_up_to() < 4,
    }
}

/// `bytes` cut to at most `TEXT_CAP`, on a character boundary.
fn cap_text(bytes: &[u8]) -> &[u8] {
    if bytes.len() <= TEXT_CAP {
        return bytes;
    }
    let mut end = TEXT_CAP;
    // Back off continuation bytes (10xxxxxx) to a character start.
    while end > 0 && (bytes[end] & 0xC0) == 0x80 {
        end -= 1;
    }
    &bytes[..end]
}

fn text_mime(name: &str) -> &'static str {
    match extension(name).as_str() {
        "md" | "markdown" => "text/markdown",
        "json" => "application/json",
        "csv" => "text/csv",
        "tsv" => "text/tab-separated-values",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" | "cjs" => "text/javascript",
        "ts" | "tsx" | "mts" | "cts" => "text/typescript",
        "xml" => "application/xml",
        "svg" => "image/svg+xml",
        "yaml" | "yml" => "application/yaml",
        "toml" => "application/toml",
        _ => "text/plain",
    }
}

fn binary_mime(head: &[u8]) -> String {
    infer::get(head)
        .map(|t| t.mime_type().to_string())
        .unwrap_or_else(|| "application/octet-stream".into())
}

/// The image as stored: unchanged when it's within both limits, else
/// downscaled to `IMAGE_MAX_EDGE` and re-encoded (PNG if it has
/// transparency and that fits, else JPEG), shrinking further until it fits
/// `IMAGE_CAP`. A GIF is kept as is (re-encoding would lose its animation),
/// so one over the cap is refused.
struct PreparedImage {
    bytes: Vec<u8>,
    format: image::ImageFormat,
    width: u32,
    height: u32,
    downscaled: bool,
}

fn prepare_image(bytes: Vec<u8>, format: image::ImageFormat) -> Result<PreparedImage, String> {
    let reader = image::ImageReader::with_format(Cursor::new(&bytes), format);
    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| format!("Couldn't read the image: {e}"))?;
    if bytes.len() <= IMAGE_CAP && width.max(height) <= IMAGE_MAX_EDGE {
        return Ok(PreparedImage {
            bytes,
            format,
            width,
            height,
            downscaled: false,
        });
    }
    if format == image::ImageFormat::Gif {
        if bytes.len() <= IMAGE_CAP {
            return Ok(PreparedImage {
                bytes,
                format,
                width,
                height,
                downscaled: false,
            });
        }
        return Err("GIFs larger than 5 MB can't be attached.".into());
    }
    let img = image::load_from_memory_with_format(&bytes, format)
        .map_err(|e| format!("Couldn't decode the image: {e}"))?;
    let mut edge = IMAGE_MAX_EDGE.min(width.max(height));
    for _ in 0..6 {
        let scaled = if img.width().max(img.height()) > edge {
            img.resize(edge, edge, image::imageops::FilterType::Triangle)
        } else {
            img.clone()
        };
        if scaled.color().has_alpha() {
            let mut png = Cursor::new(Vec::new());
            if scaled.write_to(&mut png, image::ImageFormat::Png).is_ok()
                && png.get_ref().len() <= IMAGE_CAP
            {
                return Ok(PreparedImage {
                    width: scaled.width(),
                    height: scaled.height(),
                    bytes: png.into_inner(),
                    format: image::ImageFormat::Png,
                    downscaled: true,
                });
            }
        }
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 85)
            .encode_image(&scaled.to_rgb8())
            .map_err(|e| format!("Couldn't re-encode the image: {e}"))?;
        if jpeg.len() <= IMAGE_CAP {
            return Ok(PreparedImage {
                width: scaled.width(),
                height: scaled.height(),
                bytes: jpeg,
                format: image::ImageFormat::Jpeg,
                downscaled: true,
            });
        }
        edge = edge * 3 / 4;
    }
    Err("The image is too large to attach.".into())
}

fn write_staged(
    root: &Path,
    mut attachment: Attachment,
    bytes: Option<&[u8]>,
    copy_from: Option<&Path>,
) -> Result<Attachment, String> {
    let dir = root.join(&attachment.id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let result = (|| {
        let stored = dir.join(sanitize_name(&attachment.name_for_copy()));
        if let Some(bytes) = bytes {
            std::fs::write(&stored, bytes).map_err(|e| e.to_string())?;
            attachment.stored_size = bytes.len() as u64;
            attachment.stored_path = Some(stored.to_string_lossy().into_owned());
        } else if let Some(src) = copy_from {
            attachment.stored_size = std::fs::copy(src, &stored).map_err(|e| e.to_string())?;
            attachment.stored_path = Some(stored.to_string_lossy().into_owned());
        }
        let meta = serde_json::to_vec_pretty(&attachment).map_err(|e| e.to_string())?;
        std::fs::write(dir.join(META_FILE), meta).map_err(|e| e.to_string())?;
        Ok(attachment)
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    result
}

impl Attachment {
    /// The stored copy's file name: the original's, with the extension
    /// changed if the image was re-encoded to another format.
    fn name_for_copy(&self) -> String {
        if self.kind != AttachmentKind::Image {
            return self.name.clone();
        }
        let ext = match self.mime.as_str() {
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => "png",
        };
        let current = extension(&self.name);
        let matches = current == ext || (ext == "jpg" && current == "jpeg");
        if matches {
            self.name.clone()
        } else {
            with_extension(&self.name, ext)
        }
    }
}

fn new_attachment(kind: AttachmentKind, name: &str, mime: String, size: u64) -> Attachment {
    Attachment {
        id: uuid::Uuid::new_v4().to_string(),
        kind,
        name: sanitize_name(name),
        mime,
        size,
        original_path: None,
        stored_path: None,
        stored_size: 0,
        width: None,
        height: None,
        downscaled: false,
        truncated: false,
    }
}

/// Stages in-memory `bytes` (a pasted image or file) as `name`.
pub fn stage_bytes(root: &Path, name: &str, bytes: Vec<u8>) -> Result<Attachment, String> {
    let size = bytes.len() as u64;
    let head = &bytes[..bytes.len().min(SNIFF_BYTES)];
    if let Some(format) = image_format(head) {
        return stage_image(root, name, size, bytes, format, None);
    }
    if is_text(cap_text(&bytes), bytes.len() > TEXT_CAP) {
        let kept = cap_text(&bytes);
        let mut a = new_attachment(AttachmentKind::Text, name, text_mime(name).into(), size);
        a.truncated = kept.len() < bytes.len();
        return write_staged(root, a, Some(kept), None);
    }
    let a = new_attachment(AttachmentKind::Binary, name, binary_mime(head), size);
    if size <= BINARY_COPY_CAP {
        write_staged(root, a, Some(&bytes), None)
    } else {
        write_staged(root, a, None, None)
    }
}

fn stage_image(
    root: &Path,
    name: &str,
    size: u64,
    bytes: Vec<u8>,
    format: image::ImageFormat,
    original_path: Option<String>,
) -> Result<Attachment, String> {
    let prepared = prepare_image(bytes, format)?;
    let mut a = new_attachment(
        AttachmentKind::Image,
        name,
        image_mime(prepared.format).into(),
        size,
    );
    a.original_path = original_path;
    a.width = Some(prepared.width);
    a.height = Some(prepared.height);
    a.downscaled = prepared.downscaled;
    write_staged(root, a, Some(&prepared.bytes), None)
}

/// Stages the file at `path` (dropped or picked in the file dialog).
pub fn stage_path(root: &Path, path: &Path) -> Result<Attachment, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
    if meta.is_dir() {
        return Err(format!(
            "{} is a folder; only files can be attached.",
            path.display()
        ));
    }
    let size = meta.len();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "attachment".into());
    let original = Some(path.to_string_lossy().into_owned());
    let mut file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    // Enough to tell an image from text from anything else, and to hold a
    // whole capped text file.
    let mut head = Vec::new();
    (&mut file)
        .take(TEXT_CAP as u64 + 1)
        .read_to_end(&mut head)
        .map_err(|e| e.to_string())?;
    if let Some(format) = image_format(&head[..head.len().min(SNIFF_BYTES)]) {
        if size > IMAGE_READ_CAP {
            return Err(format!("{name} is too large to attach as an image."));
        }
        file.read_to_end(&mut head).map_err(|e| e.to_string())?;
        return stage_image(root, &name, size, head, format, original);
    }
    let cut = (head.len() as u64) < size || head.len() > TEXT_CAP;
    let kept = cap_text(&head);
    if is_text(kept, cut) {
        let mut a = new_attachment(AttachmentKind::Text, &name, text_mime(&name).into(), size);
        a.original_path = original;
        a.truncated = (kept.len() as u64) < size;
        return write_staged(root, a, Some(kept), None);
    }
    let mut a = new_attachment(
        AttachmentKind::Binary,
        &name,
        binary_mime(&head[..head.len().min(SNIFF_BYTES)]),
        size,
    );
    a.original_path = original;
    if size <= BINARY_COPY_CAP {
        write_staged(root, a, None, Some(path))
    } else {
        write_staged(root, a, None, None)
    }
}

/// The staged attachment `id`, if it exists. `id` must be a uuid, so it
/// can't name anything outside `root`.
pub fn load(root: &Path, id: &str) -> Option<Attachment> {
    uuid::Uuid::parse_str(id).ok()?;
    let meta = std::fs::read(root.join(id).join(META_FILE)).ok()?;
    serde_json::from_slice(&meta).ok()
}

/// `ids` loaded, in order; an unknown one is an error (the send fails
/// rather than silently dropping something the user attached).
pub fn load_all(root: &Path, ids: &[String]) -> Result<Vec<Attachment>, String> {
    ids.iter()
        .map(|id| {
            load(root, id).ok_or_else(|| format!("Attachment {id} is gone; attach it again."))
        })
        .collect()
}

/// Removes staged attachment `id` (a chip removed before sending).
pub fn discard(root: &Path, id: &str) {
    if uuid::Uuid::parse_str(id).is_ok() {
        let _ = std::fs::remove_dir_all(root.join(id));
    }
}

/// Removes every staged attachment under `root` that `referenced` doesn't
/// name and that is older than `GARBAGE_AGE`.
pub fn collect_garbage(root: &Path, referenced: &HashSet<String>) {
    collect_garbage_older_than(root, referenced, GARBAGE_AGE);
}

fn collect_garbage_older_than(root: &Path, referenced: &HashSet<String>, age: Duration) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if uuid::Uuid::parse_str(&name).is_err() || referenced.contains(&name) {
            continue;
        }
        let old_enough = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|d| d >= age);
        if old_enough {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// Startup sweep: every attachment no message references any more.
pub fn sweep(db: &crate::db::Db) {
    let referenced = crate::db::referenced_attachment_ids(db);
    collect_garbage(&root(), &referenced);
}

/// Percent-decodes a header value the frontend wrote with
/// `encodeURIComponent` (headers are ASCII only).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(b) = u8::from_str_radix(hex, 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Stages a file from disk — see `stage_path`.
#[tauri::command]
pub async fn stage_attachment_path(path: String) -> Result<Attachment, String> {
    tauri::async_runtime::spawn_blocking(move || stage_path(&root(), Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

/// Stages pasted bytes — the request body is the raw file, its name in the
/// `x-attachment-name` header (URI-encoded). See `stage_bytes`.
#[tauri::command]
pub async fn stage_attachment_bytes(request: Request<'_>) -> Result<Attachment, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file's bytes as the request body.".into());
    };
    let bytes = bytes.clone();
    let name = request
        .headers()
        .get("x-attachment-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_else(|| "attachment".into());
    tauri::async_runtime::spawn_blocking(move || stage_bytes(&root(), &name, bytes))
        .await
        .map_err(|e| e.to_string())?
}

/// Removes a staged attachment that was never sent.
#[tauri::command]
pub fn discard_attachment(id: String) {
    discard(&root(), &id);
}

/// Opens an attachment with the OS's default app, or (`reveal`) shows it in
/// the file manager — the original file if it's still there when revealing
/// (that's the one the user knows), the stored copy otherwise.
#[tauri::command]
pub fn open_attachment(app: AppHandle, id: String, reveal: bool) -> Result<(), String> {
    let attachment = load(&root(), &id).ok_or("No such attachment.")?;
    let original = attachment
        .original_path
        .as_ref()
        .map(PathBuf::from)
        .filter(|p| p.exists());
    let path = if reveal {
        original.or_else(|| attachment.best_path())
    } else {
        attachment.best_path()
    }
    .ok_or("The file is no longer on disk.")?;
    if reveal {
        app.opener()
            .reveal_item_in_dir(&path)
            .map_err(|e| e.to_string())
    } else {
        app.opener()
            .open_path(path.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("al-attach-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn png(width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbImage::from_fn(width, height, |x, y| {
            image::Rgb([(x % 256) as u8, (y % 256) as u8, ((x * y) % 256) as u8])
        });
        let mut out = Cursor::new(Vec::new());
        img.write_to(&mut out, image::ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn a_small_image_is_kept_as_is() {
        let root = temp_root();
        let bytes = png(10, 20);
        let a = stage_bytes(&root, "shot.png", bytes.clone()).unwrap();
        assert_eq!(a.kind, AttachmentKind::Image);
        assert_eq!(a.mime, "image/png");
        assert_eq!((a.width, a.height), (Some(10), Some(20)));
        assert!(!a.downscaled);
        assert_eq!(
            std::fs::read(a.stored_path.as_ref().unwrap()).unwrap(),
            bytes
        );
        assert_eq!(load(&root, &a.id), Some(a));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_large_image_is_downscaled() {
        let root = temp_root();
        let a = stage_bytes(&root, "big.png", png(3000, 1500)).unwrap();
        assert!(a.downscaled);
        assert_eq!(a.width, Some(IMAGE_MAX_EDGE));
        assert_eq!(a.height, Some(IMAGE_MAX_EDGE / 2));
        assert!(a.stored_size as usize <= IMAGE_CAP);
        assert_eq!(a.name, "big.png");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn text_is_capped_and_binary_is_a_reference() {
        let root = temp_root();
        let file = root.join("log.txt");
        let mut text = "é".repeat(TEXT_CAP / 2);
        text.push_str("tail");
        std::fs::write(&file, &text).unwrap();
        let a = stage_path(&root, &file).unwrap();
        assert_eq!(a.kind, AttachmentKind::Text);
        assert!(a.truncated);
        assert_eq!(a.original_path.as_deref(), Some(file.to_str().unwrap()));
        let stored = std::fs::read(a.stored_path.unwrap()).unwrap();
        assert!(stored.len() <= TEXT_CAP);
        assert!(std::str::from_utf8(&stored).is_ok());

        let small = stage_bytes(&root, "a.json", b"{\"a\":1}".to_vec()).unwrap();
        assert_eq!(
            (small.kind, small.mime.as_str()),
            (AttachmentKind::Text, "application/json")
        );
        assert!(!small.truncated);

        let bin = stage_bytes(&root, "x.bin", vec![0, 1, 2, 255, 0]).unwrap();
        assert_eq!(bin.kind, AttachmentKind::Binary);
        assert_eq!(bin.mime, "application/octet-stream");
        assert_eq!(bin.size, 5);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn folders_are_refused_and_ids_must_be_uuids() {
        let root = temp_root();
        assert!(stage_path(&root, &root).is_err());
        assert_eq!(load(&root, "../etc"), None);
        assert!(load_all(&root, &["nope".into()]).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn garbage_keeps_referenced_attachments() {
        let root = temp_root();
        let kept = stage_bytes(&root, "a.txt", b"a".to_vec()).unwrap();
        let swept = stage_bytes(&root, "b.txt", b"b".to_vec()).unwrap();
        let referenced = HashSet::from([kept.id.clone()]);
        collect_garbage_older_than(&root, &referenced, Duration::ZERO);
        assert!(load(&root, &kept.id).is_some());
        assert!(load(&root, &swept.id).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn decodes_uri_encoded_names() {
        assert_eq!(percent_decode("my%20file%C3%A9.txt"), "my fileé.txt");
        assert_eq!(percent_decode("100%"), "100%");
    }
}
