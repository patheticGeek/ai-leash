import { MessageCircle, Sparkles } from "lucide-react";

// The sparkle-tipped chat bubble above both empty states — the "new thread"
// screen (`NewThreadView`) and an emptied transcript (`EmptyTranscript`).
export default function ChatHeroBadge() {
  return (
    <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-primary-hover shadow-[0_0_0_1px_rgba(58,95,143,0.3),0_10px_26px_rgba(0,0,0,0.2)]">
      <MessageCircle size={25} strokeWidth={1.6} />
      <Sparkles size={13} className="absolute -right-1 -top-1 text-amber-300" />
    </div>
  );
}
