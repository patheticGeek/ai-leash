import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";
import type { AcpModeOptions } from "../../../../lib/tauriApi";
import type { PermissionMode } from "../../../../store";
import EffortPickerPopover from "../popovers/EffortPickerPopover";
import ModelPickerPopover, {
  type PickerOption,
} from "../popovers/ModelPickerPopover";
import PermissionModePopover, {
  ASK_BYPASS_OPTIONS,
} from "../popovers/PermissionModePopover";

interface ChatToolbarProps {
  // Model/agent picker. `open` is owned by the caller so "/model" can pop it
  // without a real click.
  backendOptions: PickerOption[];
  activeBackendKey: string | null;
  activeBackendLabel: string;
  // Set when nothing can be sent with what's picked — the agent is turned
  // off or deleted in Settings, or the model is no longer offered. The
  // picker trigger turns red and shows this as its tooltip.
  sendBlockedReason: string | null;
  onSelectBackend: (key: string) => void;
  modelSwitchPending: boolean;
  modelPickerOpen: boolean;
  onModelPickerOpenChange: (open: boolean) => void;
  // The agent's own "thought level" picker; null (hidden) when the backend
  // has no effort picker or the agent advertises none.
  effortOptions: {
    options: { value: string; name: string }[];
    currentValue: string;
  } | null;
  effortChoice: string | null;
  onSelectEffort: (value: string) => void;
  permissionMode: PermissionMode;
  onSelectPermissionMode: (mode: PermissionMode) => void;
  // The agent's own modes; when set, the permission picker offers these
  // instead of Ask/Bypass.
  modeOptions: AcpModeOptions | null;
  modeChoice: string | null;
  onSelectMode: (value: string) => void;
  // Free-text model id for a backend with no model list to pick from.
  showModelIdInput: boolean;
  model: string;
  onModelChange: (model: string) => void;
}

// The pickers in the composer's footer: which model/agent answers, its
// effort level, and the permission mode (the agent's own modes, else
// Ask/Bypass) — ghost buttons opening menus above them, composed here so
// `ChatComposer` stays about the message itself, not who answers it.
export default function ChatToolbar({
  backendOptions,
  activeBackendKey,
  activeBackendLabel,
  sendBlockedReason,
  onSelectBackend,
  modelSwitchPending,
  modelPickerOpen,
  onModelPickerOpenChange,
  effortOptions,
  effortChoice,
  onSelectEffort,
  permissionMode,
  onSelectPermissionMode,
  modeOptions,
  modeChoice,
  onSelectMode,
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
        dangerMessage={sendBlockedReason}
        loading={modelSwitchPending}
        open={modelPickerOpen}
        onOpenChange={onModelPickerOpenChange}
      />
      {effortOptions && (
        <EffortPickerPopover
          options={effortOptions.options}
          value={effortChoice ?? effortOptions.currentValue}
          onSelect={onSelectEffort}
        />
      )}
      {modeOptions ? (
        <PermissionModePopover
          options={modeOptions.options.map((o) => ({
            value: o.value,
            label: o.name,
            subtitle: o.description,
          }))}
          value={modeChoice ?? modeOptions.currentValue}
          onSelect={onSelectMode}
          warn={false}
          open={permissionModePickerOpen}
          onOpenChange={setPermissionModePickerOpen}
        />
      ) : (
        <PermissionModePopover
          options={ASK_BYPASS_OPTIONS}
          value={permissionMode}
          onSelect={(value) => onSelectPermissionMode(value as PermissionMode)}
          warn={permissionMode === "bypass"}
          open={permissionModePickerOpen}
          onOpenChange={setPermissionModePickerOpen}
        />
      )}
      {showModelIdInput && (
        <TextInput
          label="Model id"
          isLabelHidden
          size="sm"
          width={160}
          value={model}
          onChange={onModelChange}
          placeholder="model id"
        />
      )}
    </>
  );
}
