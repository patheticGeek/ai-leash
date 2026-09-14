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
  - [Agent chat](#agent-chat)
  - [Sub-agents](#sub-agents)
  - [AGENTS.md, memory & skills](#agentsmd-memory--skills)
  - [Conversation history](#conversation-history)
  - [Editor & file tree](#editor--file-tree)
  - [Terminal](#terminal)
  - [Actions](#actions)
  - [Crash log](#crash-log)
  - [Everything else](#everything-else)
- [Install](#install)
  - [Linux](#linux)
  - [macOS](#macos)
- [Building from source](#building-from-source)
- [Project layout](#project-layout)
- [Status](#status)

## Features

### Agent chat

The center pane is a chat with a real agent loop behind it: tool calls,
streaming responses, retry/regenerate, and per-turn token usage against
the model's context window. Queue a follow-up while the agent works, stop a
turn that is no longer useful, or use slash commands for common tasks such as
clearing or compacting a conversation.

Tool calls (file reads/edits, shell commands) show up inline, collapsed
by default with the raw args one click away, and destructive ones
(`shell`, file edits) stop and ask before doing anything.

The built-in runtime supports multiple model providers, and the
[Agent Client Protocol](https://agentclientprotocol.com) backend can
drive external agents such as Claude Code and GitHub Copilot CLI. Each
conversation retains its own provider, model, and compatible agent controls.

### Sub-agents

The agent can delegate independent chunks of a task to isolated
sub-agents — each gets a clean context and its own tool loop, and
several can run at once when the work actually splits that way. They
show up as nested threads under the tool call that spawned them, or as
their own tab if you want to watch one directly.

### AGENTS.md, memory & skills

Drop an `AGENTS.md` in your project root and it's folded into the
system prompt on every turn — edit it mid-session and the next message
picks up the change, no restart. Same for a global one that applies
across every project. Subdirectory-scoped `AGENTS.md` files kick in
automatically once the agent actually touches something in that folder.

Skills are single markdown files the model can load on demand by name
(only offered as a tool at all if the project actually has any), and a
plain-text memory file gives the agent durable notes across sessions —
both scoped the same way, project and global.

### Conversation history

Conversations, tool activity, and completed-turn timing are saved locally as
you work, then restored when you reopen the app. Keep separate threads for
different tasks or projects, mark finished work as done to tuck it away, and
delete a thread when you no longer need its transcript. Sub-agent work stays
with the conversation that created it, so you can review it later.

### Editor & file tree

CodeMirror 6 with syntax highlighting for the common languages, a lazy
file tree that only fetches a directory's contents when you expand it,
and every filesystem operation — editor and agent tools alike — checked
against the project root so nothing can read or write outside it.

Open several files alongside the chat, edit them directly, and save with
`Ctrl+S` or `Command+S`. The tree refreshes after changes made by the agent,
your terminal, or another program.

### Terminal

A real interactive terminal (xterm.js + a PTY on the backend), not a
sandboxed command box. Open more than one, they persist in the
background when you switch tabs, and use them for commands you want to run
yourself. This is separate from the agent's own `shell` tool, which returns
a one-shot command result in the conversation.

### Actions

Define named project commands such as `dev → npm run dev` in the
project's `.ai-leash/actions.json`. Actions run in their own persistent
terminal, can be started or stopped from the Actions panel, and expose their
live output to you and the built-in agent. Once you approve an Action's saved
command, the agent can reuse it without asking you to approve that same
predefined command every time. The same action interface is available to ACP
agents through the local MCP bridge.

### Crash log

When the app encounters an error, it records the details locally—even when
the window stays open. Open **Settings → Crash log** to review, copy, refresh,
or clear those entries before reporting a problem.

### Everything else

- A left-sidebar project switcher — recent projects sorted by last
  activity, with live indicators when a conversation is generating in the
  background or waiting for an approval.
- Resizable panels throughout, markdown rendering for assistant
  messages, and a debounced filesystem watcher that keeps the file tree
  in sync with edits made by the agent, terminal commands, builds, or
  changes made outside the app.

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
