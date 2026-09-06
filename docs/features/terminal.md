# Terminal

`TerminalPanel.tsx` + `pty.rs` implement a real, interactive terminal —
not a sandboxed "shell tool" output box (that's a separate thing, see
[tools.md](./tools.md)).

## Backend (`pty.rs`)

- `pty_spawn(cwd, cols, rows)` opens a PTY via `portable-pty`
  (`native_pty_system().openpty(...)`), spawns `$SHELL` (falling back to
  `/bin/bash`) inside it with `TERM=xterm-256color` set explicitly
  (`portable-pty`'s base environment doesn't set `TERM` itself, which
  otherwise makes shell prompt themes like starship/powerlevel10k warn
  about it being unset), and `cwd` set to the given directory if
  provided.
- A dedicated OS thread (`std::thread::spawn`, not a tokio task, since
  the PTY reader is blocking I/O) reads raw bytes from the PTY master
  and emits them as base64-encoded strings on a per-terminal event,
  `pty://{id}/data`. Base64 is used (rather than raw UTF-8) so
  multi-byte characters split across read boundaries can't corrupt the
  stream — xterm.js decodes the raw bytes itself once reassembled.
- `pty_write(id, data)` writes keystrokes back into the PTY.
- `pty_resize(id, cols, rows)` resizes the PTY when the panel resizes.
- `pty_kill(id)` kills the child process and drops the handle.
- Live PTYs are tracked in `AppState.ptys: Mutex<HashMap<String, PtyHandle>>`.

## Frontend (`TerminalPanel.tsx`)

Uses `@xterm/xterm` + `@xterm/addon-fit`. On mount it spawns a PTY
rooted at the current `projectRoot` (or the shell's default directory if
no project is open), wires `term.onData` → `pty_write` and the
`pty://{id}/data` event → `term.write(bytes)`, and uses a
`ResizeObserver` to call `fit()` and `pty_resize` on layout changes.

The effect's dependency array is `[projectRoot]`, so opening a different
folder tears down the old PTY (killing the process) and spawns a fresh
one in the new directory — this is deliberate, not an accident of
re-render timing.
