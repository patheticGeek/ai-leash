//! Standing guidance, delivered without the user having to ask for it:
//! folded into the native agent's system prompt
//! (`context::build_system_prompt`) and returned as the `instructions` of
//! the MCP bridge's `initialize` response for ACP agents
//! (`mcp_bridge::client`). One builder, `guidance`, makes it for both from
//! a `ChatContext`, in three parts: what AI Leash is, what this chat is
//! ("This chat", stated as facts for its kind), then the tool rules. Tool
//! descriptions say what a tool does; this says when to pick it, and how
//! tools chain together — the part a model won't work out from a flat
//! list of schemas.

use crate::chat_context::{AgentBackend, ChatContext, ChatKind};

/// Its own paragraph, appended to every agent's guidance: the chat
/// renders HTML in a sandboxed frame (`src/ui/HtmlPreview.tsx`), and agents
/// only use that if told it exists.
const HTML_PREVIEWS: &str = "\n\nHTML previews: the chat renders a fenced code block tagged `html` as a live preview (with a Preview / Code switch). When the user asks for a UI prototype, mockup or small interactive demo, show it one of two ways, whichever suits the request: put one complete, self-contained HTML document in such a block in your reply, or write it to an `.html` file in the project, which gets a Preview button on its tool call in the chat, and point the user to that button. Either way, put all CSS and JavaScript inline: the preview is sandboxed with no network access (no CDNs, web fonts, remote images or fetch) and can't reach the app, storage or other pages. Images can be inline SVG or `data:` URLs. Don't re-create a page in the chat any other way (as a ```ui block, a table or prose).";

/// The whole guidance for one chat. Sub-agents aren't told about
/// `spawn_sub_agent`, which they don't get.
pub fn guidance(ctx: &ChatContext) -> String {
    let mut out = String::from("# AI Leash\n\n");
    out.push_str(&intro(ctx));
    out.push_str("\n\n# This chat\n\n");
    out.push_str(&this_chat(ctx));
    out.push_str("\n\n# Using your tools\n\n");
    out.push_str(&tool_rules(ctx).join("\n"));
    out.push_str("\n\n");
    out.push_str(rich_reply_guidance());
    out.push_str(HTML_PREVIEWS);
    out
}

/// (a) What AI Leash is, and why to act through its tools.
fn intro(ctx: &ChatContext) -> String {
    let lead = "You are running inside AI Leash, an agentic harness. ";
    let sub = ctx.allows_sub_agents();
    match ctx.backend {
        AgentBackend::Native => format!(
            "{lead}The user follows your work through the harness's UI, which renders every tool call you make: file edits as reviewable diffs, commands as tool entries in the chat, Actions in the Actions tab{}. Work done any other way is invisible to them. So act through your tools rather than describing what you would do or asking the user to do it themselves, and don't wait to be told to use them.",
            if sub { ", sub-agents in the Sub Agents tab" } else { "" },
        ),
        AgentBackend::Acp => format!(
            "{lead}The user follows your work through the harness's UI, which only shows what goes through the harness's own tools below: Actions appear in the Actions tab, {}memory in the project's notes. Where one of these does the same job as a built-in feature of yours (background shell processes, {}your own memory files), prefer the AI Leash tool so the user can see and manage what is going on. Use them proactively — don't wait to be asked.",
            if sub { "sub-agents in the Sub Agents tab, " } else { "" },
            if sub { "your own sub-agent/task tool, " } else { "" },
        ),
    }
}

