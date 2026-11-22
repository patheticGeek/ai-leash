import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { ReactNode } from "react";
import type { GitBranch } from "@/lib/tauriApi";

// The "create" view shared by both checkout pickers: a scrolling form body
// (with the failure message, if any) over a Back / Create footer.
export function CreatePanel({
  children,
  error,
  canSubmit,
  submitting,
  onBack,
  onSubmit,
}: {
  children: ReactNode;
  error: string | null;
  canSubmit: boolean;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto p-3">
        {children}
        {error && <span className="text-red-400">{error}</span>}
      </div>
      <div className="flex justify-end gap-2 border-t border-white/5 p-2">
        <Button size="sm" variant="ghost" label="Back" onClick={onBack} />
        <Button
          size="sm"
          variant="primary"
          label={submitting ? "Creating…" : "Create"}
          isDisabled={!canSubmit || submitting}
          onClick={onSubmit}
        />
      </div>
    </>
  );
}

// "New branch name" + "Base branch" — the fields for making a branch, which
// both pickers offer (directly, and as a new worktree's branch).
export function NewBranchFields({
  name,
  onNameChange,
  baseBranch,
  onBaseBranchChange,
  branches,
}: {
  name: string;
  onNameChange: (name: string) => void;
  baseBranch: string | null;
  onBaseBranchChange: (branch: string) => void;
  branches: GitBranch[];
}) {
  return (
    <>
      <TextInput
        label="New branch name"
        size="sm"
        value={name}
        onChange={onNameChange}
        placeholder="my-feature"
        hasAutoFocus
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
    </>
  );
}
