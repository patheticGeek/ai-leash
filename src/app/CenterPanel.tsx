import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, X } from "lucide-react";
import { Button } from "@/ui/button";
import ChatPanel from "../features/chat/ChatPanel";
import SubAgentChatTab from "../features/chat/SubAgentChatTab";
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
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#17181c] text-blue-300 shadow-[0_0_0_1px_rgba(110,168,254,0.2),0_12px_30px_rgba(0,0,0,0.25)]">
          <FolderOpen size={28} strokeWidth={1.6} />
        </div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-blue-300/80">
          Welcome to ai-leash
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Start with a project
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
          Open a local folder to give your agent context, tools, and a
          conversation that stays with the project.
        </p>
        <Button
          onClick={pickProject}
          className="mt-7 gap-2 bg-[#3a5f8f] text-white shadow-[0_2px_10px_rgba(58,95,143,0.3)] hover:bg-[#4a6f9f]"
        >
          <FolderOpen size={15} />
          Open a project folder
        </Button>
        <p className="mt-4 text-xs text-zinc-600">
          You can also use the <span className="text-zinc-500">+</span> button
          in the sidebar header.
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

  if (!projectRoot || !activeSessionId) {
    return (
      <div className="flex h-full flex-col bg-[#0e0f12]">
        <NoProjectState />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 px-1.5 overflow-x-auto bg-[#0e0f12]">
        {chatTabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs cursor-default transition-colors duration-150 ease-out ${
              tab.id === activeChatTabId
                ? "bg-white/10 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Button
              variant="unstyled"
              size="none"
              onClick={() => setActiveChatTab(tab.id)}
              className="max-w-[12rem] truncate text-left"
            >
              {tab.label}
            </Button>
            {tab.kind === "subagent" && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Close tab"
                onClick={() => closeChatTab(tab.id)}
                className="-my-1 -mr-2 text-zinc-600 hover:text-zinc-300"
              >
                <X size={12} />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="relative flex-1 min-h-0">
        <div
          className={
            activeChatTabId === "primary" ? "h-full bg-[#0e0f12]" : "hidden"
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
                tab.id === activeChatTabId ? "h-full bg-[#0e0f12]" : "hidden"
              }
            >
              <SubAgentChatTab subSessionId={tab.subSessionId} />
            </div>
          ))}
      </div>
    </div>
  );
}
