import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import NewConversationPopover from "@/app/NewConversationPopover";
import ChatHeroBadge from "./ChatHeroBadge";

// The "new thread" empty state — a conversation with no message sent yet
// gets its message box centered (both axes) under this heading instead of
// the normal bottom-pinned layout. The heading's project name doubles as the
// project switcher; the title bar's own "New Thread" button always targets
// the current project, so switching *which* project a still-fresh thread
// targets only lives here.
export default function NewThreadView({
  projectName,
  children,
}: {
  projectName: string;
  /** The message box + checkout bar. */
  children: ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <ChatHeroBadge />
          <h2 className="text-lg font-medium text-zinc-100">
            What are we working on in{" "}
            <NewConversationPopover
              trigger={
                <button
                  type="button"
                  title="Switch project"
                  className="cursor-pointer inline-flex items-center gap-0.5 underline decoration-dotted decoration-zinc-500 underline-offset-4 hover:text-blue-300 hover:decoration-blue-300"
                >
                  {projectName}
                  <ChevronDown size={14} className="text-zinc-500" />
                </button>
              }
            />
            ?
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Ask about your code, plan a change, or let the agent explore the
            project with you.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
