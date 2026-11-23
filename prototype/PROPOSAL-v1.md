# ai leash on Astryx templates — layout proposal

A redesign of every ai leash surface on Astryx page templates, prototyped at
`/tmp/al-proto` (Vite + `@astryxdesign/core` 0.7.17 + StyleX, the repo's
`leash` theme copied in and wrapped in `<Theme>` the same way `src/main.tsx`
does). Nothing in the repo was changed.

- Prototype source: `/tmp/al-proto/src` (`shell/`, `chat/`, `screens/`, `data.ts`)
- Screenshots at 1400×900: `/tmp/al-proto/shots/*.png`
- Run it: `cd /tmp/al-proto && npm run dev`, then open `http://localhost:5199/#/<route>`
  (`chat`, `chat-permission`, `chat-question`, `new`, `new-slash`, `board`,
  `board-epics`, `task`, `task-dialog`, `settings/<agents|chat|fonts|editor|debug|crashlog|about>`)

Rules followed in the prototype: no `<div>`, no `className`, no `style={{}}`,
no raw hex. Spacing and colour come from component props, with StyleX tokens
through `xstyle` where props run out. Raw px appear only for structural
widths (rail and column widths, the drawer height). `astryx doctor --built .`:
0 failures. Its one warning flags the token `stylex.create` blocks and the
setup stylesheet, which is the sanctioned route.

---

## 1. What the templates do

The gallery pages at astryx.atmeta.com are rendered on the client, so a fetch
only returns their one-line descriptions. The notes below come from the
template sources scaffolded with `npx astryx template <name>` (copies in
`/tmp/al-templates/`).

| Template | Frame | Spacing / density | Type | Main components | Empty / loading / selected |
|---|---|---|---|---|---|
| **ai-chat-landing** | `Layout contentWidth=720 padding=6`, one centred column (`VStack gap=8 vAlign=center`) | Roomy: gap 8 between blocks, 6 inside | `Text large` greeting + `display-2` headline; cards use `Heading 4` + `xsm` secondary | `ChatComposer` (input min-height 84, `ChatComposerDrawer` of `Token`s, header/footer/send action slots), `ToggleButtonGroup` categories, `Grid minWidth=280` of muted `ClickableCard`s | It *is* the empty state. Selected = the active category toggle |
| **ai-chat** | Full-height `ChatLayout` (composer slot) + optional resizable artifact pane (`ResizeHandle` + transparent `Card` with a bottom-divided `Toolbar`) | `density="spacious"`, centred transcript | Markdown `density="compact"` in ghost bubbles | `ChatMessageList`, `ChatMessage` (user = filled bubble, assistant = avatar + ghost bubbles), `ChatMessageMetadata` (timestamp, status), `ChatToolCalls` (status icon, mono name, target, +/- diff, duration, expandable `resultDetail`), `ChatSystemMessage` (divider / status), `CodeBlock` with title | Running tool = spinner row; no empty state (landing covers it) |
| **ide** | `Layout` with a start `LayoutPanel` (256, 160–400, collapses to 50), a centre code pane, a vertical-resizable bottom drawer (300) and an end inspector (320) | Dense: tree `density="compact"`, inspector `padding=4 gap=3`, `ResizeHandle hasDivider isAlwaysVisible={false}` | `Heading 3` file name + supporting path; `CodeBlock size="sm"` | `TextInput` search + `TreeList`, drawer `TabList size=sm` (Terminal/Problems/Output), `SegmentedControl layout=fill`, `MetadataList`, `List` with time end content | Selected file in the tree; no empty states |
| **kanban-board** | `LayoutHeader hasDivider padding=4` with a `Toolbar`, then a horizontal row of columns that scrolls sideways | Columns 300 wide, gap 4; column header padding 3, body padding 2; cards padding 3, gap 2 | `Heading 3` board title + count `Badge`; `Heading 4` column and card titles; supporting description (2 lines) | Muted `Card` per column with a `Layout` header (`StatusDot`, title, `InfoTip`, count); `Card` per item (ref + priority `Badge`, `MoreMenu` with "Move to …"); pointer-event drag with a muted ghost placeholder and a floating card on `--shadow-high` | `EmptyState isCompact` with an icon per empty column; stacks vertically below 768px |
| **settings-dialog** | `Dialog width=1120 padding=0` with one fixed height; `Layout start=SideNav content=LayoutContent` | Rows padding 4, control column 192 wide, rows stack together at a 480px container width | `Heading 4` "Settings" in the rail; `Heading 2` panel title + supporting description; group titles are supporting semibold | `SideNav` with a search `TextInput` in `topContent`, `SideNavSection` per group; `SettingsCard` (muted `Card padding=0`, subtle `Divider`s), `SettingsRow` (required icon, title, description, control); sticky close `IconButton` | Search swaps the nav for a `ListItem` results list; selected nav item |
| **shell-side-nav** | `AppShell contentPadding=0` + one `SideNav` (collapsible, resizable 300, 220–420); no top bar | Children in `VStack gap=0.5` | `SideNavHeading` with `NavIcon` | Hidden-header sections: Menu (New chat, Search, Library), then one collapsible `SideNavItem` per workspace holding its conversations; `StatusDot` end content; `MoreMenu` revealed by `useContainerReveal`; delete through `AlertDialog`; footer section (Settings, account) | Selected conversation; status dots for active / review / blocked |
| **work-item-detail** | `Layout contentWidth=1260`: `LayoutHeader` + content column + end `LayoutPanel` (340, `hasDivider`) | Roomy: header padding 6, sections padding 6 split by `Divider`s, rail gap 10 | `Heading 1` title (2 lines), section `Heading 2`, rail `Heading 3` | Breadcrumb (`Link` back, vertical `Divider`s), a row of `Selector`s (status with `StatusDot`, priority, assignee) + `Tokenizer`; Description, Subtasks (`ProgressBar` + `CheckboxListItem`), Attachments (`ClickableCard`), Comments and activity feed; rail `MetadataList`, `AvatarGroup`, linked items | Below 1024px the rail drops under the content |

