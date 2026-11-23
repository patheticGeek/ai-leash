# ai leash on stock Astryx — UI proposal (v2)

A redesign of every ai leash surface on Astryx's own page templates, in
Astryx's **stock** colours, prototyped as a standalone Vite app in
`prototype/` (Vite + `@astryxdesign/core` 0.7.17 + StyleX). Nothing in the
real app (`src/`, `themes/`) was changed. ai leash is an agentic harness: the
file tree, terminal and editor are there to support the agent chat.

- Prototype source: `prototype/src` (`shell/`, `chat/`, `screens/`, `data.ts`;
  `ref/` holds the raw templates the screens are compared against)
- Screenshots at 1400×900: `prototype/shots-v2/*.png` (v2) and
  `prototype/shots/*.png` (v1, kept for comparison); `shots-v2/ref-<template>.png`
  is each raw template rendered in the same theme
- Raw template scaffolds: `prototype/templates-ref/<template>/page.tsx`
- v1 proposal (leash theme): `prototype/PROPOSAL-v1.md`
- Run it: `cd prototype && npm install && npm run dev`, then open
  `http://localhost:5199/#/<route>` — routes `chat`, `chat-permission`,
  `chat-question`, `new`, `new-slash`, `board`, `board-epics`,
  `board-epics-drag`, `board-epics-scrolled`, `task`, `task-new`,
  `task-details`, `task-details-todo`, `chat-collapsed`, `chat-subagent-tab`,
  `settings/<agents|chat|fonts|editor|debug|crashlog|about>`, `ref/<template>`,
  plus the chat-states gallery in §2.8 (`strip-*`, `popup-*`, `prompt-*`,
  `toasts`, `confirm-*`, `tooltip`, `state-*`, `pill-*`)
- Reshoot everything: `npm i --no-save playwright && npx playwright install
  chromium-headless-shell`, then `node scripts/shoot-all.mjs`

Checks: `npx astryx doctor` and `npx astryx doctor --built .` both report
**0 failures**. The one `--built` warning (`built-astryx-purity`) comes from
`src-v1/` (the leash-theme prototype, kept for comparison) and the copied
template sources in `src/ref/`; the v2 screens use StyleX only for structural
widths and sticky positioning the components have no prop for.

---

## 0. What changed from v1

v1 feedback: *"it still looks broken, and just mushed together rather than put
together with thought and intention."* v1 started from the templates but then
bent them towards today's look through the custom `leash` theme (the
`#3a5f8f` accent, custom surface hexes, tooltip/toast/tab tweaks, `spacing
tight`) and per-screen padding cuts. Each screen ended up a slightly
different compromise between the template and the old app, so nothing lined
up across screens.

v2 goes the other way: **the templates win**.

| | v1 | v2 |
|---|---|---|
| Theme | Repo's `leash` theme (custom accent, surfaces, tight spacing, tab/tooltip/toast overrides) | Stock `neutral` (`--like neutral`), dark mode. Only change: chrome text on the scale's 12px step (§1) |
| Spacing | Template gaps/paddings shrunk per screen (2–4 instead of 6) | Template frames, gaps and paddings kept as scaffolded |
| Accent | Blue `#3a5f8f` everywhere selected | Neutral's monochrome: selection is a muted fill, primary actions are the light button |
| Tabs | Pill tabs (leash) | `TabList` underline tabs, as in ide / settings |
| Chat | Avatars dropped, compact, full width, composer header row dropped | Template's `ChatMessage` / ghost bubbles, centred transcript, **no agent avatar** (agent replies span the transcript column); `ChatComposer` with its own header (attach, context %), footer (pickers) and drawer (queued) |
| Strips above the composer | Hand-built one-line strips from layout primitives | Stock `Banner` (warning / info) with actions; permission and question prompts on the composer's card surface |
| Board | Coloured priority `Token`s | Priority `Badge`, as kanban-board does; epics as tinted `Token`s |
| Title bar | Breadcrumb text | One-line Astryx `Breadcrumbs` (`project / page`), sidebar expand toggle in front of it while the rail is collapsed |
| Tasks | Dialog for new, full page for existing | Two `Dialog`s: New task, and Task details (opens on card click); full-page view not recommended |

