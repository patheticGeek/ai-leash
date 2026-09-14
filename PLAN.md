# Live data refactor

Branch: `live-data-react-query`

Goal: unify the app's real-time/live data (git branch, models, actions,
generating status, fs tree, etc.) behind React Query instead of the three
ad-hoc patterns currently in use (per-component `useState` + `listen()`,
a hand-rolled module-level `Map` in `generatingListener.ts`, and Zustand
slices), and fix the concrete duplicate-listener/poller bugs found along
the way.

Workflow: one phase at a time. Implement → user verifies in the running
app → commit → next phase. This file is updated after every phase.

## Inventory (source of truth for what's live today)

| Data | Mechanism today | Problem |
|---|---|---|
| Current git branch | Backend `notify` watcher → `git://branch_changed` event | Duplicated: `LeftBar` row and `CheckoutBar` each run their own `listen()` + refetch for the same path |
| Ollama model list | `setInterval` 5s in `useChatSession` → `providerSlice` | Fine, single poll |
| Provider connectivity | `setInterval` 5s in `App.tsx` → `providerSlice` | Fine, single shared poll |
| Chat stream (tokens/thinking/tools) | Push events, one `useEffect` in `useChatStream` | Fine, append-only, not query-shaped — leave on Zustand |
| "Generating" status | Push event routed through a hand-rolled module-level `Map` (`generatingListener.ts`) | Third distinct shared-state pattern, separate from Zustand and from per-component listeners |
| Permission requests | Push event, single listener in `LeftBar`, store-backed | Fine |
| Filesystem tree | Backend emits one global payload-less `fs://changed`; every expanded folder node registers its own listener | N+1 duplicate listeners, full refetch on every FS change anywhere |
| PTY output | Push per-pty event | Fine |
| PTY exit | `pty://{id}/exit` emitted by backend | **Dead event** — never listened to anywhere, terminal goes silent when process dies |
| Actions run status | `setInterval` 2s | Three independent polls of the same `listActions` call (`TitleBarActions`, `ActionsTab`, `ActionTerminalTab`) |
| Sub-agent tasks | Push events + one-time DB backfill on conversation switch | Fine, single store |

## Phases

### Phase 0 — Foundation ✅ done (uncommitted)
- Added `@tanstack/react-query`, wrapped app root in `QueryClientProvider`
  (`src/main.tsx`), `refetchOnWindowFocus: false` since pushed data updates
  the cache directly rather than via refetch.
- Added `src/lib/useTauriEvent.ts`: reference-counted `listen()` wrapper —
  N components subscribing to the same event name share one real Tauri
  listener instead of each registering their own.
- Nothing consumes these yet; inert change, typecheck + lint clean.
- **Status: implemented, awaiting user verification + commit.**

### Phase 1 — Poll-only data → `useQuery` with `refetchInterval`
- Actions (`useActions`): one `useQuery(["actions", sessionId])`, consumed
  by `TitleBarActions`, `ActionsTab`, `ActionTerminalTab` — collapses 3
  independent 2s pollers into 1.
- Ollama models, provider connectivity: same treatment for consistency.
- **Status: not started.**

### Phase 2 — Push-driven data → `useQuery` + event-fed cache
- Git branch: `useQuery(["git-branch", path])`, fetched once, kept fresh by
  one shared `useTauriEvent("git://branch_changed", ...)` that calls
  `setQueryData`. `LeftBar` and `CheckoutBar` share cache + one listener.
- Filesystem tree: query key per directory path; the single shared
  `fs://changed` listener invalidates the relevant path(s) instead of every
  node refetching itself.
- **Status: not started.**

### Phase 3 — Replace `generatingListener.ts`
- Fold "generating" state into `useQuery(["generating", sessionId])`,
  written by the centralized backend listener via `setQueryData`. Removes
  the third parallel shared-state pattern.
- **Status: not started.**

### Phase 4 — Fix the dead `pty://{id}/exit` event
- Wire it into pty query state (`["pty-alive", id]`) so terminal tabs can
  show "process exited" instead of going silently stale.
- **Status: not started.**

### Phase 5 — Leave as-is (already correct)
- Chat stream transcript, permission requests, sub-agent task list: push-driven,
  already funnel through one listener into one Zustand slice consumed by
  multiple components. Not migrating — React Query isn't a good fit for
  append/reducer-shaped data like the chat transcript.

## Open questions
- `staleTime`/`gcTime` tuning so branch/model data for a background
  conversation isn't evicted while its sidebar row still shows it.