Common thread: every template is roomier than ai leash. The leash theme's
`spacing tight` dial does most of the tightening. Where the prototype goes
further, it does it with smaller spacing steps on the components (padding
2–4 instead of 6, gap 1.5–4 instead of 6–10), not with overrides.

---

## 2. Surfaces

### 2.1 App shell — `ide` + `shell-side-nav`

Screenshots: `shots/chat.png`, `shots/chat-permission.png`, `shots/chat-question.png`

```
┌────────────────┬──────────────────────────────────────────────┬──────────────────────────┐
│ ai leash       │ ai-leash / #42 Astryx: board on the kanban…  │  </>  [▶ dev ▾]   – □ ×  │ TopNav
├────────────────┼──────────────────────────────────────────────┼──────────────────────────┤
│ All projects ▾ ⚲ +│ (Agent) (Audit entry grouping ×)          │ (Files)(Sub agents)(Act…)+│ pill tabs
│ ✎ New thread ^N │──────────────────────────────────────────────│──────────────────────────│
│ ▾ ai-leash      │                                              │ [⌕ Search files       ]  │
│   ▦ Board  ◌ 3 2│              transcript                      │ ▸ docs                   │
│   #42 Astryx…3:12◌│           (ChatLayout, compact)            │ ▾ src                    │
│   Fix ACP sess… │                                              │   ▾ app …                │
│   #38 Split…   ●│                                              │   ▾ features/board       │
│ ▾ tidepool      │                                              │     ▌BoardView.tsx▐      │
│   ▦ Board     1 │  ┌ queued strip ──────────────────────────┐  │                          │
│ ▸ dotfiles      │  ┌ composer ──────────────────────────────┐  │                          │
│ ─────────────── │  │ Ask the agent…                         │  │──────────────────────────│
│ ▸ Done        3 │  │ 📎 Claude Code·Opus ▾ High ▾ Edits ▾ 62% Queue ■│ (optional terminal     │
│                 │  └────────────────────────────────────────┘  │  drawer, ide template)   │
│ ⚙ Settings      │   ⎇ task-42 ▾                task/42-… ▾     │                          │
└────────────────┴──────────────────────────────────────────────┴──────────────────────────┘
  SideNav 248          centre (CenterPanel tabs + chat)             LayoutPanel 380, resizable
```

- **Frame:** `AppShell variant="wash"` with `TopNav` (the title bar) and the
  side-nav template's `SideNav resizable`. Then a `Layout` with the centre in
  `content` and the ide template's inspector as an end `LayoutPanel` behind a
  `ResizeHandle hasDivider`. This is mostly what `App.tsx` already does; the
  change is what goes inside each region.
- **Title bar:** unchanged in role: logo, breadcrumb (project / title), Open
  in IDE, the Actions split button, window controls, and the debug bug button
  when debug mode is on. The breadcrumb starts where the chat column starts.
  On a board the Open and Actions controls give way to the
  Board / Both / Chat `SegmentedControl`.
