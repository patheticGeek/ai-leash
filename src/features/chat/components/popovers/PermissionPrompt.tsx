import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import type { PermissionRequestPayload } from "../../../../lib/tauriApi";
import PromptCard from "./PromptCard";

interface PermissionPromptProps {
  request: PermissionRequestPayload;
  onRespond: (approved: boolean) => void;
}

const KIND_LABEL: Record<PermissionRequestPayload["kind"], string> = {
  shell: "The agent wants to run a shell command",
  edit: "The agent wants to edit this file",
  acp: "The agent wants permission to proceed",
};

// The permission ask, in the composer's place on its card surface (see
// `PromptCard`). Always shown while there's a request for this session (no
// open/close state of its own); `ChatComposer` decides *whether* to render
// it via `useSessionPermissions`.
export default function PermissionPrompt({
  request,
  onRespond,
}: PermissionPromptProps) {
  return (
    <PromptCard
      label={KIND_LABEL[request.kind]}
      title={request.title}
      subtitle={KIND_LABEL[request.kind]}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            label="Deny"
            onClick={() => onRespond(false)}
          />
          <Button
            variant="primary"
            size="sm"
            label="Approve"
            onClick={() => onRespond(true)}
          />
        </>
      }
    >
      {request.detail && (
        <CodeBlock
          code={request.detail}
          language={request.kind === "shell" ? "bash" : "plaintext"}
          // An edit's detail is "+ added" / "- removed" / "  context" lines.
          isDiff={request.kind === "edit"}
          isWrapped={request.kind !== "edit"}
          hasLanguageLabel={false}
          size="sm"
          width="100%"
          maxHeight="40vh"
        />
      )}
    </PromptCard>
  );
}
