import { InfoTip } from "@astryxdesign/core/InfoTip";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { api, type StartingContext } from "@/lib/tauriApi";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// A native provider gets all of it in its system prompt
// (`context::build_system_prompt`). An ACP agent only gets what the MCP
// bridge's instructions carry — the Actions and skills lists
// (`mcp_bridge::client::bridge_instructions`); AGENTS.md isn't sent, and
// memory is only there if it calls `read_memory`.
function tokens(ctx: StartingContext, isAcp: boolean): string[] {
  const out = isAcp ? [] : [...ctx.agentsMd];
  if (!isAcp && ctx.globalMemory) out.push("Global memory");
  if (!isAcp && ctx.projectMemory) out.push("Project memory");
  if (ctx.skills > 0) out.push(plural(ctx.skills, "skill"));
  if (ctx.actions > 0) out.push(plural(ctx.actions, "action"));
  return out;
}

// The new-thread screen's "The agent starts with" row, under the composer
// (it takes the place of the `ai-chat-landing` template's category chips):
// what ai-leash folds into the system prompt for a thread in `checkoutPath`
// (the primary checkout or the worktree picked in the checkout bar).
// Refetched on mount, so edits to AGENTS.md / memory / skills show up the
// next time the screen opens. For an ACP agent (`acpAgentLabel` set) it
// lists only what reaches it through the bridge, with an InfoTip saying the
// rest is up to the agent. Hidden while loading, or for a native provider
// when there's nothing.
export default function StartsWithRow({
  checkoutPath,
  acpAgentLabel,
}: {
  checkoutPath: string;
  // The selected agent's name when it's an ACP agent, else null.
  acpAgentLabel: string | null;
}) {
  const isAcp = acpAgentLabel !== null;
  const { data } = useQuery({
    queryKey: qk.startingContext(checkoutPath),
    queryFn: () => api.getStartingContext(checkoutPath),
    refetchOnMount: "always",
  });
  if (!data) return null;
  const items = tokens(data, isAcp);
  if (items.length === 0 && !isAcp) return null;
  return (
    <VStack gap={2} paddingInline={3}>
      <HStack gap={1} vAlign="center">
        <Text type="supporting" weight="semibold" color="secondary">
          The agent starts with
        </Text>
        {isAcp && (
          <InfoTip
            label="What external agents get"
            content={`${acpAgentLabel} reads its own instruction files. From AI Leash it gets the Actions and skills lists; it reads AI Leash memory only when it asks for it.`}
          />
        )}
      </HStack>
      {items.length > 0 ? (
        <HStack gap={1} wrap="wrap">
          {items.map((t) => (
            <Token key={t} label={t} />
          ))}
        </HStack>
      ) : (
        <Text type="supporting" color="secondary">
          No Actions or skills in this project yet
        </Text>
      )}
    </VStack>
  );
}
