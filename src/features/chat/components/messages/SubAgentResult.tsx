import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Bot, SquareArrowOutUpRight } from "lucide-react";
import { useSubAgents } from "@/data/subAgents";
import { isToolError } from "../../../../lib/chatEntries";
import { useAppStore } from "../../../../store";
import Markdown from "../../../../ui/Markdown";
import type { PanelEntry } from "../../hooks/useChatStream";
import SystemNotice from "./SystemNotice";

// Results longer than this start collapsed.
const LONG_RESULT_CHARS = 280;
const LONG_RESULT_LINES = 4;

function argString(args: unknown, key: string): string | undefined {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const value = (args as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

// A sub-agent's finished result (`chat::record_sub_agent_result`) as a line
// of its own, outside any activity group or Worked-for fold: "Sub-agent
// finished · <task> · <status>", an Open button to its transcript tab
// (`SubAgentChatTab`), and Show for the result text — open from the start
// unless it is long. The open state is remembered for the session.
export default function SubAgentResult({
  entry,
}: {
  entry: Extract<PanelEntry, { kind: "tool" }>;
}) {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const tasks = useSubAgents(activeSessionId);
  const subSessionId = argString(entry.args, "sub_session_id");
  const description = argString(entry.args, "description") ?? "Sub-agent";
  const task = tasks.find((t) => t.subSessionId === subSessionId);
  const failed =
    task?.status === "error" ||
    (task?.status !== "done" && isToolError(entry.result));
  const result = entry.result?.trim() ?? "";
  const isLong =
    result.length > LONG_RESULT_CHARS ||
    result.split("\n").length > LONG_RESULT_LINES;
  return (
    <SystemNotice
      icon={<Icon icon={Bot} size="sm" />}
      label={`Sub-agent finished · ${description} · ${failed ? "Failed" : "Done"}`}
      isDefaultOpen={!isLong}
      persistKey={`sub-agent-result:${entry.callId}`}
      actions={
        subSessionId ? (
          <Button
            variant="ghost"
            size="sm"
            label="Open"
            tooltip="Open its conversation"
            endContent={<Icon icon={SquareArrowOutUpRight} size="sm" />}
            onClick={() => openChatTab(subSessionId, description)}
          />
        ) : undefined
      }
    >
      {result ? <Markdown content={result} /> : undefined}
    </SystemNotice>
  );
}
