//! Run registry: one record per Action run, kept after the process ends so
//! its output and outcome stay readable (`read_action` after a stop or a
//! crash). Replaces the old `AppState.action_runs`, which only held a pty id
//! and an output buffer and dropped the entry on stop.
//!
//! A run is keyed like the old map — (checkout path, action id), see
//! `actions.rs`'s `run_key` for why the checkout is part of it — and holds
//! at most the latest run per key: starting an action again replaces the
//! previous, finished record.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Output kept per run. Raw bytes, trimmed from the front once over the cap,
/// with the number of trimmed bytes remembered so offsets stay stable (see
/// `RunOutput`).
pub const MAX_OUTPUT_BYTES: usize = 256 * 1024;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Running,
    /// The process ended on its own; `exit_code` says how.
    Exited,
    /// Killed by `stop_action` (or the app exiting).
    Stopped,
}

impl RunStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            RunStatus::Running => "running",
            RunStatus::Exited => "exited",
            RunStatus::Stopped => "stopped",
        }
    }
}

/// A run's captured output, addressed by cumulative byte offset from the
/// start of the run. Offsets never shift when the front is trimmed, so a
/// reader can ask for "everything after offset N" across reads.
#[derive(Default)]
pub struct RunOutput {
    bytes: Vec<u8>,
    /// Bytes trimmed from the front so far — the offset of `bytes[0]`.
    dropped: u64,
}

impl RunOutput {
    pub fn append(&mut self, chunk: &[u8]) {
        self.bytes.extend_from_slice(chunk);
        if self.bytes.len() > MAX_OUTPUT_BYTES {
            let excess = self.bytes.len() - MAX_OUTPUT_BYTES;
            self.bytes.drain(0..excess);
            self.dropped += excess as u64;
        }
    }

    /// Offset just past the last byte captured so far.
    pub fn end(&self) -> u64 {
        self.dropped + self.bytes.len() as u64
    }

    /// Everything from `offset` on, plus the offset it actually starts at —
    /// later than asked if that part was already trimmed. `None` means from
    /// the oldest byte held.
    pub fn since(&self, offset: Option<u64>) -> (u64, &[u8]) {
        let from = offset
            .unwrap_or(self.dropped)
            .clamp(self.dropped, self.end());
        (from, &self.bytes[(from - self.dropped) as usize..])
    }
}

pub struct Run {
    pub id: String,
    /// Indexes `AppState.ptys` for the process/IO. Empty until the pty has
    /// been spawned (the run is created first so the output callback has
    /// somewhere to write).
    pub pty_id: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub exit_code: Option<u32>,
    pub status: RunStatus,
    pub output: RunOutput,
}

pub type RunHandle = Arc<Mutex<Run>>;

impl Run {
    pub fn new(id: String, started_at: i64) -> Self {
        Self {
            id,
            pty_id: String::new(),
            started_at,
            ended_at: None,
            exit_code: None,
            status: RunStatus::Running,
            output: RunOutput::default(),
        }
    }

    pub fn is_running(&self) -> bool {
        self.status == RunStatus::Running
    }

    /// The process ended. Leaves a run already marked stopped alone: a
    /// killed process also ends, but "stopped" is the more useful outcome.
    /// Returns whether it changed anything (false if it was already stopped).
    pub fn finish(&mut self, exit_code: Option<u32>, at: i64) -> bool {
        if self.status != RunStatus::Running {
            return false;
        }
        self.status = RunStatus::Exited;
        self.exit_code = exit_code;
        self.ended_at = Some(at);
        true
    }

    pub fn mark_stopped(&mut self, at: i64) {
        if self.status == RunStatus::Running {
            self.status = RunStatus::Stopped;
            self.ended_at = Some(at);
        }
    }

    /// One-line outcome for tool output, e.g. `exited with code 1`.
    pub fn describe_status(&self) -> String {
        match (self.status, self.exit_code) {
            (RunStatus::Running, _) => "running".to_string(),
            (RunStatus::Stopped, _) => "stopped".to_string(),
            (RunStatus::Exited, Some(code)) => format!("exited with code {code}"),
            (RunStatus::Exited, None) => "exited".to_string(),
        }
    }
}

/// Payload of `run://output`: `data` (base64) is the run's output starting
/// at byte `offset`. Also the shape `actions::run_snapshot` returns, so a
/// terminal can treat a snapshot and a live chunk the same way — write
/// whatever part of it lies past what it has already written.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunOutputChunk {
    pub run_id: String,
    pub offset: u64,
    pub data: String,
}

impl Run {
    /// Output from `offset` on (clamped to what's held), as a chunk.
    pub fn chunk_since(&self, offset: Option<u64>) -> RunOutputChunk {
        use base64::{engine::general_purpose, Engine as _};
        let (from, bytes) = self.output.since(offset);
        RunOutputChunk {
            run_id: self.id.clone(),
            offset: from,
            data: general_purpose::STANDARD.encode(bytes),
        }
    }
}

