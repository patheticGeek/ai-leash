import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { api, type StartingContext } from "@/lib/tauriApi";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function tokens(ctx: StartingContext): string[] {
  const out = [...ctx.agentsMd];
  if (ctx.globalMemory) out.push("Global memory");
  if (ctx.projectMemory) out.push("Project memory");
  if (ctx.skills > 0) out.push(plural(ctx.skills, "skill"));
  if (ctx.actions > 0) out.push(plural(ctx.actions, "action"));
  return out;
}

// The new-thread screen's "The agent starts with" row, under the composer
// (it takes the place of the `ai-chat-landing` template's category chips):
// what ai-leash folds into the system prompt for a thread in `checkoutPath`
// (the primary checkout or the worktree picked in the checkout bar).
// Refetched on mount, so edits to AGENTS.md / memory / skills show up the
// next time the screen opens. Hidden while loading or when there's nothing.
export default function StartsWithRow({
  checkoutPath,
}: {
  checkoutPath: string;
}) {
  const { data } = useQuery({
    queryKey: qk.startingContext(checkoutPath),
    queryFn: () => api.getStartingContext(checkoutPath),
    refetchOnMount: "always",
  });
  const items = data ? tokens(data) : [];
  if (items.length === 0) return null;
  return (
    <VStack gap={2} paddingInline={3}>
      <Text type="supporting" weight="semibold" color="secondary">
        The agent starts with
      </Text>
      <HStack gap={1} wrap="wrap">
        {items.map((t) => (
          <Token key={t} label={t} />
        ))}
      </HStack>
    </VStack>
  );
}
