# Design guide

How ai-leash should look and behave, written for the agents (and people)
who change its UI. Read it before adding or changing any surface; the
mechanics (Astryx only, StyleX tokens, the theme editor) are in
`AGENTS.md` and still apply.

ai-leash is an agentic harness: people hand work to agents and keep them
on a leash — see what they do, steer them, stop them. Every UI decision
should make that easier, faster or calmer.

> **The agent's work is the centre. The leash is always visible. The UI
> stays quiet, fast and out of the way.**

## Principles

Ordered: when two conflict, the earlier one wins.

1. **Keep the leash visible.** Anything an agent does — tool calls,
   Actions, sub-agents, memory writes, files touched, approvals it waits
   on — leaves a trace the user can see, open and stop. Never hide what an
   agent did to save a click.
2. **Speed is a feature.** The UI never waits on the agent. No spinner for
   a local operation; update optimistically. A feature that slows the core
   loop (typing, switching chats, streaming a long transcript) waits until
   it can be fast.
3. **The work is the centre; chrome recedes.** The chat (or board) gets the
   space and the darkest surface. The sidebar, side panel, editor and
   terminal support it and step back.
4. **One good way, by default.** A strong default beats a setting. Add a
   preference only when no single default serves the user; remember state
   the user sets (per project or app-wide) instead of asking again.
5. **Calm over clever.** Hierarchy comes from size, colour and position —
   not weight, decoration or motion. Distinctiveness isn't the goal;
   quality is.
6. **Systems, not one-offs.** Fix a look once at the right level —
   component, token, theme — not per screen.
7. **Keyboard-first.** Every frequent action has a key and shows it;
   power is reachable without being on screen.
8. **Integrated, not bolted on.** A feature works everywhere it applies:
   native and ACP agents, chat and board, main checkout and worktrees,
   both tab areas.
9. **Craft is the floor; cut scope, not quality.** A feature isn't done
   without its empty, loading and error states and its keyboard path.
10. **Evolve, don't upend.** Keep layouts, positions and shortcuts stable;
    every change needs a reason the user would agree with.

## Rules for this app

### Layout

- Three areas: sidebar (full height) | chat or board | side panel. The
  side panel opens and closes (Ctrl+J); the board has none.
- No separate title bar. Each pane opens with a **top band**
  (`features/tabs/TopBand.tsx`): one fixed height, one divider, so the
  chat's band and the panel's band read as one bar. Tabs sit at the
  band's start, controls at its end; the **window controls** end the
  rightmost band (the panel's, or the chat's when the panel is closed).
  Empty band space drags the window.
- New controls for a pane go in its band's end slot, not in a new row.

### Colour

- Surfaces, darkest to lightest: chat/board `surface` (`#0f0f10`) →
  sidebar and side panel `body`/`muted` (`#161617`) → cards, menus,
  popovers `card` (`#1c1c1e`). Use the tokens, never the hex.
- Status colours mean one thing each, everywhere (sidebar, tabs, board
  cards, Activity): **blue** = an agent is running, **amber** = waiting on
  the user (approval, question), **red** = failed, **green** = done.
  Nothing else gets those colours.
- One brand gradient, in the logo only. No other gradients or accent
  colours in the app UI.

### Type and weight

- Content at the interface size (14px default), chrome (tabs, small
  buttons, pickers) one step down (12px), supporting text muted.
- Weight 500 at most; the board has **no bold at all**, titles included.
  Emphasis is colour (`primary` vs `secondary` text) and size.

### Buttons

Use the stock variants only, by role:

| Variant | Use for | Examples |
|---|---|---|
| `secondary` (frosted) | a chrome entry point the user reaches for often | sidebar **Search**, the **Actions** split button |
| `ghost` | icon tools and toggles | open in editor, panel toggle, tab **+**, window controls, row ⋯ |
| `primary` | the one main action of a surface | board **New task**, a dialog's confirm |
| `destructive` | deleting or discarding | delete task, force-delete worktree |

- Neighbours line up: when a button sits among rows (e.g. sidebar
  Search above New thread), give it the rows' inline padding so icons,
  labels and shortcut badges form straight columns.
- Optical alignment counts: an icon button's glyph, not its box, lines up
  with the content edge (see the sidebar collapse button's
  negative margin).
- Size controls to their text: a copy/retry button next to a 12px meta
  line is the smallest size, not the default.

### Icons

- `lucide-react` only, default stroke, Astryx `Icon` sizes.
- An icon names its action: fold/unfold (`FoldHorizontal`) for collapsing
  a column, a chevron pointing toward the edge it folds into for
  collapsing a sidebar or panel (the sidebar and side panel use the same
  registry chevron, mirrored).
- Every tab has its kind's icon at its start; hovering or keyboard-focusing
  a closable tab turns that icon into ×. The Agent tab never closes.

### Tabs

- Underline `TabList`, size sm, inside the band. The selected underline
  lands on the band's divider (`--_tab-indicator-bottom`), never floating
  above it.
- Both tab areas use the same `TabStrip`; a tab's decorations follow its
  kind, not the area it's in.

### Keyboard and search

- Every shortcut is declared once in `src/lib/shortcuts.ts`; handlers go
  through `useShortcuts`. Never add a stray `document.addEventListener`
  for a key.
- Show the key wherever the action appears: a `Kbd` badge at the end of
  the row or button, `withShortcut(label, id)` in tooltips, the palette
  row. Ctrl on Linux/Windows, ⌘ on macOS — the registry handles it.
- Don't steal keys from the terminal or editor while they have focus
  (only Ctrl+K passes through).
- Anything you can navigate to belongs in the command palette
  (`AppCommandPalette.tsx`); its matching is fuzzy (`lib/fuzzyMatch.ts`),
  so search by any word of a title or project.

### Motion

- Only to explain cause and effect (something opened, moved, finished),
  short (Astryx duration tokens) and off under `prefers-reduced-motion`.
- When an action reveals something off-screen, bring it into view (opening
  the board's Done column scrolls to it).

### States and copy

- Every list, panel and column has an empty state that says what goes
  there and how it fills. Loading shows placeholders, not spinners, for
  anything local. Errors say what happened and what to do next, with a
  retry where one makes sense.
- Labels say what happens: "Collapse Done column", not "Hide". Sentence
  case. No exclamation marks.
- Don't offer an action where it doesn't belong (no "add task" on Review
  or Done — tasks arrive there).

## Before you finish a UI change

1. Re-read the files: no `className`, `style={{}}`, raw `<div>`/`<span>`,
   hex or px (see `AGENTS.md`).
2. Same job, same look: compare with the nearest existing control
   (variant, size, padding, icon) and match it.
3. Check alignment against neighbours — icon columns, text baselines,
   badge edges, underline on the divider.
4. Empty, loading, error and keyboard paths exist.
5. `npx tsc --noEmit`, `npx biome check <files>`, `npm test`, **and**
   `npx vite build` — StyleX errors (e.g. importing a non-`.stylex.ts`
   constant into `stylex.create`) only show up in a real build.
6. Theme changes: through the theme editor only, then look at the
   `editor show --png` pictures.
7. Update the matching `docs/features/*.md`.

## Where these ideas come from

Published design thinking from Linear (opinionated defaults, craft as the
bar, reduce scope not quality), Vercel (Web Interface Guidelines,
performance as design), Figma (UI3: keep users in flow, speed is a
feature, respect change), Notion (restraint, "good tools get out of your
way"), Zed (the editor should disappear, no magic, hyper-responsive),
Warp (meet developers where they are, great defaults), Raycast (fast,
simple, delightful; keyboard-first) and Arc (transparency, optimise for
how it feels).