/// How often a running Action's new output is emitted — coalesces the pty's
/// many small reads (a dev server's per-line writes) into a few events per
/// frame instead of one per read.
const FLUSH_INTERVAL: std::time::Duration = std::time::Duration::from_millis(30);

/// Streams a run's output as `run://output` until the run has ended and
/// everything it wrote has gone out. Reads from the run's own buffer rather
/// than being handed chunks, so batching never loses bytes; if the buffer
/// trimmed past what was last sent (the webview fell far behind), the next
/// chunk simply starts later and the listener sees the gap in `offset`.
pub fn spawn_output_flusher(app: tauri::AppHandle, run: RunHandle) {
    use tauri::Emitter;
    std::thread::spawn(move || {
        let mut sent = 0u64;
        loop {
            std::thread::sleep(FLUSH_INTERVAL);
            let (chunk, done) = {
                let run = run.lock().unwrap();
                let end = run.output.end();
                let chunk = (end > sent).then(|| run.chunk_since(Some(sent)));
                sent = end;
                // A stopped run is marked before its pty is killed, so its
                // last few bytes can land after — only finish on a quiet
                // tick once the run has ended.
                let done = chunk.is_none() && !run.is_running();
                (chunk, done)
            };
            if let Some(chunk) = chunk {
                let _ = app.emit("run://output", chunk);
            }
            if done {
                break;
            }
        }
    });
}

#[derive(Default)]
pub struct RunRegistry {
    by_key: Mutex<HashMap<(String, String), RunHandle>>,
}

impl RunRegistry {
    pub fn get(&self, key: &(String, String)) -> Option<RunHandle> {
        self.by_key.lock().unwrap().get(key).cloned()
    }

    pub fn insert(&self, key: (String, String), run: RunHandle) {
        self.by_key.lock().unwrap().insert(key, run);
    }

    pub fn remove(&self, key: &(String, String)) {
        self.by_key.lock().unwrap().remove(key);
    }

    pub fn by_id(&self, run_id: &str) -> Option<RunHandle> {
        self.by_key
            .lock()
            .unwrap()
            .values()
            .find(|r| r.lock().unwrap().id == run_id)
            .cloned()
    }

    pub fn all(&self) -> Vec<RunHandle> {
        self.by_key.lock().unwrap().values().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offsets_survive_trimming_the_front() {
        let mut out = RunOutput::default();
        out.append(&vec![b'a'; MAX_OUTPUT_BYTES]);
        out.append(b"tail");
        assert_eq!(out.end(), MAX_OUTPUT_BYTES as u64 + 4);
        assert_eq!(out.since(None).0, 4, "oldest held byte");
        let (from, bytes) = out.since(Some(MAX_OUTPUT_BYTES as u64));
        assert_eq!(from, MAX_OUTPUT_BYTES as u64);
        assert_eq!(bytes, b"tail");
    }

    #[test]
    fn since_clamps_to_what_is_still_held() {
        let mut out = RunOutput::default();
        out.append(&vec![b'a'; MAX_OUTPUT_BYTES + 10]);
        let (from, bytes) = out.since(Some(0));
        assert_eq!(from, 10, "trimmed bytes are skipped, not an error");
        assert_eq!(bytes.len(), MAX_OUTPUT_BYTES);
        let (from, bytes) = out.since(Some(u64::MAX));
        assert_eq!(from, out.end());
        assert!(bytes.is_empty());
    }

    #[test]
    fn a_stopped_run_stays_stopped_when_its_process_then_ends() {
        let mut run = Run::new("r".into(), 1);
        run.mark_stopped(2);
        run.finish(Some(137), 3);
        assert_eq!(run.status, RunStatus::Stopped);
        assert_eq!(run.exit_code, None);
        assert_eq!(run.ended_at, Some(2));
    }

    #[test]
    fn a_chunk_starts_where_it_was_asked_to() {
        use base64::{engine::general_purpose, Engine as _};
        let mut run = Run::new("r".into(), 1);
        run.output.append(b"hello world");
        let chunk = run.chunk_since(Some(6));
        assert_eq!(chunk.offset, 6);
        assert_eq!(
            general_purpose::STANDARD.decode(chunk.data).unwrap(),
            b"world"
        );
    }

    #[test]
    fn a_run_that_exits_records_its_code() {
        let mut run = Run::new("r".into(), 1);
        run.finish(Some(1), 5);
        assert_eq!(run.status, RunStatus::Exited);
        assert_eq!(run.describe_status(), "exited with code 1");
        assert_eq!(run.ended_at, Some(5));
    }
}