/// (b) What this chat is for, as facts — only its own kind's.
fn this_chat(ctx: &ChatContext) -> String {
    let project = format!("**{}** (`{}`)", ctx.project_name, ctx.project_root);
    let in_worktree = ctx.checkout != ctx.project_root;
    match &ctx.kind {
        ChatKind::Project => format!(
            "This is the project chat of {project}, shown beside its board. Here you plan and delegate: turn requests into tasks with `create_tasks`, start them with `start_task`, and give a started task instructions with `send_message` to its number (`\"#12\"`). Task chats do the work and report back here with `send_message`; their updates arrive in this chat on their own. The user reviews each task's work and merges it."
        ),
        ChatKind::Task {
            number,
            title,
            branch,
            worktree_path,
        } => {
            let place = match (branch, worktree_path) {
                (Some(b), Some(w)) => format!("on branch `{b}` in the worktree `{w}`"),
                (None, Some(w)) => format!("in the worktree `{w}`"),
                (Some(b), None) => format!("on branch `{b}` in the project's main checkout"),
                (None, None) => "in the project's main checkout".to_string(),
            };
            format!(
                "This is the chat of task #{number}, *{title}*, on the board of {project}. You work {place}.\n\n\
                 - When your work on it is done, set its status to `review` with `update_task` (never `done`: the user reviews and merges it, then moves it to Done) and summarise what you changed and anything left for the reviewer.\n\
                 - If you're blocked or need a decision, report it to the project chat with `send_message` to `\"project\"`.\n\
                 - Work outside this task's scope goes on the board as new tasks with `create_tasks`; don't do it here."
            )
        }
        ChatKind::SubAgent { .. } => format!(
            "You are a sub-agent: a one-shot job for the chat that spawned you, in {project}{}. Do the job in your first message and finish. Your last message is the result handed back to that chat, so make it complete and self-contained. You can't spawn sub-agents of your own.",
            if in_worktree { format!(", working in `{}`", ctx.checkout) } else { String::new() },
        ),
        ChatKind::Plain => format!(
            "This is a chat in {project}, working in {}. It has no role on the board: it isn't a task's chat, and no task reports to it.",
            if in_worktree { format!("the worktree `{}`", ctx.checkout) } else { "the project's main checkout".to_string() },
        ),
    }
}

/// (c) The tool rules for this kind of agent.
fn tool_rules(ctx: &ChatContext) -> Vec<&'static str> {
    let mut rules = match ctx.backend {
        AgentBackend::Native => vec![
            "- **Look before you answer or change anything.** Use `list_dir` and `grep` to find things and `read_file` to read them. Don't guess at paths or file contents.",
            "- **Editing.** `read_file` first, then `edit_file` for a change to an existing file. Use `write_file` only for a new file or a full rewrite.",
            "- **Commands.** Use `shell` for one-off commands that finish quickly (tests, builds, git, inspecting state). It has a 30 second limit and blocks your turn, so for anything long-running or repeated (dev server, watcher, `--watch` builds) call `list_actions` first: if an Action matches, `run_action` it and check its output with `read_action`. If none matches, `create_action` one so it shows up in the user's Actions tab, rather than running it in `shell`.",
            "- **Verify.** After starting or changing something, check the outcome (`read_action`, re-run the tests) instead of assuming it worked.",
            "- **Memory.** When the user states a lasting preference or project convention, or corrects you in a way that should apply next time, save it with `update_memory` right away, without being asked. Keep it to durable facts, not scratch state for the current task.",
        ],
        AgentBackend::Acp => vec![
            "- **Actions** are named background commands shown in the user's Actions tab. Before starting a long-running process yourself (dev server, watcher, `--watch` build), call `list_actions`; if one matches, `run_action` it and use `read_action` to check its output or compile errors. If none matches, `create_action` one instead of leaving an untracked background process.",
            "- **Memory** is AI Leash's persistent notes for this project (`project`) and across projects (`global`). It is not put in your context for you: call `read_memory` at the start of a task in this project. When the user states a lasting preference or convention, or corrects you in a way that should apply next time, save it with `update_memory` without being asked — it replaces the whole file, so `read_memory` first and pass the merged contents. Durable facts only, not scratch state.",
        ],
    };
    rules.push(
        "- **The board.** The project has a Kanban board of tasks the user plans with. When asked to plan or break down work, add it with `create_tasks` rather than only writing a list. `list_tasks` shows what's there.",
    );
    if ctx.allows_sub_agents() {
        rules.push(
            "- **Parallel work.** If a request has two or more independent parts, hand them to `spawn_sub_agent` in a single call so they run concurrently, instead of working through them one by one. Call `list_agent_options` first if you want a specific agent, model or effort. Results arrive on their own as later turns; don't poll with `list_sub_agents`.",
        );
    }
    rules
}

