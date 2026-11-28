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
- A view with its own toolbar (the board) merges it into the band rather
  than stacking a second bar: view state and filters after the location
  crumbs, tools and the primary action at the end, before the layout
  switch and window controls (`features/board/BoardBand.tsx` portals
  them in). When the band runs short, fold the icon tools into one ⋯
  `MoreMenu`, then drop labels; never wrap onto a second line.

### Colour

- Surfaces, darkest to lightest: chat/board `surface` (`#0f0f10`) →
  sidebar and side panel `body`/`muted` (`#161617`) → cards, menus,
  popovers `card` (`#1c1c1e`). Use the tokens, never the hex.
- Status colours mean one thing each, everywhere (sidebar, tabs, board
  cards, Activity): **blue** = an agent is running, **amber** = waiting on
  the user (approval, question), **red** = failed, **green** = done.
  Nothing else gets those colours.
- Tooltips are popover-coloured (`popover` background, `primary` text,
  `--shadow-low`), set on the `tooltip` part in the theme, never the stock
  inverted light chip, which glares on the near-black app. Don't restyle a
  tooltip per call site.
- Tab icons carry run status: an Action's output tab tints its icon with
  `runState`'s tones through the shared `RunIcon` (amber while running,
  red after a failed run), matching the Actions tab and the top bar's
  Actions button. Only a control changes glyph (the top bar's Stop); a
  status icon keeps its glyph and shows state by colour alone
  (`RunIcon isStatusOnly`).
- Code has one palette, the theme's `--color-syntax-*` tokens (set in the
  theme editor, dark mode: raised `#161617` background, dimmed comments and
  punctuation). Every code surface reads it: chat code blocks and tool
  calls (Astryx `CodeBlock`), the file editor (CodeMirror, through
  `lib/codeTheme.ts`), the terminal's background, text and 16 ANSI colours
  (`lib/terminalTheme.ts`) and the JSON viewer. Don't add a stock editor
  theme (One Dark etc.) or hard-code token colours; change the palette in
  the theme and every surface follows. Markdown source in the editor shows
  hierarchy the same way the app does: prose in `secondary`, headings and
  bold in `primary` (headings stepped by size, weight 500), marks dimmed.
  Rendered Markdown (`ui/Markdown.tsx`, chat and file Preview) does the
  same: headings `primary`, 1.5/1.3/1.15em, weight 500, more space above
  than below; a `--spacing-3` gap between blocks; list items a step apart.
  A file's Preview adds document margins and a rule under h1/h2.
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
  row. ⌃ on Linux/Windows, ⌘ on macOS — the registry handles it.
- Key badges are ghost keycaps: transparent, a thin
  `--color-border-emphasized` border all round, `--color-text-secondary`
  text, at a fixed 12px (not the supporting size, which the sidebar raises
  to 14px), so a badge stays a step smaller than the label beside it.
  That's the theme's `kbd-key` part — don't restyle a `Kbd` locally.
- Show modifier keys as symbols (⌃ ⌘ ⇧ ⌥) via `kbdKeys`: pass
  `kbdKeys(keys)` to every `Kbd`, and `formatShortcut(keys)` for a key in a
  string. Never write "Ctrl" in UI text.
- A field a bare key focuses shows that key as a dimmed `Kbd` at its end
  while it's empty and unfocused (the message box's `/`), laid over the
  field so it doesn't move anything.
- Don't steal keys from the terminal or editor while they have focus
  (only Ctrl+K passes through).
- Anything you can navigate to belongs in the command palette
  (`AppCommandPalette.tsx`); its matching is fuzzy (`lib/fuzzyMatch.ts`),
  so search by any word of a title or project.
- Composer menus (`/` commands, `@` files) and the `/help` list share the
  palette's row style: icon, label in primary text, muted secondary text,
  hint or `Kbd` at the end, palette group headings and footer. Build them
  on `ComposerMenu`/`MenuRow` (`features/chat/components/popovers/`), not a
  new list.

### Prompts that need the user

A permission ask, an agent's question, or any new "the agent is waiting on
you" surface follows `PromptCard` (`features/chat/components/popovers/`):

- It takes the composer's place as one compact card (`Card elevation=low
  padding={3}`, gap 2 inside) with the card's normal border — no amber
  edge or border; the amber icon and label mark it as waiting on you.
- No heading. One small header line: the amber status icon (`ShieldAlert`
  for approval, `QuestionMark` for a question, `xsm`, the same marks the
  sidebar row shows), a short amber label in `sm` ("Wants to run a
  command", "Asked you a question"), a muted detail (who asks, "question 2
  of 3"), then at the end "1 of N" stepping, the muted `xsm` waiting time
  and any dismiss button.
- Content in `sm`: what the agent wants — the command, path or tool and its
  arguments — in monospace (`Text type="code" size="sm"`, `CodeBlock
  size="sm"`), cut to a few lines with a **Show all**, never hidden; one
  muted line of why or context. A question itself (the agent's message)
  is `lg`, the one big line in the card. A one-of choice is a compact
  `List` of selectable rows led by their number `Kbd` — no radio circles;
  the picked row takes the selected fill (several-of keeps checkboxes).
  A choice's "Other" answer is just the input, its hint in the
  placeholder, no label. Form inputs are `size="sm"`.
- Buttons: one row of `size="sm"`, start-aligned, primary first — one
  `primary` (allow once, or the recommended choice), `secondary` for the
  alternatives and the refusal, `ghost` only for navigation (Previous) and
  dismiss. Weight 500 at most.
- A key hint inside a button is `ButtonKbd` (`PromptCard.tsx`), never a bare
  `Kbd`: the key's secondary text and dark border vanish on a `primary`
  button's light fill; `ButtonKbd` points Kbd's tokens at the button's own
  foreground, dimmed, so it reads on every variant. Keys go through
  `kbdKeys`.
- Keys, one scheme for every prompt (`lib/promptKeys.ts`): `Enter` = the
  primary option, `Esc` = refuse (deny, decline), `1`–`9` = the options or
  choices in the order shown, `[`/`]` = step through several pending
  prompts. Each option shows its key. No letter keys, so a text
  field inside a prompt types normally; there only `Enter`/`Esc`/`Tab` act.
- Keys are handled by the card's own `onKeyDown`, so they act only while
  focus is inside it — not a document listener. The card focuses itself
  when a prompt appears unless the user is typing in another field, the
  terminal or the editor; it ignores `Enter` and numbers for a moment after
  appearing (an `Enter` meant for the message box mustn't approve
  anything); answering sends focus back to the message box.
- Several pending: show "1 of 3" with previous/next in the header; answer
  oldest first by default.
- Announce the prompt through `useAnnounce` (what is asked, and which keys
  answer it); the card is a labelled `region`.

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
6. `npm run check:compiler` prints "no compiler bailouts" — the React
   Compiler silently skips (and leaves unmemoized) any component or hook
   it can't compile: refs read or written during render, `try`/`finally`,
   computed-key destructuring.
7. Theme changes: through the theme editor only, then look at the
   `editor show --png` pictures.
8. Update the matching `docs/features/*.md`.

## Where these ideas come from

Published design thinking from Linear (opinionated defaults, craft as the
bar, reduce scope not quality), Vercel (Web Interface Guidelines,
performance as design), Figma (UI3: keep users in flow, speed is a
feature, respect change), Notion (restraint, "good tools get out of your
way"), Zed (the editor should disappear, no magic, hyper-responsive),
Warp (meet developers where they are, great defaults), Raycast (fast,
simple, delightful; keyboard-first) and Arc (transparency, optimise for
how it feels).
