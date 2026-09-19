import { ChevronDown } from "lucide-react";
import NewConversationPopover from "@/app/NewConversationPopover";
import ChatHeroBadge from "./ChatHeroBadge";

// The heading above the centered message box on the "new thread" screen (a
// conversation with no message sent yet). Its project name doubles as the
// project switcher; the title bar's own "New Thread" button always targets
// the current project, so switching *which* project a still-fresh thread
// targets only lives here. `ChatPanel` does the centering.
export default function NewThreadHero({
  projectName,
}: {
  projectName: string;
}) {
  return (
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
        Ask about your code, plan a change, or let the agent explore the project
        with you.
      </p>
    </div>
  );
}