- **Moved:** the **New thread** button leaves the title bar and becomes the
  first row of the sidebar (`SideNav topContent`, with a `Kbd` hint), the way
  the side-nav template puts "New chat" first.
- **Centre tabs:** a `TabList size="sm"` of pill tabs (Agent, sub-agent
  tabs). A tab's close mark cannot be an `IconButton` inside `Tab endContent`,
  because that nests a button inside a button and React refuses it. The real
  `TabStrip` keeps its own close control beside the tab.

### 2.2 Left bar — `shell-side-nav`

```
 All projects ▾   ⚲  ⊕            header: project filter, task-chat filter, add project
 ✎ New thread           Ctrl N    topContent
 ▾ 📁 ai-leash                    one collapsible SideNavItem per project …
     ▦ Board      ◌  (3) (2)      … its board first: Badge counts (in progress, review)
     #42 Astryx: board…  3:12 ◌   … then its chats: elapsed + Spinner while working
     #38 Split Prefer…        ●   StatusDot warning (pulsing) = needs approval
     Why does the PTY…        ●   StatusDot warning = waiting for your answer
 ▸ 📁 dotfiles
 ─────────────
 ▸ 🗄 Done                   3    collapsed by default
 ⚙ Settings                       footer
```

Changes compared with today's LeftBar:

- **Grouped by project instead of flat sections.** The side-nav template
  groups conversations under workspaces, and that maps onto projects. Each
  project row holds its **Board** and then its chats, so the separate
  "Project boards" section goes away. The board's counts stay, now as
  `Badge`s, which are counts and so fit the "Badge = counts only" rule.
  The "More boards (n)" overflow is no longer needed: a project you haven't
  used stays collapsed.
- **One line per chat.** The second line (project · worktree · branch)
  is dropped. The project is now the group, the task number is in the label
  (`#42 …`), and the worktree and branch are shown in the composer's
  checkout bar. The old line could move into a tooltip.
- **Status:** working = elapsed time + `Spinner`; approval = pulsing warning
  `StatusDot`; question = warning `StatusDot`. The hover-to-"Mark as done"
  swap and the context menu become a `MoreMenu` revealed with
  `useContainerReveal` (Mark as done, Open in new tab, Delete conversation),
  which also fixes today's missing keyboard path to Mark as done.
- **Kept:** the project filter `Selector`, the task-chat filter
  (all / grouped at top / hidden), Add project, collapse state remembered
  per group, and the Done group with reopen.
- **Astryx quirk to carry into the real build:** a collapsible `SideNavItem`
  lays its children out in a grid whose item takes the rows' min-content
  width, so long titles push the end slots (status, counts) out of the rail.
  `contain: inline-size` on the children's `VStack` fixes it
  (`/tmp/al-proto/src/shell/LeftBar.tsx`, `styles.nested`).

### 2.3 Side panel — `ide` (inspector + bottom drawer)

Screenshots: Files in `chat.png`, Sub agents in `chat-permission.png`,
Actions with the terminal drawer in `chat-question.png`

```
 (Files)(Sub agents)(Actions)(Terminal)(BoardView.tsx) ›  +
 ─────────────────────────────────────────────────────────
 Files:      [⌕ Search files]  + TreeList density=compact (selected file highlighted)
 Sub agents: List compact — ◌/● status · description · model · state · time · ■ stop / × remove
 Actions:    List compact — ● dev  npm run tauri dev   running  ✎ 🗑 ■
                            ● lint fix …               exited 1 ✎ 🗑 ▶
             + Add action
 ─────────────────────────────────────────────────────────
 ▣ dev · npm run tauri dev · running                    ×   ← optional drawer
 $ npm run tauri dev …                                       (ide template)
```

- Pill `TabList` + `+` (the tab picker stays). Tabs still move between the
  centre and the panel.
- **Files** gets the ide template's search box above the tree.
- **Sub agents** and **Actions** become compact `List`s with a `StatusDot`
  or `Spinner` in front, status text and row actions at the end.
- **New and optional:** the ide template's bottom drawer, used for the
  running Action's or a terminal's output under whichever tab is active. See
  the open questions; today these are ordinary tabs.

### 2.4 New thread — `ai-chat-landing`

Screenshots: `shots/new.png`, `shots/new-slash.png` (slash menu open)

