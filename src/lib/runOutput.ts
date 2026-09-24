import { api, type RunOutputChunk } from "./tauriApi";
import { subscribeTauriEvent } from "./useTauriEvent";

function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Feeds one Action run's output to `write`, exactly once and in order,
// whether the run is live or already finished. Every chunk (snapshot or
// `run://output`) says which byte offset it starts at, so this keeps a
// cursor — the offset just past what it has written — and only writes the
// part of a chunk that lies past it:
//
// 1. subscribe to `run://output` first, buffering chunks;
// 2. fetch a snapshot of everything the run still holds and write it;
// 3. replay the buffered chunks, then keep writing live ones.
//
// So nothing is lost between the snapshot and the subscription, and nothing
// is written twice. A chunk that starts past the cursor means output was
// missed (the backend trimmed it before it was sent), so it re-snapshots.
// Returns a detach function.
export function attachRunOutput(
  runId: string,
  write: (bytes: Uint8Array) => void,
): () => void {
  let cursor: number | null = null;
  let buffered: RunOutputChunk[] = [];
  let detached = false;
  let resnapshotting = false;

  function apply(chunk: RunOutputChunk) {
    if (cursor === null) return;
    const bytes = base64ToBytes(chunk.data);
    const end = chunk.offset + bytes.length;
    if (end <= cursor) return;
    if (chunk.offset > cursor) {
      void snapshot();
      return;
    }
    write(bytes.subarray(cursor - chunk.offset));
    cursor = end;
  }

  async function snapshot() {
    if (resnapshotting) return;
    resnapshotting = true;
    try {
      const snap = await api.runSnapshot(runId);
      if (detached) return;
      // The first snapshot starts the stream; a later one (after a gap)
      // just fills in from wherever the cursor stopped.
      if (cursor === null) {
        cursor = snap.offset;
      } else if (snap.offset > cursor) {
        cursor = snap.offset;
      }
      apply(snap);
      const pending = buffered;
      buffered = [];
      for (const chunk of pending) apply(chunk);
    } catch {
      // The run is gone (re-run or deleted) — whoever owns this tab
      // re-attaches to the new run id.
    } finally {
      resnapshotting = false;
    }
  }

  const unsubscribe = subscribeTauriEvent<RunOutputChunk>(
    "run://output",
    (chunk) => {
      if (chunk.runId !== runId) return;
      if (cursor === null || resnapshotting) buffered.push(chunk);
      else apply(chunk);
    },
  );
  void snapshot();

  return () => {
    detached = true;
    unsubscribe();
  };
}
