import { useTauriEvent } from "../../../lib/useTauriEvent";
import { useAppStore } from "../../../store";

// `tools/open_file.rs`'s payload: `path` is absolute and already confined
// to the conversation's checkout; `sessionId` is the top-level
// conversation (a sub-agent's parent).
interface AgentOpenFilePayload {
  sessionId: string;
  path: string;
  line: number | null;
}

// The agent's `open_file` tool: opens the file in that conversation's side
// panel (`openAgentFile`). Always on (mounted in `App`), so a call from a
// conversation that isn't on screen still lands in its saved tabs.
export function useAgentOpenFile() {
  const openAgentFile = useAppStore((s) => s.openAgentFile);
  useTauriEvent<AgentOpenFilePayload>("agent://open_file", (p) =>
    openAgentFile(p.sessionId, p.path, p.line ?? undefined),
  );
}