```
            ✦ New thread in ai-leash
            What should the agent work on?              display-3
            ┌──────────────────────────────────────────────┐
            │ Describe the task, / for commands, ! for shell│
            │ 📎 Claude Code · Opus 5.5 ▾  High ▾  Default ▾  ↑│
            └──────────────────────────────────────────────┘
              ⎇ primary ▾                  astryx-migration ▾   worktree is still pickable
            Starts with [AGENTS.md] [Project memory] [3 skills] [4 actions]
            ┌ Plan this as board tasks ┐ ┌ Review the current diff ┐
            └──────────────────────────┘ └─────────────────────────┘
            ┌ Run the tests and fix …  ┐ ┌ Explain how this part … ┐
```

- The template's centred 720 column, greeting and composer, with our pickers
  in the composer footer and the worktree/branch bar docked under it (the
  worktree can only be picked before the first message, so it matters most
  here).
- **New:** a "Starts with" row of `Token`s showing what context the agent will
  get (AGENTS.md, memory, skills, actions), which ai leash already computes
  for the system-context row.
- **New, optional:** starter-prompt cards in place of the template's category
  toggles (no categories here). See the open questions.
- Replaces `NewThreadHero` / `ChatHeroBadge` / `EmptyTranscript`.

### 2.5 Chat transcript and composer — `ai-chat` (visual design only)

Screenshots: `chat.png` (working turn, queued message, sub-agents),
`chat-permission.png` (permission ask, rate-limit and task-link strips),
`chat-question.png` (elicitation form)

```
 › 📜 System context  AGENTS.md · docs/AGENTS.md · project memory · 3 skills …
                                        ↗ From Project chat
                         ╭ #42 Astryx: board on the kanban template … ╮  accent ring
                         ╰───────────────────────────────────────────╯ 10:02 ⧉
 › Worked for 4m 51s  3 thoughts, 14 tools used, 2 messages             our WorkSummary
 The board now renders on the template's frame: …                       ghost bubble, Markdown
 10:07 ⧉
 › 📥 Note from #40 Terminal: honour code font size  Moved to Review …  our NoteRow
                         ╭ Looks good. In group-by-epic, keep …       ╮
 › Thought for 6s  The lane label has to stick …                        italic ActivityRow
 ✓ read  src/features/board/BoardView.tsx  41ms                          ChatToolCalls row
 ⌄ Show all (1 thought, 3 tools used)                                   our ActivityGroup
 ⌄ 🤖 spawn_sub_agent  2 threads
   │ ◌ Check drag between epic rows …  claude-sonnet-5-5 · grep …  1:04 ↗
   │ ● List every place that reads task.epic  … returned 6 call sites 38s ↗
 While those run I'll make the lane label sticky inside the scroller.
 ◌ edit  src/features/board/BoardView.tsx  +18 −6  ⌄ (diff CodeBlock when open)
 ◌ Working for 3:12
      ┌ ⏱ Queued: Also run the board tests once the edit lands       × ┐   docked strips
 ┌──────────────────────────────────────────────────────────────────────┐
 │ Ask the agent, / for commands, ! for shell                           │
 │ 📎 Claude Code · Opus 5.5 ▾  🧠 High ▾  🛡 Accept edits ▾   62% of context  Queue ■│
 └──────────────────────────────────────────────────────────────────────┘
      └ ⎇ task-42 ▾                                  task/42-astryx-board ▾ ┘ checkout bar
```

- **Taken from the template:** `ChatLayout` + `ChatMessageList`, filled user
  bubbles with `ChatMessageMetadata` (time + copy), assistant text in ghost
  bubbles with Astryx `Markdown density="compact"`, `ChatToolCalls` rows for
  tool calls (status icon, mono name, target, +/- counts, duration,
  expandable diff/output in `resultDetail`), `ChatSystemMessage` for status
  lines, and `ChatComposer` for the box.
- **Kept ours (unchanged logic, `entryGrouping.ts` untouched):**
  - Worked-for rows
  - ActivityGroup's "Show all (n thoughts, m tools used)", showing the latest step
  - Thinking rows
  - Notes
  - "From …" messages from other chats (accent ring + link)
  - `spawn_sub_agent` threads nested under their call, each row opening the
    sub-agent's tab
  - The system-context row
  - The Working-for indicator
  - The message footer (timestamp, copy, Retry on the last reply, Worked for)
  
  Our non-tool rows are restyled to match a `ChatToolCalls` row (same height,
  chevron, icon, label, dim one-line summary, detail hung beside a 2px rule)
  so the transcript reads as one system.
