# Live data refactor

Goal: unify the app's real-time/live data (git branch, models, actions,
generating status, fs tree, etc.) behind React Query instead of the three
ad-hoc patterns currently in use (per-component `useState` + `listen()`,
a hand-rolled module-level `Map` in `generatingListener.ts`, and Zustand
slices), and fix the concrete duplicate-listener/poller bugs found along
the way.

Workflow: one phase at a time. Implement → user verifies in the running
app → commit → next phase. This file is updated after every phase. Each
phase (or small group of phases) becomes its own PR, stacked on the
previous one rather than all landing on one branch:

- `live-data-react-query` (→ `master`): Phase 0 + Phase 1, committed.
- `live-data-react-query-phase2` (→ `live-data-react-query`): Phase 2+,
  current branch.

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

### Phase 2 — Push-driven data → `useQuery` + event-fed cache ✅ done (uncommitted)
- Git branch (`src/lib/useCurrentGitBranch.ts`): same exported signature
  (`useCurrentGitBranch(path): string | null`), now backed by
  `useQuery(["git-branch", path], () => api.getCurrentGitBranch(path))`. The
  `git://branch_changed` event payload is just the changed path (not a
  branch name — confirmed via `git.rs`'s `watch_git_branch`), so the
  `useTauriEvent` handler filters on path and calls `invalidateQueries`
  rather than `setQueryData` directly; a refetch still happens, but now once
  per distinct path instead of once per mounted `LeftBar` row / `CheckoutBar`
  (they all share the same query key so React Query dedupes the fetch too).
  `api.watchGitBranch(path)` (idempotent server-side) still fires per
  mounted path via a small `useEffect`, unchanged in spirit from before.
- Filesystem tree (`src/features/sidebar/tabs/FileTree.tsx` +
  new `useFsDir.ts`): query key `["fs-dir", checkoutPath, path ?? checkoutPath]`
  — checkout-path-keyed like Actions (Phase 1), not session-id-keyed, since
  `list_dir` is checkout-scoped too. The root listing's path slot is
  `checkoutPath` itself rather than a `null` sentinel, on purpose (see next
  point).
- Updated `useTauriEvent.ts`'s doc comment, which had described this fix in
  past tense before either consumer actually existed.
- **Correction 3** (both caught by user on first read): the initial cut of
  this had two problems.
  1. The shared `fs://changed` listener lived inside `FileTree`, which only
     exists while its sidebar tab is mounted — changes made while the tab is
     closed would go un-invalidated, leaving stale cached listings for up to
     `staleTime` once reopened. Moved to a dedicated `useFsChangeInvalidator()`
     (`useFsDir.ts`), called once from `App.tsx` (always mounted) instead —
     `useTauriEvent` already dedupes to one real `listen()` regardless of how
     many places call it, so this costs nothing extra over the old approach.
  2. The event was payload-less, so any change invalidated *every* open
     `fs-dir` query across every project, not just the changed one. Fixed on
     the backend: `start_fs_watcher` (`commands.rs`) now collects each
     `notify::Event`'s paths during the debounce window, maps each to its
     parent directory (a listing changes when something under it does, not
     at its own path), dedupes, and emits that `Vec<String>` of absolute
     changed directories as the event payload instead of `()`. The frontend
     invalidator matches those directly against each cached query's path
     slot via `invalidateQueries({ predicate: ... })` — which is also why the
     root listing keys on `checkoutPath` rather than `null`: every key's path
     slot needs to be a real absolute path to compare against the payload.
     This also meant `list_dir` (`commands.rs`) needed the same
     `session_id` → `checkout_path` signature change as Phase 1's Actions
     commands, for the same reason (key/queryFn param match, and file-tree
     state being checkout- not session-scoped) — `tauriApi.ts`'s `listDir`
     and `FileTree.tsx` updated to match, now resolving via
     `useActiveCheckoutPath()` instead of `activeSessionId`.
- cargo check/clippy/fmt + typecheck + lint all clean.
- **Status: implemented, awaiting user verification + commit.**

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