The result is one designed system: one surface ramp (wash rail → body →
muted card → raised overlay), one radius scale, the template's spacing
rhythm on every screen, the same type scale (Heading 2/3/4, body 14,
supporting 12), and the same selected / hover / status treatments
(`StatusDot` for state, `Spinner` + elapsed for work in progress, `Badge`
only for counts and the template's own priority badge).

---

## 1. Theme: stock Astryx, readable text

`prototype/themes/ai-leash` is `npx astryx experimental theme editor new
ai-leash --like neutral` — the theme `npx astryx docs theme` recommends as the
plain default — rendered in dark mode (`<Theme mode="dark">`). Colours,
surfaces, radii, shadows and spacing are all neutral's. **No `:root`
overrides**, no custom hexes.

The only edits are text sizes, and they come from Astryx's own type scale
(`npx astryx docs tokens-text-size`, `tokens-type-scale`): the scale is
`round(14 × 1.2^step)`, body / label / code use `--font-size-base` (14px) and
supporting text uses `--font-size-sm` (12px). Body text is already 14px, so it
is left alone. App chrome (tabs, side-nav rows, `sm` buttons / selectors /
inputs / segmented controls) is moved onto the scale's existing 12px step, the
size Astryx already uses for secondary text, so the chrome reads as one quiet
layer around 14px content:

```bash
npx astryx experimental theme editor new ai-leash --like neutral
npx astryx experimental theme editor set ai-leash font-size 12px --on tab
npx astryx experimental theme editor set ai-leash font-size 12px --on side-nav-item
npx astryx experimental theme editor set ai-leash font-size 12px --on button --when size:sm
npx astryx experimental theme editor set ai-leash font-size 12px --on selector --when size:sm
npx astryx experimental theme editor set ai-leash font-size 12px --on text-input --when size:sm
npx astryx experimental theme editor set ai-leash --text-label-size 12px --on segmented-control --when size:sm
# Banners: the status tint (--color-*-muted) is ~24% alpha in dark mode, so a
# Banner docked over the transcript let the messages show through. Back the
# frame with the solid card surface; the tint then reads as a solid tinted strip.
npx astryx experimental theme editor set ai-leash background-color "var(--color-background-card)" --on banner-frame
npx astryx experimental theme editor show ai-leash --png   # pictures checked
```

Measured in the prototype (`scripts/probe.mjs`): transcript, tree, settings
rows, card titles 14px; tabs, side-nav rows, pickers, checkout bar, tool rows,
system messages 12px.

---

## Templates at a glance

The gallery pages at astryx.atmeta.com are rendered on the client, so a fetch
only returns their one-line descriptions. The notes below come from the
template sources scaffolded with `npx astryx template <name>` (copies in
`prototype/templates-ref/`).

| Template | Frame | Spacing / density | Type | Main components | Empty / loading / selected |
|---|---|---|---|---|---|
| **ai-chat-landing** | `Layout contentWidth=720 padding=6`, one centred column (`VStack gap=8 vAlign=center`) | Roomy: gap 8 between blocks, 6 inside | `Text large` greeting + `display-2` headline; cards use `Heading 4` + `xsm` secondary | `ChatComposer` (input min-height 84, `ChatComposerDrawer` of `Token`s, header/footer/send action slots), `ToggleButtonGroup` categories, `Grid minWidth=280` of muted `ClickableCard`s | It *is* the empty state. Selected = the active category toggle |
| **ai-chat** | Full-height `ChatLayout` (composer slot) + optional resizable artifact pane (`ResizeHandle` + transparent `Card` with a bottom-divided `Toolbar`) | `density="spacious"`, centred transcript | Markdown `density="compact"` in ghost bubbles | `ChatMessageList`, `ChatMessage` (user = filled bubble, assistant = avatar + ghost bubbles), `ChatMessageMetadata` (timestamp, status), `ChatToolCalls` (status icon, mono name, target, +/- diff, duration, expandable `resultDetail`), `ChatSystemMessage` (divider / status), `CodeBlock` with title | Running tool = spinner row; no empty state (landing covers it) |
| **ide** | `Layout` with a start `LayoutPanel` (256, 160–400, collapses to 50), a centre code pane, a vertical-resizable bottom drawer (300) and an end inspector (320) | Dense: tree `density="compact"`, inspector `padding=4 gap=3`, `ResizeHandle hasDivider isAlwaysVisible={false}` | `Heading 3` file name + supporting path; `CodeBlock size="sm"` | `TextInput` search + `TreeList`, drawer `TabList size=sm` (Terminal/Problems/Output), `SegmentedControl layout=fill`, `MetadataList`, `List` with time end content | Selected file in the tree; no empty states |
| **kanban-board** | `LayoutHeader hasDivider padding=4` with a `Toolbar`, then a horizontal row of columns that scrolls sideways | Columns 300 wide, gap 4; column header padding 3, body padding 2; cards padding 3, gap 2 | `Heading 3` board title + count `Badge`; `Heading 4` column and card titles; supporting description (2 lines) | Muted `Card` per column with a `Layout` header (`StatusDot`, title, `InfoTip`, count); `Card` per item (ref + priority `Badge`, `MoreMenu` with "Move to …"); pointer-event drag with a muted ghost placeholder and a floating card on `--shadow-high` | `EmptyState isCompact` with an icon per empty column; stacks vertically below 768px |
| **settings-dialog** | `Dialog width=1120 padding=0` with one fixed height; `Layout start=SideNav content=LayoutContent` | Rows padding 4, control column 192 wide, rows stack together at a 480px container width | `Heading 4` "Settings" in the rail; `Heading 2` panel title + supporting description; group titles are supporting semibold | `SideNav` with a search `TextInput` in `topContent`, `SideNavSection` per group; `SettingsCard` (muted `Card padding=0`, subtle `Divider`s), `SettingsRow` (required icon, title, description, control); sticky close `IconButton` | Search swaps the nav for a `ListItem` results list; selected nav item |
| **shell-side-nav** | `AppShell contentPadding=0` + one `SideNav` (collapsible, resizable 300, 220–420); no top bar | Children in `VStack gap=0.5` | `SideNavHeading` with `NavIcon` | Hidden-header sections: Menu (New chat, Search, Library), then one collapsible `SideNavItem` per workspace holding its conversations; `StatusDot` end content; `MoreMenu` revealed by `useContainerReveal`; delete through `AlertDialog`; footer section (Settings, account) | Selected conversation; status dots for active / review / blocked |
| **work-item-detail** | `Layout contentWidth=1260`: `LayoutHeader` + content column + end `LayoutPanel` (340, `hasDivider`) | Roomy: header padding 6, sections padding 6 split by `Divider`s, rail gap 10 | `Heading 1` title (2 lines), section `Heading 2`, rail `Heading 3` | Breadcrumb (`Link` back, vertical `Divider`s), a row of `Selector`s (status with `StatusDot`, priority, assignee) + `Tokenizer`; Description, Subtasks (`ProgressBar` + `CheckboxListItem`), Attachments (`ClickableCard`), Comments and activity feed; rail `MetadataList`, `AvatarGroup`, linked items | Below 1024px the rail drops under the content |

Common thread: every template is roomier than today's ai leash. v2 keeps
the templates' spacing as scaffolded (see open question 11).

---

## 2. Surfaces

Every screen shares one frame, so the sidebar, title bar and side panel look
identical from screen to screen; only the centre changes.

### 2.1 App shell — `ide` + `shell-side-nav`

Screenshots: `shots-v2/chat.png` (vs `ref-ide.png`, `ref-shell-side-nav.png`)

```
┌──────────────────┬───────────────────────────────────────────┬──────────────────────────┐
│ [ai] ai leash  ‹ │ ai-leash / #42 Astryx: board on the kanb… │ </> [▶ dev ▾]  – □ ×     │ title bar (Breadcrumbs)
│                  ├───────────────────────────────────────────┼──────────────────────────┤
│ ✎ New thread ^N  │───────────────────────────────────────────┼──────────────────────────┤
│ ⊕ Add project    │ Agent  Check drag… ×  BoardView.tsx        │ Files  Sub agents  Act… +│ TabList sm (× = close)
│ ──────────────── ├───────────────────────────────────────────┼──────────────────────────┤
│ Projects       ⏷ │                                           │ [⌕ Search files       ]  │
│ ▾ ai-leash       │        transcript (ChatMessageList)        │ ▾ src                    │
│    ▦ Board    (2)│                                           │   ▾ features/board       │
│    #42 Astryx… 3:12●│                                        │      BoardView.tsx       │
│    Fix ACP sess… │                                           │ (TreeList compact)       │
│    #38 Split…   ●│  ┌ ChatComposer ───────────────────────┐  │                          │
│ ▾ tidepool       │  │ ─ drawer: Queued tokens             │  │                          │
│ ▸ dotfiles       │  │ 📎                       62% context │  │                          │
│ ▸ Done        3  │  │ Ask the agent…                      │  │                          │
│                  │  │ ⚙ Claude Code·Opus ▾ High ▾ Edits ▾ Queue ■│                       │
│ ⚙ Settings       │  └─────────────────────────────────────┘  │                          │
│                  │   ⎇ task-42 ▾            task/42-… ▾      │                          │
└──────────────────┴───────────────────────────────────────────┴──────────────────────────┘
 SideNav (wash)        centre                                    end LayoutPanel, resizable
```

- **Frame:** `AppShell` + the side-nav template's `SideNav` (wash rail,
  collapsible), then `Layout` with the centre in `content` and the ide
  template's inspector as an end `LayoutPanel` behind `ResizeHandle hasDivider`.
