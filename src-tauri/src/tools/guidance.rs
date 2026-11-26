//! Standing guidance, delivered without the user having to ask for it:
//! folded into the native agent's system prompt
//! (`context::build_system_prompt`) and returned as the `instructions` of
//! the MCP bridge's `initialize` response for ACP agents
//! (`mcp_bridge::client`). One builder, `guidance`, makes it for both from
//! a `ChatContext`, in four parts: what AI Leash is, what this chat is
//! ("This chat", stated as facts for its kind), the tool rules, then a
//! pointer per built-in guide (`guides`), which hold the long specs. Tool
//! descriptions say what a tool does; this says when to pick it, and how
//! tools chain together — the part a model won't work out from a flat
//! list of schemas.

use super::guides;
use crate::chat_context::{AgentBackend, ChatContext, ChatKind};

/// The whole guidance for one chat. Sub-agents aren't told about
/// `spawn_sub_agent`, which they don't get.
pub fn guidance(ctx: &ChatContext) -> String {
    let mut out = String::from("# AI Leash\n\n");
    out.push_str(&intro(ctx));
    out.push_str("\n\n# This chat\n\n");
    out.push_str(&this_chat(ctx));
    out.push_str("\n\n# Using your tools\n\n");
    out.push_str(&tool_rules(ctx).join("\n"));
    out.push_str("\n\n# Guides\n\n");
    out.push_str(&guide_pointers());
    out
}

/// The "This chat" block sent ahead of the first `session/prompt` of each
/// ACP connection (`acp::process::FirstPromptContext`), for agents that clip
/// or ignore the bridge's `instructions`: the same `this_chat` facts plus a
/// one-line `read_guide` pointer. Kept short — it rides along with the
/// user's own first message.
pub fn first_prompt_block(ctx: &ChatContext) -> String {
    format!(
        "[AI Leash, the harness running this session, adds this context to your first message. It is not from the user.]\n\n# This chat\n\n{}\n\n{}",
        this_chat(ctx),
        guide_line(),
    )
}

/// One line naming every built-in guide's topic, for `first_prompt_block`.
fn guide_line() -> String {
    let topics: Vec<String> = guides::GUIDES
        .iter()
        .map(|g| format!("`{}`", g.name))
        .collect();
    format!(
        "Before using one of this chat's features, call `read_guide` with its topic: {}.",
        topics.join(", ")
    )
}

