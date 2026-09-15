# Debug mode

Debug mode is an opt-in developer/troubleshooting toggle for inspecting AI
Leash's own external-agent (ACP) connections while you use the app.

## Turning it on

1. Open **Settings**.
2. Select **Debug**.
3. Enable **Enable debug mode**.

A small floating icon appears in the bottom-right corner of the window while
debug mode is on. Click it to open or close the **ACP Events** panel; click
it again (or the panel's close button) to hide the panel without turning
debug mode off.

## ACP Events panel

The panel shows protocol-level events for every conversation's connection to
an external agent, app-wide — not just the conversation you currently have
open — including sent requests, received responses, notifications,
permission requests, and connection errors. Use the dropdown at the top of
the panel to filter the list down to a single conversation.

Each event's payload is shown in a collapsible JSON tree so you can drill
into large payloads (like an agent's full response or the MCP server
configuration AI Leash sends when starting a session) without scrolling past
a wall of text.

The panel is absolutely positioned over the right-hand tool panel and has
its own independently adjustable width, dragged from its left edge.

Events are kept only in memory for as long as debug mode stays on. Closing
the panel does not lose anything already captured; turning debug mode off
does — nothing here is written to disk or included in conversation history.

## Showing IDs in the title bar

Debug also has a **Show IDs in title bar** toggle. When enabled, the title
bar's center section shows:

```
<project root> / <conversation id> / <ACP session id>
```

The ACP session id is the id assigned by the external agent itself (distinct
from AI Leash's own conversation id) and only appears once the ACP Events
panel has captured a `session/new` or `session/load` event for that
conversation — so it shows `—` until debug mode has been on for at least one
message in that conversation.
