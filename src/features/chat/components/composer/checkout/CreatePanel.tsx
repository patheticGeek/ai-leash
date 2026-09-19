import type { ReactNode } from "react";
import type { GitBranch } from "@/lib/tauriApi";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-zinc-500">{children}</span>;
}

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
        <Button size="sm" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          size="sm"
          disabled={!canSubmit || submitting}
          onClick={onSubmit}
        >
          {submitting ? "Creating…" : "Create"}
        </Button>
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
      <FieldLabel>New branch name</FieldLabel>
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="my-feature"
        autoFocus
      />
      <FieldLabel>Base branch</FieldLabel>
      <Select
        value={baseBranch ?? undefined}
        onValueChange={onBaseBranchChange}
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder="Select a branch" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.name} value={b.name}>
              {b.name}
              {b.isCurrent ? " (current)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