/// (d) One line per built-in guide (`guides::GUIDES`): the long specs live
/// there, behind `read_guide`. The list has to be here, in the always-seen
/// text, not only in the tool's schema — Claude Code defers MCP tool
/// schemas until it goes looking for a tool.
fn guide_pointers() -> String {
    let mut out = String::from(
        "Each chat feature beyond Markdown has a short guide; call `read_guide` with its topic first:\n",
    );
    for g in guides::GUIDES {
        out.push_str(&format!("\n- `{}`: {}", g.name, g.when));
    }
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
            "{lead}The user sees your work in its UI, which only shows what goes through the AI Leash tools below: Actions in the Actions tab, {}memory in the project's notes. Prefer them to your built-in equivalents (background shell processes, {}your own memory files) so the user can see and manage the work, and use them unasked.",
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
            // Only a worktree is this task's own: in the main checkout the
            // branch is whatever the user has checked out.
            let commit = match (branch, worktree_path) {
                (Some(_), Some(_)) => "; commit your work on that branch, this task's own",
                (None, Some(_)) => "; commit your work there",
                _ => "",
            };
            format!(
                "This is the chat of task #{number}, *{title}*, on the board of {project}. You work {place}{commit}.\n\n\
                 - Keep its description current with `update_task` as you learn. When you're done, set its status to `review` (never `done`: the user reviews and merges it) and summarise what you changed and anything left for the reviewer.\n\
                 - On other tasks, `update_task` only adds links or dependency notes. For anything bigger, or if you're blocked or need a decision, `send_message` to `\"project\"`.\n\
                 - Work outside this task's scope goes on the board as new tasks (`create_tasks`), not here."
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
            "- **Actions** are background commands shown in the user's Actions tab. Run a dev server, watcher or `--watch` build as one, not as an untracked process of your own: `list_actions`, then `run_action` a match (check it with `read_action`), or `create_action` one if none fits.",
            "- **Memory** is AI Leash's notes for this project (`project`) and all projects (`global`). It isn't in your context: call `read_memory` at the start of a task. When the user states a lasting preference or corrects you for next time, save it with `update_memory` unasked; it replaces the whole file, so read first and merge. Durable facts only.",
        ],
    };
    // A task's chat has its own board rules in "This chat"; a sub-agent only
    // reads the board.
    if !matches!(ctx.kind, ChatKind::Task { .. } | ChatKind::SubAgent { .. }) {
        rules.push(
        "- **The board.** The project has a Kanban board of tasks the user plans with. When asked to plan or break down work, add it with `create_tasks` rather than only writing a list. `list_tasks` shows what's there.",
    );
    }
    if ctx.allows_sub_agents() {
        rules.push(
            "- **Parallel work.** Hand two or more independent parts of a request to `spawn_sub_agent` in one call so they run concurrently (`list_agent_options` to pick an agent, model or effort). Results arrive on their own as later turns; don't poll `list_sub_agents`.",
        );
    }
    rules.push(
        "- **Live facts.** `chat_info` re-checks this chat's task status, branch and follow state.",
    );
    rules
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::board_tools;

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
            assert!(at("# Using your tools") < at("# Guides"));
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
            assert!(text.contains("set its status to `review` (never `done`"));
            assert!(text.contains("`send_message` to `\"project\"`"));
            assert!(text.contains("outside this task's scope"));
            assert!(text.contains(
                "in the worktree `/proj/demo.worktrees/task-12`; commit your work on that branch, this task's own."
            ));
            assert!(text.contains("Keep its description current with `update_task` as you learn."));
            assert!(
                text.contains("On other tasks, `update_task` only adds links or dependency notes")
            );
            assert!(text.contains(
                "For anything bigger, or if you're blocked or need a decision, `send_message`"
            ));
        }
        let main = ChatKind::Task {
            number: 1,
            title: "t".into(),
            branch: None,
            worktree_path: None,
        };
        let text = guidance(&ctx(main, AgentBackend::Native));
        assert!(text.contains("You work in the project's main checkout."));
        assert!(!text.contains("Commit your work"));
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
    fn every_agent_is_told_about_chat_info() {
        for c in every_context() {
            assert!(
                guidance(&c).contains("`chat_info` re-checks"),
                "{:?}",
                c.kind
            );
        }
    }

    #[test]
    fn every_agent_is_pointed_at_every_guide() {
        for c in every_context() {
            let text = guidance(&c);
            for g in guides::GUIDES {
                assert!(text.contains(&format!("- `{}`: ", g.name)), "{}", g.name);
            }
            // The specs themselves are behind `read_guide` now.
            assert!(!text.contains("`keyValue`"));
        }
    }

    #[test]
    fn guidance_only_names_real_tools() {
        // Every backticked identifier that looks like a tool name must be one
        // this guidance's agent actually has.
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
            allowed.extend(board_tools::board_tools_for(&c.kind));
            if c.allows_sub_agents() {
                allowed.extend(sub_agents);
            }
            allowed.push("read_guide");
            allowed.push("chat_info");
            let text = guidance(&c);
            for name in text.split('`').skip(1).step_by(2) {
                if name.contains('_') && !name.contains(' ') && !name.starts_with("--") {
                    assert!(allowed.contains(&name), "unknown tool `{name}` in guidance");
                }
            }
        }
    }

    #[test]
    fn first_prompt_block_is_this_chat_and_a_guide_pointer() {
        for kind in kinds() {
            let c = ctx(kind, AgentBackend::Acp);
            let block = first_prompt_block(&c);
            // The very same "This chat" text the instructions carry.
            assert!(guidance(&c).contains(&this_chat(&c)));
            assert!(block.contains(&format!("# This chat\n\n{}", this_chat(&c))));
            assert!(block.contains("It is not from the user."));
            for g in guides::GUIDES {
                assert!(block.contains(&format!("`{}`", g.name)), "{}", g.name);
            }
            // Only the pointer, not the guides' one-liners or the tool rules.
            assert!(!block.contains("# Using your tools"));
            assert!(!block.contains("# Guides"));
            assert!(block.len() < 1_500, "{} chars: {block}", block.len());
        }
    }

    #[test]
    fn task_block_gives_the_branch_worktree_and_review_rules() {
        let block = first_prompt_block(&ctx(task(), AgentBackend::Acp));
        assert!(block.contains(
            "on branch `task/12-fix` in the worktree `/proj/demo.worktrees/task-12`; commit your work on that branch"
        ));
        assert!(block.contains("set its status to `review`"));
        assert!(block.contains("other tasks, `update_task` only adds links"));
        assert!(block.contains("summarise what you changed"));
    }
}
