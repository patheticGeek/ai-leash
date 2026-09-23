import { Badge } from "@/ui/badge";
import type { SubAgentTask } from "../../data/subAgents";

const STATUS_VARIANT = {
  running: "warning",
  done: "success",
  error: "danger",
} as const;

// The running / done / error pill shown for a sub-agent in both the side
// panel's list (`SubAgentsTab.tsx`) and the header of its own chat tab
// (`SubAgentChatTab.tsx`).
export default function SubAgentStatusBadge({
  status,
}: {
  status: SubAgentTask["status"];
}) {
  return (
    <Badge
      size="sm"
      variant={STATUS_VARIANT[status]}
      outline
      className="shrink-0"
    >
      {status === "running" ? "running…" : status}
    </Badge>
  );
}
