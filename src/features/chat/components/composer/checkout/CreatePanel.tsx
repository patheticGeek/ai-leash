import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { GitBranch } from "@/lib/tauriApi";

// The inline "create" view shared by both checkout pickers — the list view
// swaps for it and Cancel swaps back, so creating stays anchored to the bar:
// back + title, the fields, then Cancel / Create ("Creating…" while busy).
export function CreatePanel({
  title,
  children,
  canSubmit,
  submitting,
  onBack,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  canSubmit: boolean;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <VStack gap={3}>
      <HStack gap={1} align="center">
        <IconButton
          variant="ghost"
          size="sm"
          label="Back"
          icon={<ArrowLeft size={14} />}
          isDisabled={submitting}
          onClick={onBack}
        />
        <Heading level={5}>{title}</Heading>
      </HStack>
      {children}
      <HStack gap={2} justify="end">
        <Button
          variant="ghost"
          size="sm"
          label="Cancel"
          isDisabled={submitting}
          onClick={onBack}
        />
        <Button
          variant="primary"
          size="sm"
          label={submitting ? "Creating…" : "Create"}
          isLoading={submitting}
          isDisabled={!canSubmit}
          onClick={onSubmit}
        />
      </HStack>
    </VStack>
  );
}

// "New branch name" + "Base branch" — the fields for making a branch, which
// both pickers offer (directly, and as a new worktree's branch). A failed
// create shows git's reason on the name field.
export function NewBranchFields({
  name,
  onNameChange,
  onEnter,
  baseBranch,
  onBaseBranchChange,
  branches,
  error,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onEnter: () => void;
  baseBranch: string | null;
  onBaseBranchChange: (branch: string) => void;
  branches: GitBranch[];
  error: string | null;
}) {
  return (
    <VStack gap={3}>
      <TextInput
        label="New branch name"
        size="sm"
        value={name}
        onChange={onNameChange}
        onEnter={onEnter}
        placeholder="my-feature"
        hasAutoFocus
        status={error ? { type: "error", message: error } : undefined}
      />
      <Selector
        label="Base branch"
        size="sm"
        width="100%"
        value={baseBranch ?? undefined}
        onChange={onBaseBranchChange}
        placeholder="Select a branch"
        options={branches.map((b) => ({
          value: b.name,
          label: b.isCurrent ? `${b.name} (current)` : b.name,
        }))}
      />
    </VStack>
  );
}
