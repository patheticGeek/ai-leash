import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Icon } from "@astryxdesign/core/Icon";
import { FileText } from "lucide-react";
import SystemNotice from "./SystemNotice";

// The "System prompt" line at the top of a top-level conversation's
// transcript; Show opens the whole prompt.
export default function SystemPromptRow({
  systemPrompt,
}: {
  systemPrompt: string;
}) {
  return (
    <SystemNotice
      icon={<Icon icon={FileText} size="sm" />}
      label="System prompt"
    >
      <CodeBlock
        code={systemPrompt}
        hasLanguageLabel={false}
        size="sm"
        width="100%"
        maxHeight={320}
        isWrapped
      />
    </SystemNotice>
  );
}
