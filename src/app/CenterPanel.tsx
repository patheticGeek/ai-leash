import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/ui/tabs";
import ChatPanel from "../features/chat/ChatPanel";
import SubAgentChatTab from "../features/chat/SubAgentChatTab";
import { useGenerating } from "../lib/generatingQuery";
import { useAppStore } from "../store";

function NoProjectState() {
  const addProject = useAppStore((s) => s.addProject);

  async function pickProject() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await addProject(dir);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-raised text-primary-hover shadow-[0_0_0_1px_rgba(58,95,143,0.35),0_12px_30px_rgba(0,0,0,0.25)]">
          <FolderOpen size={28} strokeWidth={1.6} />
        </div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-primary-hover/80">
          Welcome to ai-leash
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Start with a project
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Open a local folder to give your agent context, tools, and a
          conversation that stays with the project.
        </p>
        <Button
          onClick={pickProject}
          className="mt-7 gap-2 bg-primary text-primary-foreground shadow-[0_2px_10px_rgba(58,95,143,0.3)] hover:bg-primary-hover"
        >
          <FolderOpen size={15} />
          Open a project folder
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          You can also use the <span className="text-muted-foreground">+</span>{" "}
          button in the sidebar header.
        </p>
      </div>
    </div>
  );
}

export default function CenterPanel() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const chatTabs = useAppStore((s) => s.chatTabs);
  const activeChatTabId = useAppStore((s) => s.activeChatTabId);
  const setActiveChatTab = useAppStore((s) => s.setActiveChatTab);
  const closeChatTab = useAppStore((s) => s.closeChatTab);
  // Backend-driven per-session activity — the primary tab is covered by the
  // always-mounted `useGeneratingListener` (`App.tsx`), `subAgentTasks`
  // covers sub-agent tabs (no `generating` event of its own; `status` is
  // already tracked for the Sub Agents sidebar). Queried even before the
  // `activeSessionId` null-check below since hooks can't be conditional;
  // an empty-string fallback session id is harmless (never actually shown).
  const primaryGenerating = useGenerating(activeSessionId ?? "").active;
  const subAgentTasks = useAppStore((s) => s.subAgentTasks);

  if (!projectRoot || !activeSessionId) {
    return (
      <div className="flex h-full flex-col bg-background">
        <NoProjectState />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={activeChatTabId}
        onValueChange={setActiveChatTab}
        className="shrink-0 gap-0 bg-background"
      >
        <TabsList variant="strip">
          {chatTabs.map((tab) => {
            const running =
              tab.kind === "primary"
                ? primaryGenerating
                : subAgentTasks.find((t) => t.subSessionId === tab.subSessionId)
                    ?.status === "running";
            // Only shine while this tab isn't the one you're already looking
            // at — the active tab's own content already shows its running
            // state (the "Working for…"/"Waiting" indicator), so shining the
            // tab title too would just be redundant right where it matters
            // least.
            const shine = running && tab.id !== activeChatTabId;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                onClose={
                  tab.kind === "subagent"
                    ? () => closeChatTab(tab.id)
                    : undefined
                }
              >
                <span
                  className={cn(
                    "max-w-[12rem] truncate",
                    shine && "shine-text",
                  )}
                >
                  {tab.label}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <div className="relative flex-1 min-h-0">
        <div
          className={
            activeChatTabId === "primary" ? "h-full bg-background" : "hidden"
          }
        >
          <ChatPanel sessionId={activeSessionId} projectRoot={projectRoot} />
        </div>
        {chatTabs
          .filter((tab) => tab.kind === "subagent")
          .map((tab) => (
            <div
              key={tab.id}
              className={
                tab.id === activeChatTabId ? "h-full bg-background" : "hidden"
              }
            >
              <SubAgentChatTab subSessionId={tab.subSessionId} />
            </div>
          ))}
      </div>
    </div>
  );
}
