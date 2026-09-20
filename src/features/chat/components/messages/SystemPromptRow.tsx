import { useState } from "react";
import { ActivityRow } from "./ActivityRow";

// The collapsible "system prompt" line at the top of a top-level
// conversation's transcript. Owns its own open/closed state — nothing else
// reads it.
export default function SystemPromptRow({
  systemPrompt,
}: {
  systemPrompt: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <ActivityRow
      italic
      label="system prompt"
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    >
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-code">
        {systemPrompt}
      </pre>
    </ActivityRow>
  );
}