- **Composer:**
  - The three pickers go in `footerActions` with Attach in front, so the
    composer's header row is dropped.
  - Context usage becomes text ("62% of context") in `sendActions`, beside
    Queue (shown while sending) and Send/Stop.
  - The slash menu opens over the box (`new-slash.png`).
  - Attachments use `ChatComposerDrawer` with `Token`s.
- **Docked strips stay ours:** queued messages, the Claude rate-limit notice
  (with "Yes, resume automatically" / "No"), the task-link notice ("Hand back
  to project chat") and the help overlay sit above the box. The
  worktree/branch bar sits below it. They are built from layout primitives,
  as `DockedBanner` is today.
- **Permission and elicitation prompts** replace the box, as they do now.
  - Permission: a `Card` with the request, the command or diff in a
    `CodeBlock`, and Deny / Approve (Enter).
  - Elicitation: a `RadioList`, an optional note, and Decline / Skip / Next.
- **Dropped:** assistant avatars (the template has them, but they cost a
  column in a dense harness).

### 2.6 Project board — `kanban-board`

Screenshots: `board.png` (Both layout, project chat docked),
`board-epics.png` (Board layout, group by epic, Show done on, a drop ghost in
Review), `board-epics-scrolled.png` (scrolled sideways: the epic labels stay
pinned)

```
 ai-leash board  All epics ▾        (○ Group by epic) (○ Show done ③) │ ≋ Epics  ⚙  [+ New task]
 ─────────────────────────────────────────────────────────────────────────────────────
              ● Backlog 3    +   ● Todo 3     +   ● In progress 3 +   ● Review 2   +   ● Done 3
 ┌──────────┐┌─────────────────┐┌──────────────┐┌───────────────┐┌──────────────┐┌─────────
 │[Astryx   ]││                 ││#44 · L [High]⋯││#42 · L [High] ⋯││#38 · S [Med] ⋯││#37 · XL …
 │ 5 tasks  ││                 ││Astryx: side … ││Astryx: board …  ││Split Prefer…  ││
 │ (sticky) ││                 ││[Astryx] ▷Start││[Astryx] 3:12 ◌ 💬││[Astryx]    💬 ││
 ├──────────┤├─────────────────┤├──────────────┤├───────────────┤├──────────────┤├─────────
 │[Project  ]││#47 · M [Low]   ⋯││              ││               ││#39 …         ││#36 …
 │ board    ││Board: keyboard… ││              ││               │╎ drop ghost  ╎│
 …                                                                                 Load 12 older
```

- The template's `LayoutHeader` + `Toolbar`:
  - Start: board title, then the epic filter.
  - End: Group by epic and Show done as `Switch`es (Show done's count in a
    `Badge`), Epics, board settings, and the primary New task.
- **Columns** (ungrouped): muted `Card`, 264 wide, with a `Layout` header:
  `StatusDot` (neutral / neutral / accent / warning / success), title, count,
  `+`. An empty column shows `EmptyState isCompact`.
- **Cards:**
  - Top line: number + effort as supporting text, priority as a coloured
    `Token` (AGENTS.md reserves `Badge` for counts), and a `MoreMenu`.
  - Title: 2 lines.
  - Bottom line: the epic `Token`, then elapsed time + `Spinner` while the
    task's chat works, and **Start** or the **Open its chat** icon.
- **Group by epic:** one swimlane per epic (plus "No epic") under one shared
  column header row that sticks to the top. The lane's label (epic `Token` +
  count) is `position: sticky` on the inline start, so it stays pinned while
  the board scrolls sideways. Dragging into another lane changes the epic;
  the template's muted ghost placeholder marks the drop slot.