- **Sidebar collapse** (`chat.png` expanded, `chat-sidebar-collapsed.png`
  collapsed): the SideNav's own foot button is turned off (`hasButton:
  false`) and one controlled collapse config is shared, as the
  `SideNavCollapseButton` docs describe for a button outside the nav.
  Expanded, the `‹` toggle sits at the top of the rail beside the logo
  (`SideNavHeading headerEndContent`). Collapsed, the rail shrinks to its
  icons and the heading's end slot is hidden, so the `›` toggle leads the
  title bar's breadcrumb, at the same spot just right of the rail.
  (`src/shell/sidebarCollapse.tsx`)
- **Title bar:** a one-line `Breadcrumbs` trail, the last item `isCurrent`:
  `ai-leash / #42 Astryx: board on the kanban template`, `ai-leash / Board`,
  `ai-leash / New thread`. No subtitle (worktree and branch are in the
  checkout bar, agent in the pickers). Then Open in editor, the Actions split
  button and window controls; on a board, Open/Actions give way to the
  Board / Both / Chat `SegmentedControl`.
- **Closing tabs** (`chat-tabs-close.png`): a `Tab` is a `<button>`, so an
  `IconButton` can't go in its `endContent`, and putting one *beside* the tab
  breaks the hover pill and the selected underline. So the × is part of the
  tab, like a browser tab: a plain icon in `endContent`, visible on the
  selected tab and on hover/focus (its box is reserved so tabs don't shift).
  A click on the × closes (the Tab's `onClick` checks the target); so does
  middle-click anywhere on the tab, and Delete / Ctrl+W on a focused tab
  (`aria-keyshortcuts`), which is the keyboard path. Home tabs (Agent, Files,
  Sub agents, Actions) have no ×. (`src/shell/PaneTabs.tsx`)
- **Sidebar** (`shell-side-nav`): New thread (with `Kbd`) and Add project as
  the template's top menu; then one collapsible `SideNavItem` per project
  holding its **Board** (count `Badge` = tasks waiting for review) and its
  chats; working chats show elapsed time + a `StatusDot`, chats waiting for
  approval/answers a warning `StatusDot`; Done collapsed at the bottom;
  Settings in the footer. Long titles need `contain: inline-size` on the
  nested `VStack` (`src/shell/LeftBar.tsx`, `styles.nested`), or the
  collapsible item's grid pushes the end slots out of the rail.
- **Centre and side panel tabs:** the ide drawer's `TabList size="sm"`
  (underline), the same component in both panes.

### 2.2 Side panel — `ide` (inspector + drawer)

Screenshots: Files in `chat.png`, Sub agents in `chat-permission.png`,
Actions in `chat-question.png`

- **Files:** the ide explorer as scaffolded: search `TextInput` + `TreeList
  density="compact"` in a `padding={4}` stack.
- **Sub agents / Actions:** compact `List hasDividers edge="padded"` rows
  (the layout docs' "List in a zero-padding section, the List owns the
  inset"): `StatusDot` · description · model and latest line · elapsed · stop
  / open. Actions puts **Add action** in a `LayoutFooter hasDivider`.
- **Terminal:** the ide drawer's borderless `CodeBlock` look.

### 2.3 New thread — `ai-chat-landing`

Screenshots: `new.png`, `new-slash.png` (vs `ref-ai-chat-landing.png`)

```
            ✦ New thread in ai-leash                         Text large + icon
            What should the agent work on?                   display headline
            ┌ ChatComposer (min-height 84) ────────────────┐
            │ 📎                                            │
            │ Describe the task, / for commands, ! for shell│
            │ ⚙ Claude Code · Opus 5.5 ▾  High ▾  Edits ▾  ⬆│
            └───────────────────────────────────────────────┘
             ⎇ primary ▾                   astryx-migration ▾  checkout bar
            The agent starts with
            [AGENTS.md] [docs/AGENTS.md] [Project memory] [3 skills] [4 actions]   Tokens
            ┌ Plan this as board tasks ┐ ┌ Review the current diff ┐   muted ClickableCards
            └──────────────────────────┘ └─────────────────────────┘   (Grid minWidth 280)
            ┌ Run the tests and fix…   ┐ ┌ Explain how a part works┐
```

The heading's project name is a picker: a ghost, label-less `Selector` inline in the heading (Recent projects with their paths, then "Add project…"). Choosing a project re-targets the checkout bar under the composer (primary worktree + that project's branch), the breadcrumb and the "starts with" row.

The template's centred 720 column, greeting, composer and card grid; its
category `ToggleButtonGroup` is replaced by the "starts with" context row
(what ai leash folds into the system prompt). `/` opens the slash command
menu above the input (`new-slash.png`).

### 2.4 Chat transcript and composer — `ai-chat` (visual design only)

Screenshots: `chat.png`, `chat-permission.png`, `chat-question.png`
(vs `ref-ai-chat.png`)

ai leash's grouping logic is unchanged; each of its rows maps onto an
ai-chat part instead of being a restyled lookalike:

| ai leash row | ai-chat part |
|---|---|
| Worked-for summary / activity group | `ChatToolCalls` with a `label` ("Worked for 4m 51s · 1 thought, 4 tools used"), one row per tool |
| Thinking | a `ChatToolCalls` row ("Thought · for 6s") whose `resultDetail` is the thought |
| Tool call (read/edit/grep/bash) | `ChatToolCalls` row: status icon, mono name, target, +/- counts, duration, expandable diff `CodeBlock` |
| `spawn_sub_agent` + its threads | `ChatToolCalls` row; the threads are a compact `List` in `resultDetail` (status dot, description, model, elapsed, open) |
| System context row, notes, messages from other chats | `ChatSystemMessage` with an icon; "From Project chat" uses the user bubble's `name` slot |
| Message footer / Working for | `ChatMessageMetadata` (timestamp + copy/retry; `Spinner` + "Working for 3:12" while running) |
| Assistant prose | `ChatMessageBubble variant="ghost" width="100%"` + `Markdown density="compact"`; no avatar, so the reply, its tool rows and timestamp start at the transcript's left edge |

Composer dock (top → bottom):

```
 ┌ Banner warning ─ Claude session limit reached · Resets 14:00 ─ [No] [Yes, resume automatically] ┐
 ┌ Banner info ──── Following task #38 ──────────────────────────────── [Hand back to project chat] ┐
 ┌ ChatComposer ──────────────────────────────────────────────────────────────────────────────────┐
 │  ─  (drawer handle: collapse)                                                                 │
 │  [≡ Also run the board tests once the edit lands ×]          drawer: queued messages (Tokens)  │
 │  📎                                                    62% of context   header actions/context │
 │  Ask the agent, / for commands, ! for shell                                                    │
 │  ⚙ Claude Code · Opus 5.5 ▾   💡 High ▾   🛡 Accept edits ▾                    Queue  ■        │
 └────────────────────────────────────────────────────────────────────────────────────────────────┘
   ⎇ task-42 ▾                                                            task/42-astryx-board ▾
```

- Rate-limit and task-link notices are stock `Banner`s with their actions.
- A permission prompt (`chat-permission.png`) or a question from the agent
  (`chat-question.png`) takes the composer's place on the same `Card`
  surface: Heading 4 title, supporting subtitle, content (`CodeBlock` /
  `RadioList` + note), actions right-aligned (ghost → secondary → primary).

### 2.5 Project board — `kanban-board`

Screenshots: `board.png` (Both, with the project chat docked),
`board-epics.png`, `board-epics-drag.png`, `board-epics-scrolled.png`
(vs `ref-kanban-board.png`)

```
 Tasks (14)                       [All epics ▾]  ▤ ✓ ⚙  [+ New task]     LayoutHeader + Toolbar
 ┌──────────────┐ ┌ ● Backlog ⓘ  3 + ┐ ┌ ● Todo ⓘ   3 + ┐ ┌ ● In progress ┐  muted column Cards,
 │ Astryx migr. │ │                   │ │ #44·L  High   … │ │ #42·L High  … │  shared header row
 │ 5 tasks      │ │                   │ │ Astryx: side…   │ │ Astryx: board │
 │  (sticky)    │ │                   │ │          ▷ Start│ │       3:12 ●  │
 ├──────────────┤ ├───────────────────┤ ├─────────────────┤ ├───────────────┤  one swimlane per epic
 │ Project board│ │ #47·M Low       … │ │                 │ │               │
 │ 3 tasks      │ │ Board: keyboard…  │ │                 │ │               │
```

- Template frame: `LayoutHeader hasDivider` toolbar (count `Badge`, epic
  filter, show-done / group-by-epic toggles, board settings, New task),
  fixed-width muted column `Card`s with `StatusDot` · title · `InfoTip` ·
  count · add.
- Card: `#47 · M` ref + effort, priority `Badge` (the template's own use),
  title (Heading 4), epic `Token` (hidden in swimlanes), `MoreMenu`, and the
  card's live state: **Start** (not started), elapsed + `StatusDot` (its chat
  is working), open-chat icon (has a chat).
- **Group by epic:** one swimlane per epic under the shared column header;
  the epic label column is `position: sticky; left: 0` inside the sideways
  scroller (`board-epics-scrolled.png` shows it pinned with Backlog/Todo
  scrolled away). Drag uses the template's muted ghost placeholder and a
  floating card on `--shadow-high` (`board-epics-drag.png`).
- **Both** layout: the project chat docks in the end panel with a compact
  composer (pickers collapse to icons).

### 2.6 Task modals — one design, `work-item-detail` content in a Dialog

Screenshots: `task-new.png`, `task-details.png` (running),
`task-details-todo.png` (not started); full-page view for comparison:
`task.png` (vs `ref-work-item-detail.png`)

New task and Task details are **one modal in three states**: "new" is the
editable, empty version of "details". Same frame, same regions, same field
positions; only the values and the footer change.

- **Frame:** the `DialogFormDialog` block (a `Layout` inside the `Dialog`:
  `DialogHeader` / `LayoutContent` / `LayoutFooter`, actions at the end),
  `purpose="form"`. **Width 1120, maxHeight 85dvh**: the settings-dialog
  template's own width.
  At 1400×900 it leaves a 140px gutter each side, so the rail gets 320px and
  the content column about 770px.
- **Main column** (work-item-detail's header and content): the title (a
  `TextInput size="lg"`, "Task title", when new; `Heading 2` + edit when
  set), then the **label-less field row** the template uses: `Selector`s
  with `isLabelHidden`, showing a status dot, a priority `Badge`, an effort
  value and an epic `Token`. Empty fields show an icon plus a placeholder
  ("Priority", "Effort", "Epic") and can be cleared while drafting. Then the
  Description (a 12-row `TextArea`, Markdown, when new; rendered `Markdown` +
  edit when set), then **Its chat** (details only).
- **Rail** (`LayoutPanel` 320, divider): `MetadataList`s like the template's
  rail. **Agent**: Agent / Model / Thinking / Permission as ghost `sm`
  `Selector`s with icons on "Board default" (new and not started), plain
  values once the chat is running. **Checkout**: worktree / branch ("Created
  on start" until then). **Details** (not on new): created, created by.
- **Footer:** new → "Start it right away" checkbox, then Cancel and Create
  task; details → Delete task (destructive, confirmed by an `AlertDialog`),
  then Close. Fields save as they change, so details has no Save.

```
 ┌ Dialog 1120 ───────────────────────────────────────────────────────────────────────────┐
 │ New task  |  Task #42                                                        (…)   ×  │ DialogHeader
 │ ai-leash board                                                                        │
 │ ┌ content ─────────────────────────────────────────┐ ┌ rail 320 ──────────────────────┐│
 │ │ [Task title            ]  |  Astryx: board on…  ✎ │ │ Agent                           ││
 │ │ [● Todo▾] [⚑ Priority▾] [⚖ Effort▾] [▤ Epic▾]     │ │  Agent      ⚙ Board default ▾   ││  new / not started:
 │ │                                                   │ │  Model      ✦ Board default ▾   ││  ghost Selectors;
 │ │ Description                                    ✎ │ │  Thinking   ◌ Board default ▾   ││  running: plain values
 │ │ [ TextArea, Markdown ]  |  rendered Markdown      │ │  Permission ⛉ Board default ▾   ││
 │ │                                                   │ │ Checkout                        ││
 │ │ Its chat  (details only)                          │ │  Worktree   Created on start    ││
 │ │ ┌ ● Not started · Start ┐ | ┌ ● Working for 3:12 ┐│ │  Branch     Created on start    ││
 │ │ └───────────────────────┘   └ Stop · Open chat   ┘│ │ Details (details only)          ││
 │ └───────────────────────────────────────────────────┘ └─────────────────────────────────┘│
 │ ☐ Start it right away      [Cancel] [Create task]  |  [🗑 Delete task]          [Close] │ LayoutFooter
 └───────────────────────────────────────────────────────────────────────────────────────┘
   left of "|" = New task, right = Task details
```

**Recommendation: drop the full-page task view.** Everything it showed now
fits the details dialog, which keeps the board (and its drag targets) in
place behind it. Astryx's Dialog guidance ("keep dialogs focused on a single
task; if the content grows beyond what fits, consider a full page") only
argues for a page once a task holds more than this. The page's one extra,
the Activity feed, has no backend yet (Q4). If it's built later and makes
the dialog too long, that's the time to bring the page back, opened from the
dialog's `…` menu.

### 2.7 Settings — `settings-dialog`

Screenshots: `settings-agents.png`, `settings-chat.png`, `settings-fonts.png`,
`settings-editor.png`, `settings-debug.png`, `settings-crashlog.png`,
`settings-about.png` (vs `ref-settings-dialog.png`)

The template's fixed-height `Dialog` with a `SideNav` (search in
`topContent`, sections Agents / Preferences / App) and a content column:
Heading 2 + supporting description, group titles, muted `SettingsCard`s of
`SettingsRow`s (icon, title, description, control in a fixed column).
Preferences is split into Chat, Fonts (with live previews), External editor
and Debug; Crash log shows the last panic in a `CodeBlock` with
reload / copy / delete.

---

### 2.8 Chat banners, popups and alerts — one route each

Every transient piece of the chat, mocked on the real chat screen
(`src/screens/ChatStatesScreen.tsx`), each built from one stock Astryx
component so they share a look. Screenshot = `shots-v2/<route>.png`.

| Route | What | Astryx part |
|---|---|---|
| `strip-queued-1`, `strip-queued-3` | Queued messages, 1 and 3 | `ChatComposerDrawer` of removable `Token`s (the composer's own drawer; collapse handle because it has a count) |
| `strip-rate-limit` | Claude session limit, counting down to auto-resume ("resuming in 1:42:07", Don't resume / Try now) | `Banner status="warning"` |
| `strip-task-link` | "The project chat isn't following this task" + Hand back to project chat | `Banner status="info"` |
| `strip-error-crash` | Agent process crashed (Show log / Restart agent) | `Banner status="error"` |
| `strip-error-connection` | Connection lost, retrying in 5s (Retry now) | `Banner status="error"` |
| `strip-help` | `/help`: the commands list (`!command`, local and agent `/` commands), dismissable | `Banner status="info"` with a compact `List` body |
| `notice-error`, `notice-restore-failed`, `notice-history-truncated`, `notice-stacked` | The real app's TranscriptNotices: provider error, failed session restore (Start new session), earlier history not shared, and two at once | `Banner` error / error / warning, in the same stack above the composer |
| `popup-slash` | `/` command menu | `ChatComposerInput` trigger → `Typeahead` + `TypeaheadItem` (name + description) |
| `popup-mention` | `@` file mention (planned) | same trigger pattern as Astryx's `ChatComposerInputMentionTrigger` block; file/folder icon + path |
| `popup-model`, `popup-effort`, `popup-permission` | The three composer pickers | `DropdownMenu` (sections per agent for models) |
| `prompt-permission`, `prompt-question` | Permission prompt and elicitation question, in the composer's place | muted-elevation `Card` (Heading 4, supporting subtitle, content, actions end-aligned) |
| `toasts` | "Task #42 moved to Review" (Open), "Copied", error toast | `useToast()`; the app mounts `ToastViewport position="topEnd"` under the title bar, because the default bottom-end sits on the composer's send/stop corner |
| `confirm-delete-conversation` | Delete conversation | `AlertDialog` (destructive action; Cancel focused) |
| `confirm-finish-task` | Finish a task with uncommitted changes: Keep it open / Remove worktree | `AlertDialog` with `cancelLabel` = the safe choice |
| `tooltip` | Tooltip on an icon button (Open in external editor) | `IconButton tooltip` |
| `state-empty`, `state-loading`, `state-error` | Transcript + Sub agents list: empty, loading, error | `EmptyState` (compact in the panel), `Skeleton` rows in each list's own shape; errors say what failed and offer Try again |
| `state-actions-empty`, `state-actions-loading`, `state-actions-error` | Actions list: empty (with Add action), loading, error | same |
| `pill-subagents`, `pill-subagents-open` | Running sub-agents above the composer (planned): "3 sub-agents running", expanding to the list with stop buttons and Stop all | ghost `Button` (Spinner + count + chevron); open = muted `Card` with the Sub agents tab's compact `List` |

**Transcript notices move to the composer stack:** today they're sticky at the
top of the transcript; here they join the strips above the composer, so every
notice lives in one place next to the send it affects and nothing overlays
the transcript as it scrolls. Stacking order, top to bottom: errors, then
warnings, then info, then the composer.

The rules they share:
- **Severity is the Banner's `status`** (warning = needs a decision, info =
  state you can change, error = something broke). Actions are always on the
  end: secondary ghost first, then the one recommended action.
- **Popups anchor to what opened them** (input caret, picker button) and use
  the menu surface; nothing custom.
- **Toasts confirm, they never ask**; anything needing a decision is a
  Banner or an AlertDialog.
- **States use the content's own shape:** skeletons mimic bubbles, prose and
  list rows; empty states say what will appear and how.

## 3. Implementation tasks

Each task updates the `docs/features/*.md` page for its surface, then
`npx tsc --noEmit` and `npx astryx doctor --built .`.

| # | Task | Main files |
|---|---|---|
| 0 | **Theme: switch from `leash` to stock Astryx.** Create `ai-leash` with `--like neutral` and the six 12px chrome settings (§1), `npx astryx theme add ai-leash`, make it the default, remove the `leash` theme (`themes/leash/`, `src/themes/leash/`, its entry in `src/astryx-themes.ts`) Leave the `--al-*` / shadcn variables in `src/index.css` alone: they colour the not-yet-migrated Tailwind surfaces and go away with them (the font preference bridge stays, see Q6). **Replace the AGENTS.md rule** "The `leash` theme should look like ai-leash, not like stock Astryx" with: "The theme is stock Astryx (`neutral`, dark). Don't recolour or respace it; build each surface from its Astryx template and keep the template's frame, gaps and padding. The only theme edit is chrome text on the 12px scale step — change the theme only through `astryx experimental theme editor`, with a reason from Astryx's docs." Expect every surface not yet migrated to look different (blue accent gone) until its task lands. | `themes/*`, `src/themes/*`, `src/astryx-themes.ts`, `src/main.tsx`, `src/index.css`, `AGENTS.md` |
| 1 | **App shell:** title bar `Breadcrumbs`, sidebar collapse toggle (rail top ↔ title bar), New thread / Add project into the sidebar, `TabList` tabs with the in-tab × / middle-click / Delete close, end panel frame | `src/app/App.tsx`, `TitleBar.tsx`, `TitleBarActions.tsx`, `CenterPanel.tsx`, `src/features/tabs/TabStrip.tsx`, `src/features/board/BoardLayoutSwitch.tsx`; docs `ui-shell.md` |
| 2 | **Sidebar:** project groups (Board + chats), status end slots, reveal `MoreMenu`, Done group, the `contain` fix | `src/app/LeftBar.tsx`, `NewConversationPopover.tsx`, `DeleteConversationDialog.tsx`, sidebar state in `src/store/*`; docs `ui-shell.md`, `project-board.md`, `conversation-history.md` |
| 3 | **Side panel:** Files (search + compact `TreeList`), Sub agents / Actions as compact `List`s, terminal look | `src/features/sidebar/SidePanel.tsx`, `TabPicker.tsx`, `tabs/*`, `src/features/tabs/TabContent.tsx`; docs `ui-shell.md`, `actions.md`, `terminal.md` |
| 4 | **New thread:** landing column, "starts with" tokens, starter cards | `src/features/chat/components/empty-states/*`, `ChatPanel.tsx`; docs `agent-chat.md` |
| 5 | **Transcript:** `ChatMessageList` / `ChatMessage` / `ChatToolCalls` / `ChatSystemMessage` / `ChatMessageMetadata` mapping (§2.4). Grouping untouched | `src/features/chat/components/messages/*`, `banners/TranscriptNotices.tsx`, `SubAgentChatTab.tsx`, `src/ui/Markdown.tsx`; docs `agent-chat.md` |
| 6 | **Composer:** `ChatComposer` slots, queued drawer, `Banner` notices (rate limit with countdown, task link, crash / connection errors), checkout bar, permission / question prompts, slash menu, `@` file mention (new), pickers, running sub-agents pill (new), app-wide top-end `ToastViewport`; the transcript / panel empty-loading-error states go with tasks 5 and 3 (§2.8) | `src/features/chat/components/composer/*`, `banners/*`, `popovers/*`; docs `agent-chat.md`, `tools.md` |
| 7 | **Board:** toolbar, columns, cards, epic swimlanes with sticky labels, drag ghost, project-chat dock | `src/features/board/*` (`BoardView`, `TaskCard`, `TaskMeta`, `ProjectBoardView`, `boardLayout.ts`, dialogs); docs `project-board.md` |
| 8 | **Task modals:** one 1120-wide modal in new / not-started / running states (label-less field row, Markdown description, chat state, agent + checkout rail, Delete with AlertDialog); opens from New task and on card click. No full-page view | `src/features/board/TaskDialog.tsx` (split into new + details), `AgentFields.tsx`, `TaskCard.tsx` (click → details), `StartTaskDialog.tsx`; docs `project-board.md` |
| 9 | **Settings:** dialog shell with search, Preferences split into four panels, agent rows | `src/features/settings/*`; docs `ui-shell.md`, `agent-chat.md`, `debug-mode.md`, `crash-logging.md` |

Order: **0 first** (everything else is designed against stock), then
1 → 2 → 3 (frame), 5 → 6 → 4 (chat; 5 and 6 both touch `ChatPanel.tsx`, don't
run them in parallel), 7 → 8, and 9 any time after 0.

---

## 4. Open questions

From v1 (still open):

1. **Sidebar grouping:** group chats under their project (the side-nav
   template; the "Project boards" section goes away), or keep today's flat
   **Project boards / Chats / Done** sections? Grouping drops the
   cross-project "most recent first" order in All projects.
2. **Chat rows on one line:** OK to drop the project · worktree · branch
   line (project = group, branch = checkout bar), maybe keeping it as a
   tooltip?
3. **Side panel drawer (ide vs our tab model):** dock terminal / Action
   output in a bottom drawer as the ide template does, or keep terminals as
   plain tabs that can move between centre and panel (v2 shows tabs)?
4. **Task view:** *now proposed:* details in a dialog, no full page (§2.6).
   Still open: is an **Activity** feed (status moves, chat-to-chat messages)
   worth a backend board-event log? If so it would be a section in the
   details dialog.
5. **Settings split:** split Preferences into Chat / Fonts / External editor
   / Debug, rename "IDE" to "External editor", and add search?
6. **Text size preference:** Settings > Fonts defaults the interface size to
   16px, while Astryx sizes text from a 14px base. Default the preference to
   14 and have it drive `--font-size-base`, so the setting and the theme agree?
7. **New-thread starter cards:** keep four fixed prompts, generate them from
   the project's skills and Actions, or drop them and keep only the "starts
   with" row?
8. **Template conflicts from v1** — v2 settles them by following the
   template: the transcript is centred, priority is the template's `Badge`,
   and the composer keeps its header row (attach + context %). Agent avatars
   are dropped (your call after review). OK?

New in v2:

9. **Stock look vs ai leash identity:** with neutral's monochrome palette
   the only brand colour left is the logo. Acceptable, or should the theme
   take an accent later (through `editor set ai-leash accent …`, as one
   theme setting, never per screen)?
10. **Underline tabs instead of pills:** v2 uses `TabList`'s stock underline
    tabs everywhere, with the in-tab × (§2.1). Two side effects to accept:
    the × is a pointer target inside the tab button rather than its own
    focusable button (keyboard close is Delete / Ctrl+W), and hovering one
    tab hides the selected tab's underline (stock `TabList` behaviour,
    visible in `chat-tabs-close.png`). Drag reordering still needs adding.
    OK?
11. **Template spacing is roomier** than today's app (e.g. sidebar rows,
    settings rows, board card padding). v2 keeps it as the templates
    scaffold it. If it's too airy, the fix is one theme setting
    (`editor set ai-leash spacing tight`), not per-page padding — want that?
12. **Board in Both layout:** at 1400px the board area fits ~2.5 columns,
    so the third is cut at the panel edge and scrolls sideways. Accept, make
    columns narrower in Both (template uses 300), or default boards to the
    Board layout with the chat as a toggle?
13. **Composer queued drawer:** `ChatComposerDrawer` with a count shows its
    collapse handle at the top of the composer. Keep it collapsible (handle
    visible), or drop the count so the drawer is always open and the handle
    goes away?
14. ~~Title bar subtitle~~ — dropped; the title bar is a one-line
    breadcrumb.
15. **Breadcrumb links:** `ai-leash` in the breadcrumb goes to the project's
    board. Is that right, or should it open a project menu
    (`BreadcrumbItem menu`: switch project, open board, project settings)?
16. **Collapsed rail:** collapsed, the sidebar keeps an icon rail (New
    thread, Add project, one folder per project, Done, Settings). Is that
    enough, or should collapse hide the rail completely,
    leaving only the title-bar toggle?
17. **Toast position:** top-end under the title bar (so toasts never cover
    the composer) instead of Astryx's bottom-end default. OK?
18. **Planned pieces mocked here:** the `@` file mention and the running
    sub-agents pill aren't in the app yet. Build them as part of task 6, or
    as separate board tasks?
19. **Task modal "Start it right away":** is a checkbox in the New task
    footer the right place, or should Create have a split button
    (Create / Create and start)?
