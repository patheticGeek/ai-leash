import { useState } from "react";

// Runs one async action at a time and tracks its `pending`/`error` state —
// the "set submitting, clear the old error, try, surface the failure,
// clear submitting" dance every form-in-a-popover repeats. `run` resolves to
// whether the action succeeded, so the caller decides what success does
// (close the popover, reset a field).
export function useAsyncAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<boolean> {
    setPending(true);
    setError(null);
    let ok: boolean;
    try {
      await action();
      ok = true;
    } catch (e) {
      setError(String(e));
      ok = false;
    }
    setPending(false);
    return ok;
  }

  return { pending, error, run, clearError: () => setError(null) };
}
