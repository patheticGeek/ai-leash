import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { useEffect, useState } from "react";
import { useSubAgents } from "../../../../data/subAgents";
import { formatDuration } from "../../../../lib/format";
import { useAppStore } from "../../../../store";

// The last row of the banner stack, right above the composer, while any of
// this chat's sub-agents is running (#26): a spinner, "N sub-agents running"
// and the longest one's elapsed time, with "View" revealing the Sub agents
// tab in the side panel. Gone once none is running. Reads the same
// lifecycle-driven query as that tab (`useSubAgents`), so native and ACP
// chats both work and nothing polls; the 1s tick only advances the time.
export default function SubAgentsBanner({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const running = useSubAgents(sessionId).filter((t) => t.status === "running");
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const [now, setNow] = useState(Date.now());
  const isRunning = running.length > 0;
  useEffect(() => {
    if (!isRunning) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  if (!isRunning) return null;
  const longest = Math.max(...running.map((t) => now - t.startedAt));
  const count = `${running.length} sub-agent${running.length === 1 ? "" : "s"}`;
  return (
    <Banner
      status="info"
      elevation="low"
      collapsible={false}
      icon={<Spinner size="sm" aria-label="Running" />}
      title={`${count} running · ${formatDuration(longest / 1000)}`}
      endContent={
        <Button
          variant="secondary"
          size="sm"
          label="View"
          onClick={() => openPanelTab("subagents")}
        />
      }
    />
  );
}
