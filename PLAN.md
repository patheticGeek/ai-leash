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

### Phase 1 — Poll-only data → `useQuery` with `refetchInterval` ✅ done (uncommitted)
- `useActions` (`src/features/actions/useActions.ts`) now backed by
  `useQuery(actionsQueryKey(checkoutPath))` with `refetchInterval: 2000`
  instead of its own `setState`/`setInterval`. Returns `{ actions, refresh,
  checkoutPath }` (see Correction 2 below for why `checkoutPath` and not
  `sessionId`); `TitleBarActions`/`ActionsTab` updated to match.
- `ActionTerminalTab.tsx` no longer runs its own independent
  `setInterval(sync, 2000)` + `listActions` call; it now consumes the same
  `actionsQueryKey(checkoutPath)` query (via `useQuery`, same key as above)
  and re-runs its attach/detach logic in a `useEffect` keyed on the query's
  `data`. Collapses what was 3 independent 2s pollers of `listActions` down
  to 1.
- Ollama models / provider connectivity polls: left as-is for this pass —
  each was already a single shared poll (not duplicated), so there's no bug
  to fix; migrating them to `useQuery` is cosmetic/consistency-only and
  lower priority than the duplication fixes. Deferred, can revisit later.
- **Correction 1**: the query was initially keyed on `sessionId`. User
  caught that this doesn't match the backend's actual granularity —
  confirmed via investigation that `actions.rs`'s `run_key` (and everything
  derived from it: `action_runs`, running ptys) is keyed by the *resolved
  checkout path*, not session id, and a session id maps to a checkout path
  many-to-one (every new conversation defaults to the primary root;
  worktrees can be shared too). Keying the frontend cache on `sessionId`
  would have kept two conversations sharing a checkout on two separate
  cache entries/polls for what the backend treats as identical state.
  Fixed: added `conversationCheckoutPath()` (`src/store/
  conversationSlice.ts`) and `useActiveCheckoutPath()` (`src/lib/
  useActiveCheckoutPath.ts`), query key switched to the resolved checkout
  path.
- **Correction 2**: after correction 1, the query *key* was the checkout
  path but the `queryFn` still called `api.listActions(sessionId)` — key
  and fetcher params had drifted apart (an anti-pattern: the queryFn's
  actual inputs should always be exactly what the key is, so they can't
  silently diverge). Traced why: the Tauri commands themselves
  (`list_actions`, `create_action`, `update_action`, `delete_action`,
  `run_action_cmd`, `stop_action_cmd`, `action_backlog` — `src-tauri/src/
  actions.rs`) took `session_id: String` and resolved it to `root: &Path`
  server-side via `get_session_root`, purely so the frontend didn't have to
  pass a path. But the frontend already has the path (that's the query
  key), and the agent-tool-facing side of these same functions
  (`action_tools.rs`) already calls the inner `root`-based functions
  directly, bypassing session id entirely — so the session-id parameter on
  these 7 commands was serving no one. Changed all 7 to take
  `checkout_path: String` directly (dropped the now-unused `state`
  param from the 4 commands where it had no other use); updated
  `tauriApi.ts`'s 7 wrappers and all call sites (`useActions.ts`,
  `ActionTerminalTab.tsx`, `ActionsTab.tsx`, `TitleBarActions.tsx`) to pass
  `checkoutPath` throughout. `useActions()` now returns `checkoutPath`
  instead of `sessionId`.
- typecheck + lint + `cargo clippy` + `cargo fmt --check` + `cargo test`
  (actions module) all clean.
- **Status: implemented, awaiting user verification + commit.**

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
