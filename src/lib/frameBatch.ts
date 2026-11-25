// Collects items pushed between frames and hands them to `flush` together,
// once per animation frame — a streamed reply arrives as many small Tauri
// events per frame, and applying each one as its own state update would
// re-render the transcript for every chunk rather than for every frame.
//
// A timeout backs the frame up: a hidden or minimised window stops running
// `requestAnimationFrame` callbacks, and the queue shouldn't grow unflushed
// until it's shown again.
const FALLBACK_MS = 100;

export interface FrameBatcher<T> {
  push: (item: T) => void;
  /** Applies whatever is queued right now (e.g. before an update that must come after it). */
  flush: () => void;
  /** Drops the queue without applying it, filtered by `keep` when given. */
  discard: (keep?: (item: T) => boolean) => void;
}

export function createFrameBatcher<T>(
  flush: (items: T[]) => void,
): FrameBatcher<T> {
  let queue: T[] = [];
  let frame: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (frame !== null) cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    frame = null;
    timer = null;
  }

  function run() {
    cancel();
    if (queue.length === 0) return;
    const items = queue;
    queue = [];
    flush(items);
  }

  return {
    push(item) {
      queue.push(item);
      if (frame !== null || timer !== null) return;
      frame = requestAnimationFrame(run);
      timer = setTimeout(run, FALLBACK_MS);
    },
    flush: run,
    discard(keep) {
      queue = keep ? queue.filter(keep) : [];
      if (queue.length === 0) cancel();
    },
  };
}