- **Kept:** dnd-kit drag (the template's pointer code is only a reference),
  Show done hidden by default, Load older at the foot of Done, and the project
  chat docked right in **Both** (a `LayoutPanel` with a small header and a
  compact `ChatLayout`, no checkout bar because it always works in the main
  checkout).

### 2.7 Task view and task dialog — `work-item-detail`

Screenshots: `task.png`, `task-dialog.png`

```
 ← ai-leash board │ #42 │ Astryx migration                         ✎  [↗ Open its chat]  ⋯
 Astryx: board on the kanban template                                         Heading 2
 [● In progress ▾] [High ▾] [Effort L ▾] [Astryx migration ▾]                inline-editable
 ─────────────────────────────────────────────────────────────┬───────────────────────────
 Description                                                  │ Details
   Markdown                                                   │   Created   Today, 09:31
 ───────────────────────────────                              │ Agent
 Its chat                               ■ Stop  [↗ Open its chat]│  Agent      Claude Code
 ┌ ◌ Working for 3:12  edit …BoardView.tsx · 2 sub-agents ┐   │   Model      Opus 5.5
 │ Last reply: "The board now renders …"                   │   │   Thinking   High
 └─────────────────────────────────────────────────────────┘   │   Permission Accept edits
 ───────────────────────────────                              │ Checkout
 Activity                                                     │   Worktree   task-42
  📥 Project chat created this task in Todo           09:31   │   Branch     task/42-astryx-board
  🤖 Project chat started it with Claude Code …       09:31   │   Project chat  Following
  ⎇ ai leash created worktree task-42 …               09:31   │
  💬 #42 → Project chat: "Columns done. …"            10:07   │
```

- **New: a task view.** Clicking a card opens a full view in the board area,
  the way the work-item-detail template shows an item, instead of the edit
  dialog:
  - Header: breadcrumb back to the board; status, priority, effort and epic
    as `Selector`s you can edit in place.
  - Content: Description (Markdown), **Its chat** (live state + last reply +
    Stop / Open), and an **Activity** feed.
  - Rail: the agent settings and the checkout (worktree, branch, whether the
    project chat follows it, with Hand back).
  
  Status, priority, effort and epic sit only in the header, not again in the
  rail.
- **Task dialog** (New task, and quick edit): the same header `Selector` row
  under a title `TextInput`, a description `TextArea`, and the Agent fields
  (Agent / Model / Thinking / Permission, defaulting to "Board default").
  Cancel / Create task.
- **New backend need:** the Activity feed needs a task event log (created,
  started, status changes, worktree created) plus the messages between task
  chat and project chat. The messages exist in the transcripts; the board
  events do not. See the open questions.

### 2.8 Settings — `settings-dialog`

Screenshots: `settings-agents.png`, `settings-chat.png`, `settings-fonts.png`,
`settings-editor.png`, `settings-debug.png`, `settings-crashlog.png`,
`settings-about.png`

```
 ┌──────────────────────┬──────────────────────────────────────────────────────┐
 │ Settings             │ Agents                                            ×  │
 │ [⌕ Search settings ] │ Providers and external agents the chat bar can pick… │
 │ Agents               │ Agents                                + Add an agent │
 │  🤖 Agents  ◀        │ ┌──────────────────────────────────────────────────┐ │
 │ Preferences          │ │ >_ Claude Code · default for new conversations ⏻ ✎ 🗑│ │
 │  💬 Chat             │ │    ACP · npx -y @agentclientprotocol/claude-agent… │ │
 │  T  Fonts            │ ├──────────────────────────────────────────────────┤ │
 │  </> External editor │ │ >_ GitHub Copilot          Make default  ⏻ ✎ 🗑 │ │
 │  🐞 Debug            │ │ ⚙ Local Ollama … 9 models  Make default  ⏻ ✎ 🗑 │ │
 │ App                  │ │ ▤ OpenRouter (turned off)               ○ ✎ 🗑 │ │
 │  ⚠ Crash log         │ └──────────────────────────────────────────────────┘ │
 │  ⓘ About             │                                                      │
 └──────────────────────┴──────────────────────────────────────────────────────┘
   Dialog 1000 × min(760, 100dvh − 2rem), fixed height so the frame never jumps
```

- The template's shell: a `SideNav` with a search box and grouped sections,
  and a content pane with the panel title, description and a close button.
  Every panel is `SettingsCard`s of `SettingsRow`s (icon, title,
  description, control).
- **Changes:**
  - **Preferences is split** into four nav entries: **Chat** (compose mode,
    collapse finished turns, max box height), **Fonts** (interface and code
    family + size + Browse, with a preview), **External editor** (today's
    "IDE" section: the Open command), and **Debug**.
  - **Agents** cards become rows with an enable `Switch` (was a checkbox),
    Make default (was "click the card"), Edit and Delete.
  - **Crash log** is a `CodeBlock` with Refresh / Copy / Clear.
  - **About** shows the wordmark, version and commit, and the source link.
- **New:** settings search (template feature). It is cheap here because every
  row has a title and description to match against.
- The add/edit agent form keeps its current fields and opens in the content
  pane in place of the list.

---

## 3. Theme changes (leash)

Run these from the repo root. Both are already applied to the prototype's
copy of the theme, and the editor's pictures (`themes/leash/preview.png`,
`sheet-navigation.png` in `/tmp/al-proto`) were checked.

