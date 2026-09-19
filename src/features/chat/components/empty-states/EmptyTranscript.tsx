import ChatHeroBadge from "./ChatHeroBadge";

// Shown inside the scroller when a started conversation has no entries
// (e.g. right after `/clear`).
export default function EmptyTranscript() {
  return (
    <div className="flex min-h-[min(28rem,60vh)] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <ChatHeroBadge />
        <h2 className="text-lg font-medium text-zinc-100">
          What are we working on?
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Ask about your code, plan a change, or let the agent explore the
          project with you.
        </p>
      </div>
    </div>
  );
}