/// How to show data as rich UI in a reply: a fenced ` ```ui ` block of JSON
/// the chat renders with real components (`src/ui/UiBlock.tsx`, spec and
/// validation in `src/lib/uiSpec.ts` — keep this in sync with it). Plain
/// reply text, so it's the same for the native loop and every ACP agent;
/// appended to every agent's guidance by `guidance`.
pub fn rich_reply_guidance() -> &'static str {
    "# Rich replies\n\n\
     The chat renders a fenced code block with the language `ui` as interactive UI instead of code. Use one when data reads better as a table, chart, stat tiles or the like than as prose or a Markdown table — comparisons, metrics, results, status overviews. Keep explanations in normal Markdown around it; don't use it for a sentence or two. It's for showing data, not for pages or UI prototypes: don't rebuild a web page, mockup or `.html` file with it.\n\n\
     The block holds JSON: one node, or an array of nodes stacked vertically. Every node has a `type`:\n\
     - `table`: `columns` (strings, or `{key, label, align}` with align start/center/end) and `rows` (arrays in column order, or objects by key); cells are strings, numbers, booleans or null. Sortable by clicking a header unless `\"sortable\": false`. Optional `caption`.\n\
     - `chart`: `kind` bar (default) or line, `labels` (x-axis categories), `series` (`[{name, values}]`, one number per label, up to 8 series), optional `title` and `unit`.\n\
     - `stats`: `items` of `{label, value, change, tone, description}` (only label and value required) — a row of stat tiles.\n\
     - `keyValue`: `items` of `{label, value}`, optional `title`.\n\
     - `list`: `items` of strings or `{title, description, badge, tone}`; `ordered` true for a numbered list.\n\
     - `progress`: `label`, `value`, optional `max` (default 100) and `tone`.\n\
     - `badge` / `status`: `label` and `tone`.\n\
     - `heading` (`text`, `level` 1-3), `text` (`text`, `tone` default/secondary), `divider`.\n\
     - `callout`: `title`, optional `text` and `tone`.\n\
     - `code`: `code`, optional `language` and `title`.\n\
     - `card`: optional `title` and `description`, `children` nodes.\n\
     - `tabs`: `tabs` of `{label, children}`.\n\
     - `stack`: `children`, `direction` vertical (default) or horizontal.\n\
     - `choices`: optional `prompt`, `options` of strings or `{label, message}` — buttons; clicking one sends its message (or label) as the user's next message. Only offer them when you actually want the user to pick.\n\n\
     `tone` is one of neutral, info, success, warning, error. The JSON must be valid and is only displayed, never executed; an invalid block is shown raw with the error. Example:\n\n\
     ```ui\n\
     [{\"type\": \"table\", \"columns\": [\"Model\", \"Latency (ms)\"], \"rows\": [[\"A\", 320], [\"B\", 610]]},\n \
     {\"type\": \"chart\", \"title\": \"Latency\", \"labels\": [\"A\", \"B\"], \"series\": [{\"name\": \"Latency\", \"values\": [320, 610]}], \"unit\": \"ms\"}]\n\
     ```"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(kind: ChatKind, backend: AgentBackend) -> ChatContext {
        ChatContext {
            kind,
            backend,
            project_name: "demo".into(),
            project_root: "/proj/demo".into(),
            checkout: "/proj/demo".into(),
        }
    }

    fn task() -> ChatKind {
        ChatKind::Task {
            number: 12,
            title: "Fix the diff colours".into(),
            branch: Some("task/12-fix".into()),
            worktree_path: Some("/proj/demo.worktrees/task-12".into()),
        }
    }

    fn kinds() -> Vec<ChatKind> {
        vec![
            ChatKind::Plain,
            ChatKind::Project,
            task(),
            ChatKind::SubAgent { parent: "p".into() },
        ]
    }

    fn every_context() -> Vec<ChatContext> {
        [AgentBackend::Native, AgentBackend::Acp]
            .into_iter()
            .flat_map(|b| kinds().into_iter().map(move |k| ctx(k, b)))
            .collect()
    }

    /// A phrase only its own kind's "This chat" section has.
    fn marker(kind: &ChatKind) -> &'static str {
        match kind {
            ChatKind::Plain => "It has no role on the board",
            ChatKind::Project => "This is the project chat of",
            ChatKind::Task { .. } => "This is the chat of task #",
            ChatKind::SubAgent { .. } => "You are a sub-agent",
        }
    }

    #[test]
    fn each_kind_gets_its_own_section_and_no_other() {
        for c in every_context() {
            let text = guidance(&c);
            for other in kinds() {
                assert_eq!(
                    text.contains(marker(&other)),
                    other == c.kind,
                    "{:?}/{:?} vs {:?}",
                    c.backend,
                    c.kind,
                    other
                );
            }
        }
    }

    #[test]
    fn sections_come_in_order() {
        for c in every_context() {
            let text = guidance(&c);
            let at = |s: &str| text.find(s).unwrap();
            assert_eq!(at("# AI Leash"), 0);
            assert!(at("# AI Leash") < at("# This chat"));
            assert!(at("# This chat") < at(marker(&c.kind)));
            assert!(at(marker(&c.kind)) < at("# Using your tools"));
            assert!(at("# Using your tools") < at("# Rich replies"));
        }
    }

    #[test]
    fn task_chat_states_its_task_and_rules() {
        for b in [AgentBackend::Native, AgentBackend::Acp] {
            let text = guidance(&ctx(task(), b));
            assert!(text.contains("task #12, *Fix the diff colours*"));
            assert!(text.contains(
                "on branch `task/12-fix` in the worktree `/proj/demo.worktrees/task-12`"
            ));
            assert!(text.contains("set its status to `review` with `update_task` (never `done`"));
            assert!(text.contains("`send_message` to `\"project\"`"));
            assert!(text.contains("outside this task's scope"));
        }
        let main = ChatKind::Task {
            number: 1,
            title: "t".into(),
            branch: None,
            worktree_path: None,
        };
        assert!(guidance(&ctx(main, AgentBackend::Native))
            .contains("You work in the project's main checkout."));
    }

    #[test]
    fn project_chat_plans_and_delegates() {
        let text = guidance(&ctx(ChatKind::Project, AgentBackend::Acp));
        assert!(text.contains("you plan and delegate"));
        assert!(text.contains("report back here with `send_message`"));
        assert!(text.contains("The user reviews each task's work and merges it."));
    }

    #[test]
    fn nothing_is_conditional_on_the_chat_kind_any_more() {
        for c in every_context() {
            let text = guidance(&c);
            assert!(!text.contains("If this conversation is"));
            assert!(!text.contains("If this is a task"));
        }
    }

    #[test]
    fn plain_chat_names_its_checkout() {
        let mut c = ctx(ChatKind::Plain, AgentBackend::Native);
        assert!(guidance(&c).contains("working in the project's main checkout"));
        c.checkout = "/proj/demo.worktrees/x".into();
        assert!(guidance(&c).contains("working in the worktree `/proj/demo.worktrees/x`"));
    }

    #[test]
    fn only_sub_agents_are_not_told_to_spawn_sub_agents() {
        for c in every_context() {
            let text = guidance(&c);
            assert_eq!(
                text.contains("spawn_sub_agent"),
                c.allows_sub_agents(),
                "{:?}",
                c.kind
            );
            assert_eq!(text.contains("Sub Agents tab"), c.allows_sub_agents());
        }
    }

    #[test]
    fn every_agent_gets_rich_replies_and_html_previews() {
        for c in every_context() {
            let text = guidance(&c);
            assert!(text.contains("```ui"));
            assert!(text.contains("\n\nHTML previews: the chat renders"));
        }
    }

    #[test]
    fn rich_reply_example_is_valid_json() {
        let text = rich_reply_guidance();
        let body = text
            .split("```ui\n")
            .nth(1)
            .unwrap()
            .split("\n```")
            .next()
            .unwrap();
        let json: serde_json::Value = serde_json::from_str(body).unwrap();
        assert!(json.is_array());
    }

    #[test]
    fn guidance_only_names_real_tools() {
        // Every backticked identifier that looks like a tool name must be one
        // this guidance's agent actually has.
        let board = [
            "create_tasks",
            "list_tasks",
            "update_task",
            "start_task",
            "send_message",
        ];
        let sub_agents = ["spawn_sub_agent", "list_agent_options", "list_sub_agents"];
        let native = [
            "list_dir",
            "grep",
            "read_file",
            "edit_file",
            "write_file",
            "shell",
            "list_actions",
            "run_action",
            "read_action",
            "create_action",
            "update_memory",
        ];
        let bridge = [
            "list_actions",
            "run_action",
            "read_action",
            "create_action",
            "read_memory",
            "update_memory",
        ];
        for c in every_context() {
            let mut allowed: Vec<&str> = match c.backend {
                AgentBackend::Native => native.to_vec(),
                AgentBackend::Acp => bridge.to_vec(),
            };
            allowed.extend(board);
            if c.allows_sub_agents() {
                allowed.extend(sub_agents);
            }
            let text = guidance(&c);
            for name in text.split('`').skip(1).step_by(2) {
                if name.contains('_') && !name.contains(' ') && !name.starts_with("--") {
                    assert!(allowed.contains(&name), "unknown tool `{name}` in guidance");
                }
            }
        }
    }
}
