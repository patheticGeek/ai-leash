import { useState } from "react";
import { Input } from "@/ui/input";
import type { PermissionMode } from "../../../../store";
import EffortPickerPopover from "../popovers/EffortPickerPopover";
import ModelPickerPopover, {
  type PickerOption,
} from "../popovers/ModelPickerPopover";
import PermissionModePopover from "../popovers/PermissionModePopover";

interface ChatToolbarProps {
  // Model/agent picker. `open` is owned by the caller so "/model" can pop it
  // without a real click.
  backendOptions: PickerOption[];
  activeBackendKey: string | null;
  activeBackendLabel: string;
  // Set when the picked agent is turned off in Settings — the picker
  // trigger turns red and shows this as its tooltip.
  backendDisabledReason: string | null;
  onSelectBackend: (key: string) => void;
  modelSwitchPending: boolean;
  modelPickerOpen: boolean;
  onModelPickerOpenChange: (open: boolean) => void;
  isAcp: boolean;
  // ACP-only "thought level" picker; hidden when the agent advertises none.
  effortOptions: {
    options: { value: string; name: string }[];
    currentValue: string;
  } | null;
  effortChoice: string | null;
  onSelectEffort: (value: string) => void;
  permissionMode: PermissionMode;
  onSelectPermissionMode: (mode: PermissionMode) => void;
  // Free-text model id for OpenAI-compatible providers (no model list to pick from).
  showModelIdInput: boolean;
  model: string;
  onModelChange: (model: string) => void;
}

// The pickers along the bottom-left of the message box: which model/agent
// answers, its effort level, and the Ask/Bypass permission mode — composed
// here and slotted into `ChatInputBar` so that component stays about the
// input box itself, not who's picked to answer it.
export default function ChatToolbar({
  backendOptions,
  activeBackendKey,
  activeBackendLabel,
  backendDisabledReason,
  onSelectBackend,
  modelSwitchPending,
  modelPickerOpen,
  onModelPickerOpenChange,
  isAcp,
  effortOptions,
  effortChoice,
  onSelectEffort,
  permissionMode,
  onSelectPermissionMode,
  showModelIdInput,
  model,
  onModelChange,
}: ChatToolbarProps) {
  const [permissionModePickerOpen, setPermissionModePickerOpen] =
    useState(false);
  return (
    <>
      <ModelPickerPopover
        options={backendOptions}
        activeKey={activeBackendKey}
        onSelect={onSelectBackend}
        triggerLabel={activeBackendLabel}
        dangerMessage={backendDisabledReason}
        loading={modelSwitchPending}
        open={modelPickerOpen}
        onOpenChange={onModelPickerOpenChange}
      />
      {isAcp && effortOptions && (
        <EffortPickerPopover
          options={effortOptions.options}
          value={effortChoice ?? effortOptions.currentValue}
          onSelect={onSelectEffort}
        />
      )}
      <PermissionModePopover
        mode={permissionMode}
        onSelect={onSelectPermissionMode}
        open={permissionModePickerOpen}
        onOpenChange={setPermissionModePickerOpen}
      />
      {showModelIdInput && (
        <Input
          variant="chip"
          value={model}
          onChange={(e) => onModelChange(e.currentTarget.value)}
          placeholder="model id"
        />
      )}
    </>
  );
}
