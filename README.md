# AI Leash

A desktop agentic harness — the editor, file tree, and terminal exist to
support agent work, not the other way around. No telemetry: run an agent,
inspect its work, and keep it under your control. Tool calls, permission
prompts before destructive operations, and sub-agents make the process
visible, whether you use the built-in runtime or connect an external ACP
agent.

Built on Tauri, so the app itself is a small native binary with a Rust
backend, not a bundled Chromium.

**[Download the latest release →](https://github.com/patheticGeek/ai-leash/releases/latest)**

## Table of contents

- [Features](#features)
- [Install](#install)
  - [Linux](#linux)
  - [macOS](#macos)
- [Building from source](#building-from-source)
- [Project layout](#project-layout)
- [Status](#status)

## Features

- **Bring any agent** — the built-in runtime works with multiple model
  providers, and the [Agent Client Protocol](https://agentclientprotocol.com)
  backend drives external agents such as Claude Code and GitHub Copilot CLI.
  Each conversation keeps its own provider, model, and agent controls.
- **You stay in control** — tool calls show inline, and destructive ones
  (`shell`, file edits) ask before running. All file access is checked
  against the project root.
- **Sub-agents** — delegate independent chunks of work to isolated,
  concurrent agents, shown as nested threads or their own tabs.
- **`AGENTS.md`, memory & skills** — project and global instructions, notes,
  and on-demand skills, picked up mid-session without a restart.
- **Actions** — named project commands (`.ai-leash/actions.json`) that run in
  persistent terminals, visible to you, the built-in agent, and ACP agents.
- **Real workspace** — CodeMirror editor, lazy file tree with a filesystem
  watcher, and interactive PTY terminals beside the chat.
- **Persistent conversations** — history, tool activity, and timing are saved
  locally, per project, with worktree/branch switching and mark-as-done.
- **Inspectable** — a debug-mode ACP events panel and a local crash log; no
  telemetry.
- **Small and native** — Tauri with a Rust backend, not a bundled Chromium.

See [docs/features](./docs/features) for guides to using each feature.

## Install

Every push to `master` builds and publishes fresh packages via
[GitHub Actions](./.github/workflows/build.yml) — grab the latest one
from the [Releases page](https://github.com/patheticGeek/ai-leash/releases/latest).

### Linux

#### Debian/Ubuntu

Download the `.deb` package from the
[Releases page](https://github.com/patheticGeek/ai-leash/releases/latest)
and install it:

```bash
sudo apt install ./ai-leash_*.deb
```

#### Arch

Grab the `.tar.gz` archive from the [Releases page](https://github.com/patheticGeek/ai-leash/releases/latest) and install it:

```bash
tar xf ai-leash_*.tar.gz
cd ai-leash-bin
makepkg -si
```

#### Fedora?

### macOS

Download the `.dmg` from the [Releases page](https://github.com/patheticGeek/ai-leash/releases/latest) page, open it, and drag `AI Leash` into `Applications`.

It's not notarized, so the first launch needs a right-click → Open (or
`xattr -d com.apple.quarantine /Applications/AI\ Leash.app` if Gatekeeper
still blocks it) instead of a normal double-click.

## Building from source

You'll need [Rust](https://rustup.rs) and Node 20+.

```bash
git clone https://github.com/patheticGeek/ai-leash.git
cd ai-leash
npm install

# dev, with hot reload
npm run tauri dev

# a real installer/bundle for your current platform
npm run tauri build
```

To build the Debian package explicitly:

```bash
npx tauri build --bundles deb
```

On Linux you'll also need the system packages Tauri itself needs —
`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`,
`libxdo-dev`, plus the usual build toolchain. See the
[build workflow](./.github/workflows/build.yml) for the exact `apt`
line used in CI.

## Project layout

```
src-tauri/src/    Rust backend — agent loop, tools + permission gating,
                  PTYs, actions, SQLite history
src/              React frontend — app shell, chat, editor, terminal,
                  file tree, settings, and Zustand store slices
docs/features/    Per-feature reference docs, kept current with the code
```

## Status

Under active development, breaking changes land on `master` regularly.
Not published to any package registry — build it yourself or grab a CI
build from Releases.