```bash
# Body / label / code text 13px → 14px, supporting text and pill tabs 11px → 12px
# (the leash tab setting already points tabs at --font-size-sm, so they follow).
npx astryx experimental theme editor set leash text-size medium

# Selected sidebar / settings-nav row: --color-background-muted (#17181c) is
# nearly invisible on the wash rail; match the selected pill tab's tint.
npx astryx experimental theme editor set leash background-color "rgba(255, 255, 255, 0.08)" --on side-nav-item --state selected
```

Then regenerate the copy the app imports (as after any leash change):
`npx astryx experimental theme editor show leash --png`, which rewrites
`src/themes/leash/*`. Look at the pictures.

Not changed, but worth knowing:
- The editor reports two contrast problems that already exist in the repo's
  theme: the accent progress-bar fill on its track (1.20:1) and the slider
  thumb (2.89:1). Neither appears in the proposed screens.
- `src/index.css` still maps `--font-family-*` to the font preferences at
  runtime. That stays, because the user can change fonts. See open question 6
  for how the size preference should map onto the 14px base.

---

## 4. Implementation tasks (one per surface)

Each task also updates the `docs/features/*.md` page that describes its
surface (AGENTS.md: docs are kept in sync), then `npx tsc --noEmit` and
`astryx doctor --built .`.

| # | Task | Files |
|---|---|---|
| 0 | **Theme**: the two `editor set` lines above, and regenerate | `themes/leash/*`, `src/themes/leash/*` (generated), `src/astryx-themes.ts` (unchanged unless re-added) |
| 1 | **App shell**: TopNav content, New thread moved out, centre pill tabs, end panel frame | `src/app/App.tsx`, `src/app/TitleBar.tsx`, `src/app/TitleBarActions.tsx`, `src/app/OpenInIdeButton.tsx`, `src/app/CenterPanel.tsx`, `src/features/tabs/TabStrip.tsx`, `src/features/board/BoardLayoutSwitch.tsx`; docs `ui-shell.md` |
| 2 | **Left bar**: project groups (Board + chats), status end slots, reveal `MoreMenu`, Done group, the `contain` fix | `src/app/LeftBar.tsx`, `src/app/NewConversationPopover.tsx`, `src/app/DeleteConversationDialog.tsx`, the sidebar-collapse state in `src/store/*`; docs `ui-shell.md`, `project-board.md` ("In the sidebar"), `conversation-history.md` |
| 3 | **Side panel**: pill tabs + picker, Files search + compact `TreeList`, Sub agents / Actions as compact `List`s, the drawer if wanted (open question 3) | `src/features/sidebar/SidePanel.tsx`, `TabPicker.tsx`, `tabs/FileTree.tsx`, `tabs/SubAgentsTab.tsx`, `tabs/ActionsTab.tsx`, `tabs/ActionTerminalTab.tsx`, `tabs/TerminalPanel.tsx`, `tabs/FileEditorTab.tsx`, `src/features/tabs/TabContent.tsx`, `tabKinds.ts`; docs `ui-shell.md`, `actions.md`, `terminal.md`, `editor.md` |
| 4 | **New thread**: landing column, "Starts with" tokens, starter cards (if kept) | `src/features/chat/components/empty-states/NewThreadHero.tsx`, `ChatHeroBadge.tsx`, `EmptyTranscript.tsx`, `src/features/chat/ChatPanel.tsx` (floating vs centred composer); docs `agent-chat.md` |
| 5 | **Transcript**: `ChatLayout`/`ChatMessageList`/`ChatMessage`, `ChatToolCalls` rows, ActivityRow restyle, sub-agent threads, From/Note rows, footer. Grouping untouched | `src/features/chat/components/messages/*` (`ChatEntryList`, `ChatEntryRenderer`, `ActivityRow`, `ActivityGroup`, `ToolEntry`, `SubEntryLine`, `WorkSummary`, `FromChat`, `MessageFooter`, `SystemPromptRow`, `WorkingForIndicator`, `SectionLabel`), `banners/TranscriptNotices.tsx`, `src/features/chat/SubAgentChatTab.tsx`, `src/ui/Markdown.tsx` (Astryx `Markdown`, keeping the code-block header with "Open in a new terminal"); docs `agent-chat.md` |
| 6 | **Composer**: `ChatComposer` slots, pickers in the footer, context %, Queue, slash menu, strips, checkout bar, permission and elicitation prompts | `src/features/chat/components/composer/*` (`ChatComposer`, `ChatInputBar`, `ChatToolbar`, `ContextUsageRing`, `checkout/*`), `banners/*` (`DockedBanner`, `QueuedMessageBanner`, `ClaudeRateLimitBanner`, `TaskLinkBanner`, `HelpBanner`, `ChatBanners`), `popovers/*` (`PermissionPopover`, `ElicitationPopover`, `SlashCommandMenu`, `ModelPickerPopover`, `EffortPickerPopover`, `PermissionModePopover`, `InputAnchoredPopover`); docs `agent-chat.md`, `tools.md` |
| 7 | **Board**: toolbar, columns, cards, epic swimlanes with sticky labels, drop ghost, project-chat dock | `src/features/board/BoardView.tsx`, `TaskCard.tsx`, `TaskMeta.tsx`, `ProjectBoardView.tsx`, `boardLayout.ts`, `EpicsDialog.tsx`, `BoardSettingsDialog.tsx`, `StartTaskDialog.tsx`, `useFinishTask.tsx`; docs `project-board.md` |
| 8 | **Task view + dialog**: new task view in the board area, header `Selector`s, rail; dialog rebuilt; (optional) task activity log | new `src/features/board/TaskView.tsx`, `TaskDialog.tsx`, `AgentFields.tsx`, `useIsBoardView.ts` + the store slice that routes board ↔ task view; optional backend: `src-tauri/src/db/*` + board events for Activity; docs `project-board.md` |
| 9 | **Settings**: dialog shell with search, Preferences split into four panels, agent rows | `src/features/settings/SettingsModal.tsx`, `tabs/AgentsSettingsTab.tsx`, `tabs/PreferencesSettingsTab.tsx` (split into Chat / Fonts / Editor / Debug panels), `tabs/SettingsParts.tsx`, `tabs/ToggleRow.tsx`, `tabs/FontFamilyPicker.tsx`, `tabs/CrashLogTab.tsx`, `tabs/AboutTab.tsx`; docs `ui-shell.md` (Preferences), `agent-chat.md`, `debug-mode.md`, `crash-logging.md` (they name "Settings > Preferences > …") |

