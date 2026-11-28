import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import {
  currentPromptIndex,
  stepPromptIndex,
  truncateLines,
} from "../../../../lib/promptKeys";
import type { PermissionRequestPayload } from "../../../../lib/tauriApi";
import { permissionsForSession, useAppStore } from "../../../../store";
import PromptCard, { focusComposerAfterAnswer } from "./PromptCard";

interface PermissionPromptProps {
  // The oldest request waiting on this project (`permissionForSession`).
  request: PermissionRequestPayload;
  // `requestId`: the request on screen, which may not be `request` once the
  // user steps through several.
  onRespond: (approved: boolean, requestId: string) => void;
}

// The question the heading asks, by kind.
const KIND_QUESTION: Record<PermissionRequestPayload["kind"], string> = {
  shell: "Run this command?",
  edit: "Make this edit?",
  acp: "Allow this tool call?",
};

// A long command or diff shows this many lines until "Show all".
const COLLAPSED_LINES = 12;

// The options, in number-key order. The backend answers yes or no: an ACP
// agent's own options collapse to allow-once (or allow-always if that's all
// it offers) and a cancel (`acp/permissions.rs`), so there's no "always"
// here to offer yet.
const OPTIONS = [
  { approved: true, label: "Allow once" },
  { approved: false, label: "Deny" },
] as const;

// The permission ask, in the composer's place on its card surface (see
// `PromptCard`). Always shown while there's a request for this session (no
// open/close state of its own); `ChatComposer` decides *whether* to render
// it via `useSessionPermissions`. A project's own request and its
// sub-agents' can wait at once: they're stepped through with `[`/`]`.
export default function PermissionPrompt({
  request,
  onRespond,
}: PermissionPromptProps) {
  const projectId = request.parentSessionId ?? request.sessionId;
  const pending = useAppStore((s) => s.pendingPermissions);
  const all = permissionsForSession(pending, projectId);
  const queue = all.length > 0 ? all : [request];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const index = currentPromptIndex(
    queue.map((r) => r.id),
    selectedId,
  );
  const shown = queue[index] ?? request;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isExpanded = expandedId === shown.id;
  const detail = isExpanded
    ? { text: shown.detail, hiddenLines: 0 }
    : truncateLines(shown.detail, COLLAPSED_LINES);

  function respond(approved: boolean) {
    onRespond(approved, shown.id);
    if (queue.length <= 1) focusComposerAfterAnswer();
  }

  const isSubAgent = shown.parentSessionId != null;
  const who = isSubAgent ? "A sub-agent" : "The agent";
  const question = KIND_QUESTION[shown.kind];
  // A shell request's title is just "Run shell command": the command itself
  // is the detail. Others name their target ("Edit src/app.ts").
  const target = shown.kind === "shell" ? null : shown.title;
  const subtitle = `${who} is waiting for your answer`;

  return (
    <PromptCard
      promptId={shown.id}
      icon={ShieldAlert}
      label="Permission request"
      title={question}
      subtitle={subtitle}
      announcement={`${who} needs approval: ${shown.title}. Enter allows once, Escape denies.`}
      queue={{
        index,
        count: queue.length,
        onStep: (delta) =>
          setSelectedId(
            queue[stepPromptIndex(index, queue.length, delta)]?.id ?? null,
          ),
      }}
      optionCount={OPTIONS.length}
      onKeyAction={(action) => {
        if (action.type === "primary") respond(true);
        else if (action.type === "refuse") respond(false);
        else {
          const option = OPTIONS[action.index];
          if (option) respond(option.approved);
        }
      }}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            label="Deny"
            tooltip="Deny (Esc or 2)"
            endContent={<Kbd keys="escape" />}
            onClick={() => respond(false)}
          />
          <Button
            variant="primary"
            size="sm"
            label="Allow once"
            tooltip="Allow once (Enter or 1)"
            endContent={<Kbd keys="enter" />}
            onClick={() => respond(true)}
          />
        </>
      }
    >
      <VStack gap={2}>
        {target && (
          <Text type="code" maxLines={1}>
            {target}
          </Text>
        )}
        {shown.detail && (
          <CodeBlock
            code={detail.text}
            language={shown.kind === "shell" ? "bash" : "plaintext"}
            // An edit's detail is "+ added" / "- removed" / "  context" lines.
            isDiff={shown.kind === "edit"}
            isWrapped={shown.kind !== "edit"}
            hasLanguageLabel={false}
            size="sm"
            width="100%"
            maxHeight="40vh"
          />
        )}
        {detail.hiddenLines > 0 && (
          <Button
            variant="ghost"
            size="sm"
            label={`Show all (${detail.hiddenLines} more ${detail.hiddenLines === 1 ? "line" : "lines"})`}
            onClick={() => setExpandedId(shown.id)}
          />
        )}
      </VStack>
    </PromptCard>
  );
}
