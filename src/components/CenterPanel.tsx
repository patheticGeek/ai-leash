import { X } from "lucide-react";
import { useAppStore } from "../store";
import ChatPanel from "./ChatPanel";
import SubAgentChatTab from "./SubAgentChatTab";
import Button from "./Button";

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
            onClick={() => setActiveChatTab(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs cursor-default ${
              tab.id === activeChatTabId
                ? "bg-white/10 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="max-w-[12rem] truncate">{tab.label}</span>
            {tab.kind === "subagent" && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  closeChatTab(tab.id);
                }}
                className="-mr-1 text-zinc-600 hover:text-zinc-300"
              >
                <X size={12} />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="relative flex-1 min-h-0">
        <div className={activeChatTabId === "primary" ? "h-full" : "hidden"}>
          <ChatPanel />
        </div>
        {chatTabs
          .filter((tab) => tab.kind === "subagent")
          .map((tab) => (
            <div key={tab.id} className={tab.id === activeChatTabId ? "h-full" : "hidden"}>
              <SubAgentChatTab subSessionId={tab.subSessionId!} />
            </div>
          ))}
      </div>
    </div>
  );
}
