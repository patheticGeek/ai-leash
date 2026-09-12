// Shared try/catch JSON.parse/stringify wrapper for localStorage-backed
// store state — every slice that persists to localStorage used to
// hand-roll this same read/write pair with its own try/catch.
export const localStorageJson = {
  read<T>(key: string, fallback: T): T {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  write(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  },
};
