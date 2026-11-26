//! Standing "when to reach for which tool" guidance, delivered without the
//! user having to ask for it: folded into the native agent's system prompt
//! (`context::build_system_prompt`) and returned as the `instructions` of
//! the MCP bridge's `initialize` response for ACP agents (`mcp_bridge::client`).
//! Tool descriptions say what a tool does; this says when to pick it, and
//! how tools chain together — the part a model won't work out from a
//! flat list of schemas.

/// System-prompt section for the native provider loop. `allow_subtasks` is
/// false for sub-agents themselves, which don't get `spawn_sub_agent` and
/// so shouldn't be told about it.
pub fn native_guidance(allow_subtasks: bool) -> String {
    let mut out = String::from(
        "# Using your tools\n\n\
         You are running inside AI Leash, an agentic harness. The user follows your work through the harness's UI, which renders every tool call you make: file edits as reviewable diffs, commands as tool entries in the chat, Actions in the Actions tab, sub-agents in the Sub Agents tab. Work done any other way is invisible to them. So act through your tools rather than describing what you would do or asking the user to do it themselves, and don't wait to be told to use them.\n\n\
         - **Look before you answer or change anything.** Use `list_dir` and `grep` to find things and `read_file` to read them. Don't guess at paths or file contents.\n\
         - **Editing.** `read_file` first, then `edit_file` for a change to an existing file. Use `write_file` only for a new file or a full rewrite.\n\
         - **Commands.** Use `shell` for one-off commands that finish quickly (tests, builds, git, inspecting state). It has a 30 second limit and blocks your turn, so for anything long-running or repeated (dev server, watcher, `--watch` builds) call `list_actions` first: if an Action matches, `run_action` it and check its output with `read_action`. If none matches, `create_action` one so it shows up in the user's Actions tab, rather than running it in `shell`.\n\
         - **Verify.** After starting or changing something, check the outcome (`read_action`, re-run the tests) instead of assuming it worked.\n\
         - **Memory.** When the user states a lasting preference or project convention, or corrects you in a way that should apply next time, save it with `update_memory` right away, without being asked. Keep it to durable facts, not scratch state for the current task.\n\
         - **The board.** The project has a Kanban board of tasks the user plans with. When asked to plan or break down work, add it with `create_tasks` rather than only writing a list. `list_tasks` shows what's there. If this conversation is a task's own chat, set it to review with `update_task` when your work on it is done, and use `send_message` to the project chat if you're blocked or need a decision. From the project chat, `send_message` to a task's number gives it instructions.",
    );
    if allow_subtasks {
        out.push_str(
            "\n- **Parallel work.** If a request has two or more independent parts, hand them to `spawn_sub_agent` in a single call so they run concurrently, instead of working through them one by one. Call `list_agent_options` first if you want a specific agent, model or effort. Results arrive on their own; don't poll.",
        );
    }
    out.push_str("\n\n");
    out.push_str(rich_reply_guidance());
    out
}

/// How to show data as rich UI in a reply: a fenced ` ```ui ` block of JSON
/// the chat renders with real components (`src/ui/UiBlock.tsx`, spec and
/// validation in `src/lib/uiSpec.ts` — keep this in sync with it). Plain
/// reply text, so it's the same for the native loop and every ACP agent;
/// appended to both `native_guidance` and `bridge_instructions`.
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

/// `instructions` for the MCP bridge server. The ACP agent already has its
/// own file/shell tools, so this only covers what the bridge adds: Actions,
/// memory and sub-agents.
pub fn bridge_instructions() -> String {
    "You are running inside AI Leash, an agentic harness. The user follows your work through the harness's UI, which only shows what goes through the harness's own tools below: Actions appear in the Actions tab, sub-agents in the Sub Agents tab, memory in the project's notes. Where one of these does the same job as a built-in feature of yours (background shell processes, your own sub-agent/task tool, your own memory files), prefer the AI Leash tool so the user can see and manage what is going on. Use them proactively — don't wait to be asked.\n\
     \n\
     - Actions are named background commands shown in the user's Actions tab. Before starting a long-running process yourself (dev server, watcher, `--watch` build), call `list_actions`; if one matches, `run_action` it and use `read_action` to check its output or compile errors. If none matches, `create_action` one instead of leaving an untracked background process.\n\
     - Memory is AI Leash's persistent notes for this project (`project`) and across projects (`global`). It is not put in your context for you: call `read_memory` at the start of a task in this project. When the user states a lasting preference or convention, or corrects you in a way that should apply next time, save it with `update_memory` without being asked — it replaces the whole file, so `read_memory` first and pass the merged contents. Durable facts only, not scratch state.\n\
     - Sub-agents: if a request has two or more independent parts, hand them to `spawn_sub_agent` in one call so they run concurrently. Call `list_agent_options` first if you want a specific agent, model or effort. Results arrive on their own as later turns; don't poll with `list_sub_agents`.\n\
     - The board: the project has a Kanban board of tasks the user plans with. When asked to plan or break down work, add it with `create_tasks` rather than only writing a list; `list_tasks` shows what's there. If this conversation is a task's own chat, set it to review with `update_task` when your work on it is done, and use `send_message` to the project chat if you're blocked or need a decision. From the project chat, `send_message` to a task's number gives it instructions.\n\
     \n"
        .to_string()
        + rich_reply_guidance()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_guidance_only_mentions_sub_agents_when_allowed() {
        assert!(native_guidance(true).contains("spawn_sub_agent"));
        assert!(!native_guidance(false).contains("spawn_sub_agent"));
    }

    #[test]
    fn both_transports_describe_rich_replies() {
        assert!(native_guidance(false).contains("```ui"));
        assert!(bridge_instructions().contains("```ui"));
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
        // this guidance's transport actually offers.
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
            "spawn_sub_agent",
            "list_agent_options",
            "create_tasks",
            "list_tasks",
            "update_task",
            "send_message",
        ];
        let bridge = [
            "list_actions",
            "run_action",
            "read_action",
            "create_action",
            "read_memory",
            "update_memory",
            "spawn_sub_agent",
            "list_agent_options",
            "list_sub_agents",
            "create_tasks",
            "list_tasks",
            "update_task",
            "send_message",
        ];
        for (text, allowed) in [
            (native_guidance(true), &native[..]),
            (bridge_instructions(), &bridge[..]),
        ] {
            for name in text.split('`').skip(1).step_by(2) {
                if name.contains('_') && !name.contains(' ') && !name.starts_with("--") {
                    assert!(allowed.contains(&name), "unknown tool `{name}` in guidance");
                }
            }
        }
    }
}