Suggested order: 0 → 1 → 2 → 3 (frame first), then 5 → 6 → 4 (chat), then 7
→ 8, and 9 at any point. 5 and 6 touch `ChatPanel.tsx` together, so don't run
them in parallel.

---

## 5. Open questions

1. **Sidebar grouping:** group chats under their project (the side-nav
   template; the "Project boards" section goes away), or keep today's flat
   **Project boards / Chats / Done** sections restyled? Grouping drops the
   cross-project "most recent first" order in All projects.
2. **Chat rows on one line:** OK to drop the project · worktree · branch
   line (project = group, branch = checkout bar), maybe keeping it as a
   tooltip?
3. **Side panel drawer (ide vs our tab model):** dock terminal / Action
   output in a bottom drawer under the active tab, as the ide template does?
   It conflicts with "every tab can move between centre and panel", so the
   alternative is to keep terminals as plain tabs (the prototype shows both).
4. **Task view:** open existing tasks in a full view (work-item-detail) and
   keep the dialog only for New task / quick edit? And is the **Activity**
   feed worth a new board-event log in the backend, or should it show only the
   chat-to-chat messages that already exist (or be dropped)?
5. **Settings split:** split Preferences into Chat / Fonts / External editor
   / Debug, rename "IDE" to "External editor", and add search?
6. **Text size preference:** Settings > Fonts defaults the interface size to
   16px and scales from there, while Astryx now sizes text in rem from a 14px
   base. Should the preference default to 14 and drive Astryx's
   `--font-size-base` (or the root font size), so the setting and the theme
   agree?
7. **New-thread starter cards:** keep the four fixed prompts, generate them
   from the project's skills and Actions, or drop them and keep only the
   "Starts with" row?
8. **Template conflicts settled in the prototype:**
   - Assistant avatars dropped (ai-chat has them).
   - Transcript density `compact`, full width (ai-chat uses `spacious`,
     centred).
   - Priority shown as a coloured `Token`, not a `Badge` (kanban-board uses
     `Badge`; AGENTS.md reserves `Badge` for counts).
   - Composer header row dropped: Attach moved to the footer, context usage
     shown as text instead of the ring.
   
   OK with these?
