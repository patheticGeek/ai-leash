import { type ReactNode, useEffect, useState } from "react";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { useAppStore } from "../../../store";
import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_IDE_COMMAND,
  DEFAULT_UI_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from "../../../store/preferencesSlice";
import ToggleRow from "./ToggleRow";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      {children}
    </section>
  );
}

// Holds what's being typed so an in-between value ("1" on the way to "14")
// isn't rejected, and only commits a number in range; the field snaps back
// to the saved size on blur.
function FontSizeInput({
  id,
  value,
  onCommit,
}: {
  id: string;
  value: number;
  onCommit: (size: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Input
      id={id}
      type="number"
      min={MIN_FONT_SIZE}
      max={MAX_FONT_SIZE}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const size = Number(e.target.value);
        if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) onCommit(size);
      }}
      onBlur={() => setDraft(String(value))}
      className="w-24"
    />
  );
}

function FontRow({
  idPrefix,
  label,
  hint,
  family,
  familyPlaceholder,
  onFamilyChange,
  size,
  defaultSize,
  onSizeChange,
}: {
  idPrefix: string;
  label: string;
  hint: string;
  family: string;
  familyPlaceholder: string;
  onFamilyChange: (family: string) => void;
  size: number;
  defaultSize: number;
  onSizeChange: (size: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md bg-raised px-3 py-2.5">
      <div className="text-sm text-zinc-200">{label}</div>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label
            htmlFor={`${idPrefix}-family`}
            className="text-xs text-zinc-500"
          >
            Font family
          </Label>
          <Input
            id={`${idPrefix}-family`}
            value={family}
            placeholder={familyPlaceholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onFamilyChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-size`} className="text-xs text-zinc-500">
            Size (px)
          </Label>
          <FontSizeInput
            id={`${idPrefix}-size`}
            value={size}
            onCommit={onSizeChange}
          />
        </div>
      </div>
      <span className="block text-xs text-zinc-600">
        {hint} Family is a CSS font list, such as{" "}
        <code className="font-mono text-zinc-400">Inter, sans-serif</code>{" "}
        (empty for the default). Default size is {defaultSize}px.
      </span>
    </div>
  );
}

export default function PreferencesSettingsTab() {
  const composeMode = useAppStore((s) => s.composeMode);
  const setComposeMode = useAppStore((s) => s.setComposeMode);
  const uiFontFamily = useAppStore((s) => s.uiFontFamily);
  const setUiFontFamily = useAppStore((s) => s.setUiFontFamily);
  const uiFontSize = useAppStore((s) => s.uiFontSize);
  const setUiFontSize = useAppStore((s) => s.setUiFontSize);
  const codeFontFamily = useAppStore((s) => s.codeFontFamily);
  const setCodeFontFamily = useAppStore((s) => s.setCodeFontFamily);
  const codeFontSize = useAppStore((s) => s.codeFontSize);
  const setCodeFontSize = useAppStore((s) => s.setCodeFontSize);
  const ideCommand = useAppStore((s) => s.ideCommand);
  const setIdeCommand = useAppStore((s) => s.setIdeCommand);
  const debugModeEnabled = useAppStore((s) => s.debugModeEnabled);
  const setDebugModeEnabled = useAppStore((s) => s.setDebugModeEnabled);
  const debugShowIds = useAppStore((s) => s.debugShowIds);
  const setDebugShowIds = useAppStore((s) => s.setDebugShowIds);

  return (
    <div className="flex h-full flex-col space-y-6">
      <Section title="Chat">
        <ToggleRow
          label="Compose mode"
          hint="Enter inserts a new line in the chat box, and Ctrl+Enter sends
            the message instead."
          checked={composeMode}
          onChange={setComposeMode}
        />
      </Section>
      <Section title="Fonts">
        <FontRow
          idPrefix="ui-font"
          label="Interface text"
          hint="Used for all normal text; every text size in the app scales with it."
          family={uiFontFamily}
          familyPlaceholder="Instrument Sans"
          onFamilyChange={setUiFontFamily}
          size={uiFontSize}
          defaultSize={DEFAULT_UI_FONT_SIZE}
          onSizeChange={setUiFontSize}
        />
        <FontRow
          idPrefix="code-font"
          label="Code text"
          hint="Used for code blocks, tool output, terminals and the file editor."
          family={codeFontFamily}
          familyPlaceholder="JetBrains Mono"
          onFamilyChange={setCodeFontFamily}
          size={codeFontSize}
          defaultSize={DEFAULT_CODE_FONT_SIZE}
          onSizeChange={setCodeFontSize}
        />
      </Section>
      <Section title="IDE">
        <div className="space-y-1.5 rounded-md bg-raised px-3 py-2.5">
          <Label htmlFor="ide-command" className="text-sm text-zinc-200">
            Command
          </Label>
          <Input
            id="ide-command"
            value={ideCommand}
            placeholder={DEFAULT_IDE_COMMAND}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setIdeCommand(e.target.value)}
          />
          <span className="block text-xs text-zinc-600">
            Launched by the title bar's Open button with the current project or
            worktree folder added as the last argument. Use any command on your
            PATH, with optional flags, such as{" "}
            <code className="font-mono text-zinc-400">code</code>,{" "}
            <code className="font-mono text-zinc-400">zed</code>,{" "}
            <code className="font-mono text-zinc-400">cursor</code> or{" "}
            <code className="font-mono text-zinc-400">code -n</code>.
          </span>
        </div>
      </Section>
      <Section title="Debug">
        <ToggleRow
          label="Enable debug mode"
          hint="Adds a floating icon (bottom-right) that opens a live ACP Events
            panel — every request, response, notification, and error crossing
            every conversation's agent connection, app-wide. Nothing is
            persisted to disk; events are only kept in memory while this is on,
            and are dropped the moment it's turned off."
          checked={debugModeEnabled}
          onChange={setDebugModeEnabled}
        />
        <ToggleRow
          label="Show IDs in title bar"
          hint="Shows the current project, conversation, and ACP session id in
            the title bar's center section, as `project / conversation /
            session`."
          checked={debugShowIds}
          onChange={setDebugShowIds}
        />
      </Section>
    </div>
  );
}
