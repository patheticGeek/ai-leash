import { ArrowDown } from "lucide-react";
import type * as React from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { cn } from "@/lib/utils";
import { Button } from "./button";

// Adapted from the AI Elements `conversation` component (shadcn registry,
// https://registry.ai-sdk.dev/conversation.json), which wraps
// `use-stick-to-bottom`: a transcript scroller that follows new content while
// the reader is parked at the bottom, stops following as soon as they scroll
// up, and offers a button to jump back down. Changes for this app: instant
// initial scroll, our `Button` chip for the jump button (centred without a
// translate — `Button` nudges itself with one on press), and the content
// wrapper defaulting to a min-full-height column so short transcripts can be
// bottom-aligned.

function Conversation({
  className,
  ...props
}: React.ComponentProps<typeof StickToBottom>) {
  return (
    <StickToBottom
      data-slot="conversation"
      className={cn("relative h-full overflow-y-hidden", className)}
      initial="instant"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

function ConversationContent({
  className,
  ...props
}: React.ComponentProps<typeof StickToBottom.Content>) {
  return (
    <StickToBottom.Content
      data-slot="conversation-content"
      className={cn("flex min-h-full flex-col gap-3 p-3", className)}
      {...props}
    />
  );
}

function ConversationScrollButton({
  className,
  children = "Latest",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick">) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 flex justify-center",
        className,
      )}
    >
      <Button
        data-slot="conversation-scroll-button"
        variant="chip"
        bordered
        size="sm"
        onClick={() => scrollToBottom()}
        className="pointer-events-auto bg-card"
        {...props}
      >
        <ArrowDown />
        {children}
      </Button>
    </div>
  );
}

export { Conversation, ConversationContent, ConversationScrollButton };
