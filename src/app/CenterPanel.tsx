import { X } from "lucide-react";
import { Button } from "@/ui/button";
import ChatPanel from "../features/chat/ChatPanel";
import SubAgentChatTab from "../features/chat/SubAgentChatTab";
import { useAppStore } from "../store";

export default function CenterPanel() {
  const chatTabs = useAppStore((s) => s.chatTabs);
  const activeChatTabId = useAppStore((s) => s.activeChatTabId);
  const setActiveChatTab = useAppStore((s) => s.setActiveChatTab);
  const closeChatTab = useAppStore((s) => s.closeChatTab);

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
          <ChatPanel />
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
