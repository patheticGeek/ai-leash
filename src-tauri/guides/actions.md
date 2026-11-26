# Actions

Actions are named background commands, such as `dev` → `npm run dev`, defined per project and shown in the user's Actions tab, where they can start, stop and watch them.

- Before starting anything long-running or repeated — a dev server, a watcher, a `--watch` build — call `list_actions`. If one matches, `run_action` it rather than running the same command yourself.
- If none matches, define one with `create_action` (a short name and the command). The user approves the command once; after that `run_action` needs no prompt. Don't leave an untracked background process instead.
- `run_action` is a no-op if the Action is already running; `stop_action` it first to restart it.
- After starting one, check it with `read_action`: its status (running, stopped, or exited with a code) and its captured output, such as compile errors. Pass `since` from a previous read's header to get only the newer output. Check it again whenever it might have failed, rather than assuming it works.
