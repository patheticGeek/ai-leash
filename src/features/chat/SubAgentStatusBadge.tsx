import { Token } from "@astryxdesign/core/Token";
import type { SubAgentTask } from "../../data/subAgents";

const STATUS_COLOR = {
  running: "yellow",
  done: "green",
  error: "red",
} as const;

// The running / done / error token shown for a sub-agent in both the side
// panel's list (`SubAgentsTab.tsx`) and the header of its own chat tab
// (`SubAgentChatTab.tsx`).
export default function SubAgentStatusBadge({
  status,
}: {
  status: SubAgentTask["status"];
}) {
  return (
    <Token
      size="sm"
      color={STATUS_COLOR[status]}
      label={status === "running" ? "running…" : status}
    />
  );
}
