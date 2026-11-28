// `try { return await body(); } finally { cleanup(); }` as a plain function.
// The React Compiler can't compile a `try` with a `finally` (or without a
// `catch`), and skips the whole component or hook that holds one, so code
// inside components calls this instead.
export async function withCleanup<T>(
  body: () => Promise<T>,
  cleanup: () => void,
): Promise<T> {
  try {
    return await body();
  } finally {
    cleanup();
  }
}
