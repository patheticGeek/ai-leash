import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";

// What a permission ask or an agent's question looks like: it takes the
// composer's place, on the composer's own card surface (`Card elevation=low`)
// — Heading 4 title, a supporting subtitle, the content, then the actions
// end-aligned (ghost → secondary → primary). `ChatComposer` swaps it in.
export default function PromptCard({
  title,
  subtitle,
  headerEnd,
  children,
  actions,
  label,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  // Beside the title, e.g. a dismiss button.
  headerEnd?: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  label: string;
}) {
  return (
    <Card elevation="low" padding={4} role="region" aria-label={label}>
      <VStack gap={3}>
        <HStack gap={2} align="start" justify="between">
          <VStack gap={0.5}>
            <Heading level={4}>{title}</Heading>
            {subtitle != null && (
              <Text type="supporting" color="secondary">
                {subtitle}
              </Text>
            )}
          </VStack>
          {headerEnd}
        </HStack>
        {children}
        <HStack gap={2} align="center" justify="end">
          {actions}
        </HStack>
      </VStack>
    </Card>
  );
}
