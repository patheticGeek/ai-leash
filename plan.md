# Milestone 7, Phase 3 — Claude Code / GitHub Copilot presets, and tool/skill continuity for ACP sessions

Working notes from a design discussion following phase 2 (external ACP
agent backend, shipped in `b336114`). Nothing in this document has been
implemented yet — it's the discussion and the decisions still open,
written down so the next session (or the next person) doesn't have to
re-derive it.

## Where this started

The user asked for one-click support for Claude Code and GitHub Copilot
as agent backends, specifically "spin up cli and use that already authed
from system" — i.e. shell out to the CLIs the user already has installed
and logged in, rather than asking for API keys.

## What's already confirmed (not guessed — verified against real sources)

- **Claude**: the `agent-client-protocol` crate we already depend on ships
  a built-in convenience constructor, `AcpAgent::claude_agent()`, whose
  doc comment says it "just runs `npx -y
  @agentclientprotocol/claude-agent-acp@latest`" (verified in the
  vendored crate source, `acp_agent.rs`). That npm package's own
  description: "Use Claude Agent SDK from any ACP client" — it wraps the
  *official* Claude Agent SDK and exposes it over ACP. Authentication
  reuses an existing `claude` CLI login (your Claude subscription/plan),
  falling back to `ANTHROPIC_API_KEY` only if no CLI login is found, and
  asking before ever embedding a key in plaintext.
- **Copilot**: GitHub Copilot CLI shipped **native** ACP support in
  public preview as of Jan 2026 (github.blog changelog + official docs at
  `docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server`).
  Launch command: `copilot --acp` (stdio is the default mode). Requires
  the `copilot` CLI already installed and either logged in via existing
  GitHub auth, or BYOK env vars. The docs confirm the client must send
  the working directory via `session/new`'s `cwd` param — our existing
  `drive_acp_connection` (`src-tauri/src/acp.rs`) already does this via
  `NewSessionRequest::new(cwd)` built from `commands::get_root_path`, so
  nothing needed there.

Because both are just launch-command strings compatible with the
already-shipped generic ACP backend, **the two presets themselves need no
Rust changes at all** — just two quick-select buttons in
`ProviderSettingsModal.tsx`'s existing "External ACP agent" section that
fill in the known-good command string, on top of the free-text input that
already exists for any other/custom ACP agent. This part of the plan was
fully designed (see git history / prior planning) and is ready to build
whenever — it just hasn't been explicitly greenlit yet because the
conversation branched into the bigger question below before confirming.

## The discussion: what about our own tools/skills/memory in ACP sessions?

The user then asked the harder question: when an external ACP agent
(Claude Code or Copilot) is driving a session instead of our own
`run_agent_loop`, what happens to ai-leash's own custom tools
(`read_file`/`edit_file`/`shell`/`spawn_sub_agent`/`load_skill` in
`tools.rs`) and its own AGENTS.md/memory/skills system
(`context.rs`)?

**Current behavior (already true today, documented in
`docs/features/agent-chat.md`'s "External ACP agent backend" section):**
none of it carries over. `acp.rs` sends only the raw user text as the
prompt — `context::build_system_prompt()` is never called for ACP
sessions. The external agent brings its own tools entirely; our
`tools.rs` never runs for an ACP-backed session.

**"Why not just use the official SDKs directly instead of ACP?"** —
answered and mostly closed:
- For Claude, `claude-agent-acp` already wraps the official Claude Agent
  SDK — using it via ACP already gets the SDK's behavior, just normalized
  to a protocol our Rust backend can drive uniformly, without embedding a
  Node runtime and hand-writing a bespoke SDK-specific Rust client.
- For Copilot, there's no separate SDK to call instead — GitHub added ACP
  natively to the `copilot` CLI itself as its official external- integration
  surface. ACP isn't a fallback here, it's the interface.
- Going the official-SDK route directly (bypassing ACP) would only be
  possible for Claude at all (Copilot has no equivalent embeddable SDK
  path), and would mean maintaining two structurally different backend
  integrations instead of one generic ACP driver.

**"Could we still do our own tool/skill injection if we used the official
SDK?"** — yes for Claude specifically: the Claude Agent SDK supports
in-process custom tool registration (via its MCP-server-in-process
mechanism / `canUseTool` callback) and system-prompt append/override.
But this is Claude-only.

**The middle path (the one that survived scrutiny):** ACP's own
`NewSessionRequest` has an `mcp_servers: Vec<McpServer>` field (confirmed
directly in the vendored `agent-client-protocol-schema` crate source,
`v1/agent.rs` — supports `Http`, `Sse`, `Stdio`, and an unstable `Acp`
transport). This is the protocol's own standardized mechanism for a
client to hand an ACP-compliant agent extra tools via MCP — not
Claude-specific. If we stand up a small local MCP server exposing our
custom tools (at minimum `load_skill`), and pass it into every session's
`NewSessionRequest.mcp_servers`, both Claude Code and Copilot (and any
future ACP agent that supports MCP) get access to it through the one
generic backend we already built — no per-vendor bespoke integration
needed.

## Research: how does `~/Projects/t3code` solve this?

Spawned a research sub-agent against `~/Projects/t3code` (a separate,
mature multi-backend coding-agent product the user has local access to —
supports Claude, Codex, Cursor/ACP, Grok, and OpenCode behind one
provider abstraction) to see how a real, shipped product handles exactly
this problem. Full findings below; this validates the middle path above
almost exactly, with useful refinements.

**One shared MCP server, not SDK-specific tool registration — even for
Claude.** T3 Code uses the real `@anthropic-ai/claude-agent-sdk` directly
for its Claude backend, yet still does *not* use the SDK's in-process
custom-tool API. Instead it runs a single HTTP MCP server
(`apps/server/src/mcp/McpHttpServer.ts`, built on `effect/unstable/ai`'s
`McpServer.layerHttp`) exposing its own toolkit (in their case, browser
automation), and every backend adapter points at the *same* server,
translated into whatever that backend natively expects:
- Claude (`ClaudeAdapter.ts`): SDK's `mcpServers` option, `{type: "http",
  url, headers: {Authorization: ...}}`.
- Cursor/ACP (`CursorAdapter.ts` → `AcpSessionRuntime.ts`): passed as
  `mcpServers: [{type: "http", name, url, headers: [...]}]` straight into
  ACP's `NewSessionRequest`/`LoadSessionRequest` — literally the same
  field we found.
- Codex (`CodexAdapter.ts`): Codex has no JSON `mcpServers` field, so
  they pass CLI config overrides instead (`-c
  mcp_servers.t3-code.url=...`, `-c
  mcp_servers.t3-code.bearer_token_env_var=...`).

**Per-thread session + bearer token.** A small registry
(`McpProviderSession.ts`) maps each active conversation/thread to
`{endpoint, authorizationHeader}`, so the MCP server can scope/authorize
tool calls per session rather than being one shared unauthenticated
endpoint.

**No cross-provider skill/AGENTS.md bridging at all.** Each provider
discovers skills through its own native mechanism only, purely for
read-only display in T3 Code's own UI picker — never injected into the
actual session:
- Claude: `ClaudeSkills.ts` scans the filesystem directly (`.claude/skills`,
  `.agents/skills`, etc.) because — per their own comment — "the Agent SDK
  init handshake surfaces skills only as slash commands without their
  filesystem paths."
- Codex: calls Codex's own native `skills/list` JSON-RPC method.
- Grok/OpenCode: analogous native-source scans.

T3 Code's own summary in `docs/internals/providers.md`: "the orchestration
layer does not know which one is behind a thread" — tool availability is
made uniform by giving every provider the *same* MCP server unconditionally,
not by a per-provider "supports custom tools" capability flag.

## Decisions pending

1. ~~Do the two ACP presets (Claude Code / GitHub Copilot quick-select
   buttons) now, independent of the MCP-bridge question?~~ **Shipped** —
   `ACP_PRESETS` in `SettingsModal.tsx`, see
   [agent-chat.md](./docs/features/agent-chat.md#external-acp-agent-backend).
2. **Build the MCP-server bridge for our custom tools at all, or accept
   the current "ACP sessions get none of our tools/skills" limitation as
   permanent?** T3 Code's precedent argues for building it, but it's real
   new scope (a whole MCP server implementation) — worth confirming
   that's actually wanted before planning it out in detail.
3. **If built: stdio or HTTP transport for our MCP server?** T3 Code uses
   HTTP with a per-thread bearer token (works uniformly across all their
   backends, including ones that can't spawn arbitrary local processes).
   Stdio would be simpler to wire up locally (no port/auth-token
   management) but ACP's stdio MCP transport support may vary more by
   agent than HTTP does — needs checking against each target agent's
   `InitializeResponse.agent_capabilities.mcp_capabilities` rather than
   assumed.
4. **Which of our tools get exposed via the bridge?** At minimum
   `load_skill` (the thing that started this discussion) — does memory
   (project/global memory notes) get exposed too, as a read tool? Do any
   of the filesystem/shell tools get exposed, or would that conflict with
   /duplicate the external agent's own native tools (likely redundant and
   possibly confusing to the agent — probably skills/memory only, not
   read_file/edit_file/shell/spawn_sub_agent)?
5. **AGENTS.md/memory content itself (not the skill-loading tool, the
   actual prose)** — per the earlier discussion and T3 Code's precedent,
   the recommendation is to *not* bridge this (trust Claude
   Code/Copilot's own native CLAUDE.md/AGENTS.md filesystem discovery,
   since both run as real processes with the real project `cwd` already
   passed via `NewSessionRequest.cwd`) rather than prepending a rendered
   system-prompt-equivalent into the first `PromptRequest`. Not yet
   confirmed as final — the alternative (do inject it) was raised earlier
   in the conversation and not ruled out, just deprioritized once the
   MCP-bridge path came up as the likely better lever for the *tool*
   half of the problem specifically.

## Next step

Once the above are resolved, this should go back through the normal
plan-mode flow (Explore/Plan agents, a concrete file-by-file design, user
sign-off) before any code is written — same process as phases 1 and 2.
Nothing here should be treated as an approved implementation plan yet.
